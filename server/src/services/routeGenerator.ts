import { searchNearbyPOIs } from './amap/poiSearch.js'
import { reverseGeocode } from './amap/geocode.js'
import { getWeather } from './amap/weather.js'
import { generatePlan } from './aiPlannerService.js'
import type { Route, PreferenceTag, TimeOption } from '../types/route.js'

interface GenerateParams {
  lat: number
  lng: number
  timeOption: TimeOption
  preferences: PreferenceTag[]
}

interface GenerateResult {
  routes: Route[]
  locationName: string
  weatherNote: string | null
  source: 'ai' | 'fallback'
  fallbackReason: string | null
}

/** Fetch data from Amap, then delegate to aiPlannerService */
export async function generateRoutes(params: GenerateParams): Promise<GenerateResult> {
  const { lat, lng, timeOption, preferences } = params

  // Fetch Amap data in parallel
  const [pois, geoInfo, weatherInfo] = await Promise.all([
    searchNearbyPOIs({ lat, lng, timeOption, preferences }),
    reverseGeocode(lat, lng),
    preferences.includes('rainy_day') ? getWeather(lat, lng) : Promise.resolve(null),
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
  })

  return {
    routes: plan.routes,
    locationName,
    weatherNote: weatherInfo?.note || null,
    source: plan.source,
    fallbackReason: plan.fallbackReason,
  }
}
