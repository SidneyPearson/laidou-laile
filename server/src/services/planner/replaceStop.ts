import { normalizeName } from '../../utils/text.js'
import type { Stop, Route } from '../../types/route.js'
import type { ReplaceStopInput } from './types.js'
import { PREFERENCE_REPLACE_KEYWORDS } from './constants.js'
import { searchSingleCuisinePOI } from './poiMatching.js'
import { estimateWalkDistFromStops, extractCuisineKeyword } from './routeMetrics.js'
import { applyRoutePolicies } from './routePolicy.js'

/**
 * Replace a single stop with a different nearby place of the same type.
 * Searches around the replaced stop's coordinates, excludes all places already
 * in the route, re-sorts geographically, and recomputes metrics. Returns null
 * if no suitable replacement is found.
 */
export async function replaceStop(input: ReplaceStopInput): Promise<Route | null> {
  const { route, stopIndex, preferences, distance, adcode } = input
  const target = route.stops[stopIndex]
  if (!target) return null

  // Derive search keyword: prefer cuisine hint from the stop name, else fall
  // back to the user's preference category.
  const cuisineKw = extractCuisineKeyword(target.name)
  const prefKw = preferences.map((p) => PREFERENCE_REPLACE_KEYWORDS[p]).filter(Boolean).join('|')
  const keyword = cuisineKw || prefKw || '餐厅|景点'

  // Exclude every place already in the route so the replacement is genuinely new.
  const usedNames = new Set(route.stops.map((s) => normalizeName(s.name)))
  const usedPoiIds = new Set(route.stops.map((s) => s.amapPoiId).filter(Boolean) as string[])

  // Search radius: at least 800m, up to half the user's exploration distance.
  const maxDist = Math.max(800, distance > 0 ? Math.round(distance / 2) : 2000)

  const found = await searchSingleCuisinePOI(
    keyword, target.lng, target.lat, adcode, maxDist, usedNames,
  )
  if (!found || usedPoiIds.has(found.id)) return null

  // Build the replacement stop, keeping the original visit duration.
  const newStop: Stop = {
    name: found.name,
    address: found.address,
    visitDurationMinutes: target.visitDurationMinutes,
    notes: found.address
      ? `${found.address}${found.rating ? `，评分 ${found.rating}` : ''}`
      : '',
    amapPoiId: found.id,
    lng: found.lng,
    lat: found.lat,
    // Search distance is relative to the replaced stop; routePolicy recomputes
    // the displayed value against the original route origin.
    distanceMeters: undefined,
  }

  const newStops = route.stops.map((s, i) => (i === stopIndex ? newStop : s))

  // Re-sort geographically along the first→last axis (same as refine).
  if (newStops.length >= 2) {
    const first = newStops[0]
    const last = newStops[newStops.length - 1]
    const axisLat = last.lat - first.lat
    const axisLng = last.lng - first.lng
    const axisLen = Math.sqrt(axisLat * axisLat + axisLng * axisLng) || 1
    newStops.sort((a, b) => {
      const projA = ((a.lat - first.lat) * axisLat + (a.lng - first.lng) * axisLng) / axisLen
      const projB = ((b.lat - first.lat) * axisLat + (b.lng - first.lng) * axisLng) / axisLen
      return projA - projB
    })
  }

  const walkDist = estimateWalkDistFromStops(newStops)
  const totalDur = newStops.reduce((s, st) => s + st.visitDurationMinutes, 0)
    + Math.ceil((walkDist / 100) * 1.5)

  const result: Route = {
    ...route,
    id: crypto.randomUUID(),
    stops: newStops,
    walkingDistanceMeters: walkDist,
    totalDurationMinutes: totalDur,
  }
  return applyRoutePolicies([result], {
    origin: input.origin ?? { lat: route.stops[0].lat, lng: route.stops[0].lng },
    timeMinutes: input.timeMinutes ?? Math.max(60, route.totalDurationMinutes),
    explorationDistance: distance,
    preferences,
  }).routes[0] ?? null
}
