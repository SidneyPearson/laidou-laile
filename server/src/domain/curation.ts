import { z } from 'zod'

export const SPOT_CATEGORIES = [
  'classic_landmark',
  'featured_district',
  'theme_park',
  'nature',
  'walk_street',
  'mall',
  'food',
  'museum_culture',
] as const
export type SpotCategory = typeof SPOT_CATEGORIES[number]

export const SPOT_TIERS = ['S', 'A', 'B', 'C'] as const
export type SpotTier = typeof SPOT_TIERS[number]

export const CITY_STATUSES = ['draft', 'published', 'disabled'] as const
export type CityStatus = typeof CITY_STATUSES[number]
export const PUBLICATION_STATUSES = ['draft', 'pending_review', 'published', 'disabled'] as const
export type PublicationStatus = typeof PUBLICATION_STATUSES[number]
export const VERIFICATION_STATUSES = ['unverified', 'verified', 'failed', 'stale'] as const
export type VerificationStatus = typeof VERIFICATION_STATUSES[number]

export const spotCategorySchema = z.enum(SPOT_CATEGORIES)
export const spotTierSchema = z.enum(SPOT_TIERS)
export const cityStatusSchema = z.enum(CITY_STATUSES)
export const publicationStatusSchema = z.enum(PUBLICATION_STATUSES)
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES)

export interface CityRecord {
  adcode: string
  provinceName: string
  name: string
  slug: string
  intro: string | null
  coverImageUrl: string | null
  status: CityStatus
  priority: number
  reviewIntervalDays: 7 | 14 | 30
  lastContentReviewAt: string | null
  lastRefreshRunId: string | null
  createdAt: string
  updatedAt: string
  spotCount?: number
  publishedSpotCount?: number
}

export interface SpotSourceInput {
  title: string
  url?: string | null
  sourceName?: string | null
  checkedAt?: string | null
}

export interface SpotRecord {
  id: string
  cityAdcode: string
  name: string
  searchName: string
  amapName: string | null
  amapPoiId: string | null
  district: string | null
  address: string | null
  lng: number | null
  lat: number | null
  category: SpotCategory
  tier: SpotTier
  priority: number
  reason: string
  tierReason: string
  personas: string[]
  tags: string[]
  suggestedDuration: string | null
  bestTime: string | null
  indoorFriendly: boolean
  reservationRequired: boolean
  reservationNote: string | null
  coverImageUrl: string | null
  verificationStatus: VerificationStatus
  verifiedAt: string | null
  publicationStatus: PublicationStatus
  sourceKind: string | null
  version: number
  createdAt: string
  updatedAt: string
  sources?: SpotSourceInput[]
}

export interface RecommendationContext {
  category?: SpotCategory
  personas?: string[]
  rainy?: boolean
}

const TIER_ORDER: Record<SpotTier, number> = { S: 0, A: 1, B: 2, C: 3 }

export function canPublishSpot(spot: Pick<SpotRecord,
  'verificationStatus' | 'amapPoiId' | 'lng' | 'lat' | 'category' | 'tier' | 'reason' | 'tierReason' | 'district' | 'suggestedDuration'
>): string[] {
  const errors: string[] = []
  if (spot.verificationStatus !== 'verified') errors.push('地点尚未通过高德验证')
  if (!spot.amapPoiId?.trim()) errors.push('缺少高德 POI ID')
  if (!Number.isFinite(spot.lng) || !Number.isFinite(spot.lat)) errors.push('缺少有效坐标')
  if (!SPOT_CATEGORIES.includes(spot.category)) errors.push('分类不合法')
  if (!SPOT_TIERS.includes(spot.tier)) errors.push('级别不合法')
  if (!spot.reason.trim()) errors.push('推荐理由不能为空')
  if (!spot.tierReason.trim()) errors.push('级别理由不能为空')
  if (!spot.district?.trim()) errors.push('区县不能为空')
  if (!spot.suggestedDuration?.trim()) errors.push('建议停留时间不能为空')
  return errors
}

function bTierMatches(spot: SpotRecord, context: RecommendationContext): boolean {
  if (context.category && spot.category === context.category) return true
  if (context.rainy && spot.indoorFriendly) return true
  const requested = new Set(context.personas ?? [])
  return spot.personas.some(persona => requested.has(persona))
}

function preferenceAdjustment(spot: SpotRecord, context: RecommendationContext): number {
  let score = 0
  if (context.rainy && spot.indoorFriendly) score += 2
  const requested = new Set(context.personas ?? [])
  if (spot.personas.some(persona => requested.has(persona))) score += 2
  return score
}

export function selectMainRecommendations(
  spots: SpotRecord[],
  context: RecommendationContext = {},
): SpotRecord[] {
  return spots
    .filter(spot => spot.publicationStatus === 'published' && spot.verificationStatus === 'verified')
    .filter(spot => spot.tier !== 'C')
    .filter(spot => !context.category || spot.category === context.category)
    .filter(spot => spot.tier !== 'B' || bTierMatches(spot, context))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
      || (b.priority + preferenceAdjustment(b, context)) - (a.priority + preferenceAdjustment(a, context))
      || b.priority - a.priority
      || a.name.localeCompare(b.name, 'zh-CN'))
}

const SENSITIVE_KEY = /password|hash|secret|cookie|authorization|headers?/i

export function sanitizeAuditPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditPayload)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .map(([key, child]) => [key, sanitizeAuditPayload(child)]))
}
