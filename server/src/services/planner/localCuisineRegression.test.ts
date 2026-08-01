import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AmapPOI } from '../../types/poi.js'

const get = vi.hoisted(() => vi.fn())
vi.mock('../amap/client.js', () => ({
  getAmapClient: () => ({ get }),
}))

import { generatePlan } from './generatePlan.js'
import { buildFallbackRoutes } from './fallbackPlanner.js'
import { applyRoutePolicies } from './routePolicy.js'
import { buildCategoryKeywords, buildCategoryTypecodePrefixes } from './preferenceCriteria.js'

function rawPoi(id: string, name: string, type: string, typecode: string, distance: number) {
  return {
    id, name, type, typecode, distance: String(distance),
    address: `${name}地址`, location: `${104.06 + distance / 1_000_000},30.67`,
    biz_ext: { rating: '4.7', cost: '70' },
  }
}

function poi(id: string, name: string, typecode: string, distance: number): AmapPOI {
  return {
    id, name, typecode, distance, type: typecode.startsWith('05') ? '餐饮服务' : '风景名胜',
    address: `${name}地址`, lng: 108.94 + distance / 1_000_000, lat: 34.26,
    rating: '4.7', cost: null,
  }
}

describe('real local-cuisine regressions', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('keeps Chengdu 川菜 POIs even when their names do not contain 本地菜 or 特色菜', async () => {
    get.mockResolvedValue({ data: { pois: [
      rawPoi('cd-1', '成都吃客', '餐饮服务;中餐厅;四川菜(川菜)', '050102', 260),
      rawPoi('cd-2', '饕林餐厅', '餐饮服务;中餐厅;四川菜(川菜)', '050102', 520),
      rawPoi('cd-3', '普通西餐厅', '餐饮服务;外国餐厅;西餐厅', '050200', 180),
      rawPoi('cd-4', '东北劲水饺馆', '餐饮服务;中餐厅;特色/地方风味餐厅', '050118', 160),
    ] } })

    const result = await generatePlan({
      position: { lat: 30.67, lng: 104.06 }, areaName: '宽窄巷子',
      city: '青羊区', weather: '晴', timeMinutes: 120, distance: 3000,
      preferences: ['food'], cuisineTypes: ['local_cuisine'], adcode: '510105',
    })

    expect(result.routes.length).toBeGreaterThan(0)
    const names = result.routes.flatMap(route => route.stops.map(stop => stop.name))
    expect(names).toContain('成都吃客')
    expect(names).toContain('饕林餐厅')
    expect(names).not.toContain('普通西餐厅')
    expect(names).not.toContain('东北劲水饺馆')
    const keywords = get.mock.calls[0]?.[1]?.params?.keywords as string
    expect(keywords).toContain('川菜')
  })

  it('retains both Xi’an food and scenic candidates in the leading mixed fallback route', () => {
    const candidates = [
      poi('xa-s1', '钟楼', '110000', 80),
      poi('xa-s2', '鼓楼', '110000', 120),
      poi('xa-s3', '化觉巷清真大寺', '110000', 150),
      poi('xa-f1', '老米家泡馍(鼓楼景观店)', '050121', 220),
      poi('xa-f2', '君诚斋老米家泡馍馆(回民街店)', '050121', 280),
    ]
    const categoryInput = {
      city: '西安市', areaName: '回民街',
      cuisineTypes: ['local_cuisine'], scenicTypes: ['popular'],
    }
    const result = applyRoutePolicies(
      buildFallbackRoutes(candidates, 240, ['food', 'scenic']),
      {
        origin: { lat: 34.26, lng: 108.94 }, timeMinutes: 240,
        explorationDistance: 3000, preferences: ['food', 'scenic'],
        categoryKeywordsByPreference: buildCategoryKeywords(categoryInput),
        categoryTypecodePrefixesByPreference: buildCategoryTypecodePrefixes(categoryInput),
      },
    )

    expect(result.routes.length).toBeGreaterThan(0)
    const firstNames = result.routes[0].stops.map(stop => stop.name)
    expect(firstNames).toContain('老米家泡馍(鼓楼景观店)')
    expect(firstNames.some(name => ['钟楼', '鼓楼', '化觉巷清真大寺'].includes(name))).toBe(true)
  })

  it('does not let museum scores/time fitting evict the captured 050121 food candidate', () => {
    const candidates = [
      poi('xa-f1', '老米家泡馍(鼓楼景观店)', '050121', 220),
      ...Array.from({ length: 8 }, (_, index) =>
        poi(`museum-${index}`, `西安历史博物馆${index + 1}`, '140100', 80 + index * 30)),
    ]
    const categoryInput = {
      city: '西安市', areaName: '回民街',
      cuisineTypes: ['local_cuisine'], scenicTypes: ['popular'],
    }
    const result = applyRoutePolicies(
      buildFallbackRoutes(candidates, 240, ['food', 'scenic']),
      {
        origin: { lat: 34.26, lng: 108.94 }, timeMinutes: 240,
        explorationDistance: 3000, preferences: ['food', 'scenic'],
        categoryKeywordsByPreference: buildCategoryKeywords(categoryInput),
        categoryTypecodePrefixesByPreference: buildCategoryTypecodePrefixes(categoryInput),
      },
    )

    expect(result.routes).toHaveLength(1)
    expect(result.routes[0].stops.map(stop => stop.name)).toEqual(expect.arrayContaining([
      '老米家泡馍(鼓楼景观店)',
      '西安历史博物馆1',
    ]))
  })
})
