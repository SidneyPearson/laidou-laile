import { describe, expect, it } from 'vitest'

import { buildRecallQueries } from './recallPolicy.js'

describe('buildRecallQueries', () => {
  it('adds broad and area-aware variants for sparse local-cuisine searches', () => {
    expect(buildRecallQueries({
      preference: 'food',
      subtypes: ['local_cuisine'],
      area: '宽窄巷子',
    })).toEqual([
      {
        keywords: '宽窄巷子|本地菜|老字号|特色菜|地方风味|川菜|四川菜|成都菜|成都小吃',
        types: '050000',
      },
    ])
  })

  it('keeps shopping and entertainment variants in their own categories', () => {
    const queries = buildRecallQueries({
      preference: 'wander',
      subtypes: ['shopping', 'entertainment'],
      area: '北京路步行街',
    })

    expect(queries).toContainEqual({
      keywords: '北京路步行街|商场|购物中心|步行街|集市',
      types: '060000',
    })
    expect(queries).toContainEqual({
      keywords: '北京路步行街|电影院|KTV|桌游|密室|演出',
      types: '080000',
    })
  })

  it('caps recall variants at three per selected preference', () => {
    expect(buildRecallQueries({
      preference: 'wander',
      subtypes: ['shopping', 'entertainment', 'cafe', 'popular'],
      area: '北京路步行街',
    })).toHaveLength(3)
  })

  it('does not leak wander subtype queries into food recall', () => {
    expect(buildRecallQueries({
      preference: 'food',
      subtypes: ['shopping', 'entertainment'],
      area: '北京路步行街',
    })).toEqual([])
  })
})
