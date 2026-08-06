import { api } from './api'
import type {
  ExploreCategory,
  InspirationSpot,
  Persona,
} from '../types/explore'

export interface CityContextResponse {
  city: string
  district: string
  township: string
  adcode: string
  formattedAddress: string
  weather: {
    weather: string
    temperature: string
    isRainy: boolean
    note: string | null
  } | null
}

export interface ExploreRecommendRequest {
  city: string
  adcode?: string
  persona: Persona
  category: ExploreCategory
  cursor?: number
  limit?: number
  isRainy?: boolean
  /** User's real location (only sent after geolocation authorization). */
  lat?: number
  lng?: number
}

export interface ExploreRecommendResponse {
  spots: InspirationSpot[]
  nextCursor: number | null
  source: 'curated_amap_verified'
}

export async function fetchCityContext(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<CityContextResponse> {
  const { data } = await api.get<CityContextResponse>('/city/context', {
    params: { lat, lng },
    signal,
  })
  return data
}

export async function fetchExploreRecommendations(
  request: ExploreRecommendRequest,
  signal?: AbortSignal,
): Promise<ExploreRecommendResponse> {
  const { data } = await api.post<ExploreRecommendResponse>(
    '/explore/recommend',
    request,
    { signal },
  )
  return data
}
