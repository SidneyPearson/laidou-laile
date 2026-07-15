import type { AmapPOI } from '../../types/poi.js'
import type { Route, Stop, PreferenceTag } from '../../types/route.js'
import { PREF_LABELS } from './constants.js'
import { estimateWalkDist, estimateDuration, fmtDist } from './routeMetrics.js'

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
  const sorted = pois.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  }).sort((a, b) => a.distance - b.distance)

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
      id: crypto.randomUUID(),
      name: `${prefLabel}路线${i + 1}`,
      tagline: `${stops.length}个地点`,
      stops,
      totalDurationMinutes: totalDur + Math.ceil((walkDist / 100) * 1.5),
      walkingDistanceMeters: walkDist,
      tips: walkDist < 600 ? '全程步行即可，距离很近' : '可步行+共享单车结合',
    })
  }

  return routes
}
