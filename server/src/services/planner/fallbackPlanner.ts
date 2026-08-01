import type { AmapPOI } from '../../types/poi.js'
import type { Route, Stop, PreferenceTag } from '../../types/route.js'
import { PREF_LABELS } from './constants.js'
import { estimateWalkDist, fmtDist } from './routeMetrics.js'
import { estimateVisitDuration } from './timeBudget.js'
import { classifyPoiQuality } from './poiQuality.js'

/**
 * Rule-based fallback: split deduped POIs (sorted by distance) into up to 3
 * routes of up to 5 stops each. Used when the AI path fails entirely.
 */
export function buildFallbackRoutes(
  pois: AmapPOI[],
  _timeMinutes: number,
  preferences: PreferenceTag[],
): Route[] {
  const prefLabel = [...new Set(preferences.map((p) => PREF_LABELS[p] || p))].join('')

  const seen = new Set<string>()
  const sortedByDistance = pois.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  }).sort((a, b) => a.distance - b.distance)

  const scopeOf = (p: AmapPOI): PreferenceTag | undefined => p.typecode.startsWith('05') ? 'food'
    : p.typecode.startsWith('11') || p.typecode.startsWith('14') ? 'scenic'
      : p.typecode.startsWith('06') || p.typecode.startsWith('07') || p.typecode.startsWith('08') ? 'wander'
        : undefined
  // Preserve category coverage in mixed requests. Pure distance chunks used
  // to put all scenic stops first and leave valid restaurants in a later card.
  let sorted = sortedByDistance
  if (preferences.length > 1) {
    const pools = new Map<PreferenceTag, AmapPOI[]>(preferences.map(preference => [preference, []]))
    const unscoped: AmapPOI[] = []
    for (const candidate of sortedByDistance) {
      const scope = scopeOf(candidate)
      const pool = scope ? pools.get(scope) : undefined
      if (pool) pool.push(candidate)
      else unscoped.push(candidate)
    }
    const interleaved: AmapPOI[] = []
    while ([...pools.values()].some(pool => pool.length > 0)) {
      for (const preference of preferences) {
        const next = pools.get(preference)?.shift()
        if (next) interleaved.push(next)
      }
    }
    interleaved.push(...unscoped)
    sorted = interleaved
  }

  // A mixed fallback is a coverage-safe route, not three category-homogeneous
  // cards. Reserve one nearest verified POI per selected preference and keep
  // the reservoir equally narrow; otherwise the later time fitter can drop
  // the lower-scored food stop while filling the route with museums.
  const planningPois = preferences.length > 1
    ? preferences
      .map(preference => sorted.find(candidate =>
        scopeOf(candidate) === preference
          && !['reject', 'downrank'].includes(classifyPoiQuality(candidate).decision),
      ))
      .filter((candidate): candidate is AmapPOI => Boolean(candidate))
    : sorted

  const routes: Route[] = []
  const candidateStops: Stop[] = planningPois.map((p) => ({
    name: p.name,
    address: p.address,
    visitDurationMinutes: estimateVisitDuration(p),
    notes: p.address,
    amapPoiId: p.id,
    parentPoiId: p.parentId,
    typecode: p.typecode,
    preferenceScope: scopeOf(p),
    lng: p.lng,
    lat: p.lat,
    distanceMeters: p.distance,
  }))
  const MAX_PER_ROUTE = 5
  const perRoute = preferences.length > 1
    ? planningPois.length
    : Math.min(MAX_PER_ROUTE, Math.max(2, Math.ceil(planningPois.length / 3)))
  const chunks = preferences.length > 1
    ? (planningPois.length > 0 ? 1 : 0)
    : Math.min(3, Math.ceil(planningPois.length / perRoute))

  for (let i = 0; i < chunks; i++) {
    const chunk = planningPois.slice(i * perRoute, (i + 1) * perRoute)
    if (chunk.length === 0) continue

    const stops: Stop[] = chunk.map((p) => ({
      name: p.name,
      address: p.address,
      visitDurationMinutes: estimateVisitDuration(p),
      notes: `${p.address}，距您约${fmtDist(p.distance)}`,
      amapPoiId: p.id,
      parentPoiId: p.parentId,
      typecode: p.typecode,
      preferenceScope: scopeOf(p),
      lng: p.lng,
      lat: p.lat,
      distanceMeters: p.distance,
    }))

    const totalDur = stops.reduce((s, st) => s + st.visitDurationMinutes, 0)
    const walkDist = estimateWalkDist(chunk)

    routes.push({
      id: crypto.randomUUID(),
      name: `${prefLabel}路线${i + 1}`,
      tagline: `${stops.length}个地点`,
      stops,
      totalDurationMinutes: totalDur + Math.ceil((walkDist / 100) * 1.5),
      walkingDistanceMeters: walkDist,
      tips: walkDist < 600 ? '全程步行即可，距离很近' : '可步行+共享单车结合',
      candidateStops,
    })
  }

  return routes
}
