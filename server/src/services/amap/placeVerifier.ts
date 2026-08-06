import { getAmapClient } from './client.js'
import { haversineDist } from '../../utils/geo.js'
import { normalizeName } from '../../utils/text.js'
import type { AmapTextResponse, AmapPOI } from '../../types/poi.js'
import { filterUsablePois } from '../poiQuality.js'

/** Minimal POI normalization for text-search verification (distance is recomputed
 *  via Haversine below, so we don't depend on the planning distance policy). */
function normalizeTextPOI(raw: AmapTextResponse['pois'][number]): AmapPOI | null {
  if (!raw.location || !raw.location.includes(',')) return null
  const [lng, lat] = raw.location.split(',').map(Number)
  if (isNaN(lng) || isNaN(lat)) return null
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    typecode: raw.typecode,
    address: raw.address || '',
    lng,
    lat,
    distance: 0,
    rating: raw.biz_ext?.rating || null,
    cost: raw.biz_ext?.cost || null,
    parentId: raw.parent || null,
    photos: raw.photos,
    photoUrl: raw.photos?.[0]?.url,
  }
}

/** Verify a single place name via Amap text-search.
 *  Returns the best-matching POI near the user, or null if not found.
 *  Uses Haversine distance for filtering (more reliable than Amap's reported distance). */
export async function verifyPlace(
  name: string,
  userLng: number,
  userLat: number,
  adcode?: string,
  maxDistance?: number,
): Promise<AmapPOI | null> {
  const client = getAmapClient()

  // Retry wrapper for QPS limit errors (Amap free tier is ~3 QPS)
  let lastError = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt))

    try {
      const res = await client.get<AmapTextResponse>('/place/text', {
        params: {
          keywords: name,
          location: `${userLng},${userLat}`,
          ...(adcode ? { city: adcode } : {}),
          offset: 5,
          page: 1,
          extensions: 'all',
        },
      })

      const pois = filterUsablePois(
        (res.data.pois || []).map(raw => normalizeTextPOI(raw)).filter(Boolean) as AmapPOI[],
      )
      if (pois.length === 0) {
        console.warn(`⚠️ verifyPlace: no results for "${name}"`)
        return null
      }

      // Compute Haversine distance + name similarity score
      const searchName = normalizeName(name)
      const scored = pois.map((p) => {
        const poiName = normalizeName(p.name)
        // Score: how well does the POI name match the search name?
        // 100 = exact, 80 = POI name contains search name cleanly,
        // 60 = mutual substring, 40 = partial overlap, 0 = no match
        let sim = 0
        if (poiName === searchName) {
          sim = 100
        } else if (poiName.includes(searchName)) {
          // "新泾公园" inside "新泾公园南门" → good
          // But "新泾公园" inside "我爱我家(新泾公园店)" → suspicious: extra business prefix
          const prefix = poiName.replace(searchName, '').replace(/[()（）]/g, '').trim()
          // Extra text that makes this clearly NOT the place we want
          const isFalseMatch = /店|公司|派出所|警务室|居委会|街道办事处|服务站|中介|地产|房产|我爱我家|链家|贝壳|停车场|停车库|停车点|地铁站|出入口|入口|出口|厕所|卫生间|垃圾|配电|物业|管理处|收费/.test(prefix)
          sim = isFalseMatch ? 30 : 80
        } else if (searchName.includes(poiName)) {
          sim = 60
        } else {
          // Partial word overlap
          const overlap = [...searchName].filter(c => poiName.includes(c)).length
          const ratio = overlap / Math.max(searchName.length, poiName.length)
          sim = Math.round(ratio * 40)
        }
        return {
          ...p,
          distance: haversineDist(userLat, userLng, p.lat, p.lng),
          _sim: sim,
        }
      })

      // Filter by maxDistance (0 = unlimited, skip filter)
      const filtered = maxDistance && maxDistance > 0
        ? scored.filter(p => p.distance <= maxDistance)
        : scored

      if (filtered.length === 0) {
        console.warn(`⚠️ verifyPlace: "${name}" found but all too far (>${maxDistance}m)`)
        return null
      }

      // Sort: highest similarity first, then closest distance
      filtered.sort((a, b) => {
        if (b._sim !== a._sim) return b._sim - a._sim
        return a.distance - b.distance
      })

      // Skip false matches (sim=30) — try next best result first.
      // e.g. LLM says "豫园", Amap returns "豫园派出所"(sim=30) then "豫园"(sim=100)
      const best = filtered.find(p => p._sim >= 40)
      if (!best) {
        console.warn(`⚠️ verifyPlace: "${name}" no good match (best "${filtered[0]?.name}" sim=${filtered[0]?._sim})`)
        return null
      }

      console.log(`✅ verifyPlace: "${name}" → "${best.name}" (${best.distance}m, sim=${best._sim})`)
      return best
    } catch (err: any) {
      lastError = err.message
      if (err.message?.includes('QPS') || err.message?.includes('LIMIT')) {
        continue // retry after backoff
      }
      break // non-retryable error
    }
  }
  console.error(`verifyPlace failed for "${name}":`, lastError)
  return null
}
