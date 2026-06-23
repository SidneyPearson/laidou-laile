import { v4 as uuid } from 'uuid'
import { chatCompletionWithFallback } from './llm/client.js'
import { buildUserPrompt, buildRefinePrompt, SYSTEM_PROMPT } from './llm/prompt.js'
import { parseAndValidate, formatValidationErrors } from './llm/schema.js'
import { verifyPlace, searchNearbyPOIs, CUISINE_KEYWORDS } from './amap/poiSearch.js'
import { getAmapClient } from './amap/client.js'
import { haversineDist } from '../utils/geo.js'
import { normalizeName } from '../utils/text.js'
import type { AmapPOI, AmapTextResponse } from '../types/poi.js'
import type { Route, Stop, PreferenceTag } from '../types/route.js'

// ── Types ──────────────────────────────────────────────

export interface PlanInput {
  /** User position */
  position: { lat: number; lng: number }
  /** City / district name from reverse geocode */
  city: string
  /** Current weather text, e.g. "多云" */
  weather: string
  /** Available time in minutes: 30 | 60 | 120 | 240 */
  timeMinutes: number
  /** Search distance in meters */
  distance: number
  /** Selected preference tags */
  preferences: PreferenceTag[]
  /** Food sub-preferences */
  cuisineTypes?: string[]
  /** Scenic sub-preferences */
  scenicTypes?: string[]
  /** Wander sub-preferences */
  wanderTypes?: string[]
  /** Adcode for Amap city-scoped search */
  adcode?: string
}

export interface PlanOutput {
  routes: Route[]
  /** How the routes were generated */
  source: 'ai' | 'fallback'
  /** Reason for fallback (null if AI succeeded) */
  fallbackReason: string | null
}

// ── Main entry ────────────────────────────────────────

/**
 * LLM-first generation:
 * 1. LLM recommends specific places from its training data
 * 2. Amap text-search verifies each place and fills in coordinates
 * Falls back to rule-based generation if LLM fails.
 */
export async function generatePlan(input: PlanInput): Promise<PlanOutput> {
  // Try AI
  try {
    const aiRoutes = await tryAIGeneration(input)
    if (aiRoutes && aiRoutes.length > 0) {
      return { routes: aiRoutes, source: 'ai', fallbackReason: null }
    }
  } catch (err: any) {
    console.error('AI planning failed:', err.message)
  }

  // Return empty — caller should do POI search + fallback
  return {
    routes: [],
    source: 'fallback',
    fallbackReason: 'AI服务暂不可用，请重试',
  }
}

// ── Route refinement ────────────────────────────────────

export interface RefineInput {
  route: Route
  removeStopIndices: number[]
  extraRequirements?: string
  position: { lat: number; lng: number }
  city: string
  weather: string
  timeMinutes: number
  distance: number
  adcode?: string
}

/**
 * Refine an existing day-trip route: remove specified stops, optionally
 * add new requirements, and have LLM regenerate the route.
 * When only removing stops (no extra requirements), skips LLM entirely.
 */
export async function refinePlan(input: RefineInput): Promise<Route | null> {
  const { route, removeStopIndices, extraRequirements, position, city, weather, timeMinutes, adcode } = input

  // Filter out removed stops
  const keptStops = route.stops.filter((_, i) => !removeStopIndices.includes(i))
  const removedStops = route.stops.filter((_, i) => removeStopIndices.includes(i))

  if (keptStops.length === 0) return null

  // Frontend-only: no extra requirements → just return trimmed route
  if (!extraRequirements) {
    return {
      ...route,
      id: uuid(),
      stops: keptStops,
      totalDurationMinutes: keptStops.reduce((s, st) => s + st.visitDurationMinutes, 0) + 10,
      walkingDistanceMeters: Math.max(0, route.walkingDistanceMeters - removedStops.length * 200),
    }
  }

  // ── Compute search center & span from kept stops ────────
  // Use the geographic center of all kept stops, not just the first one.
  // A new stop placed by LLM near the end of the route might be >input.distance
  // away from the first stop, causing verifyPlace to miss it.
  const sumLat = keptStops.reduce((s, st) => s + st.lat, 0)
  const sumLng = keptStops.reduce((s, st) => s + st.lng, 0)
  const centerLat = sumLat / keptStops.length
  const centerLng = sumLng / keptStops.length

  // Span = max distance from center to any kept stop
  const spanMeters = Math.max(
    ...keptStops.map(s => haversineDist(centerLat, centerLng, s.lat, s.lng)),
    500,
  )

  // Max verification distance: cover the full route span + buffer, at least the input distance
  const maxDist = Math.max(input.distance > 0 ? input.distance : 2000, spanMeters * 2)

  // ── Extract cuisine keywords from extraRequirements for fallback ──
  const reqText = extraRequirements || ''
  const cuisineFallbackKeyword = extractCuisineKeyword(reqText)

  // Build refine prompt (include address/distance for spatial context)
  const prompt = buildRefinePrompt({
    city,
    weather,
    timeMinutes,
    existingStops: keptStops.map(s => ({
      name: s.name,
      notes: s.notes || '',
      address: s.address || '',
      distanceMeters: s.distanceMeters || 0,
      visitDurationMinutes: s.visitDurationMinutes,
    })),
    removedStops: removedStops.map(s => ({ name: s.name })),
    extraRequirements,
  })

  // Call LLM
  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
    })
  } catch (err: any) {
    console.error('Refine LLM call failed:', err.message)
    return null
  }

  // Parse & validate
  const parsed = parseAndValidate(raw)
  if (!parsed || !parsed.routes?.length) {
    console.warn('Refine: LLM output invalid, returning trimmed route')
    return null
  }

  const refined = parsed.routes[0]
  const keptNamesNorm = new Map(keptStops.map(s => [normalizeName(s.name), s]))
  const usedNames = new Set(keptStops.map(s => normalizeName(s.name)))

  /** Find a kept stop that matches the LLM stop name (fuzzy: normalize both sides).
   *  Each kept stop can only be matched ONCE — after matching, it's removed from
   *  the map so duplicate LLM outputs of the same stop don't create duplicates. */
  function matchKeptStop(llmName: string): Stop | undefined {
    const norm = normalizeName(llmName)
    if (keptNamesNorm.has(norm)) {
      const result = keptNamesNorm.get(norm)
      keptNamesNorm.delete(norm)
      return result
    }
    for (const [k, v] of keptNamesNorm) {
      if (k.includes(norm) || norm.includes(k)) {
        keptNamesNorm.delete(k)
        return v
      }
    }
    return undefined
  }

  // ── Step 1: Process LLM output — match kept stops, verify new ones ──
  const mergedStops: Stop[] = []
  const usedKeptNorm = new Set<string>()  // which kept stops were preserved by LLM
  const usedPoiIds = new Set(keptStops.map(s => s.amapPoiId).filter(Boolean) as string[])
  let newStopsDropped = 0
  let newStopsAdded = 0  // how many truly new stops were successfully added
  const droppedNames: string[] = []  // track dropped stop names for tips cleanup

  // Cuisine relevance filter: if user asked for a specific cuisine, reject
  // new stops that don't match (e.g. "世博源" mall when asking for 面馆)
  const cuisineFilter = cuisineFallbackKeyword
    ? cuisineFallbackKeyword.split('|').map(k => k.toLowerCase())
    : null

  for (const llmStop of refined.stops) {
    const matched = matchKeptStop(llmStop.name)
    if (matched) {
      mergedStops.push({
        ...matched,
        visitDurationMinutes: llmStop.visitDurationMinutes || matched.visitDurationMinutes,
      })
      usedKeptNorm.add(normalizeName(matched.name))
      continue
    }

    // Skip if this new stop's normalized name already appeared (LLM hallucinated duplicate)
    const llmNorm = normalizeName(llmStop.name)
    if (usedNames.has(llmNorm)) {
      console.warn(`Refine: skipping duplicate "${llmStop.name}"`)
      continue
    }

    // New stop → verify against Amap (use route center)
    let verified = await verifyPlace(llmStop.name, centerLng, centerLat, adcode, maxDist)

    // Fallback 1: cuisine keyword from extraRequirements
    if (!verified && cuisineFallbackKeyword) {
      console.log(`Refine: primary verify failed for "${llmStop.name}", trying cuisine fallback "${cuisineFallbackKeyword}"`)
      verified = await searchSingleCuisinePOI(cuisineFallbackKeyword, centerLng, centerLat, adcode, maxDist, usedNames)
      if (verified) console.log(`Refine: cuisine fallback found "${verified.name}"`)
    }

    // Fallback 2: keyword from stop name itself
    if (!verified) {
      const stopKw = extractCuisineKeyword(llmStop.name)
      if (stopKw && stopKw !== cuisineFallbackKeyword) {
        console.log(`Refine: trying stop-name keyword "${stopKw}" for "${llmStop.name}"`)
        verified = await searchSingleCuisinePOI(stopKw, centerLng, centerLat, adcode, maxDist, usedNames)
        if (verified) console.log(`Refine: stop-name fallback found "${verified.name}"`)
      }
    }

    if (verified) {
      // Dedup by POI ID
      if (usedPoiIds.has(verified.id)) {
        console.warn(`Refine: skipping duplicate POI "${verified.name}" (${verified.id})`)
        droppedNames.push(llmStop.name)
        newStopsDropped++
        continue
      }
      // Cuisine relevance filter: if user asked for 面馆, reject 世博源 mall
      if (cuisineFilter) {
        const verifiedNorm = normalizeName(verified.name)
        const isRelevant = cuisineFilter.some(kw => verifiedNorm.includes(kw))
        if (!isRelevant) {
          console.warn(`Refine: rejecting irrelevant stop "${verified.name}" (cuisine filter: ${cuisineFallbackKeyword})`)
          droppedNames.push(verified.name)
          newStopsDropped++
          continue
        }
      }
      usedPoiIds.add(verified.id)
      usedNames.add(normalizeName(verified.name))
      newStopsAdded++
      mergedStops.push({
        name: verified.name,
        address: verified.address,
        visitDurationMinutes: llmStop.visitDurationMinutes || 30,
        notes: llmStop.notes || '',
        amapPoiId: verified.id,
        lng: verified.lng,
        lat: verified.lat,
        distanceMeters: verified.distance > 0 ? verified.distance
          : Math.round(haversineDist(centerLat, centerLng, verified.lat, verified.lng)),
        photoTip: llmStop.photoTip,
      })
    } else {
      console.warn(`Refine: new stop "${llmStop.name}" not found on Amap, skipping`)
      droppedNames.push(llmStop.name)
      newStopsDropped++
    }
  }

  // ── Step 2: FORCE back any kept stops the LLM dropped ──
  // The LLM is unreliable — it often replaces kept stops despite instructions.
  // We guarantee kept stops are always present by re-inserting any that went missing.
  for (const kept of keptStops) {
    if (!usedKeptNorm.has(normalizeName(kept.name))) {
      console.log(`Refine: LLM dropped "${kept.name}" — forcing back into route`)
      mergedStops.push(kept)
    }
  }

  if (mergedStops.length === 0) return null

  // ── Step 2.5: Force-add from cuisine search when LLM fails to add anything ──
  // LLM often just mentions shops in tips instead of adding them as stops,
  // or suggests mall names instead of specific restaurants. When the user
  // asked for a cuisine type but no new stops were added, brute-force one
  // from Amap around-search (which finds mall-internal shops too).
  if (newStopsAdded === 0 && extraRequirements && cuisineFallbackKeyword) {
    console.log(`Refine: LLM added 0 new stops, force-searching cuisine "${cuisineFallbackKeyword}"`)
    const forceNames = new Set(mergedStops.map(s => normalizeName(s.name)))
    const forced = await searchSingleCuisinePOI(
      cuisineFallbackKeyword, centerLng, centerLat, adcode, maxDist, forceNames,
    )
    if (forced) {
      mergedStops.push({
        name: forced.name,
        address: forced.address,
        visitDurationMinutes: 30,
        notes: forced.address
          ? `${forced.address}${forced.rating ? `，评分 ${forced.rating}` : ''}`
          : '',
        amapPoiId: forced.id,
        lng: forced.lng,
        lat: forced.lat,
        distanceMeters: forced.distance,
      })
      newStopsAdded++
      console.log(`Refine: force-added "${forced.name}" (${forced.distance}m, rating=${forced.rating})`)
    } else {
      console.warn(`Refine: force-search also found nothing for "${cuisineFallbackKeyword}"`)
    }
  }

  // ── Step 3: Sort geographically along the route axis ──
  // Project each stop onto the line from first→last kept stop, sort by projection.
  // This ensures a natural walking order regardless of LLM's whims.
  const firstKept = keptStops[0]
  const lastKept = keptStops[keptStops.length - 1]
  const axisLat = lastKept.lat - firstKept.lat
  const axisLng = lastKept.lng - firstKept.lng
  const axisLen = Math.sqrt(axisLat * axisLat + axisLng * axisLng) || 1

  mergedStops.sort((a, b) => {
    const projA = ((a.lat - firstKept.lat) * axisLat + (a.lng - firstKept.lng) * axisLng) / axisLen
    const projB = ((b.lat - firstKept.lat) * axisLat + (b.lng - firstKept.lng) * axisLng) / axisLen
    return projA - projB
  })

  // ── Step 4: Recompute metrics from actual stops ──
  const actualDuration = mergedStops.reduce((s, st) => s + st.visitDurationMinutes, 0) + 10
  let actualWalking = 0
  for (let i = 1; i < mergedStops.length; i++) {
    actualWalking += haversineDist(
      mergedStops[i - 1].lat, mergedStops[i - 1].lng,
      mergedStops[i].lat, mergedStops[i].lng,
    )
  }
  actualWalking = Math.round(actualWalking)

  // Route name: only use LLM's name if new stops were actually added
  const routeName = newStopsAdded > 0 ? (refined.name || route.name) : route.name
  const routeTagline = newStopsAdded > 0 ? (refined.tagline || route.tagline) : route.tagline

  // Clean up tips: remove sentences referencing dropped/irrelevant stops
  let tips = refined.tips || route.tips || ''
  if (droppedNames.length > 0 && tips) {
    // Split by Chinese/English sentence boundaries
    const sentences = tips.split(/(?<=[。！？.!?])/)
    const filtered = sentences.filter(s => {
      const keep = !droppedNames.some(dn => s.includes(dn))
      if (!keep) console.log(`Refine: stripping tip referencing "${s.trim()}"`)
      return keep
    })
    tips = filtered.join('').trim()
    // If tips became too short or empty, fall back to original
    if (tips.length < 10) tips = route.tips || ''
  }

  return {
    id: uuid(),
    name: routeName,
    tagline: routeTagline,
    stops: mergedStops,
    totalDurationMinutes: actualDuration,
    walkingDistanceMeters: actualWalking,
    tips,
  }
}

// ── Refine helpers ──────────────────────────────────────

/** Map of keywords → Amap text-search keyword string */
const CUISINE_FALLBACK_MAP: Record<string, string> = {
  '面馆': '面馆|面庄|拉面|米线|粉',
  '面': '面馆|面庄|拉面|米线|粉',
  '面条': '面馆|面庄|拉面|米线|粉',
  '拉面': '拉面|面馆',
  '火锅': '火锅|串串|涮肉',
  '涮肉': '火锅|涮肉',
  '烧烤': '烧烤|烤肉',
  '烤肉': '烤肉|烧烤',
  '咖啡': '咖啡馆|咖啡厅',
  '奶茶': '奶茶|茶饮',
  '茶': '茶馆|茶室|茶饮',
  '糕点': '糕点|面包|蛋糕|烘焙',
  '面包': '面包|烘焙|糕点',
  '西餐': '西餐|牛排|意面|披萨',
  '自助': '自助餐|自助',
  '串串': '串串|火锅',
  '小吃': '小吃|快餐|美食',
  '美食': '美食|餐厅',
}

/** Extract a cuisine keyword from text, matching against known categories */
function extractCuisineKeyword(text: string): string | null {
  // Sort by key length (descending) so longer matches win (e.g. "自助餐" before "自助")
  const keys = Object.keys(CUISINE_FALLBACK_MAP).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (text.includes(key)) {
      return CUISINE_FALLBACK_MAP[key]
    }
  }
  return null
}

/** Estimate walk distance between verified stops using Haversine, sorted geographically */
function estimateWalkDistFromStops(stops: Stop[]): number {
  if (stops.length <= 1) return 0
  // Sort geographically: project onto the line from first to last stop
  const first = stops[0]
  const last = stops[stops.length - 1]
  const axisLat = last.lat - first.lat
  const axisLng = last.lng - first.lng
  const axisLen = Math.sqrt(axisLat * axisLat + axisLng * axisLng) || 1
  const sorted = [...stops].sort((a, b) => {
    const projA = ((a.lat - first.lat) * axisLat + (a.lng - first.lng) * axisLng) / axisLen
    const projB = ((b.lat - first.lat) * axisLat + (b.lng - first.lng) * axisLng) / axisLen
    return projA - projB
  })
  let total = 0
  for (let i = 1; i < sorted.length; i++) {
    total += haversineDist(
      sorted[i - 1].lat, sorted[i - 1].lng,
      sorted[i].lat, sorted[i].lng,
    )
  }
  return Math.round(total)
}

function estimateWalkDist(pois: AmapPOI[]): number {
  if (pois.length <= 1) return 0
  const first = pois[0]
  const last = pois[pois.length - 1]
  const axisLat = last.lat - first.lat
  const axisLng = last.lng - first.lng
  const axisLen = Math.sqrt(axisLat * axisLat + axisLng * axisLng) || 1
  const sorted = [...pois].sort((a, b) => {
    const projA = ((a.lat - first.lat) * axisLat + (a.lng - first.lng) * axisLng) / axisLen
    const projB = ((b.lat - first.lat) * axisLat + (b.lng - first.lng) * axisLng) / axisLen
    return projA - projB
  })
  let total = 0
  for (let i = 1; i < sorted.length; i++) {
    total += haversineDist(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng)
  }
  return Math.round(total)
}

/**
 * Search Amap for a single POI matching cuisine keywords near the route center.
 * Returns the best match not already used in the route.
 * Tries two strategies: text search first (good for standalone shops), then
 * around-search (finds shops inside malls that text search misses, like
 * "芳圆阁面馆(世博源2区店)" that lives inside 世博源 mall).
 */
async function searchSingleCuisinePOI(
  keywordAmap: string,
  lng: number,
  lat: number,
  adcode: string | undefined,
  maxDist: number,
  usedNames: Set<string>,
): Promise<AmapPOI | null> {
  const client = getAmapClient()
  const FALSE_RE = /派出所|警务室|居委会|街道办事处|服务站|中介|地产|房产|停车场|停车库|停车点|地铁站|出入口|厕所|卫生间|垃圾|配电|物业|管理处|收费/

  /** Parse Amap raw POI list into typed & filtered candidates */
  function pickBest(rawPois: any[]): AmapPOI | null {
    const pois = rawPois
      .map((raw): AmapPOI | null => {
        if (!raw.location || !raw.location.includes(',')) return null
        const [poiLng, poiLat] = raw.location.split(',').map(Number)
        if (isNaN(poiLng) || isNaN(poiLat)) return null
        const dist = haversineDist(lat, lng, poiLat, poiLng)
        return {
          id: raw.id, name: raw.name, type: raw.type, typecode: raw.typecode || '',
          address: raw.address || '', lng: poiLng, lat: poiLat,
          distance: Math.round(dist),
          rating: raw.biz_ext?.rating || null,
          cost: raw.biz_ext?.cost || null,
        }
      })
      .filter((p): p is AmapPOI => p !== null)

    const candidates = pois
      .filter((p) => {
        if (maxDist > 0 && p.distance > maxDist) return false
        if (usedNames.has(normalizeName(p.name))) return false
        if (FALSE_RE.test(p.name)) return false
        return true
      })
      .sort((a, b) => a.distance - b.distance)

    return candidates[0] || null
  }

  // Strategy 1: text search (location-biased, good for standalone shops)
  try {
    const res = await client.get<AmapTextResponse>('/place/text', {
      params: {
        keywords: keywordAmap,
        location: `${lng},${lat}`,
        ...(adcode ? { city: adcode } : {}),
        offset: 10, page: 1, extensions: 'all',
      },
    })
    const found = pickBest(res.data.pois || [])
    if (found) return found
  } catch (err: any) {
    console.warn(`searchSingleCuisinePOI text-search failed for "${keywordAmap}":`, err.message)
  }

  // Strategy 2: around-search within radius (finds mall-internal shops that
  // text-search misses — e.g. "芳圆阁面馆(世博源2区店)" inside 世博源 mall)
  try {
    const radius = Math.min(maxDist > 0 ? maxDist : 3000, 3000)
    const res = await client.get<AmapTextResponse>('/place/around', {
      params: {
        keywords: keywordAmap,
        location: `${lng},${lat}`,
        radius,
        types: '050000', // food-related only
        offset: 10, page: 1, extensions: 'all',
      },
    })
    const found = pickBest(res.data.pois || [])
    if (found) {
      console.log(`Refine: around-search found "${found.name}" (${found.distance}m, rating=${found.rating})`)
      return found
    }
  } catch (err: any) {
    console.warn(`searchSingleCuisinePOI around-search failed for "${keywordAmap}":`, err.message)
  }

  return null
}

// ── Food list (no cuisine type) ────────────────────────

/**
 * When user selects food but no specific cuisine type, switch to a hybrid approach:
 * 1. Search Amap for nearby food POIs
 * 2. LLM scores and curates the best ones
 * 3. Return as a single "美食清单" route with AI-scored stops
 */
async function generateFoodList(input: PlanInput): Promise<Route[] | null> {
  const { position, distance, timeMinutes, adcode, cuisineTypes } = input

  // Step 1: Search Amap for nearby food
  const pois = await searchNearbyPOIs({
    lat: position.lat,
    lng: position.lng,
    distance,
    timeOption: timeMinutes,
    preferences: ['food'],
    adcode,
    cuisineTypes: cuisineTypes as string[] | undefined,
    // Skip around-search: it returns ALL food types, we only want the specific cuisine
    skipAroundSearch: (cuisineTypes?.length ?? 0) > 0,
  })

  if (pois.length === 0) return null

  // Filter to user's actual distance.
  // Use Haversine when Amap distance is 0 (text-search returns no distance field)
  const withinDistance = distance > 0
    ? pois.filter(p => {
        const dist = p.distance > 0 ? p.distance
          : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
        return dist <= distance
      })
    : pois

  if (withinDistance.length === 0) return null

  // Pre-filter: for cuisine-specific searches, prioritize POIs whose name
  // matches the cuisine keywords (e.g. 面/粉 for noodles). LLM scoring
  // sometimes misses shops that don't have obvious names.
  let filtered = withinDistance
  if (cuisineTypes?.length) {
    const pattern = cuisineTypes.map(c => CUISINE_NAME_RE[c]).filter(Boolean)
    if (pattern.length > 0) {
      const re = new RegExp(pattern.map(p => p.source).join('|'))
      const matching = withinDistance.filter(p => re.test(p.name))
      // Use matching results first, then fill with non-matching to reach ~20
      const nonMatching = withinDistance.filter(p => !re.test(p.name))
      filtered = [...matching, ...nonMatching]
    }
  }

  // Take top candidates (max 20) for LLM to score
  const candidates = filtered.slice(0, 20)

  // Step 2: Build prompt for LLM scoring
  const poiTable = candidates.map((p, i) =>
    `${i + 1}. ${p.name} | ${p.type || '餐饮'} | ${p.address} | 距您${fmtDist(p.distance)} | 高德评分:${p.rating || '无'}`
  ).join('\n')

  const scoringPrompt = `你是一个资深美食评论家，名叫"阿来"。下面是你附近的一些餐厅，请根据你的知识对它们进行评分和筛选。

## 餐厅列表
${poiTable}

## 任务
从以上列表中选出最好的 5-8 家，根据以下维度综合打分（1-5分，可带小数点）：
- 口碑：大众点评/美食圈的评价
- 特色：是否有招牌菜、独特风味
- 性价比：价格是否合理
- 氛围：环境和服务

对每家入选的餐厅写一句简短点评（15字以内），说明推荐理由。

只输出 JSON，不要其他内容：
{
  "foodList": [
    { "name": "店名（保持原名）", "score": 4.5, "comment": "简短推荐理由" }
  ]
}
按 score 从高到低排序。`

  // Step 3: Call LLM
  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: '你是一个资深美食评论家，对各地餐厅了如指掌。只输出 JSON。' },
        { role: 'user', content: scoringPrompt },
      ],
      temperature: 0.5,
    })
  } catch {
    // LLM failed → return plain list without AI scores
    return buildPlainFoodList(candidates, input)
  }

  // Step 4: Parse LLM response
  let scored: Array<{ name: string; score: number; comment: string }> = []
  try {
    let json = raw.trim()
    if (json.startsWith('```')) json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed.foodList)) scored = parsed.foodList
  } catch {
    console.warn('Failed to parse LLM food scoring, using plain list')
  }

  if (scored.length === 0) return buildPlainFoodList(candidates, input)

  // Step 5: Match scored names back to Amap POIs
  const poiByName = new Map<string, AmapPOI>()
  for (const p of candidates) {
    poiByName.set(p.name, p)
    // Also index by simplified name for fuzzy match
    const simple = p.name.replace(/[（(][^)）]*[)）]/g, '').trim()
    if (simple !== p.name) poiByName.set(simple, p)
  }

  const stops: Stop[] = []
  for (const item of scored) {
    let poi = poiByName.get(item.name)
    // Fuzzy match if exact fails
    if (!poi) {
      for (const [key, p] of poiByName) {
        if (key.includes(item.name) || item.name.includes(key)) {
          poi = p
          break
        }
      }
    }
    if (!poi) {
      console.warn(`⚠️ Food list: scored item not found in POIs: "${item.name}"`)
      continue
    }

    const stars = '⭐'.repeat(Math.round(item.score))
    // Use Amap distance or compute from coordinates as fallback
    const dist = poi.distance > 0 ? poi.distance : Math.round(haversineDist(position.lat, position.lng, poi.lat, poi.lng))
    stops.push({
      name: poi.name,
      address: poi.address,
      visitDurationMinutes: 30,
      notes: `${stars} ${item.score.toFixed(1)} ${item.comment}`,
      amapPoiId: poi.id,
      lng: poi.lng,
      lat: poi.lat,
      distanceMeters: dist,
    })
  }

  if (stops.length === 0) return null

  const walkDist = estimateWalkDistFromStops(stops)
  const totalDur = stops.length * 30 + Math.ceil(walkDist / 100 * 1.5)

  return [{
    id: uuid(),
    name: '附近美食清单',
    tagline: `AI 精选 ${stops.length} 家，按评分排序`,
    stops,
    totalDurationMinutes: totalDur,
    walkingDistanceMeters: walkDist,
    tips: '评分基于口碑、特色、性价比、氛围综合评定，仅供参考',
  }]
}

/** Fallback plain food list without AI scores */
function buildPlainFoodList(candidates: AmapPOI[], input: PlanInput): Route[] | null {
  const { position } = input
  const maxStops = Math.min(8, candidates.length)
  const stops: Stop[] = candidates.slice(0, maxStops).map((p) => {
    const dist = p.distance > 0 ? p.distance : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
    return {
      name: p.name,
      address: p.address,
      visitDurationMinutes: 30,
      notes: `${p.address}，距您${fmtDist(dist)}${p.rating ? `，高德评分 ${p.rating}` : ''}`,
      amapPoiId: p.id,
      lng: p.lng,
      lat: p.lat,
      distanceMeters: dist,
    }
  })

  const walkDist = estimateWalkDistFromStops(stops)
  return [{
    id: uuid(),
    name: '附近美食清单',
    tagline: `附近 ${stops.length} 家餐厅`,
    stops,
    totalDurationMinutes: stops.length * 30 + Math.ceil(walkDist / 100 * 1.5),
    walkingDistanceMeters: walkDist,
    tips: '未获取 AI 评分，按距离排序',
  }]
}

// ── Cuisine comparison (multiple cuisine types) ──────────

/** Cuisine name patterns for POI classification */
const CUISINE_NAME_RE: Record<string, RegExp> = {
  hotpot: /火锅|涮|串串/,
  noodles: /面|粉|米线/,
  coffee_tea: /咖啡|奶茶|茶|饮/,
  bbq: /烧烤|烤肉/,
  pastries: /糕点|面包|烘焙|点/,
  western: /西餐|牛排|披萨|意面|萨莉亚/,
  local_cuisine: /本帮|老字号|本地|特色/,
  buffet: /自助/,
}

const CUISINE_LABEL: Record<string, string> = {
  hotpot: '火锅', noodles: '面馆', pastries: '糕点', bbq: '烧烤',
  local_cuisine: '地方菜', western: '西餐', coffee_tea: '奶茶咖啡', buffet: '自助餐',
}

/**
 * When user selects food + cuisine types, generate 3 comparison cards by dimension
 * (评分最高 / 距离最近 / 最多打卡).
 *
 * Single cuisine type (e.g. just 火锅): each card has TOP 3 shops of that type.
 * Multiple cuisine types: each card has 1 shop per type (cross-cuisine comparison).
 */
async function generateCuisineComparison(input: PlanInput): Promise<Route[] | null> {
  const { position, distance, adcode, cuisineTypes } = input
  if (!cuisineTypes?.length) return null

  // Single-cuisine: 3 stops per card; multi-cuisine: 1 stop per type
  const STOPS_PER_TYPE = cuisineTypes.length === 1 ? 3 : 1
  // Need more POIs when picking top 3
  const SEARCH_OFFSET = cuisineTypes.length === 1 ? 20 : 10

  // Step 1: Separate Amap text-search per cuisine type (combined keywords
  // bias results toward the dominant cuisine, drowning out the others).
  const client = getAmapClient()
  const cuisinePOIs = new Map<string, AmapPOI[]>()

  for (const ct of cuisineTypes) {
    const kws = CUISINE_KEYWORDS[ct]
    if (!kws) continue
    try {
      const res = await client.get<AmapTextResponse>('/place/text', {
        params: {
          location: `${position.lng},${position.lat}`,
          keywords: kws,
          types: '050000',
          ...(adcode ? { city: adcode } : {}),
          offset: SEARCH_OFFSET,
          page: 1,
          extensions: 'all',
        },
      })
      const pois = (res.data.pois || []).map((raw) => {
        if (!raw.location?.includes(',')) return null
        const [lng, lat] = raw.location.split(',').map(Number)
        if (isNaN(lng) || isNaN(lat)) return null
        return {
          id: raw.id, name: raw.name, type: raw.type, typecode: raw.typecode || '',
          address: raw.address || '', lng, lat,
          distance: parseInt(raw.distance, 10) || 0,
          rating: raw.biz_ext?.rating || null,
          cost: raw.biz_ext?.cost || null,
        }
      }).filter((p): p is AmapPOI => p !== null)
      if (pois.length > 0) cuisinePOIs.set(ct, pois)
    } catch (err: any) {
      console.error(`Cuisine search failed for ${ct}:`, err.message)
    }
  }

  if (cuisinePOIs.size === 0) return null

  // Step 2: Enrich with Haversine distance + per-cuisine search index
  type ScoredPOI = AmapPOI & { _dist: number; _rating: number; _cost: number; _idx: number }
  const allScored: ScoredPOI[] = []
  for (const [ct, pois] of cuisinePOIs) {
    for (let i = 0; i < pois.length; i++) {
      const p = pois[i]
      const dist = p.distance > 0 ? p.distance
        : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
      if (distance > 0 && dist > distance) continue
      allScored.push({
        ...p, _dist: dist,
        _rating: p.rating ? parseFloat(p.rating) : 0,
        _cost: p.cost ? parseFloat(p.cost) : 0,
        _idx: i, // per-cuisine search rank
      })
    }
  }

  if (allScored.length === 0) return null

  // Group by cuisine type (search source), then cross-check with name regex
  // to prevent misclassification: e.g. "额尔敦传统涮" returned by local_cuisine
  // search but its name contains "涮" → should be hotpot, not local_cuisine.
  const separated = new Map<string, ScoredPOI[]>()
  for (const ct of cuisineTypes) {
    const ownRe = CUISINE_NAME_RE[ct]
    const otherCts = cuisineTypes.filter(c => c !== ct)
    const matched = allScored.filter(p => {
      if (!cuisinePOIs.get(ct)?.some(pp => pp.id === p.id)) return false
      // Cross-check: if this POI matches another cuisine's name regex AND
      // doesn't match its own regex, it's likely misclassified → filter out
      for (const otherCt of otherCts) {
        const otherRe = CUISINE_NAME_RE[otherCt]
        if (otherRe && otherRe.test(p.name) && (!ownRe || !ownRe.test(p.name))) {
          return false
        }
      }
      return true
    })
    if (matched.length > 0) separated.set(ct, matched)
  }
  if (separated.size === 0) return null

  // Step 4: Define 3 permanent dimensions (评分/距离/打卡)
  const dimensions: Array<{
    key: string
    label: string   // badge on card
    slogan: string  // card title
    scorer: (p: ScoredPOI) => number
  }> = [
    { key: 'rating', label: '评分最高', slogan: '口碑之选，好评如潮',
      scorer: (p) => p._rating },
    { key: 'distance', label: '距离最近', slogan: '步行可达，方便省时',
      scorer: (p) => -p._dist },
    { key: 'popularity', label: '最多打卡', slogan: '最多打卡，人气爆棚',
      scorer: (p) => p._rating * 0.6 + (1 / (p._idx + 1)) * 4 },
  ]

  // Step 5: Build routes — for each dimension, pick top N shops per cuisine.
  // Single cuisine → 3 stops (competing shops), multi cuisine → 1 per type.
  // Shops CAN repeat across routes (a shop might be #1 in multiple dimensions).
  const routes: Route[] = []
  const rankEmoji = ['🥇', '🥈', '🥉']

  for (const dim of dimensions) {
    const used = new Set<string>() // per-route dedup only
    const stops: Stop[] = []

    for (const ct of cuisineTypes) {
      const list = separated.get(ct)
      if (!list || list.length === 0) continue

      // Sort by dimension scorer, pick top N unused
      const sorted = [...list].sort((a, b) => dim.scorer(b) - dim.scorer(a))
      const picks = sorted.filter(p => !used.has(p.id)).slice(0, STOPS_PER_TYPE)

      for (let pi = 0; pi < picks.length; pi++) {
        const best = picks[pi]
        used.add(best.id)

        const cuLabel = CUISINE_LABEL[ct] || ct
        const distStr = fmtDist(best._dist)
        const ratingStr = best._rating > 0 ? `，评分 ${best._rating.toFixed(1)}` : ''
        const costStr = best._cost > 0 ? `，人均 ¥${Math.round(best._cost)}` : ''
        // Show ranking for single-cuisine top-3 cards
        const rankPrefix = STOPS_PER_TYPE > 1 ? `${rankEmoji[pi] || ''} ` : ''

        stops.push({
          name: best.name,
          address: best.address,
          visitDurationMinutes: 35,
          notes: `${rankPrefix}【${cuLabel}】${best.address}，距您${distStr}${ratingStr}${costStr}`,
          amapPoiId: best.id,
          lng: best.lng,
          lat: best.lat,
          distanceMeters: best._dist,
        })
      }
    }

    if (stops.length === 0) continue

    const cuNames = cuisineTypes.map(c => CUISINE_LABEL[c] || c).join('+')
    const topSuffix = STOPS_PER_TYPE > 1 ? ` TOP${STOPS_PER_TYPE}` : ''
    routes.push({
      id: uuid(),
      name: dim.slogan,                       // title: "口碑之选，好评如潮"
      tagline: `${dim.label} · ${cuNames}${topSuffix}`,   // badge: "评分最高 · 火锅 TOP3"
      stops,
      totalDurationMinutes: stops.length * 35 + 10,
      walkingDistanceMeters: estimateWalkDistFromStops(stops),
      tips: dim.key === 'rating'
        ? '评分来自高德地图用户评价，仅供参考'
        : dim.key === 'popularity'
          ? '综合评分和搜索热度排序'
          : '距离由近到远排列',
    })
  }

  if (routes.length === 0) return null

  // Step 6: LLM enhances notes with personalized recommendations
  try {
    return await enhanceComparisonNotes(routes, input)
  } catch {
    return routes
  }
}

/** Use LLM to add personalized food notes to comparison routes */
async function enhanceComparisonNotes(routes: Route[], input: PlanInput): Promise<Route[]> {
  const { cuisineTypes, weather } = input
  const cuNames = cuisineTypes?.map(c => CUISINE_LABEL[c] || c).join('和') || ''

  // Build a compact list of all stops
  const stopList = routes.flatMap((r, ri) =>
    r.stops.map((s, si) => `[${r.name}] ${s.name} | ${s.address} | ${s.notes}`)
  ).join('\n')

  const prompt = `你是资深美食评论家"阿来"。用户想找${cuNames}，已按 3 个维度为你选出以下店铺：

${stopList}

## 任务
为每家店写一句点评（12字以内），说明推荐理由或招牌菜。
保持原有维度分类（评分最高/距离最近/最多打卡/最具性价比），不要改动店铺分配。
人均价格和评分信息保持不变。

只输出 JSON：
{
  "notes": {
    "店名": "推荐理由",
    ...
  }
}`

  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: '你是资深美食评论家，对各地餐厅了如指掌。只输出 JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
    })
  } catch {
    return routes
  }

  // Parse LLM notes
  let notesMap: Record<string, string> = {}
  try {
    let json = raw.trim()
    if (json.startsWith('```')) json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(json)
    if (parsed.notes) notesMap = parsed.notes
  } catch {
    return routes // Keep original notes if parsing fails
  }

  // Apply notes to stops
  for (const r of routes) {
    for (const s of r.stops) {
      const enhanced = notesMap[s.name]
      if (enhanced) {
        // Replace generic notes with LLM-enhanced version
        // Keep the cuisine label and distance, replace the address-based note
        const prefix = s.notes.match(/^【.+?】/) // Keep cuisine label
        const distMatch = s.notes.match(/距您[\d.]+(?:m|km)/)
        const ratingMatch = s.notes.match(/，评分 [\d.]+/)
        const costMatch = s.notes.match(/，人均 ¥\d+/)
        const suffix = [distMatch?.[0], ratingMatch?.[0], costMatch?.[0]].filter(Boolean).join('')
        s.notes = `${prefix ? prefix[0] : ''}${enhanced}${suffix ? '，' + suffix : ''}`
      }
    }
  }

  return routes
}

// ── Scenic / Wander list modes ─────────────────────────

/**
 * Scenic-only without sub-types: search Amap for scenic POIs, LLM organizes into themed routes.
 */
async function generateScenicRoutes(input: PlanInput): Promise<Route[] | null> {
  // 全城范围用更明确的热门景点关键词，避免搜到社区公园
  const isCityWide = input.distance === 0
  const scenicKws = isCityWide
    ? `${input.city}必去|${input.city}地标|著名景点|5A景区|热门景点|名胜古迹`
    : '景点|名胜|地标|故居|博物馆|园林|打卡'
  return generateThemedRoutes(input, ['scenic'], '景点|名胜|地标|故居|博物馆|园林|打卡', scenicKws)
}

async function generateWanderRoutes(input: PlanInput): Promise<Route[] | null> {
  return generateThemedRoutes(input, ['wander'], '商场|咖啡馆|特色街|博物馆|书店|文创|娱乐')
}

/**
 * Reusable: search Amap for POIs by preference, LLM organizes into 2-3 themed routes.
 */
async function generateThemedRoutes(
  input: PlanInput,
  preferences: PreferenceTag[],
  fallbackKeywords: string,
  scenicKeywords?: string,
): Promise<Route[] | null> {
  const { position, distance, timeMinutes, adcode, city, weather } = input

  const pois = await searchNearbyPOIs({
    lat: position.lat, lng: position.lng,
    distance, timeOption: timeMinutes as any,
    preferences: preferences as any,
    adcode,
    wideMode: distance === 0,
    scenicKeywords,
  })

  if (pois.length === 0) return null

  // For 全城范围 (distance=0), take from the FAR end: distant POIs are more
  // likely to be famous landmarks, while nearby ones are neighborhood parks.
  // Reverse so the closest among the far group comes first (LLM can still use).
  const candidates = distance === 0
    ? pois.slice(-30).reverse()
    : pois.slice(0, 30)

  const poiTable = candidates.map((p, i) =>
    `${i + 1}. ${p.name} | ${p.type || ''} | ${p.address} | 距您${fmtDist(p.distance)}`
  ).join('\n')

  const prompt = `你是${city}的资深导游。以下是通过高德地图搜索到的附近地点，请从中挑选最好的 3-8 个，组织成 2-3 条主题各异的游玩路线。

## 可选地点
${poiTable}

## 要求
- 2-3 条路线，主题明显不同
- 每条路线 1-3 个 stop
- 路线名简短有记忆点（3-8字），符合${city}本地特色
- 每个 stop 的 notes 写简短介绍（15字以内）
- tips 中体现天气建议（当前天气：${weather}）

只输出 JSON，格式：
{
  "routes": [
    { "name": "路线名", "tagline": "一句话特色", "stops": [
      { "name": "地点名", "visitDurationMinutes": 40, "notes": "简短介绍" }
    ], "tips": "实用小贴士" }
  ]
}`

  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: `你是${city}的资深导游，熟悉本地每一个角落。只输出 JSON。` },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
    })
  } catch {
    return buildSimpleThemedRoutes(candidates, preferences, fallbackKeywords, input)
  }

  // Parse LLM response
  try {
    let json = raw.trim()
    if (json.startsWith('```')) json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed.routes) || parsed.routes.length === 0) {
      return buildSimpleThemedRoutes(candidates, preferences, fallbackKeywords, input)
    }

    // Match stop names back to POI data
    const poiByName = new Map<string, AmapPOI>()
    for (const p of candidates) {
      poiByName.set(p.name, p)
      const simple = p.name.replace(/[（(][^)）]*[)）]/g, '').trim()
      if (simple !== p.name) poiByName.set(simple, p)
    }

    const routes: Route[] = []
    for (const r of parsed.routes) {
      const stops: Stop[] = []
      for (const s of (r.stops || [])) {
        let poi = poiByName.get(s.name)
        if (!poi) {
          for (const [key, p] of poiByName) {
            if (key.includes(s.name) || s.name.includes(key)) { poi = p; break }
          }
        }
        if (!poi) continue
        const dist = poi.distance > 0 ? poi.distance : Math.round(haversineDist(position.lat, position.lng, poi.lat, poi.lng))
        stops.push({
          name: poi.name, address: poi.address,
          visitDurationMinutes: s.visitDurationMinutes || 40,
          notes: s.notes || poi.address,
          amapPoiId: poi.id, lng: poi.lng, lat: poi.lat,
          distanceMeters: dist,
        })
      }
      if (stops.length > 0) {
        const walkDist = estimateWalkDistFromStops(stops)
        routes.push({
          id: uuid(), name: r.name, tagline: r.tagline || `${stops.length}个地点`,
          stops,
          totalDurationMinutes: stops.reduce((s, st) => s + st.visitDurationMinutes, 0) + Math.ceil(walkDist / 100 * 1.5),
          walkingDistanceMeters: walkDist,
          tips: r.tips || '祝你玩得开心',
        })
      }
    }
    if (routes.length > 0) return routes
  } catch {
    console.warn('Failed to parse LLM themed routes')
  }

  return buildSimpleThemedRoutes(candidates, preferences, fallbackKeywords, input)
}

/** Simple fallback: split POIs into routes by distance */
function buildSimpleThemedRoutes(
  candidates: AmapPOI[],
  _preferences: PreferenceTag[],
  _keywords: string,
  input: PlanInput,
): Route[] | null {
  const { position } = input
  const top = candidates.slice(0, 9)
  if (top.length === 0) return null

  const routes: Route[] = []
  const perRoute = Math.min(3, Math.ceil(top.length / 3))
  const chunks = Math.min(3, Math.ceil(top.length / perRoute))

  for (let i = 0; i < chunks; i++) {
    const chunk = top.slice(i * perRoute, (i + 1) * perRoute)
    if (chunk.length === 0) continue
    const stops: Stop[] = chunk.map((p) => {
      const dist = p.distance > 0 ? p.distance : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
      return {
        name: p.name, address: p.address,
        visitDurationMinutes: 40,
        notes: `${p.address}，距您${fmtDist(dist)}`,
        amapPoiId: p.id, lng: p.lng, lat: p.lat,
        distanceMeters: dist,
      }
    })
    const walkDist = estimateWalkDistFromStops(stops)
    routes.push({
      id: uuid(),
      name: `路线${i + 1}`,
      tagline: `${stops.length}个地点`,
      stops,
      totalDurationMinutes: stops.length * 40 + Math.ceil(walkDist / 100 * 1.5),
      walkingDistanceMeters: walkDist,
      tips: '',
    })
  }
  return routes.length > 0 ? routes : null
}

// ── AI path ───────────────────────────────────────────

async function tryAIGeneration(input: PlanInput): Promise<Route[] | null> {
  const { timeMinutes, preferences, city, weather, position, distance, adcode } = input

  // 半天/一天 → single curated route instead of 3 competing routes
  const isDayTrip = timeMinutes >= 240

  // Short-time special paths (bypassed for 半天/一天 — go LLM-first instead)
  if (!isDayTrip) {
    // Food without cuisine type → food list with AI scoring
    if (preferences.length === 1 && preferences[0] === 'food' && !input.cuisineTypes?.length) {
      return generateFoodList(input)
    }
    // Food with cuisine types → 3 comparison cards (评分/距离/打卡)
    if (preferences.length === 1 && preferences[0] === 'food' && input.cuisineTypes?.length) {
      return generateCuisineComparison(input)
    }
    // Scenic/wander without sub-types + local → POI search + LLM curation
    if (preferences.length === 1 && preferences[0] === 'scenic' && !input.scenicTypes?.length && distance > 0) {
      return generateScenicRoutes(input)
    }
    if (preferences.length === 1 && preferences[0] === 'wander' && !input.wanderTypes?.length) {
      return generateWanderRoutes(input)
    }
  }

  // Normal LLM-first route generation
  const userPrompt = buildUserPrompt({
    city,
    weather,
    timeMinutes,
    distance,
    preferences,
    cuisineTypes: input.cuisineTypes,
    scenicTypes: input.scenicTypes,
    wanderTypes: input.wanderTypes,
    singleRoute: isDayTrip,
  })

  // Step 2: Call LLM
  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    })
  } catch {
    return null // → fallback
  }

  // Step 3: Parse & validate JSON
  let validated = parseAndValidate(raw)

  // Retry once on schema failure
  if (!validated) {
    const errors = formatValidationErrors(raw)
    const retryPrompt = `${userPrompt}\n\n## ⚠️ 上次格式错误\n${errors}\n\n请修正后重新输出 JSON。`
    try {
      raw = await chatCompletionWithFallback({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: retryPrompt },
        ],
        temperature: 0.3,
      })
      validated = parseAndValidate(raw)
    } catch {
      // retry failed → fallback
    }
  }

  if (!validated) return null

  // Day trip mode: keep only the first route (LLM sometimes ignores the instruction)
  if (isDayTrip && validated.routes.length > 1) {
    console.log(`🔄 Day trip mode: LLM returned ${validated.routes.length} routes, keeping only first`)
    validated.routes = [validated.routes[0]]
  }

  // Step 4: Verify each stop via Amap text-search, fill in coordinates
  // Use the user's actual distance. For 全城范围 (distance=0), use 50km.
  const verifyRadius = distance > 0 ? distance : 50000
  // If only food is selected, only accept food-related POIs (typecode 05xxxx)
  const onlyFood = preferences.length === 1 && preferences[0] === 'food'

  // Build gap-fill keywords: when a route loses stops during verification, use these
  // to search for replacements of the right type.
  let gapFillKeywords = ''
  if (preferences.includes('food')) {
    if (input.cuisineTypes?.length) {
      // Only use specific cuisine keywords, NOT generic terms like "小吃" which match wrong places
      const cuisineMap: Record<string, string> = {
        hotpot: '火锅|串串|涮肉', noodles: '面馆|拉面|米线', pastries: '糕点|面包|烘焙', bbq: '烧烤|烤肉',
        local_cuisine: '本地菜|老字号|本帮菜', western: '西餐|牛排|披萨', coffee_tea: '咖啡|奶茶|茶馆|茶饮',
        buffet: '自助餐|自助|海鲜自助|烤肉自助',
      }
      gapFillKeywords = input.cuisineTypes.map(c => cuisineMap[c] || c).join('|')
    } else {
      gapFillKeywords = '餐厅|饭馆|美食'
    }
  }
  if (preferences.includes('scenic')) {
    const scenicKws = ['景点', '地标', '打卡']
    if (input.scenicTypes?.includes('street')) scenicKws.push('网红|街拍|文创')
    if (input.scenicTypes?.includes('popular')) scenicKws.push('名胜|5A|故居')
    gapFillKeywords = (gapFillKeywords ? gapFillKeywords + '|' : '') + scenicKws.join('|')
  }
  if (preferences.includes('wander')) {
    const wanderKws = ['商场', '咖啡', '娱乐']
    const wanderMap: Record<string, string> = {
      shopping: '商场|购物|步行街', cafe: '咖啡|茶馆|书吧',
      entertainment: '电影院|KTV|演出', hidden: '故居|寺庙|园林|老街',
      museum: '博物馆|美术馆|展览馆',
    }
    if (input.wanderTypes?.length) {
      wanderKws.push(...input.wanderTypes.map(w => wanderMap[w] || w))
    }
    gapFillKeywords = (gapFillKeywords ? gapFillKeywords + '|' : '') + wanderKws.join('|')
  }

  const verifiedRoutes = await verifyAndEnrichRoutes(
    validated.routes,
    position.lng,
    position.lat,
    adcode,
    verifyRadius,
    onlyFood ? /^05/ : undefined,
    gapFillKeywords,
  )

  return verifiedRoutes.length > 0 ? verifiedRoutes : null
}

// ── Amap verification ─────────────────────────────────

/**
 * Fallback: when a stop name doesn't verify, search Amap with the name as keywords.
 * Takes the best nearby match that hasn't been claimed yet.
 */
async function fallbackSearchStop(
  name: string,
  userLng: number,
  userLat: number,
  adcode: string | undefined,
  maxDistance: number | undefined,
  typeFilter: RegExp | undefined,
  claimedIds: Set<string>,
): Promise<AmapPOI | null> {
  const client = getAmapClient()
  // Use stop name as search keywords (strip common suffixes)
  const keywords = name.replace(/[（(][^)）]*[)）]/g, '').trim()
  try {
    const res = await client.get<AmapTextResponse>('/place/text', {
      params: {
        keywords,
        location: `${userLng},${userLat}`,
        ...(adcode ? { city: adcode } : {}),
        offset: 5,
        page: 1,
        extensions: 'all',
      },
    })
    const pois = (res.data.pois || [])
      .map((raw): AmapPOI | null => {
        if (!raw.location || !raw.location.includes(',')) return null
        const [lng, lat] = raw.location.split(',').map(Number)
        if (isNaN(lng) || isNaN(lat)) return null
        const dist = haversineDist(userLat, userLng, lat, lng)
        return {
          id: raw.id,
          name: raw.name,
          type: raw.type,
          typecode: raw.typecode || '',
          address: raw.address || '',
          lng, lat,
          distance: Math.round(dist),
          rating: raw.biz_ext?.rating || null,
          cost: raw.biz_ext?.cost || null,
        }
      })
      .filter((p): p is AmapPOI => p !== null)

    // False match regex — same as poiSearch.ts verifyPlace
    const FALSE_MATCH_RE = /店|公司|派出所|警务室|居委会|街道办事处|服务站|中介|地产|房产|我爱我家|链家|贝壳|停车场|停车库|停车点|地铁站|出入口|入口|出口|厕所|卫生间|垃圾|配电|物业|管理处|收费/

    // Filter by distance, typecode, already claimed, and false matches
    const candidates = pois.filter((p) => {
      if (maxDistance && maxDistance > 0 && p.distance > maxDistance) return false
      if (typeFilter && !typeFilter.test(p.typecode)) return false
      if (claimedIds.has(p.id)) return false
      // Reject false matches: POI name that includes the search name but has
      // extra text indicating it's not the actual place (e.g. parking, police)
      const pName = p.name.replace(/[()（）]/g, '').trim()
      const sName = name.replace(/[()（）]/g, '').trim()
      if (pName !== sName && pName.includes(sName)) {
        const extra = pName.replace(sName, '').trim()
        if (FALSE_MATCH_RE.test(extra)) return false
      }
      return true
    })

    if (candidates.length > 0) {
      // Sort by name similarity then distance for fallback matches
      candidates.sort((a, b) => {
        const aName = a.name.replace(/[()（）]/g, '').trim()
        const bName = b.name.replace(/[()（）]/g, '').trim()
        const sName = name.replace(/[()（）]/g, '').trim()
        const aExact = aName === sName ? 1 : 0
        const bExact = bName === sName ? 1 : 0
        if (aExact !== bExact) return bExact - aExact
        return a.distance - b.distance
      })
      const best = candidates[0]
      console.log(`🔧 Fallback search: "${name}" → "${best.name}" (${best.distance}m, typecode=${best.typecode})`)
      return best
    }
  } catch (err: any) {
    console.warn(`Fallback search failed for "${name}":`, err.message)
  }
  return null
}

/**
 * For each stop in each route, call Amap text-search to verify the place exists
 * and fill in lng/lat/address/amapPoiId. Stops that can't be verified are dropped.
 * Failed stops get a fallback keyword search to find alternatives.
 */
async function verifyAndEnrichRoutes(
  routes: Array<{
    name: string
    tagline: string
    stops: Array<{
      name: string
      visitDurationMinutes: number
      notes: string
      photoTip?: string
      address?: string
      amapPoiId?: string | null
      lng?: number
      lat?: number
    }>
    totalDurationMinutes: number
    walkingDistanceMeters: number
    tips: string
  }>,
  userLng: number,
  userLat: number,
  adcode?: string,
  maxDistance?: number,
  typeFilter?: RegExp,
  gapFillKeywords?: string,
): Promise<Route[]> {
  // Collect all unique stop names across all routes
  const allNames = new Set<string>()
  for (const r of routes) {
    for (const s of r.stops) {
      allNames.add(s.name)
    }
  }

  // Verify all unique names sequentially with delay to stay within Amap free-tier QPS
  const verificationMap = new Map<string, AmapPOI | null>()
  const names = [...allNames]
  const results: Array<{ name: string; poi: AmapPOI | null }> = []
  for (const name of names) {
    // 400ms delay between requests (Amap free tier ≈ 3 QPS)
    await new Promise(r => setTimeout(r, 400))
    let poi: AmapPOI | null = null
    // Retry once on QPS limit
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        poi = await verifyPlace(name, userLng, userLat, adcode, maxDistance)
        break
      } catch (err: any) {
        if (err?.message?.includes('QPS') && attempt < 1) {
          await new Promise(r => setTimeout(r, 1000))
        } else {
          console.warn(`verifyPlace exception for "${name}":`, err?.message)
        }
      }
    }
    results.push({ name, poi })
  }
  for (const { name, poi } of results) {
    verificationMap.set(name, poi)
  }

  // Enrich routes with verified POI data, dropping unverifiable stops
  const claimedIds = new Set<string>()
  const enriched: Route[] = []
  for (const r of routes) {
    const verifiedStops: Stop[] = []
    for (const s of r.stops) {
      let poi = verificationMap.get(s.name) ?? null

      // If exact name verification failed, try keyword fallback search
      if (!poi) {
        poi = await fallbackSearchStop(s.name, userLng, userLat, adcode, maxDistance, typeFilter, claimedIds)
      }

      if (poi) {
        // Check typecode filter (e.g. only food when user only selected food)
        if (typeFilter && !typeFilter.test(poi.typecode)) {
          console.warn(`⚠️ Stop typecode mismatch, dropped: "${s.name}" (typecode=${poi.typecode})`)
          continue
        }
        // Skip if already claimed by a previous route
        if (claimedIds.has(poi.id)) {
          console.warn(`⚠️ Stop already claimed, dropped: "${poi.name}"`)
          continue
        }
        claimedIds.add(poi.id)
        // Use Amap distance, or compute from coordinates as fallback
        const dist = poi.distance > 0 ? poi.distance : haversineDist(userLat, userLng, poi.lat, poi.lng)
        verifiedStops.push({
          name: poi.name, // Use Amap's exact name
          address: poi.address,
          visitDurationMinutes: s.visitDurationMinutes,
          notes: s.notes,
          amapPoiId: poi.id,
          lng: poi.lng,
          lat: poi.lat,
          photoTip: s.photoTip,
          distanceMeters: Math.round(dist),
        })
      } else {
        console.warn(`⚠️ Stop not found on Amap, dropped: "${s.name}"`)
      }
    }

    // Gap fill: if route lost stops, try to add one from keyword search
    if (gapFillKeywords && verifiedStops.length < r.stops.length && verifiedStops.length < 3) {
      const client = getAmapClient()
      try {
        const res = await client.get<AmapTextResponse>('/place/text', {
          params: {
            keywords: gapFillKeywords,
            location: `${userLng},${userLat}`,
            ...(adcode ? { city: adcode } : {}),
            offset: 5,
            page: 1,
            extensions: 'all',
          },
        })
        const fillPois = (res.data.pois || [])
          .map((raw): AmapPOI | null => {
            if (!raw.location || !raw.location.includes(',')) return null
            const [lng, lat] = raw.location.split(',').map(Number)
            if (isNaN(lng) || isNaN(lat)) return null
            const dist = haversineDist(userLat, userLng, lat, lng)
            return { id: raw.id, name: raw.name, type: raw.type, typecode: raw.typecode || '',
              address: raw.address || '', lng, lat, distance: Math.round(dist),
              rating: raw.biz_ext?.rating || null, cost: raw.biz_ext?.cost || null }
          })
          .filter((p): p is AmapPOI => p !== null)
          .filter((p) => {
            if (claimedIds.has(p.id)) return false
            if (typeFilter && !typeFilter.test(p.typecode)) return false
            if (maxDistance && maxDistance > 0 && p.distance > maxDistance) return false
            // Don't fill with the same name as already-verified stops
            const existingNames = new Set(verifiedStops.map(s => s.name))
            if (existingNames.has(p.name)) return false
            return true
          })
          .sort((a, b) => a.distance - b.distance)

        if (fillPois.length > 0) {
          const fill = fillPois[0]
          claimedIds.add(fill.id)
          // Estimate a reasonable visit duration based on typecode
          const fillDur = fill.typecode.startsWith('0503') ? 25 // coffee/tea shops
            : fill.typecode.startsWith('05') ? 30
            : 25
          verifiedStops.push({
            name: fill.name,
            address: fill.address,
            visitDurationMinutes: fillDur,
            notes: `${fill.address}，距您约${fmtDist(fill.distance)}`,
            amapPoiId: fill.id,
            lng: fill.lng,
            lat: fill.lat,
            distanceMeters: fill.distance,
          })
          console.log(`🔧 Gap fill: route "${r.name}" + "${fill.name}" (${fill.distance}m)`)
        }
      } catch (err: any) {
        console.warn(`Gap fill search failed for route "${r.name}":`, err.message)
      }
    }

    // Only keep routes with at least 1 verified stop
    if (verifiedStops.length > 0) {
      // Recalculate walking distance from verified POI distances
      const recalcWalkDist = estimateWalkDistFromStops(verifiedStops)
      const recalcTotalDur = verifiedStops.reduce((s, st) => s + st.visitDurationMinutes, 0)
        + Math.ceil(recalcWalkDist / 100 * 1.5)

      enriched.push({
        id: uuid(),
        name: r.name,
        tagline: r.tagline,
        stops: verifiedStops,
        totalDurationMinutes: recalcTotalDur,
        walkingDistanceMeters: recalcWalkDist,
        tips: r.tips,
      })
    }
  }

  const totalStops = routes.reduce((s, r) => s + r.stops.length, 0)
  const verified = enriched.reduce((s, r) => s + r.stops.length, 0)
  console.log(`🔍 Verification: ${verified}/${totalStops} stops matched on Amap, ${enriched.length}/${routes.length} routes kept`)

  return enriched
}

// ── Rule-based fallback (exported for routeGenerator) ─

const PREF_LABELS: Record<string, string> = {
  food: '美食', wander: '休闲', scenic: '景点',
}

export function buildFallbackRoutes(
  pois: AmapPOI[],
  timeMinutes: number,
  preferences: PreferenceTag[],
): Route[] {
  const prefLabel = [...new Set(preferences.map((p) => PREF_LABELS[p] || p))].join('')

  // Deduplicate + sort by distance
  const seen = new Set<string>()
  const sorted = pois.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  }).sort((a, b) => a.distance - b.distance)

  // Split into max 3 routes, max 5 stops each
  const routes: Route[] = []
  const MAX_PER_ROUTE = 5
  const perRoute = Math.min(MAX_PER_ROUTE, Math.max(2, Math.ceil(sorted.length / 3)))
  const chunks = Math.min(3, Math.ceil(sorted.length / perRoute))

  for (let i = 0; i < chunks; i++) {
    const chunk = sorted.slice(i * perRoute, (i + 1) * perRoute)
    if (chunk.length === 0) continue

    const stops: Stop[] = chunk.map((p) => ({
      name: p.name,
      address: p.address,
      visitDurationMinutes: estimateDuration(p),
      notes: `${p.address}，距您约${fmtDist(p.distance)}`,
      amapPoiId: p.id,
      lng: p.lng,
      lat: p.lat,
      distanceMeters: p.distance,
    }))

    const totalDur = stops.reduce((s, st) => s + st.visitDurationMinutes, 0)
    const walkDist = estimateWalkDist(chunk)

    routes.push({
      id: uuid(),
      name: `${prefLabel}路线${i + 1}`,
      tagline: `${stops.length}个地点`,
      stops,
      totalDurationMinutes: totalDur + Math.ceil(walkDist / 100 * 1.5),
      walkingDistanceMeters: walkDist,
      tips: walkDist < 600 ? '全程步行即可，距离很近' : '可步行+共享单车结合',
    })
  }

  return routes
}

function estimateDuration(poi: AmapPOI): number {
  if (poi.typecode.startsWith('05')) return 25
  if (poi.typecode.startsWith('0604')) return 45
  if (poi.typecode.startsWith('11') || poi.typecode.startsWith('14')) return 35
  return 20
}

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}
