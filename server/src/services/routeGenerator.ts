import { searchNearbyPOIs } from './amap/poiSearch.js'
import { reverseGeocode } from './amap/geocode.js'
import { getWeather } from './amap/weather.js'
import { generatePlan, buildFallbackRoutes } from './aiPlannerService.js'
import type { Route, PreferenceTag, TimeOption, CuisineType, ScenicType, WanderType, DistanceOption } from '../types/route.js'
import { applyRoutePolicies } from './planner/routePolicy.js'

interface GenerateParams {
  lat: number
  lng: number
  timeOption: TimeOption
  distance: DistanceOption
  preferences: PreferenceTag[]
  cuisineTypes?: CuisineType[]
  scenicTypes?: ScenicType[]
  wanderTypes?: WanderType[]
  customCuisine?: string[]
  customScenic?: string[]
  customWander?: string[]
}

interface GenerateResult {
  routes: Route[]
  locationName: string
  weatherNote: string | null
  weather: { weather: string; temperature: string; isRainy: boolean } | null
  source: 'ai' | 'fallback'
  fallbackReason: string | null
}

/**
 * LLM-first route generation:
 * 1. Geocode + weather (fast, parallel)
 * 2. LLM recommends places → Amap verifies each
 * 3. If AI fails, fall back to Amap around-search + rule-based builder
 */
export async function generateRoutes(params: GenerateParams): Promise<GenerateResult> {
  const { lat, lng, timeOption, distance, preferences, cuisineTypes, scenicTypes, wanderTypes,
    customCuisine, customScenic, customWander } = params

  // Step 1: geocode + weather (no POI search — LLM goes first)
  const geoInfo = await reverseGeocode(lat, lng)
  const weatherInfo = await getWeather(geoInfo.adcode)

  // For 全城范围 (distance=0), use city-level scope
  const city = distance === 0
    ? (geoInfo.city || geoInfo.district || '当前城市')
    : (geoInfo.district ? `${geoInfo.district}${geoInfo.township || ''}` : '当前位置')

  // City-level adcode for city-wide Amap searches (e.g. 310105 → 310000)
  const cityAdcode = geoInfo.adcode ? geoInfo.adcode.slice(0, 3) + '000' : ''
  const searchAdcode = distance === 0 ? cityAdcode : geoInfo.adcode

  const locationName = geoInfo.district
    ? `${geoInfo.district}${geoInfo.township ? geoInfo.township + '附近' : '附近'}`
    : '当前位置附近'

  const weather = weatherInfo?.weather || '未知'

  // Step 2: LLM-first generation (LLM → verify via Amap)
  const plan = await generatePlan({
    position: { lat, lng },
    city,
    weather,
    timeMinutes: timeOption,
    distance,
    preferences,
    cuisineTypes,
    scenicTypes,
    wanderTypes,
    customCuisine,
    customScenic,
    customWander,
    adcode: searchAdcode,
  })

  if (plan.source === 'ai' && plan.routes.length > 0) {
    return {
      routes: plan.routes,
      locationName,
      weatherNote: weatherInfo?.note || null,
      weather: weatherInfo ? {
        weather: weatherInfo.weather,
        temperature: weatherInfo.temperature,
        isRainy: weatherInfo.isRainy,
      } : null,
      source: 'ai',
      fallbackReason: plan.fallbackReason,
    }
  }

  // Step 3: Fallback — Amap around-search + rule-based builder
  console.log('🔄 LLM failed or returned no routes, falling back to Amap around-search...')
  const pois = await searchNearbyPOIs({
    lat, lng, distance, timeOption, preferences,
    cuisineTypes, scenicTypes, wanderTypes,
    adcode: searchAdcode,
    wideMode: distance === 0,
    customKeywords: [...(customCuisine ?? []), ...(customScenic ?? []), ...(customWander ?? [])],
  })

  const fallbackRoutes = buildFallbackRoutes(pois, timeOption, preferences)
  const guardedFallback = applyRoutePolicies(fallbackRoutes, {
    origin: { lat, lng },
    timeMinutes: timeOption,
    explorationDistance: distance,
    preferences,
    customKeywords: [...(customCuisine ?? []), ...(customScenic ?? []), ...(customWander ?? [])],
  })

  return {
    routes: guardedFallback.routes,
    locationName,
    weatherNote: weatherInfo?.note || null,
    weather: weatherInfo ? {
      weather: weatherInfo.weather,
      temperature: weatherInfo.temperature,
      isRainy: weatherInfo.isRainy,
    } : null,
    source: 'fallback',
    fallbackReason: guardedFallback.fallbackReason || plan.fallbackReason || 'AI服务暂不可用，已为您生成基础路线',
  }
}
