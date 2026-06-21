import { searchNearbyPOIs } from './amap/poiSearch.js'
import { reverseGeocode } from './amap/geocode.js'
import { getWeatherByCoords } from './amap/weather.js'
import { generatePlan } from './aiPlannerService.js'
import type { Route, PreferenceTag, TimeOption, MealType, CuisineType } from '../types/route.js'

interface GenerateParams {
  lat: number
  lng: number
  timeOption: TimeOption
  preferences: PreferenceTag[]
  mealTypes?: MealType[]
  cuisineTypes?: CuisineType[]
}

interface GenerateResult {
  routes: Route[]
  locationName: string
  weatherNote: string | null
  weather: { weather: string; temperature: string; isRainy: boolean } | null
  source: 'ai' | 'fallback'
  fallbackReason: string | null
}

/** Fetch data from Amap, then delegate to aiPlannerService */
export async function generateRoutes(params: GenerateParams): Promise<GenerateResult> {
  const { lat, lng, timeOption, preferences, mealTypes, cuisineTypes } = params

  // Step 1: geocode first (we need adcode for weather)
  const geoInfo = await reverseGeocode(lat, lng)

  // Step 2: POI search + weather in parallel
  const [pois, weatherInfo] = await Promise.all([
    searchNearbyPOIs({ lat, lng, timeOption, preferences, mealTypes, cuisineTypes }),
    getWeatherByCoords(lat, lng),
  ])

  const city = geoInfo.district
    ? `${geoInfo.district}${geoInfo.township || ''}`
    : '当前位置'

  const locationName = geoInfo.district
    ? `${geoInfo.district}${geoInfo.township ? geoInfo.township + '附近' : '附近'}`
    : '当前位置附近'

  const weather = weatherInfo?.weather || '未知'

  // Delegate to AI planner
  const plan = await generatePlan({
    position: { lat, lng },
    city,
    weather,
    timeMinutes: timeOption,
    preferences,
    pois,
    mealTypes,
    cuisineTypes,
  })

  return {
    routes: plan.routes,
    locationName,
    weatherNote: weatherInfo?.note || null,
    weather: weatherInfo ? {
      weather: weatherInfo.weather,
      temperature: weatherInfo.temperature,
      isRainy: weatherInfo.isRainy,
    } : null,
    source: plan.source,
    fallbackReason: plan.fallbackReason,
  }
}
