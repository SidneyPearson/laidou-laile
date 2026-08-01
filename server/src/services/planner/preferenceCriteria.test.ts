import { describe, expect, it } from 'vitest'
import { buildCategoryKeywords, buildCategoryTypecodePrefixes } from './preferenceCriteria.js'

describe('preference category criteria', () => {
  it('keeps selected wander subtypes as OR-compatible typecode prefixes', () => {
    expect(buildCategoryTypecodePrefixes({ wanderTypes: ['shopping', 'entertainment'] })).toEqual({
      wander: ['06', '08'],
    })
    expect(buildCategoryTypecodePrefixes({ wanderTypes: ['cafe', 'hidden'] })).toEqual({
      wander: ['0505', '11'],
    })
  })

  it('adds a strict visitor-oriented criterion for scenic streets', () => {
    expect(buildCategoryKeywords({ scenicTypes: ['street'] }).scenic).toContain('历史文化街区')
    expect(buildCategoryTypecodePrefixes({ scenicTypes: ['street'] })).toEqual({
      scenic: ['1401'],
    })
  })
})
