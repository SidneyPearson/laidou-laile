import { chatCompletionWithFallback } from '../llm/client.js'
import { searchNearbyPOIs, CUISINE_KEYWORDS } from '../amap/poiSearch.js'
import { getAmapClient } from '../amap/client.js'
import { haversineDist } from '../../utils/geo.js'
import type { AmapPOI, AmapTextResponse } from '../../types/poi.js'
import type { Route, Stop } from '../../types/route.js'
import type { PlanInput } from './types.js'
import { CUISINE_NAME_RE, CUISINE_LABEL } from './constants.js'
import { parseRawPoi, type AmapRawPoi } from './poiMatching.js'
import { estimateWalkDistFromStops, fmtDist } from './routeMetrics.js'

/**
 * When user selects food but no specific cuisine type, switch to a hybrid approach:
 * 1. Search Amap for nearby food POIs
 * 2. LLM scores and curates the best ones
 * 3. Return as a single "美食清单" route with AI-scored stops
 */
export async function generateFoodList(input: PlanInput): Promise<Route[] | null> {
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
    // Skip around-search when a specific cuisine is set (around returns ALL types)
    skipAroundSearch: (cuisineTypes?.length ?? 0) > 0,
  })

  if (pois.length === 0) return null

  const withinDistance = distance > 0
    ? pois.filter((p) => {
        const dist = p.distance > 0 ? p.distance
          : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
        return dist <= distance
      })
    : pois

  if (withinDistance.length === 0) return null

  // Pre-filter: prioritise POIs whose name matches the cuisine keywords.
  let filtered = withinDistance
  if (cuisineTypes?.length) {
    const pattern = cuisineTypes.map((c) => CUISINE_NAME_RE[c]).filter(Boolean)
    if (pattern.length > 0) {
      const re = new RegExp(pattern.map((p) => p.source).join('|'))
      const matching = withinDistance.filter((p) => re.test(p.name))
      const nonMatching = withinDistance.filter((p) => !re.test(p.name))
      filtered = [...matching, ...nonMatching]
    }
  }

  // Take top candidates (max 8) for LLM to score — fewer tokens = faster response
  const candidates = filtered.slice(0, 8)

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

  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: '你是一个资深美食评论家，对各地餐厅了如指掌。只输出 JSON。' },
        { role: 'user', content: scoringPrompt },
      ],
      temperature: 0.5,
      maxTokens: 1500,
    }, 15000)
  } catch {
    return buildPlainFoodList(candidates, input)
  }

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

  // Match scored names back to Amap POIs (exact, then simplified, then fuzzy).
  const poiByName = new Map<string, AmapPOI>()
  for (const p of candidates) {
    poiByName.set(p.name, p)
    const simple = p.name.replace(/[（(][^)）]*[)）]/g, '').trim()
    if (simple !== p.name) poiByName.set(simple, p)
  }

  const stops: Stop[] = []
  for (const item of scored) {
    let poi = poiByName.get(item.name)
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
  const totalDur = stops.length * 30 + Math.ceil((walkDist / 100) * 1.5)

  return [{
    id: crypto.randomUUID(),
    name: '附近美食清单',
    tagline: `AI 精选 ${stops.length} 家，按评分排序`,
    stops,
    totalDurationMinutes: totalDur,
    walkingDistanceMeters: walkDist,
    tips: '评分基于口碑、特色、性价比、氛围综合评定，仅供参考',
  }]
}

/** Fallback plain food list without AI scores */
export function buildPlainFoodList(candidates: AmapPOI[], input: PlanInput): Route[] | null {
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
    id: crypto.randomUUID(),
    name: '附近美食清单',
    tagline: `附近 ${stops.length} 家餐厅`,
    stops,
    totalDurationMinutes: stops.length * 30 + Math.ceil((walkDist / 100) * 1.5),
    walkingDistanceMeters: walkDist,
    tips: '未获取 AI 评分，按距离排序',
  }]
}

/**
 * When user selects food + cuisine types, generate 3 comparison cards by
 * dimension (评分最高 / 距离最近 / 最多打卡).
 *
 * - Single cuisine (e.g. just 火锅): each card has TOP 3 shops of that type.
 * - Multiple cuisines: each card has 1 shop per type (cross-cuisine comparison).
 */
export async function generateCuisineComparison(input: PlanInput): Promise<Route[] | null> {
  const { position, distance, adcode, cuisineTypes } = input
  if (!cuisineTypes?.length) return null

  const STOPS_PER_TYPE = cuisineTypes.length === 1 ? 3 : 1
  const SEARCH_OFFSET = cuisineTypes.length === 1 ? 20 : 10

  // Step 1: separate Amap text-search per cuisine type. Combined keywords bias
  // results toward the dominant cuisine, drowning out the others.
  const client = getAmapClient()
  const cuisinePOIs = new Map<string, AmapPOI[]>()

  for (const ct of cuisineTypes) {
    const kws = (CUISINE_KEYWORDS as Record<string, string>)[ct]
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
      const pois = ((res.data.pois || []) as AmapRawPoi[])
        .map((raw) => parseRawPoi(raw, position.lng, position.lat))
        .filter((p): p is AmapPOI => p !== null)
      if (pois.length > 0) cuisinePOIs.set(ct, pois)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Cuisine search failed for ${ct}:`, msg)
    }
  }

  if (cuisinePOIs.size === 0) return null

  // Step 2: enrich each POI with Haversine distance + rating/cost/rank scores.
  type ScoredPOI = AmapPOI & { _dist: number; _rating: number; _cost: number; _idx: number }
  const allScored: ScoredPOI[] = []
  for (const [ct, pois] of cuisinePOIs) {
    for (let i = 0; i < pois.length; i++) {
      const p = pois[i]
      const dist = p.distance > 0 ? p.distance
        : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
      if (distance > 0 && dist > distance) continue
      allScored.push({
        ...p,
        _dist: dist,
        _rating: p.rating ? parseFloat(p.rating) : 0,
        _cost: p.cost ? parseFloat(p.cost) : 0,
        _idx: i,
      })
    }
  }

  if (allScored.length === 0) return null

  // Step 3: group by cuisine type, cross-check with name regex to prevent
  // misclassification (e.g. "额尔敦传统涮" matches local_cuisine search but its
  // name contains "涮" → should be hotpot).
  const separated = new Map<string, ScoredPOI[]>()
  for (const ct of cuisineTypes) {
    const ownRe = CUISINE_NAME_RE[ct]
    const otherCts = cuisineTypes.filter((c) => c !== ct)
    const matched = allScored.filter((p) => {
      if (!cuisinePOIs.get(ct)?.some((pp) => pp.id === p.id)) return false
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

  // Step 4: define 3 permanent dimensions.
  const dimensions: Array<{
    key: string
    label: string
    slogan: string
    scorer: (p: ScoredPOI) => number
  }> = [
    { key: 'rating', label: '评分最高', slogan: '口碑之选，好评如潮',
      scorer: (p) => p._rating },
    { key: 'distance', label: '距离最近', slogan: '步行可达，方便省时',
      scorer: (p) => -p._dist },
    { key: 'popularity', label: '最多打卡', slogan: '最多打卡，人气爆棚',
      scorer: (p) => p._rating * 0.6 + (1 / (p._idx + 1)) * 4 },
  ]

  // Step 5: per dimension, pick top N shops per cuisine. Shops can repeat
  // across routes (a shop might be #1 in multiple dimensions).
  const routes: Route[] = []
  const rankEmoji = ['🥇', '🥈', '🥉']

  for (const dim of dimensions) {
    const used = new Set<string>()
    const stops: Stop[] = []

    for (const ct of cuisineTypes) {
      const list = separated.get(ct)
      if (!list || list.length === 0) continue

      const sorted = [...list].sort((a, b) => dim.scorer(b) - dim.scorer(a))
      const picks = sorted.filter((p) => !used.has(p.id)).slice(0, STOPS_PER_TYPE)

      for (let pi = 0; pi < picks.length; pi++) {
        const best = picks[pi]
        used.add(best.id)

        const cuLabel = CUISINE_LABEL[ct] || ct
        const distStr = fmtDist(best._dist)
        const ratingStr = best._rating > 0 ? `，评分 ${best._rating.toFixed(1)}` : ''
        const costStr = best._cost > 0 ? `，人均 ¥${Math.round(best._cost)}` : ''
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

    const cuNames = cuisineTypes.map((c) => CUISINE_LABEL[c] || c).join('+')
    const topSuffix = STOPS_PER_TYPE > 1 ? ` TOP${STOPS_PER_TYPE}` : ''
    routes.push({
      id: crypto.randomUUID(),
      name: dim.slogan,
      tagline: `${dim.label} · ${cuNames}${topSuffix}`,
      stops,
      totalDurationMinutes: stops.length * 35 + 10,
      walkingDistanceMeters: estimateWalkDistFromStops(stops),
      // Gourmet comparison is exempt from the ≥30° divergence rule
      // but still annotated for UI.
      divergenceExempt: true,
      direction: dim.label,
      reason: dim.key === 'rating'
        ? '同品类按口碑评分排序，帮你挑最稳的一家'
        : dim.key === 'distance'
          ? '同品类按步行距离排序，省时省脚'
          : '同品类按人气热度排序，跟着大家走',
      tips: dim.key === 'rating'
        ? '评分来自高德地图用户评价，仅供参考'
        : dim.key === 'popularity'
          ? '综合评分和搜索热度排序'
          : '距离由近到远排列',
    })
  }

  if (routes.length === 0) return null

  try {
    return await enhanceComparisonNotes(routes, input)
  } catch {
    return routes
  }
}

/** Use LLM to add personalized notes to comparison routes. */
async function enhanceComparisonNotes(routes: Route[], input: PlanInput): Promise<Route[]> {
  const { cuisineTypes } = input
  const cuNames = cuisineTypes?.map((c) => CUISINE_LABEL[c] || c).join('和') || ''

  const stopList = routes.flatMap((r) =>
    r.stops.map((s) => `[${r.name}] ${s.name} | ${s.address} | ${s.notes}`)
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
      maxTokens: 1500,
    }, 12000)
  } catch {
    return routes
  }

  let notesMap: Record<string, string> = {}
  try {
    let json = raw.trim()
    if (json.startsWith('```')) json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(json)
    if (parsed.notes) notesMap = parsed.notes
  } catch {
    return routes
  }

  for (const r of routes) {
    for (const s of r.stops) {
      const enhanced = notesMap[s.name]
      if (enhanced) {
        const prefix = s.notes.match(/^【.+?】/)
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
