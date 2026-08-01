import type { PreferenceTag } from '../../types/route.js'
import { buildLocalCuisineSearchTerms } from './localCuisinePolicy.js'

export interface RecallQueryInput {
  preference: PreferenceTag
  subtypes: string[]
  area: string
}

export interface RecallQuery {
  keywords: string
  types: string
}

const QUERIES_BY_PREFERENCE: Partial<Record<PreferenceTag, Record<string, RecallQuery>>> = {
  wander: {
    shopping: { keywords: '商场|购物中心|步行街|集市', types: '060000' },
    entertainment: { keywords: '电影院|KTV|桌游|密室|演出', types: '080000' },
    cafe: { keywords: '咖啡|茶馆|茶饮|书吧', types: '050000' },
  },
  scenic: {
    popular: { keywords: '著名景点|名胜古迹|地标|必去', types: '110000|140000' },
  },
}

/**
 * Build a bounded set of supplementary text-search variants for a selected
 * preference. Callers merge these results with their normal Amap searches;
 * this policy only broadens recall and does not decide final distance.
 */
export function buildRecallQueries(input: RecallQueryInput): RecallQuery[] {
  const area = input.area.trim()

  if (input.preference === 'food' && input.subtypes.includes('local_cuisine')) {
    return [
      {
        keywords: [area, ...buildLocalCuisineSearchTerms(area)].filter(Boolean).join('|'),
        types: '050000',
      },
    ]
  }

  const subtypeQueries = QUERIES_BY_PREFERENCE[input.preference]
  if (!subtypeQueries) return []

  return input.subtypes
    .map(subtype => subtypeQueries[subtype])
    .filter((query): query is RecallQuery => Boolean(query))
    .slice(0, 3)
    .map(query => ({
      ...query,
      keywords: [area, query.keywords].filter(Boolean).join('|'),
    }))
}
