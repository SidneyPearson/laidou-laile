import { haversineDist } from '../../utils/geo.js'
import type { AmapPOI } from '../../types/poi.js'
import type { Stop } from '../../types/route.js'
import { CUISINE_FALLBACK_MAP } from './constants.js'

/** Extract a cuisine keyword group from free text; matches against
 *  {@link CUISINE_FALLBACK_MAP}. Longer keys win so "自助餐" beats "自助". */
export function extractCuisineKeyword(text: string): string | null {
  const keys = Object.keys(CUISINE_FALLBACK_MAP).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (text.includes(key)) {
      return CUISINE_FALLBACK_MAP[key]
    }
  }
  return null
}

/** Sort stops geographically along the first→last axis. Pure. */
function projectSort<T extends { lat: number; lng: number }>(items: T[]): T[] {
  if (items.length <= 1) return items.slice()
  const first = items[0]
  const last = items[items.length - 1]
  const axisLat = last.lat - first.lat
  const axisLng = last.lng - first.lng
  const axisLen = Math.sqrt(axisLat * axisLat + axisLng * axisLng) || 1
  return [...items].sort((a, b) => {
    const projA = ((a.lat - first.lat) * axisLat + (a.lng - first.lng) * axisLng) / axisLen
    const projB = ((b.lat - first.lat) * axisLat + (b.lng - first.lng) * axisLng) / axisLen
    return projA - projB
  })
}

/** Estimate walking distance between verified stops using Haversine, after
 *  projecting them onto the first→last axis (natural walking order). */
export function estimateWalkDistFromStops(stops: Stop[]): number {
  if (stops.length <= 1) return 0
  const sorted = projectSort(stops)
  let total = 0
  for (let i = 1; i < sorted.length; i++) {
    total += haversineDist(
      sorted[i - 1].lat, sorted[i - 1].lng,
      sorted[i].lat, sorted[i].lng,
    )
  }
  return Math.round(total)
}

/** Same as {@link estimateWalkDistFromStops} but for raw {@link AmapPOI}
 *  objects (used by rule-based fallback where we haven't built Stops yet). */
export function estimateWalkDist(pois: AmapPOI[]): number {
  if (pois.length <= 1) return 0
  const sorted = projectSort(pois)
  let total = 0
  for (let i = 1; i < sorted.length; i++) {
    total += haversineDist(
      sorted[i - 1].lat, sorted[i - 1].lng,
      sorted[i].lat, sorted[i].lng,
    )
  }
  return Math.round(total)
}

/** Rough visit duration in minutes, inferred from Amap typecode prefix. */
export function estimateDuration(poi: AmapPOI): number {
  if (poi.typecode.startsWith('05')) return 25
  if (poi.typecode.startsWith('0604')) return 45
  if (poi.typecode.startsWith('11') || poi.typecode.startsWith('14')) return 35
  return 20
}

/** Format meters as either "N.Nkm" or "Nm". */
export function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}
