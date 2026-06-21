import type { PreferenceTag, TimeOption, MealType, CuisineType, PhotoType, ScenicType, WanderType, WalkLevel, DistanceOption } from './route'

export interface GenerateRoutesRequest {
  lat: number
  lng: number
  timeOption: TimeOption
  distance: DistanceOption
  preferences: PreferenceTag[]
  mealTypes?: MealType[]
  cuisineTypes?: CuisineType[]
  photoTypes?: PhotoType[]
  scenicTypes?: ScenicType[]
  wanderTypes?: WanderType[]
  walkLevel?: WalkLevel
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
