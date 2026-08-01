import { getAmapClient } from './client.js'
import { haversineDist } from '../../utils/geo.js'
import { normalizeName } from '../../utils/text.js'
import type { AmapAroundResponse, AmapTextResponse, AmapPOI } from '../../types/poi.js'
import type { PreferenceTag } from '../../types/route.js'
import { normalizePoiDistance } from '../planner/distancePolicy.js'
import { classifyPoiQuality, filterUsablePois } from '../planner/poiQuality.js'
import { searchTermsFor } from '../planner/keywordRelevance.js'
import { buildRecallQueries } from '../planner/recallPolicy.js'
import { buildCategoryKeywords, buildCategoryTypecodePrefixes } from '../planner/preferenceCriteria.js'
import { buildLocalCuisineTerms, hasRegionalCuisineConflict } from '../planner/localCuisinePolicy.js'
import { runAmapSearchTasks } from './amapSearchScheduler.js'

// Preference → Amap typecode mapping
const PREFERENCE_TYPECODES: Record<PreferenceTag, string> = {
  food: '050000',       // 餐饮服务
  wander: '060000|070000|080000', // 购物+生活服务+体育休闲
  scenic: '110000|140000|060300', // 风景名胜+科教文化+特色商业街
}

// Cuisine type → Amap keywords
export const CUISINE_KEYWORDS: Record<string, string> = {
  hotpot: '火锅|串串|涮肉',
  noodles: '面馆|面庄|拉面|米线|粉',
  pastries: '糕点|点心|面包|烘焙',
  bbq: '烧烤|烤肉',
  local_cuisine: '本地菜|老字号|本帮菜|特色菜',
  western: '西餐|牛排|披萨|意面',
  coffee_tea: '奶茶|咖啡|茶馆|茶饮',
  buffet: '自助餐|自助|海鲜自助|烤肉自助|日料自助',
}

// Scenic type → Amap keywords
const SCENIC_KEYWORDS: Record<string, string> = {
  popular: '著名景点|5A|4A|名胜古迹|地标|必去',
  street: '打卡|网红|街拍|特色街|胡同|文创',
}

// Wander type → Amap typecode + keywords
const WANDER_CONFIG: Record<string, { types?: string; keywords?: string }> = {
  shopping: { types: '060000', keywords: '商场|购物中心|步行街|集市' },
  cafe: { types: '050000', keywords: '咖啡|茶馆|茶饮|书吧' },
  entertainment: { types: '080000', keywords: '电影院|KTV|桌游|密室|演出' },
  hidden: { types: '110000|140000', keywords: '故居|寺庙|园林|小众|秘境|胡同|老街|古巷' },
  museum: { types: '140000', keywords: '博物馆|美术馆|展览馆|纪念馆|科技馆' },
}

// Max POI results cap — generous so LLM has enough to choose from
const MAX_POI_RESULTS = 50

/** Normalize raw Amap POI into clean format */
function normalizePOI(raw: AmapAroundResponse['pois'][number], refLng: number, refLat: number): AmapPOI | null {
  if (!raw.location || !raw.location.includes(',')) {
    console.warn(`POI missing location: ${raw.name} (${raw.id})`)
    return null
  }
  const [lng, lat] = raw.location.split(',').map(Number)
  if (isNaN(lng) || isNaN(lat)) {
    console.warn(`POI invalid coords: ${raw.name} (${raw.id}) location=${raw.location}`)
    return null
  }
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    typecode: raw.typecode,
    address: raw.address || '',
    lng,
    lat,
    distance: normalizePoiDistance(raw.distance, { lat: refLat, lng: refLng }, { lat, lng }) ?? 0,
    rating: raw.biz_ext?.rating || null,
    cost: raw.biz_ext?.cost || null,
    parentId: raw.parent || null,
    photos: raw.photos,
    photoUrl: raw.photos?.[0]?.url,
  }
}

/** Deduplicate POIs. When wideMode is true, sample across the full distance
 *  range instead of taking the closest ones — used for 全城范围 to avoid
 *  filling the candidate list with neighborhood parks. */
interface PoiSubtypePriority {
  keywords: string[]
  typecodePrefixes: string[]
  groups?: Array<{ keywords: string[]; typecodePrefixes: string[] }>
}

function matchesSubtypePriority(
  poi: AmapPOI,
  priority: Pick<PoiSubtypePriority, 'keywords' | 'typecodePrefixes'>,
): boolean {
  if (priority.typecodePrefixes.some(prefix => poi.typecode.startsWith(prefix))) return true
  if (priority.keywords.length === 0) return false
  const text = `${poi.name} ${poi.type} ${poi.address}`.toLowerCase()
  return priority.keywords.some(keyword => text.includes(keyword.toLowerCase()))
}

function dedupeAndSort(
  pois: AmapPOI[],
  wideMode = false,
  dedupeScenicParents = false,
  subtypePriority: PoiSubtypePriority = { keywords: [], typecodePrefixes: [], groups: [] },
): AmapPOI[] {
  const seen = new Set<string>()
  const seenParents = new Set<string>()
  const unique: AmapPOI[] = []
  for (const poi of pois) {
    const duplicateParent = dedupeScenicParents && !!poi.parentId && seenParents.has(poi.parentId)
    if (!seen.has(poi.id) && !duplicateParent) {
      seen.add(poi.id)
      if (dedupeScenicParents && poi.parentId) seenParents.add(poi.parentId)
      unique.push(poi)
    }
  }
  unique.sort((a, b) => {
    const aQualityPenalty = classifyPoiQuality(a).decision === 'downrank' ? 1 : 0
    const bQualityPenalty = classifyPoiQuality(b).decision === 'downrank' ? 1 : 0
    // For bounded local searches, keep explicitly selected subtype results
    // ahead of generic around-search neighbours before applying the 50-POI
    // cap. Quality remains the first gate, so internal scenic fragments do
    // not outrank normal public venues merely because their type matches.
    const aSubtypePenalty = !wideMode && matchesSubtypePriority(a, subtypePriority) ? 0 : 1
    const bSubtypePenalty = !wideMode && matchesSubtypePriority(b, subtypePriority) ? 0 : 1
    return aQualityPenalty - bQualityPenalty
      || aSubtypePenalty - bSubtypePenalty
      || a.distance - b.distance
  })

  // A union priority alone can still let 50 scenic matches evict every food
  // match. Reserve one provider-backed candidate per selected preference
  // before applying the global cap, then retain the normal quality order.
  if (!wideMode && (subtypePriority.groups?.length ?? 0) > 1) {
    const reserved: AmapPOI[] = []
    for (const group of subtypePriority.groups ?? []) {
      const candidate = unique.find(poi => matchesSubtypePriority(poi, group))
      if (candidate && !reserved.some(poi => poi.id === candidate.id)) reserved.push(candidate)
    }
    if (reserved.length > 0) {
      const reservedIds = new Set(reserved.map(poi => poi.id))
      unique.splice(0, unique.length, ...reserved, ...unique.filter(poi => !reservedIds.has(poi.id)))
    }
  }

  if (!wideMode || unique.length <= MAX_POI_RESULTS) {
    return unique.slice(0, MAX_POI_RESULTS)
  }

  // wideMode: evenly sample across distance spectrum so famous landmarks
  // that are far away still make the cut (instead of being pushed out by
  // 50 nearby neighborhood parks).
  const result: AmapPOI[] = []
  const step = unique.length / MAX_POI_RESULTS
  for (let i = 0; i < MAX_POI_RESULTS; i++) {
    result.push(unique[Math.floor(i * step)])
  }
  return result
}

/** Search nearby POIs using Amap around-search API */
export async function searchNearbyPOIs(params: {
  lat: number
  lng: number
  distance: number
  timeOption: number
  preferences: PreferenceTag[]
  cuisineTypes?: string[]
  scenicTypes?: string[]
  wanderTypes?: string[]
  adcode?: string
  /** When true, sample evenly across distance range (for 全城范围) */
  wideMode?: boolean
  /** Override scenic text-search keywords */
  scenicKeywords?: string
  /** When true, skip around-search (biased toward user location). Use for 全城范围. */
  skipAroundSearch?: boolean
  /** Free-text preferences, kept separate from enum-backed subtypes. */
  customKeywords?: string[]
  /** Category-aware free text for mixed-preference searches. */
  customKeywordsByPreference?: Partial<Record<PreferenceTag, string[]>>
  /** Landmark or commercial-area name used to recover sparse text searches. */
  areaName?: string
}): Promise<AmapPOI[]> {
  const { lat, lng, distance, preferences, cuisineTypes, scenicTypes, wanderTypes, adcode, wideMode, scenicKeywords, skipAroundSearch,
    customKeywords = [], customKeywordsByPreference, areaName } = params
  const underlyingClient = getAmapClient()
  const searchTasks: Array<() => Promise<void>> = []
  const scheduledRequests = new Map<string, Promise<{ data: unknown }>>()
  // Defer and deduplicate calls so supplementary recall cannot burst through
  // Amap's free-tier QPS ceiling. Offset/extensions are deliberately excluded
  // from the key: the first equivalent query already supplies the same POIs.
  const client = {
    get<T>(path: string, config: { params: Record<string, string | number | undefined> }): Promise<{ data: T }> {
      const { location, radius, keywords, types, city, page } = config.params
      const key = [path, location, radius, keywords, types, city, page].join('\u0000')
      const existing = scheduledRequests.get(key)
      if (existing) return existing as Promise<{ data: T }>

      let resolveRequest!: (value: { data: T }) => void
      let rejectRequest!: (reason?: unknown) => void
      const request = new Promise<{ data: T }>((resolve, reject) => {
        resolveRequest = resolve
        rejectRequest = reject
      })
      scheduledRequests.set(key, request as Promise<{ data: unknown }>)
      searchTasks.push(async () => {
        try {
          resolveRequest(await underlyingClient.get<T>(path, config))
        } catch (error) {
          rejectRequest(error)
        }
      })
      return request
    },
  }

  // 0 = unlimited → use max Amap radius (50km)
  const radius = distance > 0 ? distance : 50000

  // Build typecode union from preferences
  let typeFilter = preferences
    .map((p) => PREFERENCE_TYPECODES[p])
    .filter(Boolean)

  // Add wander sub-type typecodes if wander is selected and has sub-options
  if (preferences.includes('wander') && wanderTypes?.length) {
    for (const wt of wanderTypes) {
      if (WANDER_CONFIG[wt]?.types) typeFilter.push(WANDER_CONFIG[wt].types!)
    }
  }

  // Historic/commercial streets are classified under 0604xx by Amap. Keep
  // this subtype-specific so ordinary shopping POIs are not leaked into every
  // scenic request.
  if (preferences.includes('scenic') && scenicTypes?.includes('street')) {
    typeFilter.push('060400')
  }

  // Deduplicate types
  let typesParam = [...new Set(typeFilter.flatMap((t) => t.split('|')))].join('|')
  if (!typesParam) {
    typesParam = '050000|060000|080000|110000' // mixed default
    console.log(`No type filters from preferences [${preferences}], using default types`)
  }

  console.log(`Amap around-search: location=${lng},${lat} radius=${radius} types=${typesParam}`)

  const promises: Promise<AmapPOI[]>[] = []

  // Main around-search — skip for 全城范围: around-search is distance-sorted,
  // so it returns the closest N POIs first. For city-wide scenic/wander, this
  // means 50 neighborhood parks drown out the city's famous landmarks.
  if (!skipAroundSearch) {
    console.log(`Amap around-search: location=${lng},${lat} radius=${radius} types=${typesParam}`)
    for (const page of [1, 2]) {
      promises.push(
        client
          .get<AmapAroundResponse>('/place/around', {
            params: {
              location: `${lng},${lat}`,
              radius,
              types: typesParam,
              offset: 25,
              page,
              extensions: 'all',
            },
          })
          .then((res) => {
            const pois = (res.data.pois || []).map(raw => normalizePOI(raw, lng, lat)).filter(Boolean) as AmapPOI[]
            return pois
          })
          .catch((err) => {
            console.error(`Amap around-search page=${page} FAILED:`, err.message)
            return [] as AmapPOI[]
          }),
      )
    }
  }

  // ── Supplementary text searches ──────────────────────

  // Food text search — always do a broad food search, with keywords if specified
  if (preferences.includes('food')) {
    // When cuisine type is specified, use only cuisine keywords (not generic "美食|餐厅")
    // to avoid mixing in unrelated restaurants
    const kwParts: string[] = cuisineTypes?.length ? [] : ['美食|餐厅|饭馆']
    if (cuisineTypes?.length) {
      for (const c of cuisineTypes) if (CUISINE_KEYWORDS[c]) kwParts.push(CUISINE_KEYWORDS[c])
    }
    kwParts.push(...searchTermsFor(customKeywordsByPreference?.food ?? customKeywords))
    const kws = kwParts.join('|')
    console.log(`Amap food text-search: keywords=${kws}`)
    for (const page of cuisineTypes?.length ? [1] : [1, 2]) {
      promises.push(
        client
          .get<AmapTextResponse>('/place/text', {
            params: {
              location: `${lng},${lat}`,
              keywords: kws,
              types: '050000',
              ...(adcode ? { city: adcode } : {}),
              offset: 15,
              page,
              extensions: 'all',
            },
          })
          .then((res) => (res.data.pois || []).map(raw => normalizePOI(raw, lng, lat)).filter(Boolean) as AmapPOI[])
          .catch((err) => { console.error(`Amap food text-search page=${page} FAILED:`, err.message); return [] as AmapPOI[] }),
      )
    }
  }

  // Scenic + scenic sub-preferences
  if (preferences.includes('scenic')) {
    const genericScenicKws = scenicKeywords || '景点|名胜|故居|博物馆|寺庙|园林|地标|打卡'
    let scenicKws = genericScenicKws
    if (scenicTypes?.length) {
      const subKws = scenicTypes.map((st) => SCENIC_KEYWORDS[st]).filter(Boolean)
      if (subKws.length) scenicKws = `${genericScenicKws}|${subKws.join('|')}`
    }
    const customTerms = searchTermsFor(customKeywordsByPreference?.scenic ?? customKeywords)
    if (customTerms.length) scenicKws = `${scenicKws}|${customTerms.join('|')}`
    console.log(`Amap scenic text-search: keywords=${scenicKws}`)
    const scenicSearchTypes = scenicTypes?.includes('street')
      ? '110000|140000|060400'
      : '110000|140000'
    for (const page of [1, 2]) {
      promises.push(
        client
          .get<AmapTextResponse>('/place/text', {
            params: {
              location: `${lng},${lat}`,
              keywords: scenicKws,
              types: scenicSearchTypes,
              ...(adcode ? { city: adcode } : {}),
              offset: 25,
              page,
              extensions: 'all',
            },
          })
          .then((res) => (res.data.pois || []).map(raw => normalizePOI(raw, lng, lat)).filter(Boolean) as AmapPOI[])
          .catch((err) => { console.error(`Amap scenic text-search page=${page} FAILED:`, err.message); return [] as AmapPOI[] }),
      )
    }
  }

  // Wander sub-preferences with keywords
  if (preferences.includes('wander') && wanderTypes?.length) {
    for (const wt of wanderTypes) {
      const cfg = WANDER_CONFIG[wt]
      if (cfg?.keywords) {
        const searchTypes = cfg.types || '060000|080000'
        console.log(`Amap wander text-search (${wt}): keywords=${cfg.keywords} types=${searchTypes}`)
        promises.push(
          client
            .get<AmapTextResponse>('/place/text', {
              params: {
                location: `${lng},${lat}`,
                keywords: cfg.keywords,
                types: searchTypes,
                ...(adcode ? { city: adcode } : {}),
                offset: 10,
                page: 1,
                extensions: 'all',
              },
            })
            .then((res) => (res.data.pois || []).map(raw => normalizePOI(raw, lng, lat)).filter(Boolean) as AmapPOI[])
            .catch((err) => { console.error(`Amap wander text-search (${wt}) FAILED:`, err.message); return [] as AmapPOI[] }),
        )
      }
    }
  }

  const customWanderTerms = searchTermsFor(customKeywordsByPreference?.wander ?? (
    preferences.length === 1 && preferences[0] === 'wander' ? customKeywords : []
  ))
  if (preferences.includes('wander') && customWanderTerms.length > 0) {
    const keywords = customWanderTerms.join('|')
    promises.push(
      client
        .get<AmapTextResponse>('/place/text', {
          params: {
            location: `${lng},${lat}`,
            keywords,
            types: '050000|060000|070000|080000|110000|140000',
            ...(adcode ? { city: adcode } : {}),
            offset: 15,
            page: 1,
            extensions: 'all',
          },
        })
        .then((res) => (res.data.pois || []).map(raw => normalizePOI(raw, lng, lat)).filter(Boolean) as AmapPOI[])
        .catch((err) => { console.error('Amap custom wander search FAILED:', err.message); return [] as AmapPOI[] }),
    )
  }

  // Sparse popular areas need explicit category-aware variants. These are
  // supplementary text searches only: final distance enforcement remains in
  // the route/food policies after the merged candidates are normalized.
  if (areaName?.trim()) {
    const subtypesByPreference: Partial<Record<PreferenceTag, string[]>> = {
      food: cuisineTypes,
      scenic: scenicTypes,
      wander: wanderTypes,
    }
    for (const preference of preferences) {
      const recallQueries = buildRecallQueries({
        preference,
        subtypes: subtypesByPreference[preference] ?? [],
        area: areaName,
      })
      for (const query of recallQueries) {
        console.log(`Amap recall text-search (${preference}): keywords=${query.keywords} types=${query.types}`)
        promises.push(
          client
            .get<AmapTextResponse>('/place/text', {
              params: {
                location: `${lng},${lat}`,
                keywords: query.keywords,
                types: query.types,
                ...(adcode ? { city: adcode } : {}),
                offset: 25,
                page: 1,
                extensions: 'all',
              },
            })
            .then((res) => (res.data.pois || []).map(raw => normalizePOI(raw, lng, lat)).filter(Boolean) as AmapPOI[])
            .catch((err) => {
              console.error(`Amap recall text-search (${preference}) FAILED:`, err.message)
              return [] as AmapPOI[]
            }),
        )
      }
    }
  }

  await runAmapSearchTasks(searchTasks)
  const results = await Promise.all(promises)
  const allPois = results.flat()

  if (allPois.length === 0) {
    return []
  }

  const categoryInput = { cuisineTypes, scenicTypes, wanderTypes, areaName }
  const categoryKeywords = buildCategoryKeywords(categoryInput)
  const categoryTypecodes = buildCategoryTypecodePrefixes(categoryInput)
  const subtypePreferences = preferences.filter(preference =>
    (categoryKeywords[preference]?.length ?? 0) > 0
      || (categoryTypecodes[preference]?.length ?? 0) > 0,
  )
  const subtypePriority: PoiSubtypePriority = {
    keywords: [...new Set(subtypePreferences.flatMap(preference => categoryKeywords[preference] ?? []))],
    typecodePrefixes: [...new Set(subtypePreferences.flatMap(preference => categoryTypecodes[preference] ?? []))],
    groups: subtypePreferences.map(preference => ({
      keywords: categoryKeywords[preference] ?? [],
      typecodePrefixes: categoryTypecodes[preference] ?? [],
    })),
  }

  return dedupeAndSort(
    filterUsablePois(allPois).filter(poi => {
      if (!cuisineTypes?.includes('local_cuisine') || !poi.typecode.startsWith('05')) return true
      if (hasRegionalCuisineConflict(poi, areaName)) return false
      const localTerms = buildLocalCuisineTerms(areaName)
      const typecodeMatch = localTerms
        .filter(term => /^\d+$/.test(term))
        .some(prefix => poi.typecode.startsWith(prefix))
      const text = `${poi.name} ${poi.type}`.toLowerCase()
      const keywordMatch = localTerms
        .filter(term => !/^\d+$/.test(term))
        .some(term => text.includes(term.toLowerCase()))
      return typecodeMatch || keywordMatch
    }),
    wideMode,
    preferences.includes('scenic'),
    subtypePriority,
  )
}

/** Verify a single place name via Amap text-search.
 *  Returns the best-matching POI near the user, or null if not found.
 *  Uses Haversine distance for filtering (more reliable than Amap's reported distance). */
export async function verifyPlace(
  name: string,
  userLng: number,
  userLat: number,
  adcode?: string,
  maxDistance?: number,
): Promise<AmapPOI | null> {
  const client = getAmapClient()

  // Retry wrapper for QPS limit errors (Amap free tier is ~3 QPS)
  let lastError: string = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt))

    try {
      const res = await client.get<AmapTextResponse>('/place/text', {
        params: {
          keywords: name,
          location: `${userLng},${userLat}`,
          ...(adcode ? { city: adcode } : {}),
          offset: 5,
          page: 1,
          extensions: 'all',
        },
      })

    const pois = filterUsablePois(
      (res.data.pois || []).map(raw => normalizePOI(raw, userLng, userLat)).filter(Boolean) as AmapPOI[],
    )
    if (pois.length === 0) {
      console.warn(`⚠️ verifyPlace: no results for "${name}"`)
      return null
    }

    // Compute Haversine distance + name similarity score
    const searchName = normalizeName(name)
    const scored = pois.map((p) => {
      const poiName = normalizeName(p.name)
      // Score: how well does the POI name match the search name?
      // 100 = exact, 80 = POI name contains search name cleanly,
      // 60 = mutual substring, 40 = partial overlap, 0 = no match
      let sim = 0
      if (poiName === searchName) {
        sim = 100
      } else if (poiName.includes(searchName)) {
        // "新泾公园" inside "新泾公园南门" → good
        // But "新泾公园" inside "我爱我家(新泾公园店)" → suspicious: extra business prefix
        const prefix = poiName.replace(searchName, '').replace(/[()（）]/g, '').trim()
        // Extra text that makes this clearly NOT the place we want
        const isFalseMatch = /店|公司|派出所|警务室|居委会|街道办事处|服务站|中介|地产|房产|我爱我家|链家|贝壳|停车场|停车库|停车点|地铁站|出入口|入口|出口|厕所|卫生间|垃圾|配电|物业|管理处|收费/.test(prefix)
        sim = isFalseMatch ? 30 : 80
      } else if (searchName.includes(poiName)) {
        sim = 60
      } else {
        // Partial word overlap
        const overlap = [...searchName].filter((c) => poiName.includes(c)).length
        const ratio = overlap / Math.max(searchName.length, poiName.length)
        sim = Math.round(ratio * 40)
      }
      return {
        ...p,
        distance: haversineDist(userLat, userLng, p.lat, p.lng),
        _sim: sim,
      }
    })

    // Filter by maxDistance (0 = unlimited, skip filter)
    const filtered = maxDistance && maxDistance > 0
      ? scored.filter((p) => p.distance <= maxDistance)
      : scored

    if (filtered.length === 0) {
      console.warn(`⚠️ verifyPlace: "${name}" found but all too far (>${maxDistance}m)`)
      return null
    }

    // Sort: highest similarity first, then closest distance
    filtered.sort((a, b) => {
      if (b._sim !== a._sim) return b._sim - a._sim
      return a.distance - b.distance
    })

    // Skip false matches (sim=30) — try next best result first.
    // e.g. LLM says "豫园", Amap returns "豫园派出所"(sim=30) then "豫园"(sim=100)
    const best = filtered.find(p => p._sim >= 40)
    if (!best) {
      console.warn(`⚠️ verifyPlace: "${name}" no good match (best "${filtered[0]?.name}" sim=${filtered[0]?._sim})`)
      return null
    }

      console.log(`✅ verifyPlace: "${name}" → "${best.name}" (${best.distance}m, sim=${best._sim})`)
      return best
    } catch (err: any) {
      lastError = err.message
      if (err.message?.includes('QPS') || err.message?.includes('LIMIT')) {
        continue // retry after backoff
      }
      break // non-retryable error
    }
  }
  console.error(`verifyPlace failed for "${name}":`, lastError)
  return null
}
