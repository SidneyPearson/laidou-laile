import { getAmapClient } from '../amap/client.js'
import { haversineDist } from '../../utils/geo.js'
import { normalizeName } from '../../utils/text.js'
import type { AmapPOI, AmapTextResponse } from '../../types/poi.js'
import { CUISINE_FALSE_RE } from './constants.js'

/** Amap raw POI shape after `/place/text` or `/place/around` — Amap returns
 *  fully untyped JSON, so we narrow here to a minimal common subset. */
export interface AmapRawPoi {
  id: string
  name: string
  type?: string
  typecode?: string
  address?: string
  location?: string
  distance?: string
  biz_ext?: { rating?: string | null; cost?: string | null }
}

/** Convert an Amap raw POI into our typed AmapPOI. Preserves Amap's own
 *  `distance` field when available; falls back to Haversine from the reference
 *  point when the field is missing/zero. Returns null when the location is
 *  missing or unparseable. */
export function parseRawPoi(
  raw: AmapRawPoi,
  refLng: number,
  refLat: number,
): AmapPOI | null {
  if (!raw.location || !raw.location.includes(',')) return null
  const [poiLng, poiLat] = raw.location.split(',').map(Number)
  if (isNaN(poiLng) || isNaN(poiLat)) return null
  // Preserve Amap's distance when available; compute Haversine as fallback.
  const rawDist = raw.distance ? parseInt(raw.distance, 10) || 0 : 0
  const dist = rawDist > 0 ? rawDist : Math.round(haversineDist(refLat, refLng, poiLat, poiLng))
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type ?? '',
    typecode: raw.typecode || '',
    address: raw.address || '',
    lng: poiLng,
    lat: poiLat,
    distance: dist,
    rating: raw.biz_ext?.rating || null,
    cost: raw.biz_ext?.cost || null,
  }
}

/**
 * Search Amap for a single POI matching cuisine keywords near a center point.
 * Returns the best match not already used in the caller's route.
 *
 * Tries two strategies in order:
 *   1. `/place/text` (location-biased, good for standalone shops)
 *   2. `/place/around` within radius (finds mall-internal shops that text
 *      search misses, e.g. "芳圆阁面馆(世博源2区店)" inside 世博源 mall).
 */
export async function searchSingleCuisinePOI(
  keywordAmap: string,
  lng: number,
  lat: number,
  adcode: string | undefined,
  maxDist: number,
  usedNames: Set<string>,
): Promise<AmapPOI | null> {
  const client = getAmapClient()

  function pickBest(rawPois: AmapRawPoi[]): AmapPOI | null {
    const pois = rawPois
      .map((raw) => parseRawPoi(raw, lng, lat))
      .filter((p): p is AmapPOI => p !== null)

    const candidates = pois
      .filter((p) => {
        if (maxDist > 0 && p.distance > maxDist) return false
        if (usedNames.has(normalizeName(p.name))) return false
        if (CUISINE_FALSE_RE.test(p.name)) return false
        return true
      })
      .sort((a, b) => a.distance - b.distance)

    return candidates[0] || null
  }

  // Strategy 1: text search
  try {
    const res = await client.get<AmapTextResponse>('/place/text', {
      params: {
        keywords: keywordAmap,
        location: `${lng},${lat}`,
        ...(adcode ? { city: adcode } : {}),
        offset: 10, page: 1, extensions: 'all',
      },
    })
    const found = pickBest((res.data.pois || []) as AmapRawPoi[])
    if (found) return found
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`searchSingleCuisinePOI text-search failed for "${keywordAmap}":`, msg)
  }

  // Strategy 2: around-search within radius
  try {
    const radius = Math.min(maxDist > 0 ? maxDist : 3000, 3000)
    const res = await client.get<AmapTextResponse>('/place/around', {
      params: {
        keywords: keywordAmap,
        location: `${lng},${lat}`,
        radius,
        types: '050000', // food-related only
        offset: 10, page: 1, extensions: 'all',
      },
    })
    const found = pickBest((res.data.pois || []) as AmapRawPoi[])
    if (found) {
      console.log(`Refine: around-search found "${found.name}" (${found.distance}m, rating=${found.rating})`)
      return found
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`searchSingleCuisinePOI around-search failed for "${keywordAmap}":`, msg)
  }

  return null
}
