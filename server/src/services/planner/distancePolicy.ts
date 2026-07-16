import { haversineDist } from '../../utils/geo.js'

export interface Coordinate {
  lat: number
  lng: number
}

export function isValidCoordinate(value: Coordinate | undefined): value is Coordinate {
  return !!value
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lng)
    && value.lat >= -90 && value.lat <= 90
    && value.lng >= -180 && value.lng <= 180
}

function finiteDistance(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

/** Normalize the user-origin distance of a POI without conflating unknown with 0. */
export function normalizePoiDistance(
  amapDistance: unknown,
  origin?: Coordinate,
  poi?: Coordinate,
): number | undefined {
  const raw = finiteDistance(amapDistance)
  if (raw != null && raw > 0) return Math.round(raw)

  if (isValidCoordinate(origin) && isValidCoordinate(poi)) {
    const estimated = haversineDist(origin.lat, origin.lng, poi.lat, poi.lng)
    return estimated < 1 ? 0 : Math.round(estimated)
  }
  return undefined
}

/** Haversine route estimate including origin → first stop and every adjacent leg. */
export function estimateRouteTravel(origin: Coordinate | undefined, stops: Coordinate[]): {
  distanceMeters: number
  minutes: number
} {
  const validStops = stops.filter(isValidCoordinate)
  if (validStops.length === 0) return { distanceMeters: 0, minutes: 0 }

  let total = 0
  let previous = isValidCoordinate(origin) ? origin : validStops[0]
  for (const stop of validStops) {
    total += haversineDist(previous.lat, previous.lng, stop.lat, stop.lng)
    previous = stop
  }
  const distanceMeters = Math.round(total)
  return {
    distanceMeters,
    // Existing product convention: 100 metres ≈ 1.5 minutes on foot.
    minutes: Math.ceil((distanceMeters / 100) * 1.5),
  }
}
