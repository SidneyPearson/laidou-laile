export type PreferenceTag =
  | 'food'
  | 'wander'
  | 'photo'
  | 'less_walk'
  | 'scenic'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type CuisineType =
  | 'hotpot' | 'noodles' | 'pastries' | 'bbq'
  | 'local_cuisine' | 'western' | 'coffee_tea'

export type PhotoType = 'landmark' | 'street'

export type ScenicType = 'popular' | 'museum' | 'hidden'

export type WanderType = 'shopping' | 'cafe' | 'entertainment' | 'park'

export type WalkLevel = 'minimal' | 'moderate'

export type DistanceOption = 500 | 1000 | 2000 | 3000 | 5000

export type TimeOption = 30 | 60 | 120 | 240

export interface Stop {
  name: string
  address: string
  visitDurationMinutes: number
  notes: string
  amapPoiId: string | null
  lng: number
  lat: number
  photoTip?: string
}

export interface Route {
  id: string
  name: string
  tagline: string
  stops: Stop[]
  totalDurationMinutes: number
  walkingDistanceMeters: number
  tips: string
}

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
  routes: Route[]
  generatedAt: string
  weatherNote: string | null
  weather: { weather: string; temperature: string; isRainy: boolean } | null
  locationName: string
}
