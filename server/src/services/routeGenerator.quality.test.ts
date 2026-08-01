import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AmapPOI } from '../types/poi.js'

const mocks = vi.hoisted(() => ({
  searchNearbyPOIs: vi.fn(),
  generatePlan: vi.fn(),
  reverseGeocode: vi.fn(),
  getWeather: vi.fn(),
}))

vi.mock('./amap/poiSearch.js', () => ({ searchNearbyPOIs: mocks.searchNearbyPOIs }))
vi.mock('./amap/geocode.js', () => ({ reverseGeocode: mocks.reverseGeocode }))
vi.mock('./amap/weather.js', () => ({ getWeather: mocks.getWeather }))
vi.mock('./aiPlannerService.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./aiPlannerService.js')>()
  return { ...original, generatePlan: mocks.generatePlan }
})

import { generateRoutes } from './routeGenerator.js'

let mockOrigin = { lat: 31.2304, lng: 121.4737 }

function poi(
  id: string,
  name: string,
  distance: number,
  typecode: string,
  parentId?: string,
): AmapPOI {
  return {
    id, name, distance, typecode, parentId,
    type: '', address: `${name}地址`, lng: mockOrigin.lng + distance / 1000000,
    lat: mockOrigin.lat, rating: '4.5', cost: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOrigin = { lat: 31.2304, lng: 121.4737 }
  mocks.generatePlan.mockResolvedValue({ routes: [], source: 'fallback', fallbackReason: '测试降级' })
  mocks.reverseGeocode.mockResolvedValue({
    province: '测试省', city: '测试市', district: '测试区', township: '', adcode: '310101',
  })
  mocks.getWeather.mockResolvedValue(null)
})

describe('route generation quality acceptance with mocked providers', () => {
  it('passes a manually selected area through planning and fallback recall', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([])

    const result = await generateRoutes({
      lat: 30.67, lng: 104.06, timeOption: 120, distance: 3000,
      preferences: ['food'], cuisineTypes: ['local_cuisine'], areaName: '宽窄巷子',
    })

    expect(mocks.generatePlan).toHaveBeenCalledWith(expect.objectContaining({ areaName: '宽窄巷子' }))
    expect(mocks.searchNearbyPOIs).toHaveBeenCalledWith(expect.objectContaining({ areaName: '宽窄巷子' }))
    expect(result.diagnostics).toEqual({
      recalled: 0,
      rejectedByType: 'unknown',
      rejectedByDistance: 'unknown',
      qualified: 0,
    })
  })

  it('uses the existing planning city when GPS requests omit areaName', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([])

    await generateRoutes({
      lat: 31.23, lng: 121.47, timeOption: 120, distance: 1000,
      preferences: ['wander'], wanderTypes: ['shopping'],
    })

    expect(mocks.generatePlan).toHaveBeenCalledWith(expect.objectContaining({ areaName: '测试区' }))
    expect(mocks.searchNearbyPOIs).toHaveBeenCalledWith(expect.objectContaining({ areaName: '测试区' }))
  })

  it('上海外滩: fills relevant two-hour noodle routes without xiaolong duplication', async () => {
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('n1', '本帮面一店', 100, '050300'), poi('n2', '蟹黄面二店', 150, '050300'),
      poi('n3', '葱油拌面三店', 200, '050300'), poi('n4', '焖肉面四店', 250, '050300'),
      poi('n5', '大排面五店', 300, '050300'), poi('n6', '老上海面馆六店', 350, '050300'),
      poi('n7', '传统面庄七店', 400, '050300'), poi('n8', '蟹黄面八店', 450, '050300'),
      poi('n9', '葱油拌面九店', 500, '050300'), poi('x1', '上海小笼馆', 120, '050300'),
    ])

    const result = await generateRoutes({
      lat: 31.2304, lng: 121.4737, timeOption: 120, distance: 1000,
      preferences: ['food'], cuisineTypes: ['noodles'], customCuisine: ['本帮面'],
    })
    const stops = result.routes.flatMap(route => route.stops)
    expect(result.routes).toHaveLength(3)
    expect(result.routes.every(route => route.stops.length >= 3 && route.stops.length <= 4)).toBe(true)
    expect(stops.some(stop => stop.name.includes('小笼'))).toBe(false)
    expect(new Set(stops.map(stop => stop.amapPoiId)).size).toBe(stops.length)
    expect(result.diagnostics).toEqual({
      recalled: 10,
      rejectedByType: 'unknown',
      rejectedByDistance: 'unknown',
      qualified: 9,
    })
  })

  it('杭州西湖: collapses parent details, rejects internal remains and warns about boats', async () => {
    mockOrigin = { lat: 30.243, lng: 120.15 }
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('island', '小瀛洲', 100, '110000'),
      poi('west-lake', '西湖风景名胜区', 150, '110000'),
      poi('child-hall', '镜湖厅', 160, '110000', 'west-lake'),
      poi('child-stone', '奏事殿阶沿石遗构', 170, '110000', 'west-lake'),
      ...Array.from({ length: 12 }, (_, index) =>
        poi(`s${index}`, `西湖人文景点${index + 1}`, 220 + index * 40, '110000')),
    ])

    const result = await generateRoutes({
      lat: 30.243, lng: 120.15, timeOption: 240, distance: 3000,
      preferences: ['scenic'], scenicTypes: ['popular', 'street'],
    })
    const names = result.routes.flatMap(route => route.stops.map(stop => stop.name))
    expect(names).toContain('西湖风景名胜区')
    expect(names).not.toContain('镜湖厅')
    expect(names).not.toContain('奏事殿阶沿石遗构')
    expect(result.routes.some(route => route.tips.includes('乘船'))).toBe(true)
    expect(result.routes.every(route => !/路线\d+$/.test(route.name))).toBe(true)
    expect(JSON.stringify(result.routes)).not.toContain('parentPoiId')
    expect(JSON.stringify(result.routes)).not.toContain('candidateStops')
  })

  it('北京南锣鼓巷: caps one-hour routes, filters closed homes and uses walking only', async () => {
    mockOrigin = { lat: 39.938, lng: 116.4035 }
    mocks.searchNearbyPOIs.mockResolvedValue([
      poi('c1', '胡同咖啡馆', 80, '050500'), poi('c2', '老北京茶馆', 120, '050500'),
      poi('c3', '南锣书店', 160, '060000'), poi('c4', '某故居（不对外开放）', 180, '140000'),
      poi('c5', '胡同文化空间', 220, '140000'), poi('c6', '街角咖啡', 260, '050500'),
      poi('c7', '小众园林', 300, '110000'), poi('c8', '老街文创店', 340, '060000'),
    ])

    const result = await generateRoutes({
      lat: 39.938, lng: 116.4035, timeOption: 60, distance: 500,
      preferences: ['wander'], wanderTypes: ['cafe', 'hidden'],
    })
    expect(result.routes.every(route => route.stops.length <= 3)).toBe(true)
    expect(result.routes.flatMap(route => route.stops).some(stop => stop.name.includes('不对外开放'))).toBe(false)
    expect(result.routes.every(route => route.tips.includes('步行') && !route.tips.includes('共享单车'))).toBe(true)
    expect(result.routes.flatMap(route => route.stops).every(stop => stop.distanceMeters !== 0)).toBe(true)
  })
})
