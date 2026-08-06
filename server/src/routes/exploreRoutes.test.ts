import { describe, expect, it, vi } from 'vitest'
import { createExploreRoutes } from './exploreRoutes.js'
import type { ExploreRecommendation } from '../types/explore.js'
import type { CurationRepository } from '../repositories/curationRepository.js'

const noopRepository = () => ({}) as unknown as CurationRepository
const env = { DB: {} as D1Database }

const validBody = {
  city: '上海',
  adcode: '310000',
  persona: 'couple',
  category: 'all',
}

describe('POST /recommend', () => {
  it('returns verified recommendations and private short caching', async () => {
    const result: ExploreRecommendation = {
      spots: [{
        id: 'shanghai-bund',
        city: '上海',
        name: '外滩',
        amapName: '外滩',
        district: '黄浦区',
        category: 'landmark',
        reason: '城市地标',
        tags: ['夜景'],
        suitablePersonas: ['couple'],
        suggestedDuration: '建议 1.5 小时',
        bestTime: '黄昏',
        theme: 'river',
        amapPoiId: 'B001',
        address: '中山东一路',
        lng: 121.49,
        lat: 31.24,
        verifiedAt: '2026-07-24T00:00:00.000Z',
        verificationStatus: 'verified',
        source: 'amap_verified',
        mock: false,
        reservationNote: '出发前请确认当天开放安排。',
      }],
      nextCursor: null,
      source: 'curated_amap_verified',
    }
    const recommend = vi.fn().mockResolvedValue(result)
    const app = createExploreRoutes({ recommend, repository: noopRepository })
    const response = await app.request('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    }, env)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=300')
    expect(await response.json()).toEqual(result)
  })

  it('rejects invalid JSON and invalid request values', async () => {
    const app = createExploreRoutes()
    const invalidJson = await app.request('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    const invalidValue = await app.request('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, persona: 'unknown' }),
    })

    expect(invalidJson.status).toBe(400)
    expect(invalidValue.status).toBe(400)
  })

  it('rejects oversized request bodies before recommendation work', async () => {
    const recommend = vi.fn()
    const app = createExploreRoutes({ recommend })
    const response = await app.request('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, extra: 'x'.repeat(17 * 1024) }),
    })

    expect(response.status).toBe(413)
    expect(recommend).not.toHaveBeenCalled()
  })

  it('distinguishes unsupported cities from Amap verification outages', async () => {
    const unsupported = createExploreRoutes({
      recommend: vi.fn().mockResolvedValue(null),
      repository: noopRepository,
    })
    const unverified = createExploreRoutes({
      recommend: vi.fn().mockResolvedValue({
        spots: [], nextCursor: null, source: 'curated_amap_verified',
      }),
      repository: noopRepository,
    })

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    }
    const unsupportedResponse = await unsupported.request('/recommend', options, env)
    const unverifiedResponse = await unverified.request('/recommend', options, env)

    expect(unsupportedResponse.status).toBe(404)
    expect(await unsupportedResponse.json()).toMatchObject({
      error: { code: 'CITY_NOT_SUPPORTED' },
    })
    expect(unverifiedResponse.status).toBe(503)
    expect(await unverifiedResponse.json()).toMatchObject({
      error: { code: 'NO_VERIFIED_SPOTS' },
    })
  })
})
