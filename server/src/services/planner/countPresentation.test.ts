import { describe, expect, it } from 'vitest'
import type { Route, Stop } from '../../types/route.js'
import { syncCountPresentation } from './countPresentation.js'

function stop(name: string): Stop {
  return {
    name,
    address: '测试地址',
    visitDurationMinutes: 30,
    notes: '推荐理由',
    amapPoiId: name,
    lng: 121.5,
    lat: 31.2,
  }
}

function route(tagline: string, stops: Stop[]): Route {
  return {
    id: 'route',
    name: '测试路线',
    tagline,
    stops,
    totalDurationMinutes: 90,
    walkingDistanceMeters: 300,
    tips: '测试提示',
  }
}

describe('syncCountPresentation', () => {
  it('updates TOP N from the final comparison stops', () => {
    const result = syncCountPresentation(route(
      '评分最高 · 火锅 TOP3',
      [stop('火锅一'), stop('火锅二')],
    ))

    expect(result.tagline).toBe('评分最高 · 火锅 TOP2')
  })

  it('updates N个地点 from the final itinerary stops', () => {
    const result = syncCountPresentation(route(
      '5个地点',
      [stop('地点一'), stop('地点二'), stop('地点三'), stop('地点四')],
    ))

    expect(result.tagline).toBe('4个地点')
  })

  it('updates 共 N 家 copy without changing unrelated numbers', () => {
    const result = syncCountPresentation(route(
      '步行500m，附近餐厅，共 6 家',
      [stop('餐厅一'), stop('餐厅二')],
    ))

    expect(result.tagline).toBe('步行500m，附近餐厅，共 2 家')
  })

  it('delegates food-list wording to the food presentation policy', () => {
    const result = syncCountPresentation({
      ...route('AI 精选 6 家，按评分排序', [stop('餐厅一')]),
      kind: 'food_list',
    })

    expect(result.name).toBe('附近热门美食')
    expect(result.tagline).toBe('附近热门餐厅，共 1 家')
    expect(result.kind).toBe('food_list')
  })
})
