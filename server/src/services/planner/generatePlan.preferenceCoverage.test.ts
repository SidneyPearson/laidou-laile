import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  chatCompletionWithFallback: vi.fn(),
  verifyAndEnrichRoutes: vi.fn(),
}))

vi.mock('../llm/client.js', () => ({
  chatCompletionWithFallback: mocks.chatCompletionWithFallback,
}))
vi.mock('./verifyRoutes.js', () => ({
  verifyAndEnrichRoutes: mocks.verifyAndEnrichRoutes,
}))

import { generatePlan } from './generatePlan.js'

describe('generatePlan mixed-preference coverage', () => {
  it('falls back when an AI-success route contains scenic stops but no verified restaurant', async () => {
    mocks.chatCompletionWithFallback.mockResolvedValue(JSON.stringify({
      routes: [{
        name: '古城漫步', tagline: '景点串游',
        stops: [{ name: '钟楼', visitDurationMinutes: 40, notes: '城市地标' }],
        totalDurationMinutes: 40, walkingDistanceMeters: 100, tips: '步行前往',
      }],
    }))
    mocks.verifyAndEnrichRoutes.mockResolvedValue([{
      id: 'ai-scenic', name: '古城漫步', tagline: '1个地点',
      stops: [{
        name: '钟楼', address: '钟楼盘道', visitDurationMinutes: 40, notes: '城市地标',
        amapPoiId: 'bell', typecode: '110000', lng: 108.94, lat: 34.26, distanceMeters: 620,
      }],
      totalDurationMinutes: 40, walkingDistanceMeters: 100, tips: '',
    }])

    const result = await generatePlan({
      position: { lat: 34.26, lng: 108.94 }, city: '西安市', areaName: '回民街',
      weather: '晴', timeMinutes: 240, distance: 3000,
      preferences: ['food', 'scenic'], cuisineTypes: ['local_cuisine'], scenicTypes: ['popular'],
      adcode: '610104',
    })

    expect(result.source).toBe('fallback')
    expect(result.routes).toEqual([])
    expect(result.fallbackReason).toContain('缺少美食')
  })
})
