import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AmapPOI } from '../../types/poi.js'

const mocks = vi.hoisted(() => ({
  searchNearbyPOIs: vi.fn(),
  searchSocialFoodEvidence: vi.fn(),
  chatCompletionWithFallback: vi.fn(),
}))

vi.mock('../amap/poiSearch.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../amap/poiSearch.js')>()
  return { ...original, searchNearbyPOIs: mocks.searchNearbyPOIs }
})

vi.mock('./socialFoodSearch.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./socialFoodSearch.js')>()
  return { ...original, searchSocialFoodEvidence: mocks.searchSocialFoodEvidence }
})

vi.mock('../llm/client.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../llm/client.js')>()
  return { ...original, chatCompletionWithFallback: mocks.chatCompletionWithFallback }
})

import { generatePlan } from './generatePlan.js'
import { generateFoodList } from './foodPlanner.js'

function poi(id: string, name: string, distance: number, rating: string): AmapPOI {
  return {
    id, name, distance, rating, type: '餐饮服务', typecode: '050000',
    address: `${name}地址`, lng: 121.5 + distance / 1_000_000, lat: 31.2, cost: null,
  }
}

afterEach(() => vi.clearAllMocks())

describe('pure food list generation', () => {
  it('uses the shared one-hour maximum when enough qualified candidates exist', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('1', '阿娘面馆', 120, '4.8'),
      poi('2', '沪西老弄堂面馆', 180, '4.7'),
      poi('3', '老上海葱油拌面', 240, '4.6'),
    ])
    mocks.searchSocialFoodEvidence.mockResolvedValue([])

    const routes = await generateFoodList({
      position: { lat: 31.2, lng: 121.5 },
      city: '上海市',
      weather: '晴',
      timeMinutes: 60,
      distance: 1000,
      preferences: ['food'],
      adcode: '310000',
    })

    expect(routes?.[0].stops.map(stop => stop.name)).toEqual([
      '阿娘面馆',
      '沪西老弄堂面馆',
    ])
  })

  it('returns the truthful qualified count without duplicating a one-hour shortage', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('1', '阿娘面馆', 120, '4.8'),
    ])
    mocks.searchSocialFoodEvidence.mockResolvedValue([])

    const result = await generatePlan({
      position: { lat: 31.2, lng: 121.5 },
      city: '上海市',
      weather: '晴',
      timeMinutes: 60,
      distance: 1000,
      preferences: ['food'],
      adcode: '310000',
    })

    expect(result.routes[0].stops).toHaveLength(1)
    expect(new Set(result.routes[0].stops.map(stop => stop.amapPoiId)).size).toBe(1)
    expect(result.routes[0].tagline).toBe('附近热门餐厅，共 1 家')
  })

  it('caps AI-matched comments at the shared maximum and removes duplicate shops', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('1', '阿娘面馆', 120, '4.8'),
      poi('2', '沪西老弄堂面馆', 180, '4.7'),
      poi('3', '老上海葱油拌面', 240, '4.6'),
    ])
    mocks.searchSocialFoodEvidence.mockResolvedValue([{
      title: '阿娘面馆 沪西老弄堂面馆 老上海葱油拌面探店',
      content: '上海面馆推荐',
      url: 'https://www.xiaohongshu.com/explore/food-list',
    }])
    mocks.chatCompletionWithFallback.mockResolvedValue(JSON.stringify({
      foodList: [
        { name: '阿娘面馆', score: 4.8, comment: '本帮浇头扎实' },
        { name: '阿娘面馆', score: 4.7, comment: '重复评论' },
        { name: '沪西老弄堂面馆', score: 4.6, comment: '老上海风味' },
        { name: '老上海葱油拌面', score: 4.5, comment: '葱香浓郁' },
      ],
    }))

    const routes = await generateFoodList({
      position: { lat: 31.2, lng: 121.5 },
      city: '上海市',
      weather: '晴',
      timeMinutes: 60,
      distance: 1000,
      preferences: ['food'],
      adcode: '310000',
    })

    expect(routes?.[0].stops.map(stop => stop.amapPoiId)).toEqual(['1', '2'])
    const request = mocks.chatCompletionWithFallback.mock.calls[0]?.[0]
    const prompt = request?.messages?.find((message: { role: string }) => message.role === 'user')?.content
    expect(prompt).toContain('最多选出 2 家（不得超过输入候选数）')
    expect(prompt).not.toContain('5-8 家')
  })

  it('keeps a four-hour food request as a list, filters banquet venues and rebuilds count', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('1', '额尔敦传统涮(世博大道店)', 203, '4.7'),
      poi('2', '圣拉维滨江宴会中心·银河厅', 176, '4.5'),
      poi('3', '茶然居', 369, '4.3'),
      poi('4', '阿娘面馆', 420, '4.6'),
    ])
    mocks.searchSocialFoodEvidence.mockResolvedValue([])

    const result = await generatePlan({
      position: { lat: 31.2, lng: 121.5 },
      city: '浦东新区南码头路街道',
      weather: '晴',
      timeMinutes: 240,
      distance: 1000,
      preferences: ['food'],
      adcode: '310115',
    })

    expect(result.source).toBe('ai')
    expect(result.routes).toHaveLength(1)
    expect(result.routes[0].kind).toBe('food_list')
    expect(result.routes[0].stops.map(stop => stop.name)).not.toContain('圣拉维滨江宴会中心·银河厅')
    expect(result.routes[0].stops).toHaveLength(3)
    expect(result.routes[0].tagline).toBe('附近热门餐厅，共 3 家')
    expect(result.routes[0].direction).toBeUndefined()
  })

  it('keeps an evidence-free Amap list usable and labels every stop as fallback', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('1', '阿娘面馆', 120, '4.8'),
      poi('2', '沪西老弄堂面馆', 180, '4.7'),
      poi('3', '老上海葱油拌面', 240, '4.6'),
    ])
    mocks.searchSocialFoodEvidence.mockResolvedValue([])

    const routes = await generateFoodList({
      position: { lat: 31.2, lng: 121.5 },
      city: '上海市',
      weather: '晴',
      timeMinutes: 120,
      distance: 1000,
      preferences: ['food'],
      adcode: '310000',
    })

    expect(routes).not.toBeNull()
    expect(routes?.[0].stops.length).toBeGreaterThan(0)
    for (const stop of routes?.[0].stops ?? []) {
      expect(stop.recommendationType).toBe('amap_fallback')
      expect(stop.socialEvidence).toBeUndefined()
      expect(stop.evidenceSummary).toBe('高德高分补充')
    }
  })

  it('marks a concretely matched shop social-hot with confidence-scored HTTPS evidence', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('1', '阿娘面馆', 120, '4.8'),
      poi('2', '沪西老弄堂面馆', 180, '4.7'),
    ])
    mocks.searchSocialFoodEvidence.mockResolvedValue([{
      title: '小红书｜阿娘面馆探店',
      content: '阿娘面馆本帮浇头面推荐',
      url: 'https://www.xiaohongshu.com/explore/a-niang-noodles',
    }])
    mocks.chatCompletionWithFallback.mockResolvedValue(JSON.stringify({
      foodList: [
        { name: '阿娘面馆', comment: '公开探店提及，本帮浇头扎实' },
        { name: '沪西老弄堂面馆', comment: '高德高分补充' },
      ],
    }))

    const routes = await generateFoodList({
      position: { lat: 31.2, lng: 121.5 },
      city: '上海市',
      weather: '晴',
      timeMinutes: 60,
      distance: 1000,
      preferences: ['food'],
      adcode: '310000',
    })

    const evidenced = routes?.[0].stops.find(stop => stop.name === '阿娘面馆')
    expect(evidenced?.recommendationType).toBe('social_hot')
    expect(evidenced?.socialEvidence?.length).toBeGreaterThan(0)
    for (const evidence of evidenced?.socialEvidence ?? []) {
      expect(evidence.url).toMatch(/^https:\/\//)
      expect(evidence.confidence).toBeGreaterThanOrEqual(0.7)
      expect(evidence.confidence).toBeLessThanOrEqual(1)
    }
  })
})
