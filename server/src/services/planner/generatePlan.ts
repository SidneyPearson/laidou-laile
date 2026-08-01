import { chatCompletionWithFallback } from '../llm/client.js'
import { buildUserPrompt, SYSTEM_PROMPT } from '../llm/prompt.js'
import { parseAndValidate, formatValidationErrors } from '../llm/schema.js'
import { enforceDivergence } from '../structuralDivergence.js'
import type { Route } from '../../types/route.js'
import type { PlanInput, PlanOutput } from './types.js'
import { generateFoodList, generateCuisineComparison } from './foodPlanner.js'
import { generateScenicRoutes, generateWanderRoutes } from './themedPlanner.js'
import { verifyAndEnrichRoutes } from './verifyRoutes.js'
import { applyRoutePolicies } from './routePolicy.js'
import { buildCategoryKeywords, buildCategoryTypecodePrefixes } from './preferenceCriteria.js'
import { syncFoodListPresentation } from './foodPresentation.js'
import { hasRegionalCuisineConflict } from './localCuisinePolicy.js'
import { findMissingPreferences, preferenceLabels } from './preferenceCoverage.js'

function filterRegionalCuisineConflicts(routes: Route[], input: PlanInput): Route[] {
  if (!input.cuisineTypes?.includes('local_cuisine')) return routes
  const localeText = [input.city, input.areaName].filter(Boolean).join(' ')
  const keep = (stop: Route['stops'][number]) => {
    const isFood = stop.preferenceScope === 'food' || (stop.typecode ?? '').startsWith('05')
    return !isFood || !hasRegionalCuisineConflict(stop, localeText)
  }
  return routes.flatMap((route): Route[] => {
    const stops = route.stops.filter(keep)
    if (stops.length === 0) return []
    return [{
      ...route,
      stops,
      candidateStops: route.candidateStops?.filter(keep),
    }]
  })
}

/**
 * LLM-first generation:
 * 1. LLM recommends specific places from its training data
 * 2. Amap text-search verifies each place and fills in coordinates
 *
 * Returns `{routes: [], source: 'fallback', ...}` on any AI failure — caller
 * (`routeGenerator`) then runs the rule-based POI-search fallback.
 */
export async function generatePlan(input: PlanInput): Promise<PlanOutput> {
  try {
    const generatedRoutes = await tryAIGeneration(input)
    const aiRoutes = generatedRoutes ? filterRegionalCuisineConflicts(generatedRoutes, input) : null
    if (aiRoutes && aiRoutes.length > 0) {
      const policy = applyRoutePolicies(aiRoutes, {
        origin: input.position,
        timeMinutes: input.timeMinutes,
        explorationDistance: input.distance,
        preferences: input.preferences,
        customKeywordsByPreference: {
          food: input.customCuisine ?? [],
          scenic: input.customScenic ?? [],
          wander: input.customWander ?? [],
        },
        categoryKeywordsByPreference: buildCategoryKeywords(input),
        categoryTypecodePrefixesByPreference: buildCategoryTypecodePrefixes(input),
      })
      const guardedRoutes = policy.routes.map(syncFoodListPresentation)
      if (guardedRoutes.length === 0) return {
        routes: [], source: 'fallback', fallbackReason: '附近没有通过可达性与偏好筛选的地点',
      }
      const coverageFailure = (routes: Route[]): PlanOutput | null => {
        const missing = findMissingPreferences(routes, aiRoutes, input.preferences)
        return missing.length > 0 ? {
          routes: [],
          source: 'fallback',
          fallbackReason: `AI路线缺少${preferenceLabels(missing)}地点，已改用高德候选重新编排`,
        } : null
      }
      const initialCoverageFailure = coverageFailure(guardedRoutes)
      if (initialCoverageFailure) return initialCoverageFailure
      // Enforce ≥30° structural divergence on multi-route results. Single-
      // route (day-trip) needs no divergence. Exempt routes (gourmet
      // comparison) pass through untouched inside enforceDivergence.
      if (guardedRoutes.length > 1) {
        const { kept, dropped } = enforceDivergence(guardedRoutes, { preferences: input.preferences })
        if (dropped.length > 0) {
          for (const d of dropped) {
            console.log(`📐 Divergence drop: "${d.route.name}" — ${d.reason}`)
          }
          const keptCoverageFailure = coverageFailure(kept)
          if (keptCoverageFailure) return keptCoverageFailure
          return {
            routes: kept,
            source: 'ai',
            fallbackReason: `为保证方案结构差异（≥30°），已从 ${guardedRoutes.length} 条精简为 ${kept.length} 条`,
          }
        }
        const keptCoverageFailure = coverageFailure(kept)
        if (keptCoverageFailure) return keptCoverageFailure
        return { routes: kept, source: 'ai', fallbackReason: policy.fallbackReason }
      }
      return { routes: guardedRoutes, source: 'ai', fallbackReason: policy.fallbackReason }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI planning failed:', msg)
  }

  return {
    routes: [],
    source: 'fallback',
    fallbackReason: 'AI服务暂不可用，请重试',
  }
}

/** AI path: choose the right sub-strategy, then LLM + Amap verification. */
async function tryAIGeneration(input: PlanInput): Promise<Route[] | null> {
  const { timeMinutes, preferences, city, weather, position, distance, adcode } = input

  // 半天/一天 → single curated route instead of 3 competing routes.
  const isDayTrip = timeMinutes >= 240
  const onlyFood = preferences.length === 1 && preferences[0] === 'food'
  const hasCuisinePreference = !!(input.cuisineTypes?.length || input.customCuisine?.length)

  // A pure, non-specific food request is always a food list. Longer time
  // budgets must not turn a restaurant ranking into a fictional day-trip.
  if (onlyFood && !hasCuisinePreference) {
    return generateFoodList(input)
  }

  // Short-time special paths (bypassed for 半天/一天 — go LLM-first instead).
  if (!isDayTrip) {
    // Food with cuisine types → 3 comparison cards (评分/距离/打卡).
    if (onlyFood && hasCuisinePreference) {
      return generateCuisineComparison(input)
    }
    // Scenic/wander without sub-types + local → POI search + LLM curation.
    if (preferences.length === 1 && preferences[0] === 'scenic' && !input.scenicTypes?.length && distance > 0) {
      return generateScenicRoutes(input)
    }
    if (preferences.length === 1 && preferences[0] === 'wander' && !input.wanderTypes?.length) {
      return generateWanderRoutes(input)
    }
  }

  // Normal LLM-first route generation.
  const userPrompt = buildUserPrompt({
    city,
    weather,
    timeMinutes,
    distance,
    preferences,
    cuisineTypes: [...(input.cuisineTypes ?? []), ...(input.customCuisine ?? [])],
    scenicTypes: [...(input.scenicTypes ?? []), ...(input.customScenic ?? [])],
    wanderTypes: [...(input.wanderTypes ?? []), ...(input.customWander ?? [])],
    singleRoute: isDayTrip,
  })

  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }, 25000)
  } catch {
    return null
  }

  let validated = parseAndValidate(raw)

  // Retry once on schema failure (shorter leash — primary already succeeded).
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
      }, 18000)
      validated = parseAndValidate(raw)
    } catch {
      // retry failed → fall through to null
    }
  }

  if (!validated) return null

  // Day trip: keep only the first route (LLM sometimes ignores the instruction).
  if (isDayTrip && validated.routes.length > 1) {
    console.log(`🔄 Day trip mode: LLM returned ${validated.routes.length} routes, keeping only first`)
    validated.routes = [validated.routes[0]]
  }

  // Verify each stop via Amap. For 全城范围 (distance=0), use 50km.
  const verifyRadius = distance > 0 ? distance : 50000

  // Build gap-fill keywords: when a route loses stops during verification, use
  // these to search for replacements of the right type.
  let gapFillKeywords = ''
  if (preferences.includes('food')) {
    if (input.cuisineTypes?.length || input.customCuisine?.length) {
      const cuisineMap: Record<string, string> = {
        hotpot: '火锅|串串|涮肉',
        noodles: '面馆|拉面|米线',
        pastries: '糕点|面包|烘焙',
        bbq: '烧烤|烤肉',
        local_cuisine: '本地菜|老字号|本帮菜',
        western: '西餐|牛排|披萨',
        coffee_tea: '咖啡|奶茶|茶馆|茶饮',
        buffet: '自助餐|自助|海鲜自助|烤肉自助',
      }
      gapFillKeywords = [...(input.cuisineTypes ?? []), ...(input.customCuisine ?? [])]
        .map((c) => cuisineMap[c] || c).join('|')
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
      shopping: '商场|购物|步行街',
      cafe: '咖啡|茶馆|书吧',
      entertainment: '电影院|KTV|演出',
      hidden: '故居|寺庙|园林|老街',
      museum: '博物馆|美术馆|展览馆',
    }
    if (input.wanderTypes?.length) {
      wanderKws.push(...input.wanderTypes.map((w) => wanderMap[w] || w))
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
