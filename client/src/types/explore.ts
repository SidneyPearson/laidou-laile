export type Persona = 'fast' | 'couple' | 'family' | 'lazy' | 'urban'

export type ExploreCategory =
  | 'all'
  | 'landmark'
  | 'district'
  | 'theme_park'
  | 'nature'
  | 'street'
  | 'mall'
  | 'food'
  | 'museum'

export type SpotTheme =
  | 'river'
  | 'lane'
  | 'museum'
  | 'wonderland'
  | 'garden'
  | 'market'
  | 'city'
  | 'night'

export type CoverImageSource = 'official' | 'amap' | 'gradient'

export interface PersonaOption {
  id: Persona
  name: string
  emoji: string
  tagline: string
}

export interface CategoryOption {
  id: ExploreCategory
  name: string
  emoji: string
}

export interface InspirationSpot {
  id: string
  city: string
  name: string
  district: string
  category: Exclude<ExploreCategory, 'all'>
  reason: string
  tags: string[]
  suitablePersonas: Persona[]
  suggestedDuration: string
  bestTime: string
  theme: SpotTheme
  amapName?: string
  amapPoiId?: string
  address?: string
  lng?: number
  lat?: number
  verifiedAt?: string
  verificationStatus?: 'verified' | 'demo'
  source?: 'amap_verified' | 'local_demo'
  mock: boolean
  coverImageUrl?: string
  coverImageFallbackUrl?: string
  coverImageSource?: Exclude<CoverImageSource, 'gradient'>
  coverImageSourceName?: string
  coverImageSourceUrl?: string
  reservationNote?: string
  /** Straight-line distance from the user, meters; only when request sent coords. */
  distanceMeters?: number
}
