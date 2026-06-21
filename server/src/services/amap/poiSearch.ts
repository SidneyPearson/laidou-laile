import { getAmapClient } from './client.js'
import type { AmapAroundResponse, AmapTextResponse, AmapPOI } from '../../types/poi.js'
import type { PreferenceTag, TimeOption } from '../../types/route.js'

// Preference → Amap typecode mapping
const PREFERENCE_TYPECODES: Record<PreferenceTag, string> = {
  food: '050000',       // 餐饮服务
  wander: '060000|070000|080000', // 购物+生活服务+体育休闲
  photo: '110000|140000', // 风景名胜+科教文化
  less_walk: '',        // Not a type filter — applied as prompt constraint
  local: '050000|060300|110000', // 餐饮+特色商业街+风景名胜
  rainy_day: '060000|060400|140000', // 购物中心+娱乐场所+科教文化 (indoor)
}

// Time → radius mapping
const TIME_RADIUS: Record<TimeOption, number> = {
  30: 1000,
  60: 2000,
  120: 3000,
  240: 5000,
}

// Max POI results cap
const MAX_POI_RESULTS = 30

/** Normalize raw Amap POI into clean format */
function normalizePOI(raw: AmapAroundResponse['pois'][number]): AmapPOI | null {
  if (!raw.location || !raw.location.includes(',')) {
    console.warn(`POI missing location: ${raw.name} (${raw.id})`)
    return null
  }
  const [lng, lat] = raw.location.split(',').map(Number)
  if (isNaN(lng) || isNaN(lat)) {
    console.warn(`POI invalid coords: ${raw.name} (${raw.id}) location=${raw.location}`)
    return null
  }
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    typecode: raw.typecode,
    address: raw.address || '',
    lng,
    lat,
    distance: parseInt(raw.distance, 10) || 0,
    rating: raw.biz_ext?.rating || null,
  }
}

/** Deduplicate and sort POIs by distance */
function dedupeAndSort(pois: AmapPOI[]): AmapPOI[] {
  const seen = new Set<string>()
  const unique: AmapPOI[] = []
  for (const poi of pois) {
    if (!seen.has(poi.id)) {
      seen.add(poi.id)
      unique.push(poi)
    }
  }
  return unique.sort((a, b) => a.distance - b.distance).slice(0, MAX_POI_RESULTS)
}

/** Search nearby POIs using Amap around-search API */
export async function searchNearbyPOIs(params: {
  lat: number
  lng: number
  timeOption: TimeOption
  preferences: PreferenceTag[]
}): Promise<AmapPOI[]> {
  const { lat, lng, timeOption, preferences } = params
  const client = getAmapClient()
  const radius = TIME_RADIUS[timeOption]

  // Build typecode union
  const typecodes = preferences
    .map((p) => PREFERENCE_TYPECODES[p])
    .filter(Boolean)

  // Fallback: if all preferences are constraint-only (e.g. less_walk), default to mixed
  let typesParam = [...new Set(typecodes.flatMap((t) => t.split('|')))].join('|')
  if (!typesParam) {
    typesParam = '050000|060000|080000|110000' // mixed default
    console.log(`No type filters from preferences [${preferences}], using default types`)
  }

  console.log(`Amap around-search: location=${lng},${lat} radius=${radius} types=${typesParam}`)

  // Main around-search
  const promises: Promise<AmapPOI[]>[] = [
    client
      .get<AmapAroundResponse>('/place/around', {
        params: {
          location: `${lng},${lat}`,
          radius,
          types: typesParam,
          offset: 25,
          page: 1,
          extensions: 'all',
        },
      })
      .then((res) => {
        const pois = (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[]
        return pois
      })
      .catch((err) => {
        console.error('Amap around-search FAILED:', err.message)
        if (err.response?.data) console.error('  Amap response:', JSON.stringify(err.response.data).slice(0, 200))
        return [] as AmapPOI[]
      }),
  ]

  // Supplementary text search for 'local' preference
  if (preferences.includes('local')) {
    promises.push(
      client
        .get<AmapTextResponse>('/place/text', {
          params: {
            location: `${lng},${lat}`,
            keywords: '老字号|非遗|特产|本地特色',
            types: '050000|060300|110000',
            city: '010', // Will be overridden by location
            offset: 10,
            page: 1,
            extensions: 'all',
          },
        })
        .then((res) => {
          const pois = (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[]
          return pois
        })
        .catch((err) => {
          console.error('Amap text-search FAILED:', err.message)
          return [] as AmapPOI[]
        }),
    )
  }

  const results = await Promise.all(promises)
  const allPois = results.flat()

  if (allPois.length === 0) {
    return []
  }

  return dedupeAndSort(allPois)
}
