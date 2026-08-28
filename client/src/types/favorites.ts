import type { InspirationSpot } from './explore'

export interface FavoriteCityDescriptor {
  adcode: string
  name: string
  province: string
  coverImageUrl: string | null
  center: { lat: number; lng: number } | null
}

export interface FavoriteSpot extends InspirationSpot {
  amapPoiId: string
  address: string
  lng: number
  lat: number
  verificationStatus: 'verified'
  source: 'amap_verified'
  mock: false
  favoritedAt: string
  cityDescriptor: FavoriteCityDescriptor
}

export type ToggleFavoriteResult =
  | { status: 'added'; spot: FavoriteSpot }
  | { status: 'removed'; spot: FavoriteSpot }
  | { status: 'unverified' }
