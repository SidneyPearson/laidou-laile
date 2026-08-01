import { verifyPlace } from '../amap/poiSearch.js'
import { getAmapClient } from '../amap/client.js'
import { haversineDist } from '../../utils/geo.js'
import type { AmapPOI, AmapTextResponse } from '../../types/poi.js'
import type { Route, Stop } from '../../types/route.js'
import { FALSE_MATCH_RE } from './constants.js'
import { parseRawPoi, type AmapRawPoi } from './poiMatching.js'
import { estimateWalkDistFromStops, fmtDist } from './routeMetrics.js'
import { filterUsablePois } from './poiQuality.js'
import { estimateVisitDuration } from './timeBudget.js'

/** LLM route shape before verification — LLM only provides stop names, we
 *  fill lng/lat/address/amapPoiId via Amap. */
export interface UnverifiedRoute {
  name: string
  tagline: string
  stops: Array<{
    name: string
    visitDurationMinutes: number
    notes: string
    photoTip?: string
    address?: string
    amapPoiId?: string | null
    lng?: number
    lat?: number
  }>
  totalDurationMinutes: number
  walkingDistanceMeters: number
  tips: string
  direction?: string
  reason?: string
  axes?: { goal: string; behavior: string; info: string }
}

/**
 * Fallback: when a stop name doesn't verify, search Amap with the name as
 * keywords. Returns the best nearby match that hasn't been claimed yet.
 */
export async function fallbackSearchStop(
  name: string,
  userLng: number,
  userLat: number,
  adcode: string | undefined,
  maxDistance: number | undefined,
  typeFilter: RegExp | undefined,
  claimedIds: Set<string>,
): Promise<AmapPOI | null> {
  const client = getAmapClient()
  const keywords = name.replace(/[（(][^)）]*[)）]/g, '').trim()
  try {
    const res = await client.get<AmapTextResponse>('/place/text', {
      params: {
        keywords,
        location: `${userLng},${userLat}`,
        ...(adcode ? { city: adcode } : {}),
        offset: 5, page: 1, extensions: 'all',
      },
    })
    const pois = filterUsablePois(((res.data.pois || []) as AmapRawPoi[])
      .map((raw) => parseRawPoi(raw, userLng, userLat))
      .filter((p): p is AmapPOI => p !== null))

    const candidates = pois.filter((p) => {
      if (maxDistance && maxDistance > 0 && p.distance > maxDistance) return false
      if (typeFilter && !typeFilter.test(p.typecode)) return false
      if (claimedIds.has(p.id)) return false
      // Reject false matches: POI name includes the search name but has extra
      // text indicating an unrelated facility (parking, police, mgmt, etc.)
      const pName = p.name.replace(/[()（）]/g, '').trim()
      const sName = name.replace(/[()（）]/g, '').trim()
      if (pName !== sName && pName.includes(sName)) {
        const extra = pName.replace(sName, '').trim()
        if (FALSE_MATCH_RE.test(extra)) return false
      }
      return true
    })

    if (candidates.length > 0) {
      // Prefer exact-name matches, then closest.
      candidates.sort((a, b) => {
        const aName = a.name.replace(/[()（）]/g, '').trim()
        const bName = b.name.replace(/[()（）]/g, '').trim()
        const sName = name.replace(/[()（）]/g, '').trim()
        const aExact = aName === sName ? 1 : 0
        const bExact = bName === sName ? 1 : 0
        if (aExact !== bExact) return bExact - aExact
        return a.distance - b.distance
      })
      const best = candidates[0]
      console.log(`🔧 Fallback search: "${name}" → "${best.name}" (${best.distance}m, typecode=${best.typecode})`)
      return best
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`Fallback search failed for "${name}":`, msg)
  }
  return null
}

/**
 * For each stop in each route, verify the place via Amap text-search and fill
 * in lng/lat/address/amapPoiId. Stops that can't be verified are dropped.
 * Failed stops get a fallback keyword search. If a route ends up with fewer
 * stops than requested and `gapFillKeywords` is provided, one extra stop is
 * added from a keyword search around the user.
 */
export async function verifyAndEnrichRoutes(
  routes: UnverifiedRoute[],
  userLng: number,
  userLat: number,
  adcode?: string,
  maxDistance?: number,
  typeFilter?: RegExp,
  gapFillKeywords?: string,
): Promise<Route[]> {
  // Verify every unique stop name (a stop appearing in N routes only costs 1 call).
  const allNames = new Set<string>()
  for (const r of routes) {
    for (const s of r.stops) allNames.add(s.name)
  }

  const verificationMap = new Map<string, AmapPOI | null>()
  const names = [...allNames]
  const results: Array<{ name: string; poi: AmapPOI | null }> = []
  for (const name of names) {
    // 400ms delay between requests (Amap free tier ≈ 3 QPS)
    await new Promise((r) => setTimeout(r, 400))
    let poi: AmapPOI | null = null
    // Retry once on QPS limit
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        poi = await verifyPlace(name, userLng, userLat, adcode, maxDistance)
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('QPS') && attempt < 1) {
          await new Promise((r) => setTimeout(r, 1000))
        } else {
          console.warn(`verifyPlace exception for "${name}":`, msg)
        }
      }
    }
    results.push({ name, poi })
  }
  for (const { name, poi } of results) {
    verificationMap.set(name, poi)
  }

  // Enrich each route with verified POI data. Stops with no match are dropped.
  const claimedIds = new Set<string>()
  const enriched: Route[] = []
  for (const r of routes) {
    const verifiedStops: Stop[] = []
    for (const s of r.stops) {
      let poi = verificationMap.get(s.name) ?? null

      if (!poi) {
        poi = await fallbackSearchStop(s.name, userLng, userLat, adcode, maxDistance, typeFilter, claimedIds)
      }

      if (poi) {
        if (typeFilter && !typeFilter.test(poi.typecode)) {
          console.warn(`⚠️ Stop typecode mismatch, dropped: "${s.name}" (typecode=${poi.typecode})`)
          continue
        }
        if (claimedIds.has(poi.id)) {
          console.warn(`⚠️ Stop already claimed, dropped: "${poi.name}"`)
          continue
        }
        claimedIds.add(poi.id)
        const dist = poi.distance > 0 ? poi.distance : haversineDist(userLat, userLng, poi.lat, poi.lng)
        verifiedStops.push({
          name: poi.name,
          address: poi.address,
          visitDurationMinutes: s.visitDurationMinutes,
          notes: s.notes,
          amapPoiId: poi.id,
          parentPoiId: poi.parentId,
          typecode: poi.typecode,
          lng: poi.lng,
          lat: poi.lat,
          photoTip: s.photoTip,
          distanceMeters: Math.round(dist),
        })
      } else {
        console.warn(`⚠️ Stop not found on Amap, dropped: "${s.name}"`)
      }
    }

    // Gap fill: if the route lost stops, add one from a keyword search.
    if (gapFillKeywords && verifiedStops.length < r.stops.length && verifiedStops.length < 3) {
      const client = getAmapClient()
      try {
        const res = await client.get<AmapTextResponse>('/place/text', {
          params: {
            keywords: gapFillKeywords,
            location: `${userLng},${userLat}`,
            ...(adcode ? { city: adcode } : {}),
            offset: 5, page: 1, extensions: 'all',
          },
        })
        const fillPois = filterUsablePois(((res.data.pois || []) as AmapRawPoi[])
          .map((raw) => parseRawPoi(raw, userLng, userLat))
          .filter((p): p is AmapPOI => p !== null))
          .filter((p) => {
            if (claimedIds.has(p.id)) return false
            if (typeFilter && !typeFilter.test(p.typecode)) return false
            if (maxDistance && maxDistance > 0 && p.distance > maxDistance) return false
            const existingNames = new Set(verifiedStops.map((s) => s.name))
            if (existingNames.has(p.name)) return false
            return true
          })
          .sort((a, b) => a.distance - b.distance)

        if (fillPois.length > 0) {
          const fill = fillPois[0]
          claimedIds.add(fill.id)
          const fillDur = estimateVisitDuration(fill)
          verifiedStops.push({
            name: fill.name,
            address: fill.address,
            visitDurationMinutes: fillDur,
            notes: `${fill.address}，距您约${fmtDist(fill.distance)}`,
            amapPoiId: fill.id,
            parentPoiId: fill.parentId,
            typecode: fill.typecode,
            lng: fill.lng,
            lat: fill.lat,
            distanceMeters: fill.distance,
          })
          console.log(`🔧 Gap fill: route "${r.name}" + "${fill.name}" (${fill.distance}m)`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`Gap fill search failed for route "${r.name}":`, msg)
      }
    }

    if (verifiedStops.length > 0) {
      const recalcWalkDist = estimateWalkDistFromStops(verifiedStops)
      const recalcTotalDur = verifiedStops.reduce((s, st) => s + st.visitDurationMinutes, 0)
        + Math.ceil((recalcWalkDist / 100) * 1.5)

      enriched.push({
        id: crypto.randomUUID(),
        name: r.name,
        tagline: r.tagline,
        stops: verifiedStops,
        totalDurationMinutes: recalcTotalDur,
        walkingDistanceMeters: recalcWalkDist,
        tips: r.tips,
        direction: r.direction,
        reason: r.reason,
        axes: r.axes,
      })
    }
  }

  const totalStops = routes.reduce((s, r) => s + r.stops.length, 0)
  const verifiedCount = enriched.reduce((s, r) => s + r.stops.length, 0)
  console.log(`🔍 Verification: ${verifiedCount}/${totalStops} stops matched on Amap, ${enriched.length}/${routes.length} routes kept`)

  return enriched
}
