import { getAmapClient } from './client.js'
import type { AmapAroundResponse, AmapTextResponse, AmapPOI } from '../../types/poi.js'
import type { PreferenceTag } from '../../types/route.js'

// Preference → Amap typecode mapping
const PREFERENCE_TYPECODES: Record<PreferenceTag, string> = {
  food: '050000',       // 餐饮服务
  wander: '060000|070000|080000', // 购物+生活服务+体育休闲
  photo: '110000|140000', // 风景名胜+科教文化
  less_walk: '',        // Not a type filter — applied as prompt constraint
  scenic: '110000|140000|060300', // 风景名胜+科教文化+特色商业街
}

// Meal type → Amap keywords
const MEAL_KEYWORDS: Record<string, string> = {
  breakfast: '早餐|早茶|早点|豆浆',
  lunch: '午餐|中餐|简餐|快餐',
  dinner: '晚餐|正餐',
  snack: '下午茶|小吃|甜品|奶茶',
}

// Cuisine type → Amap keywords
const CUISINE_KEYWORDS: Record<string, string> = {
  hotpot: '火锅|串串|涮肉',
  noodles: '面馆|米线|拉面|粉',
  pastries: '糕点|点心|面包|烘焙',
  bbq: '烧烤|烤肉',
  local_cuisine: '本地菜|老字号|本帮菜|特色菜',
  western: '西餐|牛排|披萨|意面',
  coffee_tea: '咖啡|茶馆|奶茶|茶饮',
}

// Photo type → Amap typecode + keywords
const PHOTO_CONFIG: Record<string, { types: string; keywords?: string }> = {
  landmark: { types: '110000' },                                    // 地标景点 → 风景名胜
  street: { types: '060300|140000', keywords: '打卡|网红|街拍|特色街|胡同|文创' }, // 街拍打卡
}

// Scenic type → Amap keywords
const SCENIC_KEYWORDS: Record<string, string> = {
  popular: '著名景点|5A|4A|名胜古迹|地标|必去',
  museum: '博物馆|美术馆|展览馆|纪念馆|科技馆',
  hidden: '故居|寺庙|园林|小众|秘境|胡同|老街|古巷',
}

// Wander type → Amap typecode + keywords
const WANDER_CONFIG: Record<string, { types?: string; keywords?: string }> = {
  shopping: { types: '060000', keywords: '商场|购物中心|步行街|集市' },
  cafe: { types: '050000', keywords: '咖啡|茶馆|茶饮|书吧' },
  entertainment: { types: '080000', keywords: '电影院|KTV|桌游|密室|演出' },
  park: { types: '110000', keywords: '公园|绿地|步道|植物园|湖畔' },
}

// Walk level → radius adjustment factor
const WALK_LEVEL_RADIUS: Record<string, number> = {
  minimal: 0.5,   // 500m range → reduce to 50%
  moderate: 1.0,  // no adjustment
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
  distance: number
  timeOption: number
  preferences: PreferenceTag[]
  mealTypes?: string[]
  cuisineTypes?: string[]
  photoTypes?: string[]
  scenicTypes?: string[]
  wanderTypes?: string[]
  walkLevel?: string
}): Promise<AmapPOI[]> {
  const { lat, lng, distance, preferences, mealTypes, cuisineTypes, photoTypes, scenicTypes, wanderTypes, walkLevel } = params
  const client = getAmapClient()

  // Apply walk level radius adjustment
  const radiusFactor = walkLevel ? (WALK_LEVEL_RADIUS[walkLevel] || 1.0) : 1.0
  const radius = Math.round(distance * radiusFactor)

  // Build typecode union from preferences
  let typeFilter = preferences
    .map((p) => PREFERENCE_TYPECODES[p])
    .filter(Boolean)

  // Add photo sub-type typecodes if photo is selected and has sub-options
  if (preferences.includes('photo') && photoTypes?.length) {
    for (const pt of photoTypes) {
      if (PHOTO_CONFIG[pt]) typeFilter.push(PHOTO_CONFIG[pt].types)
    }
  }

  // Add wander sub-type typecodes if wander is selected and has sub-options
  if (preferences.includes('wander') && wanderTypes?.length) {
    for (const wt of wanderTypes) {
      if (WANDER_CONFIG[wt]?.types) typeFilter.push(WANDER_CONFIG[wt].types!)
    }
  }

  // Deduplicate types
  let typesParam = [...new Set(typeFilter.flatMap((t) => t.split('|')))].join('|')
  if (!typesParam) {
    typesParam = '050000|060000|080000|110000' // mixed default
    console.log(`No type filters from preferences [${preferences}], using default types`)
  }

  console.log(`Amap around-search: location=${lng},${lat} radius=${radius} types=${typesParam}`)

  const promises: Promise<AmapPOI[]>[] = []

  // Main around-search
  promises.push(
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
  )

  // ── Supplementary text searches ──────────────────────

  // Food sub-preferences
  if (preferences.includes('food') && (mealTypes?.length || cuisineTypes?.length)) {
    const kwParts: string[] = []
    if (mealTypes?.length) {
      for (const m of mealTypes) if (MEAL_KEYWORDS[m]) kwParts.push(MEAL_KEYWORDS[m])
    }
    if (cuisineTypes?.length) {
      for (const c of cuisineTypes) if (CUISINE_KEYWORDS[c]) kwParts.push(CUISINE_KEYWORDS[c])
    }
    if (kwParts.length > 0) {
      const kws = kwParts.join('|')
      console.log(`Amap food text-search: keywords=${kws}`)
      promises.push(
        client
          .get<AmapTextResponse>('/place/text', {
            params: {
              location: `${lng},${lat}`,
              keywords: kws,
              types: '050000',
              city: '010',
              offset: 10,
              page: 1,
              extensions: 'all',
            },
          })
          .then((res) => (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[])
          .catch((err) => { console.error('Amap food text-search FAILED:', err.message); return [] as AmapPOI[] }),
      )
    }
  }

  // Scenic + scenic sub-preferences
  if (preferences.includes('scenic')) {
    let scenicKws = '景点|名胜|故居|博物馆|寺庙|园林|地标|打卡'
    if (scenicTypes?.length) {
      const subKws = scenicTypes.map((st) => SCENIC_KEYWORDS[st]).filter(Boolean)
      if (subKws.length) scenicKws = subKws.join('|')
    }
    console.log(`Amap scenic text-search: keywords=${scenicKws}`)
    promises.push(
      client
        .get<AmapTextResponse>('/place/text', {
          params: {
            location: `${lng},${lat}`,
            keywords: scenicKws,
            types: '110000|140000',
            city: '010',
            offset: 10,
            page: 1,
            extensions: 'all',
          },
        })
        .then((res) => (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[])
        .catch((err) => { console.error('Amap scenic text-search FAILED:', err.message); return [] as AmapPOI[] }),
    )
  }

  // Photo sub-preferences with keywords
  if (preferences.includes('photo') && photoTypes?.length) {
    for (const pt of photoTypes) {
      const cfg = PHOTO_CONFIG[pt]
      if (cfg?.keywords) {
        console.log(`Amap photo text-search (${pt}): keywords=${cfg.keywords}`)
        promises.push(
          client
            .get<AmapTextResponse>('/place/text', {
              params: {
                location: `${lng},${lat}`,
                keywords: cfg.keywords,
                types: cfg.types,
                city: '010',
                offset: 10,
                page: 1,
                extensions: 'all',
              },
            })
            .then((res) => (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[])
            .catch((err) => { console.error(`Amap photo text-search (${pt}) FAILED:`, err.message); return [] as AmapPOI[] }),
        )
      }
    }
  }

  // Wander sub-preferences with keywords
  if (preferences.includes('wander') && wanderTypes?.length) {
    for (const wt of wanderTypes) {
      const cfg = WANDER_CONFIG[wt]
      if (cfg?.keywords) {
        const searchTypes = cfg.types || '060000|080000'
        console.log(`Amap wander text-search (${wt}): keywords=${cfg.keywords} types=${searchTypes}`)
        promises.push(
          client
            .get<AmapTextResponse>('/place/text', {
              params: {
                location: `${lng},${lat}`,
                keywords: cfg.keywords,
                types: searchTypes,
                city: '010',
                offset: 10,
                page: 1,
                extensions: 'all',
              },
            })
            .then((res) => (res.data.pois || []).map(normalizePOI).filter(Boolean) as AmapPOI[])
            .catch((err) => { console.error(`Amap wander text-search (${wt}) FAILED:`, err.message); return [] as AmapPOI[] }),
        )
      }
    }
  }

  const results = await Promise.all(promises)
  const allPois = results.flat()

  if (allPois.length === 0) {
    return []
  }

  return dedupeAndSort(allPois)
}
