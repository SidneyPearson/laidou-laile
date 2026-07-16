export interface RelevancePoi {
  name: string
  type?: string
  address?: string
  tags?: string
}

const SYNONYMS: Record<string, string[]> = {
  本帮面: ['本帮面', '蟹黄面', '葱油拌面', '焖肉面', '大排面', '面馆', '面庄'],
  面馆: ['面馆', '面庄', '拉面', '米线', '粉面', '拌面'],
  咖啡: ['咖啡', '咖啡馆', '咖啡厅', 'coffee'],
  日料: ['日料', '日本料理', '寿司', '刺身', '居酒屋'],
}

export interface KeywordProfile {
  requested: string[]
  terms: string[]
}

export function buildKeywordProfile(keywords: string[]): KeywordProfile {
  const requested = keywords.map(value => value.trim().toLowerCase()).filter(Boolean)
  const terms = new Set<string>()
  for (const keyword of requested) {
    terms.add(keyword)
    for (const synonym of SYNONYMS[keyword] ?? []) terms.add(synonym.toLowerCase())
  }
  return { requested, terms: [...terms] }
}

export function scorePoiRelevance(poi: RelevancePoi, profile: KeywordProfile): number {
  if (profile.requested.length === 0) return 1
  const fields = [poi.name, poi.type, poi.address, poi.tags].map(value => (value ?? '').toLowerCase())
  let best = 0
  for (const term of profile.terms) {
    if (fields[0].includes(term)) best = Math.max(best, 3)
    else if (fields.slice(1).some(field => field.includes(term))) best = Math.max(best, 2)
  }
  return best
}

export function searchTermsFor(keywords: string[]): string[] {
  return buildKeywordProfile(keywords).terms
}
