import type { PreferenceTag, Route, Stop } from '../../types/route.js'
import { normalizePoiDistance, type Coordinate } from './distancePolicy.js'
import { classifyPoiQuality } from './poiQuality.js'
import { buildKeywordProfile, scorePoiRelevance } from './keywordRelevance.js'
import { samePoi } from './poiAllocation.js'
import { fitStopsToTimeBudget } from './timeBudget.js'
import { buildTransportHint, replaceUnsupportedTransportClaim } from './transportHint.js'
import { ensureDistinctRouteTitles } from './routeTitle.js'

export interface RoutePolicyContext {
  origin: Coordinate
  timeMinutes: number
  explorationDistance: number
  preferences: PreferenceTag[]
  customKeywords?: string[]
}

export interface RoutePolicyResult {
  routes: Route[]
  fallbackReason: string | null
}

function formatDistance(distance: number | undefined): string {
  if (distance == null) return '距离未知'
  const value = distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`
  return `距出发点${distance === 0 ? '' : '约'}${value}`
}

function normalizeDistanceClaim(notes: string, distance: number | undefined): string {
  return notes.replace(/距(?:您|用户|出发点)(?:约)?\s*[\d.]+(?:m|km)/g, formatDistance(distance))
}

/** Final deterministic guardrail shared by AI, themed and fallback routes. */
export function applyRoutePolicies(routes: Route[], context: RoutePolicyContext): RoutePolicyResult {
  const relevanceProfile = buildKeywordProfile(context.customKeywords ?? [])
  const strictCustomRelevance = context.preferences.length === 1
  const globallyUsed: Stop[] = []
  let candidateShortage = false

  const processed = routes.flatMap((route): Route[] => {
    const eligible = route.stops.flatMap((stop): Stop[] => {
      const quality = classifyPoiQuality(stop)
      if (quality.decision === 'reject') return []

      const relevance = scorePoiRelevance({
        name: stop.name,
        address: stop.address,
        tags: stop.notes,
      }, relevanceProfile)
      if (strictCustomRelevance && relevanceProfile.requested.length > 0 && relevance === 0) return []

      const distanceMeters = normalizePoiDistance(
        stop.distanceMeters,
        context.origin,
        { lat: stop.lat, lng: stop.lng },
      )
      if (context.explorationDistance > 0
        && distanceMeters != null
        && distanceMeters > context.explorationDistance) return []
      return [{
        ...stop,
        distanceMeters,
        notes: normalizeDistanceClaim(stop.notes || '', distanceMeters),
        // Used only by the budget fitter and stripped by structural typing.
        qualityScore: relevance * 10 + (quality.decision === 'allow' ? 5 : 0),
      } as Stop & { qualityScore: number }]
    })

    if (eligible.length === 0) return []

    let uniqueStops = eligible.filter(stop => !globallyUsed.some(used => samePoi(used, stop)))
    if (uniqueStops.length === 0) {
      uniqueStops = [eligible[0]]
      candidateShortage = true
    }
    globallyUsed.push(...uniqueStops)

    const fitted = fitStopsToTimeBudget(
      uniqueStops as Array<Stop & { qualityScore?: number }>,
      context.timeMinutes,
      context.origin,
    )
    if (fitted.stops.length === 0) return []

    const stops = fitted.stops.map(({ qualityScore: _qualityScore, ...stop }) => stop as Stop)
    const hint = buildTransportHint(context.explorationDistance, fitted.travelDistanceMeters, stops)
    return [{
      ...route,
      stops,
      totalDurationMinutes: fitted.totalMinutes,
      walkingDistanceMeters: fitted.travelDistanceMeters,
      tips: replaceUnsupportedTransportClaim(route.tips || '', hint),
    }]
  })

  const titles = ensureDistinctRouteTitles(processed, context.preferences)
  const defaultDirections = ['深度 · 一处慢逛', '顺路 · 最省脚', '连逛 · 多点串']
  const usedDirections = new Set<string>()
  const titled = processed.map((route, index) => {
    let direction = route.direction
    if (!route.divergenceExempt && (!direction || usedDirections.has(direction))) {
      direction = defaultDirections.find(label => !usedDirections.has(label))
        ?? `特色方向${index + 1}`
    }
    if (direction) usedDirections.add(direction)
    return { ...route, name: titles[index], direction }
  })
  return {
    routes: titled,
    fallbackReason: candidateShortage ? '附近同类候选较少，部分方案保留了相同地点' : null,
  }
}
