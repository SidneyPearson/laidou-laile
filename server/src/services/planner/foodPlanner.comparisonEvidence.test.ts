import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  searchSocialFoodEvidence: vi.fn(),
  chatCompletionWithFallback: vi.fn(),
}))

vi.mock('../amap/client.js', () => ({
  getAmapClient: () => ({ get: mocks.get }),
}))

vi.mock('./socialFoodSearch.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./socialFoodSearch.js')>()
  return { ...original, searchSocialFoodEvidence: mocks.searchSocialFoodEvidence }
})

vi.mock('../llm/client.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../llm/client.js')>()
  return { ...original, chatCompletionWithFallback: mocks.chatCompletionWithFallback }
})

import { generateCuisineComparison } from './foodPlanner.js'

function rawPoi(id: string, name: string, distance: number, rating: string) {
  return {
    id,
    name,
    type: '餐饮服务;中餐厅',
    typecode: '050100',
    address: `${name}地址`,
    location: `${121.49 + distance / 1_000_000},31.24`,
    distance: String(distance),
    biz_ext: { rating, cost: '42' },
  }
}

const input = {
  position: { lat: 31.24, lng: 121.49 },
  areaName: '外滩',
  city: '上海市',
  weather: '晴',
  timeMinutes: 120,
  distance: 1000,
  preferences: ['food' as const],
  cuisineTypes: ['noodles'],
  adcode: '310000',
}

beforeEach(() => {
  mocks.get.mockResolvedValue({ data: {
    pois: [
      rawPoi('1', '阿娘面馆', 120, '4.8'),
      rawPoi('2', '沪西老弄堂面馆', 180, '4.7'),
      rawPoi('3', '老上海葱油拌面', 240, '4.6'),
      rawPoi('4', '味香斋麻酱面馆', 300, '4.5'),
    ],
  } })
  mocks.chatCompletionWithFallback.mockRejectedValue(new Error('skip optional notes'))
})

afterEach(() => vi.clearAllMocks())

describe('cuisine comparison social evidence', () => {
  it('searches once with final Amap candidates and marks concrete matches deterministically', async () => {
    mocks.searchSocialFoodEvidence.mockResolvedValue([{
      title: '小红书｜阿娘面馆探店',
      content: '阿娘面馆本帮浇头面推荐',
      url: 'https://www.xiaohongshu.com/explore/a-niang-comparison',
    }])

    const routes = await generateCuisineComparison(input)

    expect(mocks.searchSocialFoodEvidence).toHaveBeenCalledTimes(1)
    expect(mocks.searchSocialFoodEvidence).toHaveBeenCalledWith(
      '上海市 外滩',
      expect.arrayContaining(['阿娘面馆', '沪西老弄堂面馆']),
    )
    const stops = routes?.flatMap(route => route.stops) ?? []
    const evidenced = stops.find(stop => stop.name === '阿娘面馆')
    expect(evidenced).toMatchObject({
      recommendationType: 'social_hot',
      evidenceSummary: '1个平台公开提及',
    })
    expect(evidenced?.socialScore).toBeGreaterThan(0)
    expect(evidenced?.socialEvidence?.[0]?.url).toBe(
      'https://www.xiaohongshu.com/explore/a-niang-comparison',
    )
    expect(stops.filter(stop => stop.recommendationType === 'social_hot').length).toBeGreaterThan(0)
  })

  it('does not claim check-in popularity when no verifiable platform link exists', async () => {
    mocks.searchSocialFoodEvidence.mockResolvedValue([])

    const routes = await generateCuisineComparison(input)

    expect(mocks.searchSocialFoodEvidence).toHaveBeenCalledTimes(1)
    const copy = routes?.map(route => [
      route.name,
      route.tagline,
      route.direction,
      route.reason,
      route.tips,
    ].join(' ')).join(' ') ?? ''
    expect(copy).not.toMatch(/最多打卡|人气爆棚/)
    for (const stop of routes?.flatMap(route => route.stops) ?? []) {
      expect(stop.recommendationType).toBe('amap_fallback')
      expect(stop.socialEvidence).toBeUndefined()
      expect(stop.evidenceSummary).toBe('高德高分补充')
    }
  })
})
