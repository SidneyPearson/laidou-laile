import { describe, expect, it } from 'vitest'
import type { Route, SocialEvidence, Stop } from '../../types/route.js'
import { enforceEvidencePolicy } from './evidencePolicy.js'
import { evidenceScore } from './foodRanking.js'

const baseStop: Stop = {
  name: '茶然居',
  address: '测试路1号',
  visitDurationMinutes: 30,
  notes: '测试门店',
  amapPoiId: 'poi-1',
  lng: 116.4,
  lat: 39.9,
}

function stop(overrides: Partial<Stop> = {}): Stop {
  return { ...baseStop, ...overrides }
}

function foodRoute(item: Stop): Route {
  return {
    id: 'food-route',
    kind: 'food_list',
    name: '附近热门美食',
    tagline: '热门美食精选，共 1 家',
    stops: [item],
    totalDurationMinutes: 30,
    walkingDistanceMeters: 100,
    tips: '测试',
  }
}

const validEvidence: SocialEvidence = {
  platform: '小红书',
  title: '茶然居探店笔记',
  url: 'https://www.xiaohongshu.com/explore/1',
  confidence: 0.92,
}

describe('enforceEvidencePolicy', () => {
  it('downgrades an unsupported social_hot claim to an honest Amap fallback', () => {
    const guarded = enforceEvidencePolicy(foodRoute(stop({
      recommendationType: 'social_hot',
      socialScore: 88,
      evidenceSummary: '小红书热门',
      popularityReason: '抖音与小红书多人推荐',
    })))

    expect(guarded.stops[0]).toMatchObject({
      recommendationType: 'amap_fallback',
      socialScore: 0,
      evidenceSummary: '高德高分补充',
    })
    expect(guarded.stops[0].socialEvidence).toBeUndefined()
    expect(guarded.stops[0].popularityReason).toBeUndefined()
  })

  it('keeps social_hot only when at least one valid evidence item survives', () => {
    const guarded = enforceEvidencePolicy(foodRoute(stop({
      recommendationType: 'social_hot',
      socialScore: 80,
      socialEvidence: [validEvidence],
    })))

    expect(guarded.stops[0].recommendationType).toBe('social_hot')
    expect(guarded.stops[0].socialEvidence).toEqual([validEvidence])
  })

  it.each([
    ['unsupported platform/domain pairing', {
      ...validEvidence,
      platform: '抖音' as const,
    }],
    ['non-HTTPS URL', {
      ...validEvidence,
      url: 'http://www.xiaohongshu.com/explore/1',
    }],
    ['lookalike domain', {
      ...validEvidence,
      url: 'https://xiaohongshu.com.evil.example/explore/1',
    }],
    ['empty title', {
      ...validEvidence,
      title: '   ',
    }],
    ['low confidence', {
      ...validEvidence,
      confidence: 0.69,
    }],
    ['legacy evidence without confidence', {
      platform: '小红书' as const,
      title: '旧版探店笔记',
      url: 'https://www.xiaohongshu.com/explore/legacy',
    }],
  ])('rejects %s', (_label, invalidEvidence) => {
    const guarded = enforceEvidencePolicy(foodRoute(stop({
      recommendationType: 'social_hot',
      socialEvidence: [invalidEvidence],
      popularityReason: '平台热门',
    })))

    expect(guarded.stops[0]).toMatchObject({
      recommendationType: 'amap_fallback',
      socialScore: 0,
      evidenceSummary: '高德高分补充',
    })
    expect(guarded.stops[0].socialEvidence).toBeUndefined()
    expect(guarded.stops[0].popularityReason).toBeUndefined()
  })

  it.each<SocialEvidence>([
    {
      platform: '美团',
      title: '美团门店页',
      url: 'https://www.meituan.com/meishi/1',
      confidence: 0.7,
    },
    {
      platform: '美团',
      title: '大众点评门店页',
      url: 'https://www.dianping.com/shop/1',
      confidence: 0.81,
    },
    {
      platform: '抖音',
      title: '抖音探店视频',
      url: 'https://www.douyin.com/video/1',
      confidence: 0.88,
    },
  ])('accepts a supported platform domain', (evidence) => {
    const guarded = enforceEvidencePolicy(foodRoute(stop({
      recommendationType: 'social_hot',
      socialEvidence: [evidence],
    })))
    expect(guarded.stops[0].socialEvidence).toEqual([evidence])
    expect(guarded.stops[0].recommendationType).toBe('social_hot')
  })

  it('filters invalid evidence while retaining valid evidence', () => {
    const guarded = enforceEvidencePolicy(foodRoute(stop({
      recommendationType: 'social_hot',
      socialEvidence: [
        validEvidence,
        { ...validEvidence, url: 'https://example.com/fake' },
      ],
    })))

    expect(guarded.stops[0].socialEvidence).toEqual([validEvidence])
  })

  it('recomputes platform summary and score from only surviving evidence', () => {
    const validDouyin: SocialEvidence = {
      platform: '抖音',
      title: '茶然居抖音探店',
      url: 'https://www.douyin.com/video/tea-valid',
      confidence: 0.88,
    }
    const invalidXiaohongshu: SocialEvidence = {
      platform: '小红书',
      title: '伪造的小红书链接',
      url: 'https://example.com/not-xiaohongshu',
      confidence: 0.99,
    }
    const preFilterScore = evidenceScore([validDouyin, invalidXiaohongshu])

    const guarded = enforceEvidencePolicy(foodRoute(stop({
      recommendationType: 'social_hot',
      socialEvidence: [validDouyin, invalidXiaohongshu],
      socialScore: preFilterScore,
      evidenceSummary: '2个平台公开提及',
    })))

    expect(guarded.stops[0].socialEvidence).toEqual([validDouyin])
    expect(guarded.stops[0].evidenceSummary).toBe('1个平台公开提及')
    expect(guarded.stops[0].socialScore).toBe(evidenceScore([validDouyin]))
    expect(guarded.stops[0].socialScore).toBeLessThan(preFilterScore)
  })
})
