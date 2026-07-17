import { describe, expect, it } from 'vitest'
import type { Route, Stop } from '../../types/route.js'
import { applyRoutePolicies } from './routePolicy.js'

const origin = { lat: 31.2304, lng: 121.4737 }
const stop = (name: string, offset: number, visitDurationMinutes = 30): Stop => ({
  name, address: '测试地址', visitDurationMinutes, notes: '距您约0m',
  amapPoiId: name, lat: origin.lat + offset, lng: origin.lng,
  distanceMeters: 0,
})
const route = (name: string, stops: Stop[]): Route => ({
  id: name, name, tagline: '', stops, totalDurationMinutes: 999,
  walkingDistanceMeters: 0, tips: '可步行+共享单车结合',
})

describe('real-world policy fixtures', () => {
  it('上海外滩: custom 本帮面 removes xiaolong and keeps routes distinct', () => {
    const result = applyRoutePolicies([
      route('美食路线1', [stop('老上海蟹黄面馆', 0.001), stop('上海小笼馆', 0.0011)]),
      route('美食路线2', [stop('阿娘葱油拌面', 0.0012)]),
      route('美食路线3', [stop('本帮焖肉面', 0.0013)]),
    ], { origin, timeMinutes: 120, explorationDistance: 1000, preferences: ['food'], customKeywords: ['本帮面'] })

    const names = result.routes.flatMap(r => r.stops.map(s => s.name))
    expect(names).not.toContain('上海小笼馆')
    expect(new Set(names).size).toBe(names.length)
    expect(result.routes.every(r => r.stops.length <= 4)).toBe(true)
  })

  it('杭州西湖: unavailable details are not used and water access is warned', () => {
    const result = applyRoutePolicies([
      route('景点路线1', [stop('西湖风景名胜区', 0.001, 45), stop('小瀛洲', 0.002, 40)]),
      route('景点路线2', [stop('某故居（不对外开放）', 0.0021), stop('北山街', 0.0022, 40)]),
    ], { origin, timeMinutes: 240, explorationDistance: 3000, preferences: ['scenic'] })

    expect(result.routes.flatMap(r => r.stops).some(s => s.name.includes('不对外开放'))).toBe(false)
    expect(result.routes[0].tips).toContain('乘船')
    expect(result.routes.every(r => !/路线\d+$/.test(r.name))).toBe(true)
  })

  it('北京南锣鼓巷: one hour/500m caps stops and uses walking only', () => {
    const result = applyRoutePolicies([
      route('休闲路线1', [
        stop('胡同咖啡', 0.0005, 25), stop('茶馆', 0.001, 25),
        stop('书店', 0.0015, 25), stop('某故居不对外开放', 0.002, 25), stop('公园', 0.0025, 25),
      ]),
    ], { origin, timeMinutes: 60, explorationDistance: 500, preferences: ['wander'] })

    expect(result.routes[0].stops.length).toBeLessThanOrEqual(3)
    expect(result.routes[0].tips).toContain('步行')
    expect(result.routes[0].tips).not.toContain('共享单车')
    expect(result.routes[0].stops.every(s => (s.distanceMeters ?? 0) > 0)).toBe(true)
  })
})
