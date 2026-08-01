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

export type SpotTheme =
  | 'river'
  | 'lane'
  | 'museum'
  | 'wonderland'
  | 'garden'
  | 'market'
  | 'city'
  | 'night'

export interface CuratedCoverImage {
  url: string
  sourceName: string
  sourcePageUrl: string
}

export interface HotspotSeed {
  id: string
  city: string
  adcode: string
  name: string
  /** Canonical keyword used for Amap matching; may be narrower than display name. */
  searchName: string
  district: string
  category: Exclude<ExploreCategory, 'all'>
  reason: string
  tags: string[]
  suitablePersonas: Persona[]
  suggestedDuration: string
  bestTime: string
  theme: SpotTheme
  seedLng: number
  seedLat: number
  indoorFriendly?: boolean
  reservationNote?: string
  officialCoverImage?: CuratedCoverImage
}

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
}

export interface ExploreRecommendation {
  spots: InspirationSpot[]
  nextCursor: number | null
  source: 'curated_amap_verified'
}
