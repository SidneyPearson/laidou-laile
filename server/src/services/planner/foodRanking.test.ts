import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SocialEvidence } from '../../types/route.js'

const plannerMocks = vi.hoisted(() => ({
  searchNearbyPOIs: vi.fn(),
  searchSocialFoodEvidence: vi.fn(),
  chatCompletionWithFallback: vi.fn(),
}))

vi.mock('../amap/poiSearch.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../amap/poiSearch.js')>()
  return { ...original, searchNearbyPOIs: plannerMocks.searchNearbyPOIs }
})

vi.mock('./socialFoodSearch.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./socialFoodSearch.js')>()
  return { ...original, searchSocialFoodEvidence: plannerMocks.searchSocialFoodEvidence }
})

vi.mock('../llm/client.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../llm/client.js')>()
  return { ...original, chatCompletionWithFallback: plannerMocks.chatCompletionWithFallback }
})

import {
  rankFoodCandidates,
  scoreFoodCandidate,
  type FoodCandidate,
} from './foodRanking.js'
import { generateFoodList } from './foodPlanner.js'

afterEach(() => vi.clearAllMocks())

function candidate(name: string, options: {
  rating: string | null
  distance: number
  evidence?: SocialEvidence[]
}): FoodCandidate {
  return {
    id: name,
    name,
    address: `${name}地址`,
    type: '餐饮服务',
    typecode: '050000',
    lng: 116.4,
    lat: 39.9,
    cost: null,
    parentId: null,
    rating: options.rating,
    distance: options.distance,
    socialEvidence: options.evidence,
  }
}

const xhsEvidence: SocialEvidence[] = [{
  platform: '小红书',
  title: '茶然居探店',
  url: 'https://www.xiaohongshu.com/explore/1',
  confidence: 0.95,
}]

describe('deterministic food ranking', () => {
  it('ranks by the fixed 40/25/20/10 breakdown and applies a -5 chain penalty', () => {
    const ranked = rankFoodCandidates([
      candidate('肯德基', { rating: '4.8', distance: 100 }),
      candidate('茶然居', { rating: '4.5', distance: 350, evidence: xhsEvidence }),
      candidate('阿娘面馆', { rating: '4.7', distance: 500 }),
    ], { maxDistance: 1000, cuisinePattern: /面馆|茶/ })

    expect(ranked.map(item => item.poi.name)).toEqual(['茶然居', '阿娘面馆', '肯德基'])
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
    expect(ranked[2].breakdown.chainPenalty).toBe(-5)
    expect(ranked[0].breakdown).toMatchObject({
      amapRating: 22.5,
      cuisine: 20,
      distance: 6.5,
      chainPenalty: 0,
    })
    expect(ranked[0].breakdown.social).toBeLessThanOrEqual(40)
  })

  it('keeps socialScore as a 0..100 evidence score, separate from the total score', () => {
    const result = scoreFoodCandidate(
      candidate('茶然居', { rating: '5', distance: 0, evidence: xhsEvidence }),
      { maxDistance: 1000, cuisinePattern: /茶/ },
    )

    expect(result.socialScore).toBe(58)
    expect(result.breakdown.social).toBe(23.2)
    expect(result.score).toBe(78.2)
    expect(result.score).not.toBe(result.socialScore)
    expect(result.recommendationType).toBe('social_hot')
  })

  it('rewards distinct platforms and confidence without double-counting one platform', () => {
    const onePlatform = scoreFoodCandidate(candidate('茶然居', {
      rating: '0',
      distance: 1000,
      evidence: xhsEvidence,
    }), { maxDistance: 1000 }).socialScore
    const duplicatePlatform = scoreFoodCandidate(candidate('茶然居', {
      rating: '0',
      distance: 1000,
      evidence: [
        ...xhsEvidence,
        { ...xhsEvidence[0], url: 'https://www.xiaohongshu.com/explore/2', confidence: 0.7 },
      ],
    }), { maxDistance: 1000 }).socialScore
    const twoPlatforms = scoreFoodCandidate(candidate('茶然居', {
      rating: '0',
      distance: 1000,
      evidence: [
        ...xhsEvidence,
        {
          platform: '抖音',
          title: '茶然居探店',
          url: 'https://www.douyin.com/video/1',
          confidence: 0.95,
        },
      ],
    }), { maxDistance: 1000 }).socialScore
    const lowerConfidence = scoreFoodCandidate(candidate('茶然居', {
      rating: '0',
      distance: 1000,
      evidence: [{ ...xhsEvidence[0], confidence: 0.7 }],
    }), { maxDistance: 1000 }).socialScore

    expect(duplicatePlatform).toBe(onePlatform)
    expect(twoPlatforms).toBeGreaterThan(onePlatform)
    expect(onePlatform).toBeGreaterThan(lowerConfidence)
  })

  it('clamps malformed rating and distance inputs to their component ranges', () => {
    const result = scoreFoodCandidate(
      candidate('普通餐厅', { rating: '9', distance: -50 }),
      { maxDistance: 1000, cuisinePattern: /普通/ },
    )

    expect(result.breakdown).toEqual({
      social: 0,
      amapRating: 25,
      cuisine: 20,
      distance: 10,
      chainPenalty: 0,
    })
    expect(result.score).toBe(55)
  })

  it('keeps rule order and membership when AI reorders, adds, or omits shops', async () => {
    plannerMocks.searchNearbyPOIs.mockResolvedValue([
      candidate('肯德基', { rating: '4.8', distance: 100 }),
      candidate('茶然居', { rating: '4.5', distance: 350 }),
      candidate('阿娘面馆', { rating: '4.7', distance: 500 }),
    ])
    plannerMocks.searchSocialFoodEvidence.mockResolvedValue([{
      title: '小红书｜茶然居探店',
      content: '茶然居值得打卡',
      url: 'https://www.xiaohongshu.com/explore/tea-ranking',
    }])
    plannerMocks.chatCompletionWithFallback.mockResolvedValue(JSON.stringify({
      foodList: [
        { name: '肯德基', comment: '模型先返回连锁店' },
        { name: '不存在的餐厅', comment: '不能新增' },
        { name: '茶然居', comment: '公开平台有提及' },
      ],
    }))

    const routes = await generateFoodList({
      position: { lat: 31.2, lng: 121.5 },
      city: '上海市',
      weather: '晴',
      timeMinutes: 120,
      distance: 1000,
      preferences: ['food'],
      customCuisine: ['面馆', '茶'],
      adcode: '310000',
    })

    expect(routes?.[0].stops.map(stop => stop.name)).toEqual([
      '茶然居',
      '阿娘面馆',
      '肯德基',
    ])
    expect(routes?.[0].stops[0]).toMatchObject({
      recommendationType: 'social_hot',
      socialScore: 51,
      rankingReason: '公开平台有提及',
      evidenceSummary: '1个平台公开提及',
    })
    expect(routes?.[0].stops[1]).toMatchObject({
      recommendationType: 'amap_fallback',
      socialScore: 0,
      evidenceSummary: '高德高分补充',
    })
    expect(routes?.[0].stops[1].rankingReason).toContain('高德评分 4.7')
  })
})
