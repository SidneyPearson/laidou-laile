import { getAmapClient } from './client.js'
import { haversineDist } from '../../utils/geo.js'
import { normalizeName } from '../../utils/text.js'
import type { AmapAroundResponse, AmapTextResponse, AmapPOI } from '../../types/poi.js'
import type { PreferenceTag } from '../../types/route.js'

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
function normalizePOI(raw: AmapAroundResponse['pois'][number]): AmapPOI | null {
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
    distance: parseInt(raw.distance, 10) || 0,
    rating: raw.biz_ext?.rating || null,
    cost: raw.biz_ext?.cost || null,
  }
}

/** Deduplicate POIs. When wideMode is true, sample across the full distance
 *  range instead of taking the closest ones — used for 全城范围 to avoid
 *  filling the candidate list with neighborhood parks. */
function dedupeAndSort(pois: AmapPOI[], wideMode = false): AmapPOI[] {
  const seen = new Set<string>()
  const unique: AmapPOI[] = []
  for (const poi of pois) {
    if (!seen.has(poi.id)) {
      seen.add(poi.id)
      unique.push(poi)
    }
  }
  unique.sort((a, b) => a.distance - b.distance)

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
}): Promise<AmapPOI[]> {
  const { lat, lng, distance, preferences, cuisineTypes, scenicTypes, wanderTypes, adcode, wideMode, scenicKeywords, skipAroundSearch } = params
  const client = getAmapClient()

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
            const pois = (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[]
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
    const kws = kwParts.join('|')
    console.log(`Amap food text-search: keywords=${kws}`)
    for (const page of [1, 2]) {
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
          .then((res) => (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[])
          .catch((err) => { console.error(`Amap food text-search page=${page} FAILED:`, err.message); return [] as AmapPOI[] }),
      )
    }
  }

  // Scenic + scenic sub-preferences
  if (preferences.includes('scenic')) {
    let scenicKws = scenicKeywords || '景点|名胜|故居|博物馆|寺庙|园林|地标|打卡'
    if (scenicTypes?.length) {
      const subKws = scenicTypes.map((st) => SCENIC_KEYWORDS[st]).filter(Boolean)
      if (subKws.length) scenicKws = subKws.join('|')
    }
    console.log(`Amap scenic text-search: keywords=${scenicKws}`)
    promises.push(
      client
        .get<AmapTextResponse>('/place/text', {
          params: {
            location: `${lng},${lat}`,
            keywords: scenicKws,
            types: '110000|140000',
            ...(adcode ? { city: adcode } : {}),
            offset: 10,
            page: 1,
            extensions: 'all',
          },
        })
        .then((res) => (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[])
        .catch((err) => { console.error('Amap scenic text-search FAILED:', err.message); return [] as AmapPOI[] }),
    )
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
            .then((res) => (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[])
            .catch((err) => { console.error(`Amap wander text-search (${wt}) FAILED:`, err.message); return [] as AmapPOI[] }),
        )
      }
    }
  }

  const results = await Promise.all(promises)
  const allPois = results.flat()

  if (allPois.length === 0) {
    return []
  }

  return dedupeAndSort(allPois, wideMode)
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

    const pois = (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[]
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

