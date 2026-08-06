export enum PoiQualityReason {
  NOT_PUBLIC = 'NOT_PUBLIC',
  TEMPORARILY_CLOSED = 'TEMPORARILY_CLOSED',
  NON_VISITOR_AREA = 'NON_VISITOR_AREA',
  MINOR_INTERNAL_FEATURE = 'MINOR_INTERNAL_FEATURE',
  ACCESS_UNCONFIRMED = 'ACCESS_UNCONFIRMED',
}

export type PoiQualityDecision = 'allow' | 'allow_with_caution' | 'downrank' | 'reject'

export interface PoiTextLike {
  name: string
  address?: string
  type?: string
  typecode?: string
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

const MINOR_FEATURE_RE = /基座|阶沿石|须弥座|遗构|遗迹|碑座|柱础|台阶遗址|鱼池古迹|镜湖厅|展品|陈列|馆藏|珍玩展|古籍部|打卡点|风景(?:名胜)?区-/
const CAUTION_RE = /故居|遗址|古迹/
const INTERNAL_CONTEXT_RE = /(?:景区|风景名胜区|公园|博物馆|岛)内|风景(?:名胜)?区-/
const WATER_LANDMARK_RE = /岛|洲|湖心|潭塔|小瀛洲/
const NON_VISITOR_NAME_RE = /学校|中学|小学|幼儿园|培训中心|培训学校|培训机构|驾考(?:中心|基地|考场)?|驾驶人考场|考试服务中心|青少年活动中心|服务站|维修站|发行站|办事处|政务中心|办公区|支部委员会|党委|居民委员会|社区委员会/
const VISITOR_OVERRIDE_RE = /博物馆|美术馆|展览馆|纪念馆|科技馆|文化馆|剧院|艺术馆/

export function classifyPoiQuality(poi: PoiTextLike): PoiQualityResult {
  const text = `${poi.name} ${poi.address ?? ''} ${poi.type ?? ''} ${poi.typecode ?? ''}`
  for (const rule of HARD_RULES) {
    if (rule.re.test(text)) return { decision: 'reject', reason: rule.reason }
  }
  if (NON_VISITOR_NAME_RE.test(text) && !VISITOR_OVERRIDE_RE.test(text)) {
    return { decision: 'reject', reason: PoiQualityReason.NON_VISITOR_AREA }
  }
  if (MINOR_FEATURE_RE.test(text)) {
    return { decision: 'downrank', reason: PoiQualityReason.MINOR_INTERNAL_FEATURE }
  }
  const compactName = poi.name.replace(/[（(][^)）]*[)）]/g, '').trim()
  if (!WATER_LANDMARK_RE.test(compactName)
    && INTERNAL_CONTEXT_RE.test(poi.address ?? '')
    && (compactName.length <= 8 || compactName.includes('-'))) {
    return { decision: 'downrank', reason: PoiQualityReason.MINOR_INTERNAL_FEATURE }
  }
  if (CAUTION_RE.test(text)) {
    return { decision: 'allow_with_caution', reason: PoiQualityReason.ACCESS_UNCONFIRMED }
  }
  return { decision: 'allow' }
}

/** Reject unusable candidates and place soft-quality candidates last. */
export function filterUsablePois<T extends PoiTextLike>(pois: T[]): T[] {
  return pois
    .map((poi, index) => ({ poi, index, quality: classifyPoiQuality(poi) }))
    .filter(item => item.quality.decision !== 'reject')
    .sort((a, b) => {
      const rank = (decision: PoiQualityDecision) => {
        if (decision === 'allow') return 0
        if (decision === 'allow_with_caution') return 1
        return 2
      }
      return rank(a.quality.decision) - rank(b.quality.decision) || a.index - b.index
    })
    .map(item => item.poi)
}
