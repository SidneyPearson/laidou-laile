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

export interface InspirationSpot {
  id: string
  city: string
  name: string
  amapName: string
  district: string
  category: Exclude<ExploreCategory, 'all'>
  reason: string
  tags: string[]
  suitablePersonas: Persona[]
  suggestedDuration: string
  bestTime: string
  theme: SpotTheme
  amapPoiId: string
  address: string
  lng: number
  lat: number
  verifiedAt: string
  verificationStatus: 'verified'
  source: 'amap_verified'
  mock: false
  coverImageUrl?: string
  coverImageFallbackUrl?: string
  coverImageSource?: 'official' | 'amap'
  coverImageSourceName?: string
  coverImageSourceUrl?: string
  reservationNote: string
  /** Straight-line distance from the request's lat/lng, in meters. Only
   *  present when the request supplied the user's coordinates. */
  distanceMeters?: number
}

export interface ExploreRecommendation {
  spots: InspirationSpot[]
  nextCursor: number | null
  source: 'curated_amap_verified'
}
