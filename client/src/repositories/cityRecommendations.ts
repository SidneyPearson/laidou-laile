import axios from 'axios'

export type RecommendationSource = 'd1' | 'static_fallback'
export interface RecommendationCity {
  adcode: string
  name: string
  province: string
  coverImageUrl: string | null
  /** First published spot coordinates, used as the map/explore center. */
  center: { lat: number; lng: number } | null
}
export interface RecommendationResult {
  cities: RecommendationCity[]
  source: RecommendationSource
  fallbackReason?: string
}

interface ApiAttraction {
  id: string
  name: string
  lat: number | null
  lng: number | null
}
interface ApiCity {
  adcode: string
  name: string
  province: string
  coverImageUrl: string | null
  attractions: ApiAttraction[]
}
interface ApiResponse {
  cities: ApiCity[]
  source: 'd1' | 'static_fallback'
  fallbackReason?: string
}

/** Load published cities from the admin D1. Only cities with at least one
 *  published, verified spot are returned by the server. D1 failure yields an
 *  empty list (never fabricated cities). */
export async function loadCityRecommendations(signal?: AbortSignal): Promise<RecommendationResult> {
  try {
    const { data } = await axios.get<ApiResponse>('/api/recommendations/cities', {
      signal,
      timeout: 8000,
      headers: { 'Cache-Control': 'no-cache' },
      validateStatus: status => status === 200 || status === 503,
    })
    if (!data || !Array.isArray(data.cities)) throw new Error('invalid response')
    const cities: RecommendationCity[] = data.cities.map(city => {
      const centerSpot = city.attractions.find(a => Number.isFinite(a.lat) && Number.isFinite(a.lng))
      return {
        adcode: city.adcode,
        name: city.name,
        province: city.province,
        coverImageUrl: city.coverImageUrl ?? null,
        center: centerSpot && Number.isFinite(centerSpot.lat) && Number.isFinite(centerSpot.lng)
          ? { lat: centerSpot.lat as number, lng: centerSpot.lng as number }
          : null,
      }
    })
    return {
      cities,
      source: data.source === 'static_fallback' ? 'static_fallback' : 'd1',
      fallbackReason: data.fallbackReason,
    }
  } catch {
    return { cities: [], source: 'static_fallback', fallbackReason: 'RECOMMENDATION_API_UNAVAILABLE' }
  }
}
