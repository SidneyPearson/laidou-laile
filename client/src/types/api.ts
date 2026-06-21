import type { PreferenceTag, TimeOption, MealType, CuisineType } from './route'

export interface GenerateRoutesRequest {
  lat: number
  lng: number
  timeOption: TimeOption
  preferences: PreferenceTag[]
  mealTypes?: MealType[]
  cuisineTypes?: CuisineType[]
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
