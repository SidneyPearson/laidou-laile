export type PreferenceTag =
  | 'food'
  | 'wander'
  | 'scenic'

export type CuisineType =
  | 'hotpot' | 'noodles' | 'pastries' | 'bbq'
  | 'local_cuisine' | 'western' | 'coffee_tea'
  | 'buffet'

export type ScenicType = 'popular' | 'street'

export type WanderType = 'shopping' | 'cafe' | 'entertainment' | 'hidden' | 'museum'

export type DistanceOption = 0 | 500 | 1000 | 2000 | 3000 | 5000

export type TimeOption = 30 | 60 | 120 | 240 | 480

export interface Stop {
  name: string
  address: string
  visitDurationMinutes: number
  notes: string
  amapPoiId: string | null
  lng: number
  lat: number
  photoTip?: string
  distanceMeters?: number
  /** Opening hours (reserved for business-hours feature; not yet populated) */
  openTime?: string
  closeTime?: string
  /** Whether the place is open at planning time (reserved; not yet populated) */
  openNow?: boolean
}

export interface Route {
  id: string
  name: string
  tagline: string
  stops: Stop[]
  totalDurationMinutes: number
  walkingDistanceMeters: number
  tips: string
  /** Structural direction shown to user, e.g. "深度 · 一处慢逛" (≥30° divergence) */
  direction?: string
  /** Why this route differs from the others (divergence rationale) */
  reason?: string
  /** Three-axis structural labels, used for divergence validation */
  axes?: { goal: string; behavior: string; info: string }
  /** Routes exempt from divergence check (e.g. gourmet comparison cards) */
  divergenceExempt?: boolean
}

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
  routes: Route[]
  generatedAt: string
  weatherNote: string | null
  weather: { weather: string; temperature: string; isRainy: boolean } | null
  locationName: string
}
