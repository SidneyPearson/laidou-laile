import type { PreferenceTag, TimeOption, CuisineType, ScenicType, WanderType, DistanceOption } from './route'

export interface GenerateRoutesRequest {
  lat: number
  lng: number
  timeOption: TimeOption
  distance: DistanceOption
  preferences: PreferenceTag[]
  cuisineTypes?: CuisineType[]
  scenicTypes?: ScenicType[]
  wanderTypes?: WanderType[]
}

export interface GenerateRoutesResponse {
  routes: import('./route').Route[]
  generatedAt: string
  weatherNote: string | null
  weather: { weather: string; temperature: string; isRainy: boolean } | null
  locationName: string
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}
