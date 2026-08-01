import { describe, expect, it } from 'vitest'
import {
  cityContextQuerySchema,
  exploreRecommendRequestSchema,
} from './exploreRoutes.schemas.js'

describe('cityContextQuerySchema', () => {
  it('coerces valid query strings', () => {
    const result = cityContextQuerySchema.parse({ lat: '31.23', lng: '121.47' })
    expect(result).toEqual({ lat: 31.23, lng: 121.47 })
  })

  it('rejects missing and out-of-range coordinates', () => {
    expect(cityContextQuerySchema.safeParse({ lat: '', lng: '121' }).success).toBe(false)
    expect(cityContextQuerySchema.safeParse({ lat: '91', lng: '121' }).success).toBe(false)
  })
})

describe('exploreRecommendRequestSchema', () => {
  const valid = {
    city: '上海',
    adcode: '310000',
    persona: 'couple',
    category: 'all',
  }

  it('applies safe pagination defaults', () => {
    const result = exploreRecommendRequestSchema.parse(valid)
    expect(result.cursor).toBe(0)
    expect(result.limit).toBe(6)
    expect(result.isRainy).toBe(false)
  })

  it('rejects unknown personas, categories and oversized pages', () => {
    expect(exploreRecommendRequestSchema.safeParse({ ...valid, persona: 'solo' }).success).toBe(false)
    expect(exploreRecommendRequestSchema.safeParse({ ...valid, category: 'hotel' }).success).toBe(false)
    expect(exploreRecommendRequestSchema.safeParse({ ...valid, limit: 7 }).success).toBe(false)
  })

  it('rejects malformed adcodes', () => {
    expect(exploreRecommendRequestSchema.safeParse({ ...valid, adcode: '3100' }).success).toBe(false)
  })
})
