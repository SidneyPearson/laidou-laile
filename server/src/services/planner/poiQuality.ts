export enum PoiQualityReason {
  NOT_PUBLIC = 'NOT_PUBLIC',
  TEMPORARILY_CLOSED = 'TEMPORARILY_CLOSED',
  NON_VISITOR_AREA = 'NON_VISITOR_AREA',
  MINOR_INTERNAL_FEATURE = 'MINOR_INTERNAL_FEATURE',
}

export type PoiQualityDecision = 'allow' | 'downrank' | 'reject'

export interface PoiTextLike {
  name: string
  address?: string
}

export interface PoiQualityResult {
  decision: PoiQualityDecision
  reason?: PoiQualityReason
}

const HARD_RULES: Array<{ re: RegExp; reason: PoiQualityReason }> = [
  { re: /不对外开放/, reason: PoiQualityReason.NOT_PUBLIC },
  { re: /暂停开放|暂不开放|停止营业|施工中|入口封闭/, reason: PoiQualityReason.TEMPORARILY_CLOSED },
  { re: /内部设施|办公区域|员工通道/, reason: PoiQualityReason.NON_VISITOR_AREA },
]

const MINOR_FEATURE_RE = /基座|阶沿石|须弥座|遗构|碑座|柱础|台阶遗址/

export function classifyPoiQuality(poi: PoiTextLike): PoiQualityResult {
  const text = `${poi.name} ${poi.address ?? ''}`
  for (const rule of HARD_RULES) {
    if (rule.re.test(text)) return { decision: 'reject', reason: rule.reason }
  }
  if (MINOR_FEATURE_RE.test(text)) {
    return { decision: 'downrank', reason: PoiQualityReason.MINOR_INTERNAL_FEATURE }
  }
  return { decision: 'allow' }
}

/** Reject unusable candidates and place soft-quality candidates last. */
export function filterUsablePois<T extends PoiTextLike>(pois: T[]): T[] {
  return pois
    .map((poi, index) => ({ poi, index, quality: classifyPoiQuality(poi) }))
    .filter(item => item.quality.decision !== 'reject')
    .sort((a, b) => {
      const rank = (decision: PoiQualityDecision) => decision === 'allow' ? 0 : 1
      return rank(a.quality.decision) - rank(b.quality.decision) || a.index - b.index
    })
    .map(item => item.poi)
}
