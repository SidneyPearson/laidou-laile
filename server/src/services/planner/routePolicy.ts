import type { PreferenceTag, Route, Stop } from '../../types/route.js'
import { normalizePoiDistance, type Coordinate } from './distancePolicy.js'
import { classifyPoiQuality, type PoiQualityDecision } from './poiQuality.js'
import { buildKeywordProfile, scorePoiRelevance, type KeywordProfile } from './keywordRelevance.js'
import { allocateDistinctPois, samePoi } from './poiAllocation.js'
import { fitStopsToTimeBudget, getMinimumVisitDuration, getStopCountRange } from './timeBudget.js'
import { buildTransportHint, replaceUnsupportedTransportClaim } from './transportHint.js'
import { ensureDistinctRouteTitles } from './routeTitle.js'
import { syncCountPresentation } from './countPresentation.js'

export interface RoutePolicyContext {
  origin: Coordinate
  timeMinutes: number
  explorationDistance: number
  preferences: PreferenceTag[]
  /** Compatibility path for a single preference. */
  customKeywords?: string[]
  /** Category-aware free-text constraints for mixed preferences. */
  customKeywordsByPreference?: Partial<Record<PreferenceTag, string[]>>
  /** Enum-backed subtype terms that final candidates must match. */
  categoryKeywordsByPreference?: Partial<Record<PreferenceTag, string[]>>
  /** Amap typecode prefixes for enum-backed subtypes (OR across selections). */
  categoryTypecodePrefixesByPreference?: Partial<Record<PreferenceTag, string[]>>
}

export interface RoutePolicyResult {
  routes: Route[]
  fallbackReason: string | null
}

type PreparedStop = Stop & {
  qualityScore: number
  qualityDecision: PoiQualityDecision
}

interface PreparedRoute {
  route: Route
  ownStops: PreparedStop[]
  candidates: PreparedStop[]
  targetCount: number
}

const SCENIC_STREET_TERM_RE = /街区|步行街|历史街区|历史文化街区|御街|古街|老街|胡同|古巷/
const ORDINARY_RETAIL_NAME_RE = /超市|便利店|服装|专卖店|零售|烟酒|药店|商店|商铺|店[)）]?$|店[（(]/
const CULTURAL_VENUE_NAME_RE = /博物馆|美术馆|展览馆|纪念馆|文化馆|艺术馆|剧院|遗址|故居/

function formatDistance(distance: number | undefined): string {
  if (distance == null) return '距离未知'
  const value = distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`
  return `距出发点${distance === 0 ? '' : '约'}${value}`
}

function normalizeDistanceClaim(notes: string, distance: number | undefined): string {
  return notes.replace(/距(?:您|用户|出发点)(?:约)?\s*[\d.]+(?:m|km)/g, formatDistance(distance))
}

function preferenceScopeOf(stop: Stop, context: RoutePolicyContext): PreferenceTag | undefined {
  // Amap classifies cafes as catering. When the user selected a single scene,
  // that explicit intent is more reliable than the provider's broad category.
  if (context.preferences.length === 1) return context.preferences[0]
  if (stop.preferenceScope) return stop.preferenceScope

  // In mixed routes, an explicit category keyword is stronger evidence than
  // Amap's broad typecode (cafes are type 05 but may belong to wander).
  for (const preference of context.preferences) {
    const profile = buildKeywordProfile(context.customKeywordsByPreference?.[preference] ?? [])
    if (profile.requested.length > 0 && scorePoiRelevance({
      name: stop.name, address: stop.address, tags: stop.notes, type: stop.typecode,
    }, profile) > 0) return preference
  }
  const typecode = stop.typecode ?? ''
  if (typecode.startsWith('05')) return 'food'
  if (typecode.startsWith('11') || typecode.startsWith('14')) return 'scenic'
  if (typecode.startsWith('06') || typecode.startsWith('07') || typecode.startsWith('08')) return 'wander'
  return undefined
}

function profileForScope(
  scope: PreferenceTag | undefined,
  context: RoutePolicyContext,
  legacyProfile: KeywordProfile,
): KeywordProfile {
  if (scope && context.customKeywordsByPreference) {
    return buildKeywordProfile(context.customKeywordsByPreference[scope] ?? [])
  }
  if (!context.customKeywordsByPreference && context.preferences.length === 1) return legacyProfile
  return buildKeywordProfile([])
}

function qualityWeight(decision: PoiQualityDecision): number {
  if (decision === 'allow') return 8
  if (decision === 'allow_with_caution') return 4
  if (decision === 'downrank') return 0
  return -100
}

function isParentOf(candidate: Stop, child: Stop): boolean {
  return !!candidate.amapPoiId && candidate.amapPoiId === child.parentPoiId
}

/** Collapse exact, parent-child and sibling identities, preferring the parent
 * POI and then the highest-quality representative. */
function collapseRelatedStops(stops: PreparedStop[]): PreparedStop[] {
  const collapsed: PreparedStop[] = []
  for (const candidate of stops) {
    const index = collapsed.findIndex(existing => samePoi(existing, candidate))
    if (index < 0) {
      collapsed.push(candidate)
      continue
    }
    const existing = collapsed[index]
    if (isParentOf(candidate, existing)
      || (!isParentOf(existing, candidate) && candidate.qualityScore > existing.qualityScore)) {
      collapsed[index] = candidate
    }
  }
  return collapsed
}

function prepareStop(
  stop: Stop,
  context: RoutePolicyContext,
  legacyProfile: KeywordProfile,
): PreparedStop | null {
  const quality = classifyPoiQuality(stop)
  if (quality.decision === 'reject') return null

  const scope = preferenceScopeOf(stop, context)
  const profile = profileForScope(scope, context, legacyProfile)
  const relevancePoi = {
    name: stop.name,
    address: stop.address,
    tags: stop.notes,
    type: stop.typecode,
  }
  const relevance = scorePoiRelevance(relevancePoi, profile)
  if (profile.requested.length > 0 && relevance === 0) return null
  const categoryProfile = buildKeywordProfile(
    scope ? context.categoryKeywordsByPreference?.[scope] ?? [] : [],
  )
  const isScenicStreetRequest = scope === 'scenic'
    && categoryProfile.requested.some(term => SCENIC_STREET_TERM_RE.test(term))
  if (isScenicStreetRequest
    && ORDINARY_RETAIL_NAME_RE.test(stop.name)
    && !CULTURAL_VENUE_NAME_RE.test(stop.name)) return null
  // Subtype constraints are a hard semantic gate. An unrelated shop merely
  // located on a road named "胡同" must not qualify as a hidden-lane POI.
  const categoryRelevance = scorePoiRelevance(
    isScenicStreetRequest
      ? { ...relevancePoi, tags: '' }
      : { ...relevancePoi, address: '', tags: '' },
    categoryProfile,
  )
  const typecodePrefixes = scope
    ? context.categoryTypecodePrefixesByPreference?.[scope] ?? []
    : []
  const matchesCategoryType = typecodePrefixes.some(prefix =>
    (stop.typecode ?? '').startsWith(prefix),
  )
  const hasCategoryConstraint = categoryProfile.requested.length > 0 || typecodePrefixes.length > 0
  // Keyword evidence and provider type evidence are alternatives. Likewise,
  // prefixes from multiple selected subtypes form a union, not an intersection.
  if (hasCategoryConstraint && categoryRelevance === 0 && !matchesCategoryType) return null

  const distanceMeters = normalizePoiDistance(
    stop.distanceMeters,
    context.origin,
    { lat: stop.lat, lng: stop.lng },
  )
  if (context.explorationDistance > 0
    && distanceMeters != null
    && distanceMeters > context.explorationDistance) return null

  return {
    ...stop,
    preferenceScope: scope,
    distanceMeters,
    visitDurationMinutes: Math.max(stop.visitDurationMinutes, getMinimumVisitDuration(stop)),
    notes: normalizeDistanceClaim(stop.notes || '', distanceMeters),
    qualityScore: relevance * 10 + Math.max(categoryRelevance, matchesCategoryType ? 2 : 0) * 4
      + qualityWeight(quality.decision),
    qualityDecision: quality.decision,
  }
}

function stripInternalStop(stop: PreparedStop): Stop {
  const {
    parentPoiId: _parentPoiId,
    typecode: _typecode,
    preferenceScope: _preferenceScope,
    qualityScore: _qualityScore,
    qualityDecision: _qualityDecision,
    ...publicStop
  } = stop
  return publicStop
}

/** Final deterministic guardrail shared by AI, themed, fallback, refine and replace routes. */
export function applyRoutePolicies(routes: Route[], context: RoutePolicyContext): RoutePolicyResult {
  const legacyProfile = buildKeywordProfile(context.customKeywords ?? [])
  const countRange = getStopCountRange(context.timeMinutes)

  const prepared: PreparedRoute[] = routes.flatMap((route): PreparedRoute[] => {
    const ownStops = collapseRelatedStops(route.stops
      .map(stop => prepareStop(stop, context, legacyProfile))
      .filter((stop): stop is PreparedStop => stop !== null)
      .filter(stop => stop.qualityDecision !== 'downrank'))
    if (ownStops.length === 0) return []

    const reservoir = collapseRelatedStops([
      ...ownStops,
      ...(route.candidateStops ?? [])
        .map(stop => prepareStop(stop, context, legacyProfile))
        .filter((stop): stop is PreparedStop => stop !== null)
        .filter(stop => stop.qualityDecision !== 'downrank'),
    ]).sort((a, b) => b.qualityScore - a.qualityScore)

    const desired = Math.max(ownStops.length, countRange.min)
    return [{
      route,
      ownStops,
      candidates: reservoir,
      targetCount: Math.min(countRange.max, desired),
    }]
  })

  if (prepared.length === 0) return { routes: [], fallbackReason: null }

  // Share only compatible scopes between routes. A route's own candidates stay
  // first so its theme remains intact; the shared reservoir only fills gaps.
  const allCandidates = collapseRelatedStops(prepared.flatMap(item => item.candidates))
  const candidatePools = prepared.map(item => {
    const scopes = new Set(item.ownStops.map(stop => stop.preferenceScope).filter(Boolean))
    const compatibleShared = allCandidates.filter(candidate =>
      scopes.size === 0 || (candidate.preferenceScope != null && scopes.has(candidate.preferenceScope)),
    )
    return collapseRelatedStops([...item.candidates, ...compatibleShared])
      .sort((a, b) => b.qualityScore - a.qualityScore)
  })

  const allocation = allocateDistinctPois(
    candidatePools,
    prepared.map(item => item.targetCount),
    prepared.map(() => 1),
  )

  let candidateShortage = allocation.candidateShortage || allocation.hadToRepeat
  const processed = prepared.flatMap((item, index): Route[] => {
    const fitted = fitStopsToTimeBudget(
      allocation.routes[index],
      context.timeMinutes,
      context.origin,
    )
    if (fitted.stops.length === 0) return []
    if (fitted.stops.length < item.targetCount) candidateShortage = true

    const stops = fitted.stops.map(stripInternalStop)
    const hint = buildTransportHint(context.explorationDistance, fitted.travelDistanceMeters, stops)
    const { candidateStops: _candidateStops, ...publicRoute } = item.route
    return [{
      ...publicRoute,
      stops,
      totalDurationMinutes: fitted.totalMinutes,
      walkingDistanceMeters: fitted.travelDistanceMeters,
      tips: replaceUnsupportedTransportClaim(item.route.tips || '', hint),
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
  const presented = titled.map(syncCountPresentation)
  return {
    routes: presented,
    fallbackReason: candidateShortage ? '附近同类候选较少，部分方案地点数较少或保留了有限重复' : null,
  }
}
