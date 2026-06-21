import { v4 as uuid } from 'uuid'
import { chatCompletionWithFallback } from './llm/client.js'
import { buildUserPrompt, SYSTEM_PROMPT } from './llm/prompt.js'
import { parseAndValidate, formatValidationErrors } from './llm/schema.js'
import { verifyPlace, searchNearbyPOIs } from './amap/poiSearch.js'
import { getAmapClient } from './amap/client.js'
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

// ── Food list (no cuisine type) ────────────────────────

/**
 * When user selects food but no specific cuisine type, switch to a hybrid approach:
 * 1. Search Amap for nearby food POIs
 * 2. LLM scores and curates the best ones
 * 3. Return as a single "美食清单" route with AI-scored stops
 */
async function generateFoodList(input: PlanInput): Promise<Route[] | null> {
  const { position, distance, timeMinutes, adcode } = input

  // Step 1: Search Amap for nearby food
  const pois = await searchNearbyPOIs({
    lat: position.lat,
    lng: position.lng,
    distance,
    timeOption: timeMinutes,
    preferences: ['food'],
    adcode,
  })

  if (pois.length === 0) return null

  // Take top candidates (max 20) for LLM to score
  const candidates = pois.slice(0, 20)

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
    // Food-only without cuisine type → food list with AI scoring
    if (preferences.length === 1 && preferences[0] === 'food' && !input.cuisineTypes?.length) {
      return generateFoodList(input)
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
  // Use max(distance, 3000) so verification doesn't over-filter when user picks a tight radius.
  // The distance constraint is already communicated to the LLM via the prompt.
  const verifyRadius = distance > 0 ? Math.max(distance, 3000) : 50000
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
        }
      })
      .filter((p): p is AmapPOI => p !== null)

    // Filter by distance, typecode, and already claimed
    const candidates = pois.filter((p) => {
      if (maxDistance && maxDistance > 0 && p.distance > maxDistance) return false
      if (typeFilter && !typeFilter.test(p.typecode)) return false
      if (claimedIds.has(p.id)) return false
      return true
    })

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance)
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
              rating: raw.biz_ext?.rating || null }
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

/** Estimate walk distance between verified stops based on their distances from user */
function estimateWalkDistFromStops(stops: Stop[]): number {
  if (stops.length <= 1) return 0
  // Sort by distance from user, then estimate path between consecutive ones
  const sorted = [...stops].sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0))
  let total = 0
  for (let i = 1; i < sorted.length; i++) {
    total += Math.abs((sorted[i].distanceMeters || 0) - (sorted[i - 1].distanceMeters || 0))
  }
  return total
}

function estimateWalkDist(pois: AmapPOI[]): number {
  let total = 0
  for (let i = 1; i < pois.length; i++) {
    total += Math.abs(pois[i].distance - pois[i - 1].distance)
  }
  return total
}

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}

/** Haversine distance in meters between two lat/lng points */
function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
