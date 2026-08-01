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

  it('uses a shared high-quality reservoir to fill a two-hour route when candidates are sufficient', () => {
    const candidateStops = [
      stop('候选面馆A', 0.001), stop('候选面馆B', 0.0012),
      stop('候选面馆C', 0.0014), stop('候选面馆D', 0.0016),
    ].map(s => ({ ...s, preferenceScope: 'food' as const, typecode: '050300' }))
    const inputRoute = {
      ...route('美食路线1', [candidateStops[0]]),
      candidateStops,
    }
    const result = applyRoutePolicies([inputRoute], {
      origin, timeMinutes: 120, explorationDistance: 1000, preferences: ['food'],
    })
    expect(result.routes[0].stops.length).toBeGreaterThanOrEqual(3)
    expect(result.routes[0].stops.length).toBeLessThanOrEqual(4)
  })

  it('deduplicates parent and child POIs and strips internal metadata', () => {
    const parent = { ...stop('西湖风景名胜区', 0.001, 45), amapPoiId: 'west-lake', typecode: '110000' }
    const child = {
      ...stop('镜湖厅', 0.0011, 30), amapPoiId: 'mirror-hall', parentPoiId: 'west-lake', typecode: '110000',
    }
    const result = applyRoutePolicies([route('景点路线1', [child, parent])], {
      origin, timeMinutes: 240, explorationDistance: 3000, preferences: ['scenic'],
    })
    expect(result.routes[0].stops.map(s => s.name)).toEqual(['西湖风景名胜区'])
    expect(result.routes[0].stops[0]).not.toHaveProperty('parentPoiId')
    expect(result.routes[0].stops[0]).not.toHaveProperty('typecode')
  })

  it('never uses downranked internal details merely to reach the stop minimum', () => {
    const result = applyRoutePolicies([{
      ...route('景点路线1', [stop('西湖主景点', 0.001, 45)]),
      candidateStops: [
        stop('西湖主景点', 0.001, 45),
        { ...stop('翠光亭', 0.0012, 30), address: '柳浪闻莺公园内', typecode: '110000' },
        { ...stop('博物馆壁画展品(打卡点)', 0.0014, 30), address: '西湖博物馆内', typecode: '140000' },
      ],
    }], { origin, timeMinutes: 240, explorationDistance: 3000, preferences: ['scenic'] })
    expect(result.routes[0].stops.map(s => s.name)).toEqual(['西湖主景点'])
    expect(result.fallbackReason).toContain('候选较少')
  })

  it('applies category-specific custom keywords in mixed-preference routes', () => {
    const result = applyRoutePolicies([
      route('混合路线', [
        { ...stop('上海小笼馆', 0.001), typecode: '050300' },
        { ...stop('阿娘葱油拌面', 0.0012), typecode: '050300' },
        { ...stop('胡同咖啡馆', 0.0014), typecode: '050500' },
      ]),
    ], {
      origin, timeMinutes: 120, explorationDistance: 1000, preferences: ['food', 'wander'],
      customKeywordsByPreference: { food: ['本帮面'], wander: ['咖啡'] },
    })
    const names = result.routes[0].stops.map(s => s.name)
    expect(names).not.toContain('上海小笼馆')
    expect(names).toContain('阿娘葱油拌面')
    expect(names).toContain('胡同咖啡馆')
  })

  it('explains candidate shortage when routes cannot reach their recommended target', () => {
    const shared = stop('唯一候选', 0.001)
    const result = applyRoutePolicies([
      route('路线1', [shared]), route('路线2', [shared]), route('路线3', [shared]),
    ], { origin, timeMinutes: 120, explorationDistance: 1000, preferences: ['wander'] })
    expect(result.routes).toHaveLength(3)
    expect(result.fallbackReason).toContain('候选较少')
  })

  it('enforces enum-backed wander sub-preferences at the final selection layer', () => {
    const result = applyRoutePolicies([route('休闲路线', [
      {
        ...stop('京东便民站', 0.001),
        address: '南锣鼓巷与沙井胡同交叉口',
        notes: '南锣鼓巷与沙井胡同交叉口',
        typecode: '070000',
      },
      { ...stop('胡同咖啡馆', 0.0012, 20), typecode: '050500' },
      { ...stop('某某园林', 0.0014, 20), typecode: '110000' },
    ])], {
      origin, timeMinutes: 60, explorationDistance: 500, preferences: ['wander'],
      categoryKeywordsByPreference: { wander: ['咖啡', '茶馆', '园林', '胡同'] },
    })
    const names = result.routes[0].stops.map(s => s.name)
    expect(names).not.toContain('京东便民站')
    expect(names).toContain('胡同咖啡馆')
    expect(names).toContain('某某园林')
  })

  it('treats multiple wander subtypes as OR and accepts provider type evidence', () => {
    const result = applyRoutePolicies([route('休闲路线', [
      { ...stop('Wiggly Jiggly’s五月', 0.001, 20), typecode: '050501' },
      { ...stop('五号停机坪', 0.0012, 25), typecode: '110200' },
      { ...stop('京东便民站', 0.0014, 20), typecode: '070000' },
    ])], {
      origin, timeMinutes: 60, explorationDistance: 500, preferences: ['wander'],
      categoryKeywordsByPreference: { wander: ['咖啡', '茶馆', '故居', '寺庙', '园林', '胡同'] },
      categoryTypecodePrefixesByPreference: { wander: ['0505', '11'] },
    })

    expect(result.routes[0].stops.map(s => s.name)).toEqual([
      'Wiggly Jiggly’s五月', '五号停机坪',
    ])
  })

  it('keeps legal shops for shopping but rejects them from scenic-street routes', () => {
    const ordinaryShop = { ...stop('花鳖专卖店', 0.001, 25), typecode: '061200' }
    const shopping = applyRoutePolicies([route('购物路线', [ordinaryShop])], {
      origin, timeMinutes: 60, explorationDistance: 500, preferences: ['wander'],
      categoryKeywordsByPreference: { wander: ['商场', '购物中心', '步行街', '集市'] },
      categoryTypecodePrefixesByPreference: { wander: ['06'] },
    })
    const scenic = applyRoutePolicies([route('特色街区', [
      ordinaryShop,
      { ...stop('河坊街历史文化街区', 0.0012, 40), typecode: '060400' },
      { ...stop('胡庆余堂中药博物馆', 0.0014, 45), typecode: '140100' },
      { ...stop('杭州浙一水建驾考中心', 0.0016, 25), typecode: '141400' },
      { ...stop('浙江省教育考试服务中心', 0.0018, 25), typecode: '140900' },
      {
        ...stop('逸心超市(断河头小区店)', 0.0019, 25),
        address: '河坊街历史文化街区内',
        typecode: '060400',
      },
    ])], {
      origin, timeMinutes: 120, explorationDistance: 1000, preferences: ['scenic'],
      categoryKeywordsByPreference: {
        scenic: ['特色街', '步行街', '历史文化街区', '古街', '老街', '古巷'],
      },
      categoryTypecodePrefixesByPreference: { scenic: ['1401'] },
    })

    expect(shopping.routes[0].stops.map(s => s.name)).toContain('花鳖专卖店')
    expect(scenic.routes[0].stops.map(s => s.name)).toEqual([
      '河坊街历史文化街区', '胡庆余堂中药博物馆',
    ])
  })

  it('uses explicit street semantics but never treats a 0604xx supermarket as a landmark', () => {
    const result = applyRoutePolicies([route('特色街区', [
      {
        ...stop('逸心超市(断河头小区店)', 0.001, 25),
        address: '河坊街历史文化街区内',
        typecode: '060400',
      },
      {
        ...stop('鼓楼', 0.0012, 40),
        address: '河坊街历史文化街区内',
        typecode: '110000',
      },
    ])], {
      origin, timeMinutes: 120, explorationDistance: 1000, preferences: ['scenic'],
      categoryKeywordsByPreference: {
        scenic: ['特色街', '步行街', '历史文化街区', '街区', '古街', '老街', '胡同', '古巷'],
      },
      categoryTypecodePrefixesByPreference: { scenic: ['1401'] },
    })

    expect(result.routes[0].stops.map(stop => stop.name)).toEqual(['鼓楼'])
  })

  it('syncs comparison TOP copy after final quality filtering', () => {
    const result = applyRoutePolicies([{
      ...route('火锅口碑榜', [
        { ...stop('合格火锅一', 0.001), typecode: '050117' },
        { ...stop('合格火锅二', 0.0012), typecode: '050117' },
        { ...stop('某某培训中心', 0.0014), typecode: '141400' },
      ]),
      tagline: '评分最高 · 火锅 TOP3',
      divergenceExempt: true,
    }], {
      origin, timeMinutes: 120, explorationDistance: 1000, preferences: ['food'],
    })

    expect(result.routes[0].stops).toHaveLength(2)
    expect(result.routes[0].tagline).toBe('评分最高 · 火锅 TOP2')
  })

  it('syncs pure-food copy after final quality filtering', () => {
    const result = applyRoutePolicies([{
      ...route('附近美食清单', [
        { ...stop('合格餐厅', 0.001), typecode: '050100' },
        { ...stop('某某服务站', 0.0012), typecode: '071600' },
      ]),
      kind: 'food_list',
      tagline: 'AI 精选 6 家，按评分排序',
      divergenceExempt: true,
    }], {
      origin, timeMinutes: 60, explorationDistance: 500, preferences: ['food'],
    })

    expect(result.routes[0].stops).toHaveLength(1)
    expect(result.routes[0].tagline).toBe('附近热门餐厅，共 1 家')
  })
})
