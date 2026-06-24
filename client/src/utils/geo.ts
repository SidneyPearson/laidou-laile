import type { Stop } from '../types/route'

/** Haversine distance in meters between two lat/lng points */
export function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Walking distance (meters) along a stop list, in their given order. */
export function walkingDistanceOf(stops: Stop[]): number {
  let total = 0
  for (let i = 1; i < stops.length; i++) {
    total += haversineDist(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng)
  }
  return Math.round(total)
}
