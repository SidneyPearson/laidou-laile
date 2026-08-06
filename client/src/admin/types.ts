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
export const SPOT_TIERS = ['S', 'A', 'B', 'C'] as const
export const CITY_STATUSES = ['draft', 'published', 'disabled'] as const
export const PUBLICATION_STATUSES = ['draft', 'pending_review', 'published', 'disabled'] as const
export const VERIFICATION_STATUSES = ['unverified', 'verified', 'failed', 'stale'] as const

export type SpotCategory = typeof SPOT_CATEGORIES[number]
export type SpotTier = typeof SPOT_TIERS[number]
export type CityStatus = typeof CITY_STATUSES[number]
export type PublicationStatus = typeof PUBLICATION_STATUSES[number]
export type VerificationStatus = typeof VERIFICATION_STATUSES[number]

export const SPOT_CATEGORY_LABELS: Record<SpotCategory, string> = {
  classic_landmark: '经典景点 / 城市地标',
  featured_district: '特色区域',
  theme_park: '主题公园',
  nature: '自然景区',
  walk_street: '特色步行街 / 小吃街',
  mall: '购物商场',
  food: '美食探店',
  museum_culture: '博物馆 / 文化场馆',
}

export const SPOT_TIER_LABELS: Record<SpotTier, string> = {
  S: 'S · 全国知名 / 初次必去',
  A: 'A · 城市代表 / 值得专程',
  B: 'B · 条件命中时推荐',
  C: 'C · 顺路补充 / 不进主推荐',
}

export const CITY_STATUS_LABELS: Record<CityStatus, string> = {
  draft: '草稿',
  published: '已开放',
  disabled: '已停用',
}

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  draft: '草稿',
  pending_review: '待审核',
  published: '已发布',
  disabled: '已停用',
}

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  unverified: '未验证',
  verified: '验证通过',
  failed: '验证失败',
  stale: '需要重新验证',
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AdminCity {
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
  spotCount: number
  publishedSpotCount: number
}

export interface SpotSource {
  title: string
  url?: string | null
  sourceName?: string | null
  checkedAt?: string | null
}

export interface AdminSpot {
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
  sources?: SpotSource[]
}

export interface DashboardStats {
  publishedCities: number
  draftSpots: number
  pendingReview: number
  publishedSpots: number
  verificationFailed: number
  staleSpots: number
}

/** Homepage persona card — fixed ids (the Persona contract), display-only. */
export interface AdminHomePersona {
  id: 'fast' | 'couple' | 'family' | 'lazy' | 'urban'
  title: string
  subtitle: string
  imageUrl: string | null
  sortOrder: number
  enabled: boolean
  version: number
  updatedAt?: string
}

export type RefreshRunStatus =
  | 'draft' | 'prompt_generated' | 'result_imported' | 'reviewing'
  | 'completed' | 'cancelled' | 'failed'
export type RefreshCandidateType =
  | 'new_spot' | 'existing_update' | 'tier_change' | 'category_change'
  | 'rename' | 'possible_closed' | 'possible_duplicate' | 'no_material_change'
export type RefreshAssessment =
  | 'recommended_update' | 'needs_amap_verification' | 'needs_more_evidence'
  | 'possible_duplicate' | 'high_risk_manual_review' | 'no_material_change' | 'invalid'
export type RefreshDecision = 'pending' | 'accepted' | 'rejected' | 'ignored'

export const REFRESH_RUN_STATUS_LABELS: Record<RefreshRunStatus, string> = {
  draft: '任务草稿',
  prompt_generated: '提示词已生成',
  result_imported: '结果已导入',
  reviewing: '正在审核',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败',
}
export const REFRESH_CANDIDATE_TYPE_LABELS: Record<RefreshCandidateType, string> = {
  new_spot: '新增地点',
  existing_update: '现有地点更新',
  tier_change: '级别调整',
  category_change: '分类调整',
  rename: '疑似改名',
  possible_closed: '疑似关闭',
  possible_duplicate: '疑似重复',
  no_material_change: '无实质变化',
}
export const REFRESH_ASSESSMENT_LABELS: Record<RefreshAssessment, string> = {
  recommended_update: '建议进入人工更新',
  needs_amap_verification: '需要高德验证',
  needs_more_evidence: '证据不足',
  possible_duplicate: '疑似重复',
  high_risk_manual_review: '高风险人工审核',
  no_material_change: '无实质变化',
  invalid: '无效候选',
}
export const REFRESH_DECISION_LABELS: Record<RefreshDecision, string> = {
  pending: '待处理',
  accepted: '已接受',
  rejected: '已拒绝',
  ignored: '已忽略',
}

export interface CityReviewState {
  due: boolean
  neverReviewed: boolean
  overdueDays: number
  daysUntilDue: number | null
  dueAt: string | null
  label: string
  tone: 'green' | 'yellow' | 'red' | 'gray'
}
export interface RefreshDueItem {
  city: AdminCity
  review: CityReviewState
  activeRun: { id: string; status: RefreshRunStatus } | null
}
export interface RefreshDueResponse {
  items: RefreshDueItem[]
  summary: {
    dueCities: number
    overdueCities: number
    neverReviewedCities: number
    activeRuns: number
    completedThisWeek: number
  }
}
export interface RefreshRun {
  id: string
  cityAdcode: string
  status: RefreshRunStatus
  schemaVersion: string
  promptText: string | null
  importSummary: Record<string, unknown> | null
  startedAt: string
  promptGeneratedAt: string | null
  resultImportedAt: string | null
  completedAt: string | null
}
export interface RefreshCandidate {
  id: string
  runId: string
  candidateType: RefreshCandidateType
  targetSpotId: string | null
  proposedName: string | null
  proposedSearchName: string | null
  proposedCategory: SpotCategory | null
  proposedTier: SpotTier | null
  proposedReason: string | null
  proposedTierReason: string | null
  proposedData: Record<string, unknown>
  evidence: Array<Record<string, unknown>>
  diff: Record<string, unknown> | null
  amapVerificationStatus: 'not_required' | 'unverified' | 'verified' | 'failed'
  amapVerification: Record<string, unknown> | null
  systemAssessment: RefreshAssessment
  systemAssessmentReason: string | null
  decision: RefreshDecision
  decisionNote: string | null
  reviewedAt: string | null
}
export interface RefreshRunDetail {
  run: RefreshRun
  city: AdminCity
  candidates: RefreshCandidate[]
  currentSpots: AdminSpot[]
}
export interface RefreshPreview {
  previewHash: string
  valid: boolean
  errors: string[]
  summary: {
    researchedAt: string
    sourceCount: number
    newSpotCount: number
    existingChangeCount: number
    possibleClosedCount: number
    noMaterialChange: boolean
    duplicateCount: number
    errorCount: number
  }
  candidates: RefreshCandidate[]
}
