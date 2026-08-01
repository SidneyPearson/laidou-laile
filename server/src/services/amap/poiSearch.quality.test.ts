import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('./client.js', () => ({
  getAmapClient: () => ({ get }),
}))

import { searchNearbyPOIs } from './poiSearch.js'

function rawPoi(id: string, name: string, typecode: string, distance: number) {
  return {
    id,
    name,
    type: typecode.startsWith('05') ? '餐饮服务' : typecode.startsWith('08') ? '体育休闲服务' : '生活服务',
    typecode,
    address: `${name}地址`,
    location: '116.4034,39.9387',
    distance: String(distance),
    biz_ext: {},
    parent: '',
  }
}

describe('searchNearbyPOIs category-aware custom terms', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockResolvedValue({ data: { pois: [] } })
  })

  it('keeps food and wander custom terms in their own searches', async () => {
    await searchNearbyPOIs({
      lat: 31.23, lng: 121.47, distance: 1000, timeOption: 120,
      preferences: ['food', 'wander'],
      customKeywordsByPreference: { food: ['本帮面'], wander: ['咖啡'] },
    })

    const calls = get.mock.calls.map(([, config]) => config.params as Record<string, string>)
    const foodSearch = calls.find(params => params.types === '050000' && String(params.keywords).includes('本帮面'))
    const wanderSearch = calls.find(params => String(params.types).includes('140000') && String(params.keywords).includes('咖啡'))
    expect(foodSearch?.keywords).not.toContain('咖啡')
    expect(wanderSearch?.keywords).not.toContain('本帮面')
  })

  it('deduplicates generic local-cuisine recall and adds one regional query', async () => {
    await searchNearbyPOIs({
      lat: 30.67, lng: 104.06, distance: 3000, timeOption: 120,
      preferences: ['food'], cuisineTypes: ['local_cuisine'],
      areaName: '宽窄巷子', skipAroundSearch: true,
    })

    const calls = get.mock.calls.map(([, config]) => config.params as Record<string, string>)
    const textQueries = calls.filter(params => params.types === '050000')
    expect(textQueries.filter(params => params.keywords === '本地菜|老字号|本帮菜|特色菜')).toHaveLength(1)
    expect(textQueries).toEqual(expect.arrayContaining([
      expect.objectContaining({ keywords: expect.stringContaining('川菜') }),
    ]))
    expect(textQueries.some(params => params.keywords === '')).toBe(false)
  })

  it('keeps area-aware wander variants isolated and capped', async () => {
    await searchNearbyPOIs({
      lat: 23.13, lng: 113.27, distance: 1000, timeOption: 60,
      preferences: ['wander'], wanderTypes: ['shopping', 'entertainment'],
      areaName: '北京路步行街',
    })

    const calls = get.mock.calls.map(([, config]) => config.params as Record<string, string>)
    const areaQueries = calls.filter(params => String(params.keywords).startsWith('北京路步行街|'))
    expect(areaQueries).toHaveLength(2)
    expect(areaQueries).toEqual(expect.arrayContaining([
      expect.objectContaining({ types: '060000' }),
      expect.objectContaining({ types: '080000' }),
    ]))
    expect(areaQueries.length).toBeLessThanOrEqual(3)
  })

  it('keeps a selected cafe candidate ahead of more than 50 ordinary near neighbours', async () => {
    get.mockImplementation(async (path: string, config: { params: Record<string, unknown> }) => {
      const params = config.params
      if (path === '/place/around') {
        const page = Number(params.page)
        const pois = Array.from({ length: 30 }, (_, index) => {
          const sequence = (page - 1) * 30 + index + 1
          return rawPoi(`ordinary-${sequence}`, `普通生活点${sequence}`, '070100', sequence)
        })
        return { data: { pois } }
      }
      if (params.types === '050000') {
        return { data: { pois: [rawPoi('cafe-selected', 'Wiggly Jiggly’s五月', '050501', 420)] } }
      }
      return { data: { pois: [] } }
    })

    const result = await searchNearbyPOIs({
      lat: 39.9387, lng: 116.4034, distance: 500, timeOption: 60,
      preferences: ['wander'], wanderTypes: ['cafe', 'hidden'], areaName: '南锣鼓巷',
    })

    expect(result).toHaveLength(50)
    expect(result.map(poi => poi.id)).toContain('cafe-selected')
  })

  it('keeps a selected entertainment candidate ahead of more than 50 ordinary near neighbours', async () => {
    get.mockImplementation(async (path: string, config: { params: Record<string, unknown> }) => {
      const params = config.params
      if (path === '/place/around') {
        const page = Number(params.page)
        const pois = Array.from({ length: 30 }, (_, index) => {
          const sequence = (page - 1) * 30 + index + 1
          return rawPoi(`ordinary-gz-${sequence}`, `普通生活点${sequence}`, '070100', sequence)
        })
        return { data: { pois } }
      }
      if (params.types === '080000') {
        return { data: { pois: [rawPoi('cinema-selected', '青宫影城', '080601', 680)] } }
      }
      return { data: { pois: [] } }
    })

    const result = await searchNearbyPOIs({
      lat: 23.1252, lng: 113.2708, distance: 1000, timeOption: 60,
      preferences: ['wander'], wanderTypes: ['shopping', 'entertainment'], areaName: '北京路步行街',
    })

    expect(result).toHaveLength(50)
    expect(result.map(poi => poi.id)).toContain('cinema-selected')
  })

  it('reserves a real 050121 local restaurant when more than 50 scenic matches compete for the cap', async () => {
    get.mockImplementation(async (_path: string, config: { params: Record<string, unknown> }) => {
      if (String(config.params.types).includes('050000')) {
        return { data: { pois: [rawPoi('local-food', '老米家泡馍(鼓楼景观店)', '050121', 220)] } }
      }
      return {
        data: {
          pois: Array.from({ length: 60 }, (_, index) =>
            rawPoi(`scenic-xa-${index}`, `西安历史博物馆${index}`, '140100', 20 + index)),
        },
      }
    })

    const result = await searchNearbyPOIs({
      lat: 34.2611, lng: 108.9422, distance: 3000, timeOption: 240,
      preferences: ['food', 'scenic'], cuisineTypes: ['local_cuisine'], scenicTypes: ['popular'],
      areaName: '回民街', adcode: '610104', skipAroundSearch: true,
    })

    expect(result).toHaveLength(50)
    expect(result.map(poi => poi.id)).toContain('local-food')
  })
})
