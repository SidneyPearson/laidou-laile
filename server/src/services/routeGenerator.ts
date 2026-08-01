import { searchNearbyPOIs } from './amap/poiSearch.js'
import { reverseGeocode } from './amap/geocode.js'
import { getWeather } from './amap/weather.js'
import { generatePlan, buildFallbackRoutes } from './aiPlannerService.js'
import type { Route, PreferenceTag, TimeOption, CuisineType, ScenicType, WanderType, DistanceOption } from '../types/route.js'
import { applyRoutePolicies } from './planner/routePolicy.js'
import { buildCategoryKeywords, buildCategoryTypecodePrefixes } from './planner/preferenceCriteria.js'
import type { QualityDiagnostics } from './planner/qualityDiagnostics.js'
import { findMissingPreferences, preferenceLabels } from './planner/preferenceCoverage.js'

interface GenerateParams {
  lat: number
  lng: number
  areaName?: string
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
  diagnostics?: QualityDiagnostics
}

function countQualifiedStops(routes: Route[]): number {
  const identities = new Set<string>()
  for (const stop of routes.flatMap(route => route.stops)) {
    identities.add(stop.amapPoiId || `${stop.name}\u0000${stop.lng}\u0000${stop.lat}`)
  }
  return identities.size
}

/**
 * LLM-first route generation:
 * 1. Geocode + weather (fast, parallel)
 * 2. LLM recommends places → Amap verifies each
 * 3. If AI fails, fall back to Amap around-search + rule-based builder
 */
export async function generateRoutes(params: GenerateParams): Promise<GenerateResult> {
  const { lat, lng, timeOption, distance, preferences, cuisineTypes, scenicTypes, wanderTypes,
    customCuisine, customScenic, customWander, areaName } = params

  // Step 1: geocode + weather (no POI search — LLM goes first)
  const geoInfo = await reverseGeocode(lat, lng)
  const weatherInfo = await getWeather(geoInfo.adcode)

  // For 全城范围 (distance=0), use city-level scope
  const city = distance === 0
    ? (geoInfo.city || geoInfo.district || '当前城市')
    : (geoInfo.district ? `${geoInfo.district}${geoInfo.township || ''}` : '当前位置')
  const recallAreaName = areaName?.trim() || city

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
    areaName: recallAreaName,
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
    areaName: recallAreaName,
    cuisineTypes, scenicTypes, wanderTypes,
    adcode: searchAdcode,
    wideMode: distance === 0,
    customKeywordsByPreference: {
      food: customCuisine ?? [],
      scenic: customScenic ?? [],
      wander: customWander ?? [],
    },
  })

  const fallbackRoutes = buildFallbackRoutes(pois, timeOption, preferences)
  const guardedFallback = applyRoutePolicies(fallbackRoutes, {
    origin: { lat, lng },
    timeMinutes: timeOption,
    explorationDistance: distance,
    preferences,
    customKeywordsByPreference: {
      food: customCuisine ?? [],
      scenic: customScenic ?? [],
      wander: customWander ?? [],
    },
    categoryKeywordsByPreference: buildCategoryKeywords({
      cuisineTypes, scenicTypes, wanderTypes, city, areaName: recallAreaName,
    }),
    categoryTypecodePrefixesByPreference: buildCategoryTypecodePrefixes({
      cuisineTypes, scenicTypes, wanderTypes, city, areaName: recallAreaName,
    }),
  })
  const missingPreferences = findMissingPreferences(
    guardedFallback.routes,
    fallbackRoutes,
    preferences,
  )
  const fallbackOutputRoutes = missingPreferences.length > 0 ? [] : guardedFallback.routes
  const coverageReason = missingPreferences.length > 0
    ? `附近候选不足，无法同时满足${preferenceLabels(missingPreferences)}偏好`
    : null

  return {
    routes: fallbackOutputRoutes,
    locationName,
    weatherNote: weatherInfo?.note || null,
    weather: weatherInfo ? {
      weather: weatherInfo.weather,
      temperature: weatherInfo.temperature,
      isRainy: weatherInfo.isRainy,
    } : null,
    source: 'fallback',
    fallbackReason: coverageReason || guardedFallback.fallbackReason || plan.fallbackReason || 'AI服务暂不可用，已为您生成基础路线',
    // searchNearbyPOIs currently returns candidates after its own quality
    // filtering, so only this boundary and the final policy output are
    // measurable here. Per-stage rejection counts remain explicitly unknown.
    diagnostics: {
      recalled: pois.length,
      rejectedByType: 'unknown',
      rejectedByDistance: 'unknown',
      qualified: countQualifiedStops(fallbackOutputRoutes),
    },
  }
}
