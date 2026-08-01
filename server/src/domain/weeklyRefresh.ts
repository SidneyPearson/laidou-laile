import { z } from 'zod'
import {
  SPOT_CATEGORIES,
  SPOT_TIERS,
  spotCategorySchema,
  spotTierSchema,
  type CityRecord,
  type SpotRecord,
} from './curation.js'

export const REFRESH_RUN_STATUSES = [
  'draft', 'prompt_generated', 'result_imported', 'reviewing',
  'completed', 'cancelled', 'failed',
] as const
export const REFRESH_CANDIDATE_TYPES = [
  'new_spot', 'existing_update', 'tier_change', 'category_change',
  'rename', 'possible_closed', 'possible_duplicate', 'no_material_change',
] as const
export const REFRESH_ASSESSMENTS = [
  'recommended_update', 'needs_amap_verification', 'needs_more_evidence',
  'possible_duplicate', 'high_risk_manual_review', 'no_material_change', 'invalid',
] as const
export const REFRESH_DECISIONS = ['pending', 'accepted', 'rejected', 'ignored'] as const
export const SOURCE_KINDS = ['official', 'government', 'authority', 'major_media', 'map', 'other'] as const
export const ALLOWED_PERSONAS = [
  'first_visit', 'photography', 'family', 'theme_park', 'food', 'culture',
  'museum', 'history', 'nature', 'city_walk', 'street', 'shopping',
  'couple', 'solo', 'senior', 'child',
] as const

export type RefreshRunStatus = typeof REFRESH_RUN_STATUSES[number]
export type RefreshCandidateType = typeof REFRESH_CANDIDATE_TYPES[number]
export type RefreshAssessment = typeof REFRESH_ASSESSMENTS[number]
export type RefreshDecision = typeof REFRESH_DECISIONS[number]

const httpsUrl = z.string().trim().url().max(1000).refine(value => new URL(value).protocol === 'https:', '来源链接必须使用 HTTPS')
const shortText = z.string().trim().min(1).max(160)
const optionalText = (max: number) => z.string().trim().max(max).optional()
const evidenceUrls = z.array(httpsUrl).max(10)

const proposedFieldsSchema = z.object({
  name: optionalText(120),
  searchName: optionalText(120),
  category: spotCategorySchema.optional(),
  tier: spotTierSchema.optional(),
  reason: optionalText(1000),
  tierReason: optionalText(1000),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  personas: z.array(z.enum(ALLOWED_PERSONAS)).max(20).optional(),
  bestTime: optionalText(120),
  suggestedDuration: optionalText(120),
  indoorFriendly: z.boolean().optional(),
  reservationRequired: z.boolean().optional(),
  reservationNote: z.string().trim().max(500).optional(),
}).strict()

export const externalRefreshResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  city: z.object({
    name: shortText,
    adcode: z.string().regex(/^\d{6}$/),
  }).strict(),
  researchedAt: z.string().datetime(),
  searchSummary: z.string().trim().min(1).max(3000),
  noMaterialChange: z.boolean(),
  sources: z.array(z.object({
    title: shortText,
    url: httpsUrl,
    sourceName: shortText,
    sourceKind: z.enum(SOURCE_KINDS),
  }).strict()).max(50),
  existingSpotChanges: z.array(z.object({
    spotId: z.string().trim().min(3).max(100),
    changeType: z.enum(['existing_update', 'tier_change', 'category_change', 'rename']),
    proposed: proposedFieldsSchema,
    reason: z.string().trim().min(1).max(1000),
    evidenceUrls,
  }).strict()).max(50),
  newCandidates: z.array(z.object({
    name: shortText,
    searchName: shortText,
    category: spotCategorySchema,
    suggestedTier: spotTierSchema,
    reason: z.string().trim().min(1).max(1000),
    tierReason: z.string().trim().min(1).max(1000),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
    personas: z.array(z.enum(ALLOWED_PERSONAS)).max(20),
    bestTime: optionalText(120).default(''),
    suggestedDuration: optionalText(120).default(''),
    indoorFriendly: z.boolean(),
    reservationRequired: z.boolean(),
    reservationNote: z.string().trim().max(500),
    evidenceUrls,
  }).strict()).max(50),
  possibleClosedOrRenamed: z.array(z.object({
    spotId: z.string().trim().min(3).max(100),
    changeType: z.enum(['possible_closed', 'rename']),
    proposedName: z.string().trim().max(120),
    reason: z.string().trim().min(1).max(1000),
    evidenceUrls,
  }).strict()).max(50),
}).strict().superRefine((value, ctx) => {
  const count = value.existingSpotChanges.length + value.newCandidates.length + value.possibleClosedOrRenamed.length
  if (count > 50) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '每次最多导入50条候选' })
  if (value.noMaterialChange && count > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '声明无实质变化时不能同时提交变更候选' })
  if (!value.noMaterialChange && count === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '没有候选时必须明确声明无实质变化' })
})

export type ExternalRefreshResult = z.infer<typeof externalRefreshResultSchema>

export interface CityReviewState {
  due: boolean
  neverReviewed: boolean
  overdueDays: number
  daysUntilDue: number | null
  dueAt: string | null
  label: string
  tone: 'green' | 'yellow' | 'red' | 'gray'
}

const DAY_MS = 86_400_000

export function calculateCityReviewState(
  city: Pick<CityRecord, 'status' | 'reviewIntervalDays' | 'lastContentReviewAt'>,
  nowIso: string,
): CityReviewState {
  if (city.status !== 'published') {
    return { due: false, neverReviewed: false, overdueDays: 0, daysUntilDue: null, dueAt: null, label: '未开放，不提醒', tone: 'gray' }
  }
  if (!city.lastContentReviewAt) {
    return { due: true, neverReviewed: true, overdueDays: 0, daysUntilDue: null, dueAt: null, label: '从未复核', tone: 'gray' }
  }
  const now = Date.parse(nowIso)
  const reviewed = Date.parse(city.lastContentReviewAt)
  const dueAtMs = reviewed + city.reviewIntervalDays * DAY_MS
  const due = now >= dueAtMs
  const overdueDays = due ? Math.max(0, Math.floor((now - dueAtMs) / DAY_MS)) : 0
  const daysUntilDue = due ? 0 : Math.ceil((dueAtMs - now) / DAY_MS)
  return {
    due,
    neverReviewed: false,
    overdueDays,
    daysUntilDue,
    dueAt: new Date(dueAtMs).toISOString(),
    label: due
      ? overdueDays > 0 ? `已逾期${overdueDays}天` : '今天到期'
      : daysUntilDue <= 2 ? `${daysUntilDue}天内到期` : `距离复核还有${daysUntilDue}天`,
    tone: due ? 'red' : daysUntilDue <= 2 ? 'yellow' : 'green',
  }
}

export function normalizeSpotName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s·•\-—_（）()，,。.!！?？]/g, '')
}

function normalizedText(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\s，,。.!！?？；;]/g, '').toLowerCase()
    : JSON.stringify(value)
}

export function buildSpotDiff(current: SpotRecord, proposed: Record<string, unknown>): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  for (const [key, after] of Object.entries(proposed)) {
    if (after === undefined || !(key in current)) continue
    const before = (current as unknown as Record<string, unknown>)[key]
    if (normalizedText(before) !== normalizedText(after)) diff[key] = { before, after }
  }
  return diff
}

export function uniqueEvidenceCount(urls: string[]): number {
  return new Set(urls.map(value => new URL(value).hostname.toLowerCase())).size
}

export function buildWeeklyReviewPrompt(
  city: CityRecord,
  spots: SpotRecord[],
  nowIso: string,
): string {
  const categoryDefinitions = SPOT_CATEGORIES.map(value => `- ${value}`).join('\n')
  const spotLines = spots.map(spot => `- ${spot.id}｜${spot.name}｜${spot.category}｜${spot.tier}`).join('\n') || '- 当前无已发布地点'
  const tierDefinitions = [
    'S：全国知名，第一次来这座城市通常值得去',
    'A：城市代表性强，值得专程前往',
    'B：特定画像、天气或兴趣条件下值得去',
    'C：适合顺路或补充体验，不进入城市主推荐',
  ].join('\n')
  const returnExample = {
    schemaVersion: '1.0',
    city: { name: city.name, adcode: city.adcode },
    researchedAt: nowIso,
    searchSummary: '本次检索覆盖的来源和结论摘要',
    noMaterialChange: false,
    sources: [{
      title: '来源标题',
      url: 'https://example.com/page',
      sourceName: '官方网站或媒体名称',
      sourceKind: 'official',
    }],
    existingSpotChanges: [{
      spotId: 'existing-stable-id',
      changeType: 'tier_change',
      proposed: {
        category: 'museum_culture',
        tier: 'B',
        reason: '新的推荐理由',
        tierReason: '级别调整原因',
        tags: ['室内', '亲子'],
        bestTime: '上午',
        suggestedDuration: '建议2至3小时',
        indoorFriendly: true,
        reservationRequired: true,
        reservationNote: '以官方公告为准',
      },
      reason: '为什么建议修改',
      evidenceUrls: ['https://example.com/page'],
    }],
    newCandidates: [{
      name: '地点名称',
      searchName: '高德检索名称',
      category: 'classic_landmark',
      suggestedTier: 'A',
      reason: '为什么值得去',
      tierReason: '为什么属于这个级别',
      tags: ['城市地标'],
      personas: ['couple', 'family'],
      bestTime: '傍晚',
      suggestedDuration: '建议2小时',
      indoorFriendly: false,
      reservationRequired: false,
      reservationNote: '',
      evidenceUrls: ['https://example.com/page', 'https://example.org/page'],
    }],
    possibleClosedOrRenamed: [{
      spotId: 'existing-stable-id',
      changeType: 'possible_closed',
      proposedName: '',
      reason: '疑似关闭或改名的原因',
      evidenceUrls: ['https://example.com/official-notice'],
    }],
  }
  return `你正在协助“来都来了”进行城市热门地点每周人工复核。

城市：${city.name}
adcode：${city.adcode}
本次检索日期：${nowIso}
上次复核日期：${city.lastContentReviewAt ?? '从未复核'}

当前系统已发布地点（稳定 spotId｜名称｜分类｜级别）：
${spotLines}

固定分类（只能使用以下值）：
${categoryDefinitions}

级别定义：
${tierDefinitions}

请务必联网搜索，优先使用官方网站、政府、权威机构和主流媒体，并为每项结论提供可打开的 HTTPS 来源 URL。
如果你没有联网能力，不得凭记忆生成，请仅返回 {"error":"NO_WEB_ACCESS","schemaVersion":"1.0"}。
不要编造客流、票价、排队、营业状态或来源真实性；不要复制大段原文。
不要把社交平台热度直接当作 S/A 级证据。
新地点至少提供两个不同来源；关闭、改名、迁址最好提供官方来源。
当前地点没有实质变化时不要为了凑数提出修改，不允许修改系统稳定 spotId。
只输出合法 JSON 对象，不要 Markdown、代码围栏或额外说明。
如果没有实质变化，请返回 noMaterialChange: true。

JSON 必须严格使用以下字段结构；无内容的数组返回 []，不要省略字段：
${JSON.stringify(returnExample, null, 2)}

sourceKind 只能是 official、government、authority、major_media、map、other。
changeType 只能使用示例约定的 existing_update、tier_change、category_change、rename、possible_closed。
如果没有实质变化，将 noMaterialChange 设为 true，并把三个候选数组全部返回空数组。`
}

export async function previewHash(rawJson: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawJson))
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}
