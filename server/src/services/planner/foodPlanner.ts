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
import { buildKeywordProfile, scorePoiRelevance } from './keywordRelevance.js'
import { isOrdinaryDineInPoi } from './foodSuitability.js'
import {
  attachSocialEvidence,
  searchSocialFoodEvidence,
} from './socialFoodSearch.js'
import { getStopCountRange } from './timeBudget.js'
import {
  rankFoodCandidates,
  type FoodCandidate,
  type FoodRankingResult,
} from './foodRanking.js'
import { buildLocalCuisineSearchTerms, hasRegionalCuisineConflict } from './localCuisinePolicy.js'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cuisinePatternFor(input: PlanInput): RegExp | undefined {
  const sources = (input.cuisineTypes ?? [])
    .map(cuisine => CUISINE_NAME_RE[cuisine]?.source)
    .filter((source): source is string => Boolean(source))
  sources.push(...(input.customCuisine ?? [])
    .map(value => value.trim())
    .filter(Boolean)
    .map(escapeRegExp))
  return sources.length > 0 ? new RegExp(sources.join('|'), 'u') : undefined
}

function socialSearchArea(input: PlanInput): string {
  return [...new Set([input.city, input.areaName]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value)))]
    .join(' ')
}

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
    areaName: input.areaName,
    distance,
    timeOption: timeMinutes,
    preferences: ['food'],
    adcode,
    cuisineTypes: cuisineTypes as string[] | undefined,
    // Skip around-search when a specific cuisine is set (around returns ALL types)
    skipAroundSearch: (cuisineTypes?.length ?? 0) > 0 || (input.customCuisine?.length ?? 0) > 0,
    customKeywords: input.customCuisine,
  })

  if (pois.length === 0) return null

  const withinDistance = distance > 0
    ? pois.filter((p) => {
        const dist = p.distance > 0 ? p.distance
          : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
        return dist <= distance
      })
    : pois

  const ordinaryDining = withinDistance.filter(isOrdinaryDineInPoi)
  if (ordinaryDining.length === 0) return null

  // De-duplicate and establish an Amap-only order first. The bounded leading
  // names are sent in the single Tavily query so basic search can find concrete
  // shop pages instead of only broad city guides.
  const seenPoiIds = new Set<string>()
  const uniqueDining = ordinaryDining.filter((candidate) => {
    if (seenPoiIds.has(candidate.id)) return false
    seenPoiIds.add(candidate.id)
    return true
  })
  const rankingContext = {
    maxDistance: distance,
    cuisinePattern: cuisinePatternFor(input),
  }
  const initialRanking = rankFoodCandidates(uniqueDining, rankingContext)
  const socialResults = await searchSocialFoodEvidence(
    socialSearchArea(input),
    initialRanking.map(candidate => candidate.poi.name),
  )
  const enriched = attachSocialEvidence(uniqueDining, socialResults)

  // Re-rank with matched evidence. Model output is never allowed to change
  // this deterministic order or membership.
  const ranked = rankFoodCandidates(enriched, {
    ...rankingContext,
  })

  // Use the shared time-budget cap for both plain and AI-commented food lists.
  const maxStops = getStopCountRange(timeMinutes).max
  const candidates = ranked.slice(0, maxStops)

  // Without public platform evidence, use an honest Amap-only list. DeepSeek
  // must not turn model memory into a claimed Meituan/Douyin/Xiaohongshu fact.
  if (!candidates.some(candidate => candidate.recommendationType === 'social_hot')) {
    return buildPlainFoodList(candidates, input)
  }

  const poiTable = candidates.map(({ poi: p }, i) =>
    `${i + 1}. ${p.name} | ${p.type || '餐饮'} | ${p.address} | 距您${fmtDist(p.distance)} | 高德评分:${p.rating || '无'} | 公开平台证据:${p.socialEvidence?.map(e => `${e.platform}:${e.title}`).join('；') || '无'}`
  ).join('\n')

  const scoringPrompt = `你是一个资深美食评论家，名叫"阿来"。下面是已经由规则完成排序的餐厅，请为每家餐厅补充一句简短点评。

## 餐厅列表
${poiTable}

## 任务
系统已最多选出 ${candidates.length} 家（不得超过输入候选数）。
保持输入门店范围，为每家餐厅写一句简短点评（15字以内）。
不得添加列表中没有的门店、平台来源、评分或事实。
输出顺序不参与最终排序；遗漏门店时系统会保留该门店并使用规则理由。

只输出 JSON，不要其他内容：
{
  "foodList": [
    { "name": "店名（保持原名）", "comment": "简短推荐理由" }
  ]
}
`

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

  let scored: Array<{ name: string; comment: string }> = []
  try {
    let json = raw.trim()
    if (json.startsWith('```')) json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed.foodList)) scored = parsed.foodList
  } catch {
    console.warn('Failed to parse LLM food scoring, using plain list')
  }

  if (scored.length === 0) return buildPlainFoodList(candidates, input)

  // Match model comments back to ranked Amap POIs. Unknown and duplicate model
  // items are ignored; final iteration always follows deterministic rank order.
  const poiByName = new Map<string, FoodRankingResult>()
  for (const rankedCandidate of candidates) {
    const p = rankedCandidate.poi
    poiByName.set(p.name, rankedCandidate)
    const simple = p.name.replace(/[（(][^)）]*[)）]/g, '').trim()
    if (simple !== p.name) poiByName.set(simple, rankedCandidate)
  }

  const commentsByPoiId = new Map<string, string>()
  for (const item of scored) {
    if (!item || typeof item.name !== 'string' || typeof item.comment !== 'string') continue
    let rankedCandidate = poiByName.get(item.name)
    if (!rankedCandidate) {
      for (const [key, candidate] of poiByName) {
        if (key.includes(item.name) || item.name.includes(key)) {
          rankedCandidate = candidate
          break
        }
      }
    }
    if (!rankedCandidate) {
      console.warn(`⚠️ Food list: scored item not found in POIs: "${item.name}"`)
      continue
    }
    const comment = item.comment.trim().slice(0, 60)
    if (comment && !commentsByPoiId.has(rankedCandidate.poi.id)) {
      commentsByPoiId.set(rankedCandidate.poi.id, comment)
    }
  }

  const stops: Stop[] = candidates.map((rankedCandidate) => {
    const poi = rankedCandidate.poi
    const rankingReason = commentsByPoiId.get(poi.id) || rankedCandidate.rankingReason
    const dist = poi.distance > 0 ? poi.distance : Math.round(haversineDist(position.lat, position.lng, poi.lat, poi.lng))
    return {
      name: poi.name,
      address: poi.address,
      visitDurationMinutes: 30,
      notes: `${poi.rating ? `高德评分 ${poi.rating} · ` : ''}${rankingReason}`,
      amapPoiId: poi.id,
      parentPoiId: poi.parentId,
      typecode: poi.typecode,
      preferenceScope: 'food',
      lng: poi.lng,
      lat: poi.lat,
      distanceMeters: dist,
      socialEvidence: poi.socialEvidence,
      recommendationType: rankedCandidate.recommendationType,
      socialScore: rankedCandidate.socialScore,
      rankingReason,
      evidenceSummary: rankedCandidate.evidenceSummary,
      popularityReason: poi.socialEvidence?.length ? rankingReason : undefined,
    }
  })

  if (stops.length === 0) return null

  const walkDist = estimateWalkDistFromStops(stops)
  const totalDur = stops.length * 30 + Math.ceil((walkDist / 100) * 1.5)

  return [{
    id: crypto.randomUUID(),
    kind: 'food_list',
    name: '附近美食清单',
    tagline: `附近 ${stops.length} 家餐厅，按综合表现排序`,
    stops,
    totalDurationMinutes: totalDur,
    walkingDistanceMeters: walkDist,
    tips: '排序综合公开平台证据、高德评分、品类与距离，仅供参考',
    divergenceExempt: true,
  }]
}

/** Fallback food list without AI comments; deterministic ranking stays intact. */
export function buildPlainFoodList(candidates: FoodRankingResult[], input: PlanInput): Route[] | null {
  const { position } = input
  const maxStops = getStopCountRange(input.timeMinutes).max
  const seenPoiIds = new Set<string>()
  const selectedCandidates = candidates.filter((candidate) => {
    if (seenPoiIds.has(candidate.poi.id)) return false
    seenPoiIds.add(candidate.poi.id)
    return true
  }).slice(0, maxStops)
  const stops: Stop[] = selectedCandidates.map((rankedCandidate) => {
    const p = rankedCandidate.poi
    const dist = p.distance > 0 ? p.distance : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
    return {
      name: p.name,
      address: p.address,
      visitDurationMinutes: 30,
      notes: `${p.address}，距您${fmtDist(dist)}${p.rating ? `，高德评分 ${p.rating}` : ''}`,
      amapPoiId: p.id,
      parentPoiId: p.parentId,
      typecode: p.typecode,
      preferenceScope: 'food',
      lng: p.lng,
      lat: p.lat,
      distanceMeters: dist,
      socialEvidence: p.socialEvidence,
      recommendationType: rankedCandidate.recommendationType,
      socialScore: rankedCandidate.socialScore,
      rankingReason: rankedCandidate.rankingReason,
      evidenceSummary: rankedCandidate.evidenceSummary,
      popularityReason: p.socialEvidence?.length ? rankedCandidate.rankingReason : undefined,
    }
  })

  const walkDist = estimateWalkDistFromStops(stops)
  return [{
    id: crypto.randomUUID(),
    kind: 'food_list',
    name: '附近美食清单',
    tagline: `附近 ${stops.length} 家餐厅`,
    stops,
    totalDurationMinutes: stops.length * 30 + Math.ceil((walkDist / 100) * 1.5),
    walkingDistanceMeters: walkDist,
    tips: '未获取 AI 点评，按公开证据、高德评分、品类与距离综合排序',
    divergenceExempt: true,
  }]
}

/**
 * When user selects food + cuisine types, generate 3 comparison cards by
 * dimension (评分最高 / 距离最近 / 综合推荐).
 *
 * - Single cuisine (e.g. just 火锅): each card has TOP 3 shops of that type.
 * - Multiple cuisines: each card has 1 shop per type (cross-cuisine comparison).
 */
export async function generateCuisineComparison(input: PlanInput): Promise<Route[] | null> {
  const { position, distance, adcode } = input
  // A custom term is a narrowing constraint (e.g. 面馆 + 本帮面), not a
  // second cuisine that should receive a separate slot.
  const cuisineTypes = input.customCuisine?.length
    ? [...input.customCuisine]
    : [...(input.cuisineTypes ?? [])]
  if (!cuisineTypes.length) return null

  const STOPS_PER_TYPE = cuisineTypes.length === 1 ? 3 : 1
  const SEARCH_OFFSET = cuisineTypes.length === 1 ? 20 : 10

  // Step 1: separate Amap text-search per cuisine type. Combined keywords bias
  // results toward the dominant cuisine, drowning out the others.
  const client = getAmapClient()
  const cuisinePOIs = new Map<string, AmapPOI[]>()

  for (const ct of cuisineTypes) {
    const kws = ct === 'local_cuisine'
      ? buildLocalCuisineSearchTerms([input.city, input.areaName].filter(Boolean).join(' ')).join('|')
      : (CUISINE_KEYWORDS as Record<string, string>)[ct]
      || (ct === '本帮面' ? '本帮面|蟹黄面|葱油拌面|焖肉面|大排面' : ct)
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
        .filter(isOrdinaryDineInPoi)
        .filter(p => ct !== 'local_cuisine' || !hasRegionalCuisineConflict(
          p,
          [input.city, input.areaName].filter(Boolean).join(' '),
        ))
      if (pois.length > 0) cuisinePOIs.set(ct, pois)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Cuisine search failed for ${ct}:`, msg)
    }
  }

  if (cuisinePOIs.size === 0) return null

  // Step 2: enrich each POI with Haversine distance + rating/cost/rank scores.
  type ScoredPOI = FoodCandidate & { _dist: number; _rating: number; _cost: number; _idx: number }
  let allScored: ScoredPOI[] = []
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

  // Use the same one-credit evidence flow as the pure food list. Candidate
  // names come from verified, in-radius Amap results and are bounded inside
  // searchSocialFoodEvidence, keeping one focused Tavily basic request.
  const comparisonContext = {
    maxDistance: distance,
    cuisinePattern: cuisinePatternFor(input),
  }
  const initialComparisonRanking = rankFoodCandidates(allScored, comparisonContext)
  const socialResults = await searchSocialFoodEvidence(
    socialSearchArea(input),
    initialComparisonRanking.map(candidate => candidate.poi.name),
  )
  const evidenceByPoiId = new Map(
    attachSocialEvidence(allScored, socialResults)
      .map(candidate => [candidate.id, candidate.socialEvidence] as const),
  )
  allScored = allScored.map(candidate => ({
    ...candidate,
    socialEvidence: evidenceByPoiId.get(candidate.id),
  }))
  const comparisonRanking = rankFoodCandidates(allScored, comparisonContext)
  const comparisonRankingById = new Map(
    comparisonRanking.map(candidate => [candidate.poi.id, candidate] as const),
  )
  const hasAnySocialEvidence = comparisonRanking.some(
    candidate => candidate.recommendationType === 'social_hot',
  )

  // Step 3: group by cuisine type, cross-check with name regex to prevent
  // misclassification (e.g. "额尔敦传统涮" matches local_cuisine search but its
  // name contains "涮" → should be hotpot).
  const separated = new Map<string, ScoredPOI[]>()
  const customProfile = buildKeywordProfile(input.customCuisine ?? [])
  for (const ct of cuisineTypes) {
    const ownRe = CUISINE_NAME_RE[ct]
    const otherCts = cuisineTypes.filter((c) => c !== ct)
    const matched = allScored.filter((p) => {
      if (!cuisinePOIs.get(ct)?.some((pp) => pp.id === p.id)) return false
      if (customProfile.requested.length > 0
        && scorePoiRelevance(p, customProfile) === 0) return false
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
    { key: 'recommendation', label: '综合推荐', slogan: '综合表现，透明可查',
      scorer: (p) => comparisonRankingById.get(p.id)?.score ?? 0 },
  ]

  // Step 5: per dimension, pick top N shops per cuisine. Shops can repeat
  // across routes (a shop might be #1 in multiple dimensions).
  const routes: Route[] = []
  const globallyUsed = new Set<string>()
  const rankEmoji = ['🥇', '🥈', '🥉']

  for (const dim of dimensions) {
    const used = new Set<string>()
    const stops: Stop[] = []

    for (const ct of cuisineTypes) {
      const list = separated.get(ct)
      if (!list || list.length === 0) continue

      const sorted = [...list].sort((a, b) => dim.scorer(b) - dim.scorer(a))
      const picks = sorted
        .filter((p) => !used.has(p.id) && !globallyUsed.has(p.id))
        .slice(0, STOPS_PER_TYPE)
      if (picks.length < STOPS_PER_TYPE) {
        picks.push(...sorted
          .filter((p) => !used.has(p.id) && !picks.some(pick => pick.id === p.id))
          .slice(0, STOPS_PER_TYPE - picks.length))
      }

      for (let pi = 0; pi < picks.length; pi++) {
        const best = picks[pi]
        const rankedCandidate = comparisonRankingById.get(best.id)
        if (!rankedCandidate) continue
        used.add(best.id)
        globallyUsed.add(best.id)

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
          parentPoiId: best.parentId,
          typecode: best.typecode,
          preferenceScope: 'food',
          lng: best.lng,
          lat: best.lat,
          distanceMeters: best._dist,
          socialEvidence: best.socialEvidence,
          recommendationType: rankedCandidate.recommendationType,
          socialScore: rankedCandidate.socialScore,
          rankingReason: rankedCandidate.rankingReason,
          evidenceSummary: rankedCandidate.evidenceSummary,
          popularityReason: best.socialEvidence?.length
            ? rankedCandidate.rankingReason
            : undefined,
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
          : '综合公开平台证据、高德评分、品类与距离排序',
      tips: dim.key === 'rating'
        ? '评分来自高德地图用户评价，仅供参考'
        : dim.key === 'recommendation'
          ? hasAnySocialEvidence
            ? '有平台标签的餐厅附具体公开链接，其余为高德高分补充'
            : '未找到可核验平台链接，本组按高德评分、品类与距离排序'
          : '距离由近到远排列',
      candidateStops: allScored.map((candidate) => {
        const rankedCandidate = comparisonRankingById.get(candidate.id)
        return {
          name: candidate.name,
          address: candidate.address,
          visitDurationMinutes: 35,
          notes: candidate.address,
          amapPoiId: candidate.id,
          parentPoiId: candidate.parentId,
          typecode: candidate.typecode,
          preferenceScope: 'food',
          lng: candidate.lng,
          lat: candidate.lat,
          distanceMeters: candidate._dist,
          socialEvidence: candidate.socialEvidence,
          recommendationType: rankedCandidate?.recommendationType,
          socialScore: rankedCandidate?.socialScore,
          rankingReason: rankedCandidate?.rankingReason,
          evidenceSummary: rankedCandidate?.evidenceSummary,
          popularityReason: candidate.socialEvidence?.length
            ? rankedCandidate?.rankingReason
            : undefined,
        }
      }),
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
保持原有维度分类（评分最高/距离最近/综合推荐），不要改动店铺分配。
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
