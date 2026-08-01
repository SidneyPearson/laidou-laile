import { describe, expect, it } from 'vitest'
import type { Route, Stop } from '../../types/route.js'
import { syncFoodListPresentation } from './foodPresentation.js'

function stop(name: string, withEvidence = false): Stop {
  return {
    name,
    address: '测试地址',
    visitDurationMinutes: 30,
    notes: '推荐理由',
    amapPoiId: name,
    lng: 121.5,
    lat: 31.2,
    ...(withEvidence ? {
      socialEvidence: [{
        platform: '小红书' as const,
        title: `${name}打卡推荐`,
        url: 'https://www.xiaohongshu.com/explore/1',
        confidence: 0.9,
      }],
    } : {}),
  }
}

function route(stops: Stop[]): Route {
  return {
    id: 'food-list',
    name: '附近美食清单',
    tagline: 'AI 精选 6 家，按评分排序',
    stops,
    totalDurationMinutes: 90,
    walkingDistanceMeters: 300,
    tips: '旧提示',
    direction: '深度 · 一处慢逛',
    divergenceExempt: true,
  }
}

describe('syncFoodListPresentation', () => {
  it('rebuilds the count after final filtering and removes route language', () => {
    const result = syncFoodListPresentation(route([
      stop('餐厅一', true), stop('餐厅二'), stop('餐厅三'),
    ]))
    expect(result.name).toBe('附近热门美食')
    expect(result.tagline).toBe('热门美食精选，共 3 家')
    expect(result.direction).toBeUndefined()
    expect(result.tips).toContain('公开网页搜索')
  })

  it('uses an honest Amap-only fallback when no evidence exists', () => {
    const result = syncFoodListPresentation(route([stop('餐厅一'), stop('餐厅二')]))
    expect(result.tagline).toBe('附近热门餐厅，共 2 家')
    expect(result.tips).not.toContain('美团')
    expect(result.tips).not.toContain('小红书')
  })

  it('does not use platform copy for legacy evidence without confidence', () => {
    const legacyStop = stop('旧版餐厅')
    legacyStop.recommendationType = 'social_hot'
    legacyStop.socialEvidence = [{
      platform: '小红书',
      title: '旧版笔记',
      url: 'https://www.xiaohongshu.com/explore/legacy',
    }]

    const result = syncFoodListPresentation(route([legacyStop]))
    expect(result.tagline).toBe('附近热门餐厅，共 1 家')
    expect(result.stops[0]).toMatchObject({
      recommendationType: 'amap_fallback',
      socialScore: 0,
      evidenceSummary: '高德高分补充',
    })
    expect(result.stops[0].socialEvidence).toBeUndefined()
  })

  it('recognizes kind as the canonical food-list marker regardless of an old name', () => {
    const result = syncFoodListPresentation({
      ...route([stop('餐厅一')]),
      kind: 'food_list',
      name: '模型生成的旧标题',
    })

    expect(result.name).toBe('附近热门美食')
    expect(result.tagline).toBe('附近热门餐厅，共 1 家')
  })
})
