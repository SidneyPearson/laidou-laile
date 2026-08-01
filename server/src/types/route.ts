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

export type SocialPlatform = '美团' | '抖音' | '小红书'

export type RecommendationType = 'social_hot' | 'amap_fallback'

export interface SocialEvidence {
  platform: SocialPlatform
  title: string
  url: string
  /** Match confidence for newly scored evidence; absent on legacy evidence. */
  confidence?: number
}

export type DistanceOption = 0 | 500 | 1000 | 3000 | 5000

export type TimeOption = 60 | 120 | 240 | 480

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
  /** Public web-search evidence for a social-platform food recommendation. */
  socialEvidence?: SocialEvidence[]
  /** Whether this recommendation is supported by social evidence or Amap only. */
  recommendationType?: RecommendationType
  /** Internal evidence ranking score from 0 to 100. */
  socialScore?: number
  /** Short explanation of the deterministic ranking position. */
  rankingReason?: string
  /** User-facing summary of the attached evidence. */
  evidenceSummary?: string
  /** Evidence-grounded popularity summary; absent for Amap-only fallback. */
  popularityReason?: string
  /** Planner-only metadata. Removed by the final route policy before API output. */
  parentPoiId?: string | null
  /** Planner-only Amap typecode. Removed before API output. */
  typecode?: string
  /** Planner-only preference ownership for category-specific relevance. */
  preferenceScope?: PreferenceTag
}

export interface Route {
  id: string
  /** Presentation contract: food lists are rankings, not visit itineraries. */
  kind?: 'route' | 'food_list'
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
  /** Planner-only reservoir used to fill an under-utilised route. */
  candidateStops?: Stop[]
}

export interface GenerateRoutesRequest {
  lat: number
  lng: number
  areaName?: string
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
