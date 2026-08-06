import type { CityRecord, CityStatus, PublicationStatus, SpotCategory, SpotRecord, SpotSourceInput, SpotTier, VerificationStatus } from '../domain/curation.js'

export interface Page<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number }
export interface CityListQuery { page: number; pageSize: number; keyword?: string }
export interface SpotListQuery { page: number; pageSize: number; keyword?: string; cityAdcode?: string; category?: SpotCategory; tier?: SpotTier; verificationStatus?: VerificationStatus; publicationStatus?: PublicationStatus }
export interface CityWrite { adcode: string; provinceName: string; name: string; slug: string; intro?: string | null; coverImageUrl?: string | null; status: CityStatus; priority: number; reviewIntervalDays?: 7 | 14 | 30 }
export interface SpotWrite {
  id: string; cityAdcode: string; name: string; searchName: string; district?: string | null; address?: string | null; lng?: number | null; lat?: number | null
  category: SpotCategory; tier: SpotTier; priority: number; reason: string; tierReason: string; personas: string[]; tags: string[]
  suggestedDuration?: string | null; bestTime?: string | null; indoorFriendly: boolean; reservationRequired: boolean; reservationNote?: string | null
  coverImageUrl?: string | null; publicationStatus: PublicationStatus; sourceKind?: string | null; sources?: SpotSourceInput[]
}
export interface VerificationWrite { amapName: string | null; amapPoiId: string | null; district?: string | null; address?: string | null; lng: number | null; lat: number | null; coverImageUrl?: string | null; verificationStatus: VerificationStatus; verifiedAt: string }
export interface DashboardStats { publishedCities: number; draftSpots: number; pendingReview: number; publishedSpots: number; verificationFailed: number; staleSpots: number }

export interface CurationRepository {
  listCities(query: CityListQuery): Promise<Page<CityRecord>>
  listPublishedCities(): Promise<CityRecord[]>
  findPublishedCity(nameOrAdcode: string): Promise<CityRecord | null>
  createCity(input: CityWrite, now: string): Promise<CityRecord>
  updateCity(adcode: string, input: Partial<Omit<CityWrite, 'adcode'>>, now: string): Promise<CityRecord | null>
  listSpots(query: SpotListQuery): Promise<Page<SpotRecord>>
  getSpot(id: string): Promise<SpotRecord | null>
  createSpot(input: SpotWrite, now: string): Promise<SpotRecord>
  updateSpot(id: string, expectedVersion: number, input: Partial<SpotWrite>, now: string): Promise<'conflict' | SpotRecord | null>
  setVerification(id: string, expectedVersion: number, input: VerificationWrite, now: string): Promise<'conflict' | SpotRecord | null>
  setPublication(id: string, expectedVersion: number, status: PublicationStatus, now: string): Promise<'conflict' | SpotRecord | null>
  dashboard(now: string): Promise<DashboardStats>
  audit(action: string, entityType: string, entityId: string, payload: unknown, now: string): Promise<void>
  listPublished(cityAdcode?: string): Promise<SpotRecord[]>
}
