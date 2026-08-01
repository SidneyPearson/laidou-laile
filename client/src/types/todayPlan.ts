import type { InspirationSpot } from './explore'

export const TODAY_PLAN_LIMIT = 6

export interface TodaySpot extends InspirationSpot {
  amapPoiId: string
  address: string
  lng: number
  lat: number
  verificationStatus: 'verified'
  source: 'amap_verified'
  mock: false
  addedAt: string
}

export type AddTodaySpotResult =
  | { status: 'added'; spot: TodaySpot }
  | { status: 'duplicate' }
  | { status: 'limit' }
  | { status: 'unverified' }

