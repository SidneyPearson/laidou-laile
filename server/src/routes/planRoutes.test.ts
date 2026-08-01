import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const serviceMocks = vi.hoisted(() => ({
  generateRoutes: vi.fn(),
  refinePlan: vi.fn(),
  replaceStop: vi.fn(),
}))

vi.mock('../services/routeGenerator.js', () => ({
  generateRoutes: serviceMocks.generateRoutes,
}))
vi.mock('../services/aiPlannerService.js', () => ({
  refinePlan: serviceMocks.refinePlan,
  replaceStop: serviceMocks.replaceStop,
}))

import planRoutes, { clearRequestDedupe } from './planRoutes.js'

const app = new Hono()
app.route('/api/plan', planRoutes)

const validStop = {
  name: '外婆家',
  address: '南京东路',
  visitDurationMinutes: 60,
  notes: '本帮菜',
  amapPoiId: 'B000A7BD6C',
  lng: 121.47,
  lat: 31.23,
}

const validRoute = {
  id: 'route-1',
  name: '示例路线',
  tagline: '一句话',
  stops: [validStop],
  totalDurationMinutes: 90,
  walkingDistanceMeters: 500,
  tips: '提前预约',
}

const unsupportedSocialRoute = {
  ...validRoute,
  stops: [{
    ...validStop,
    recommendationType: 'social_hot' as const,
    socialScore: 85,
    evidenceSummary: '小红书热门',
    popularityReason: '抖音与小红书推荐',
    socialEvidence: [{
      platform: '小红书' as const,
      title: '旧版来源没有置信度',
      url: 'https://www.xiaohongshu.com/explore/legacy',
    }],
  }],
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  clearRequestDedupe()
  serviceMocks.generateRoutes.mockResolvedValue({
    routes: [validRoute],
    weatherNote: '晴 25°C',
    weather: { weather: '晴', temperature: '25', isRainy: false },
    locationName: '上海市',
    source: 'ai',
    fallbackReason: null,
  })
  serviceMocks.refinePlan.mockResolvedValue(validRoute)
  serviceMocks.replaceStop.mockResolvedValue(validRoute)
})

describe('POST /api/plan/generate', () => {
  const valid = {
    lat: 31.23,
    lng: 121.47,
    timeOption: 120,
    distance: 1000,
    preferences: ['food'],
  }

  it('returns the existing success response structure', async () => {
    const res = await post('/api/plan/generate', valid)
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json).toHaveProperty('routes')
    expect(json).toHaveProperty('generatedAt')
    expect(json).toHaveProperty('weatherNote')
    expect(json).toHaveProperty('weather')
    expect(json).toHaveProperty('locationName')
    expect(json).toHaveProperty('source')
    expect(json).toHaveProperty('fallbackReason')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('enforces evidence invariants on generated routes before API output', async () => {
    serviceMocks.generateRoutes.mockResolvedValueOnce({
      routes: [unsupportedSocialRoute],
      weatherNote: null,
      weather: null,
      locationName: '上海市',
      source: 'ai',
      fallbackReason: null,
    })

    const res = await post('/api/plan/generate', { ...valid, lat: 31.231 })
    const json = await res.json() as { routes: typeof unsupportedSocialRoute[] }
    expect(json.routes[0].stops[0]).toMatchObject({
      recommendationType: 'amap_fallback',
      socialScore: 0,
      evidenceSummary: '高德高分补充',
    })
    expect(json.routes[0].stops[0].socialEvidence).toBeUndefined()
    expect(json.routes[0].stops[0].popularityReason).toBeUndefined()
  })

  it('keeps custom tags separate from enum-backed options', async () => {
    const res = await post('/api/plan/generate', {
      ...valid,
      cuisineTypes: ['hotpot'],
      customCuisine: ['潮汕牛肉锅'],
    })
    expect(res.status).toBe(200)
    expect(serviceMocks.generateRoutes).toHaveBeenCalledWith(expect.objectContaining({
      cuisineTypes: ['hotpot'],
      customCuisine: ['潮汕牛肉锅'],
    }))
  })

  it('forwards an optional selected area name to route generation', async () => {
    const res = await post('/api/plan/generate', {
      ...valid,
      areaName: '宽窄巷子',
    })
    expect(res.status).toBe(200)
    expect(serviceMocks.generateRoutes).toHaveBeenCalledWith(expect.objectContaining({
      areaName: '宽窄巷子',
    }))
  })

  it('returns standard INVALID_PARAMS for missing fields', async () => {
    const res = await post('/api/plan/generate', { lat: 31.23 })
    expect(res.status).toBe(400)
    const json = await res.json() as { error: { code: string; message: string } }
    expect(json.error.code).toBe('INVALID_PARAMS')
    expect(typeof json.error.message).toBe('string')
    expect(JSON.stringify(json)).not.toContain('stack')
    expect(serviceMocks.generateRoutes).not.toHaveBeenCalled()
  })

  it('returns INVALID_PARAMS for illegal enum values', async () => {
    const res = await post('/api/plan/generate', {
      ...valid,
      timeOption: 30,
      distance: 2000,
    })
    expect(res.status).toBe(400)
    const json = await res.json() as { error: { code: string } }
    expect(json.error.code).toBe('INVALID_PARAMS')
  })

  it('returns INVALID_PARAMS for out-of-range coordinates', async () => {
    const res = await post('/api/plan/generate', { ...valid, lat: 999 })
    expect(res.status).toBe(400)
  })

  it('returns INVALID_JSON for malformed JSON', async () => {
    const res = await post('/api/plan/generate', '{bad json')
    expect(res.status).toBe(400)
    const json = await res.json() as { error: { code: string } }
    expect(json.error.code).toBe('INVALID_JSON')
  })

  it('returns PAYLOAD_TOO_LARGE before parsing bodies over 64 KiB', async () => {
    const res = await post('/api/plan/generate', valid, {
      'content-length': String(65 * 1024),
    })
    expect(res.status).toBe(413)
    const json = await res.json() as { error: { code: string } }
    expect(json.error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(serviceMocks.generateRoutes).not.toHaveBeenCalled()
  })

  it('returns 404 NO_POIS_FOUND when planner yields no routes', async () => {
    serviceMocks.generateRoutes.mockResolvedValueOnce({ routes: [] })
    const res = await post('/api/plan/generate', { ...valid, lat: 31.24 })
    expect(res.status).toBe(404)
    const json = await res.json() as { error: { code: string; message: string } }
    expect(json.error.code).toBe('NO_POIS_FOUND')
    expect(json.error.message).toBe('附近暂未找到合适的地点')
  })

  it('keeps the NO_POIS_FOUND envelope while explaining a measured shortage', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    serviceMocks.generateRoutes.mockResolvedValueOnce({
      routes: [],
      diagnostics: {
        recalled: 18,
        rejectedByType: 3,
        rejectedByDistance: 15,
        qualified: 0,
      },
    })

    const res = await post('/api/plan/generate', { ...valid, lat: 31.241 })
    expect(res.status).toBe(404)
    const json = await res.json() as { error: { code: string; message: string } }
    expect(json.error).toEqual({
      code: 'NO_POIS_FOUND',
      message: '已找到18个候选，但合格地点均超出当前距离；可尝试扩大探索范围',
    })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('route candidate shortage', {
      recalled: 18,
      rejectedByType: 3,
      rejectedByDistance: 15,
      qualified: 0,
    })
    log.mockRestore()
  })

  it('dedupes identical concurrent requests inside one isolate', async () => {
    let release!: (value: unknown) => void
    const pending = new Promise((resolve) => { release = resolve })
    serviceMocks.generateRoutes.mockReturnValueOnce(pending)

    const first = post('/api/plan/generate', valid)
    const second = post('/api/plan/generate', valid)
    // Let both requests reach the dedupe map before resolving the provider call.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(serviceMocks.generateRoutes).toHaveBeenCalledTimes(1)

    release({
      routes: [validRoute],
      weatherNote: null,
      weather: null,
      locationName: '上海市',
      source: 'ai',
      fallbackReason: null,
    })
    const [a, b] = await Promise.all([first, second])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
  })

  it('does not dedupe requests with different bodies', async () => {
    const [a, b] = await Promise.all([
      post('/api/plan/generate', valid),
      post('/api/plan/generate', { ...valid, lng: 121.48 }),
    ])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(serviceMocks.generateRoutes).toHaveBeenCalledTimes(2)
  })

  it('returns app-standard 500 without leaking internal errors', async () => {
    serviceMocks.generateRoutes.mockRejectedValueOnce(new Error('secret details'))
    const res = await post('/api/plan/generate', { ...valid, lat: 31.25 })
    expect(res.status).toBe(500)
    const json = await res.json() as { error: { code: string; message: string } }
    expect(json.error.code).toBe('INTERNAL_ERROR')
    expect(json.error.message).not.toContain('secret details')
  })
})

describe('POST /api/plan/refine', () => {
  const valid = {
    route: validRoute,
    removeStopIndices: [],
    extraRequirements: '加一个咖啡馆',
    city: '上海',
    weather: '晴',
    timeMinutes: 240,
    distance: 1000,
  }

  it('returns routes: [refined]', async () => {
    const res = await post('/api/plan/refine', { ...valid, customCuisine: ['本帮面'] })
    expect(res.status).toBe(200)
    const json = await res.json() as { routes: unknown[] }
    expect(json.routes).toEqual([validRoute])
    expect(serviceMocks.refinePlan).toHaveBeenCalledWith(expect.objectContaining({
      route: validRoute,
      position: { lat: validStop.lat, lng: validStop.lng },
      customCuisine: ['本帮面'],
    }))
  })

  it('enforces evidence invariants on refined routes before API output', async () => {
    serviceMocks.refinePlan.mockResolvedValueOnce(unsupportedSocialRoute)
    const res = await post('/api/plan/refine', { ...valid, city: '北京' })
    const json = await res.json() as { routes: typeof unsupportedSocialRoute[] }
    expect(json.routes[0].stops[0]).toMatchObject({
      recommendationType: 'amap_fallback',
      socialScore: 0,
      evidenceSummary: '高德高分补充',
    })
    expect(json.routes[0].stops[0].socialEvidence).toBeUndefined()
  })

  it('rejects out-of-range removeStopIndices', async () => {
    const res = await post('/api/plan/refine', {
      ...valid,
      removeStopIndices: [99],
    })
    expect(res.status).toBe(400)
    expect(serviceMocks.refinePlan).not.toHaveBeenCalled()
  })

  it('rejects extraRequirements longer than 200 chars', async () => {
    const res = await post('/api/plan/refine', {
      ...valid,
      extraRequirements: 'A'.repeat(201),
    })
    expect(res.status).toBe(400)
  })

  it('returns REFINE_FAILED when service returns null', async () => {
    serviceMocks.refinePlan.mockResolvedValueOnce(null)
    const res = await post('/api/plan/refine', { ...valid, city: '杭州' })
    expect(res.status).toBe(404)
    const json = await res.json() as { error: { code: string } }
    expect(json.error.code).toBe('REFINE_FAILED')
  })
})

describe('POST /api/plan/replace-stop', () => {
  const valid = {
    route: validRoute,
    stopIndex: 0,
    preferences: ['food'],
    distance: 1000,
  }

  it('returns route on success', async () => {
    const res = await post('/api/plan/replace-stop', { ...valid, customCuisine: ['本帮面'] })
    expect(res.status).toBe(200)
    const json = await res.json() as { route: unknown }
    expect(json.route).toEqual(validRoute)
    expect(serviceMocks.replaceStop).toHaveBeenCalledWith(expect.objectContaining({
      stopIndex: 0,
      customCuisine: ['本帮面'],
    }))
  })

  it('enforces evidence invariants on replaced routes before API output', async () => {
    serviceMocks.replaceStop.mockResolvedValueOnce(unsupportedSocialRoute)
    const res = await post('/api/plan/replace-stop', { ...valid, distance: 3000 })
    const json = await res.json() as { route: typeof unsupportedSocialRoute }
    expect(json.route.stops[0]).toMatchObject({
      recommendationType: 'amap_fallback',
      socialScore: 0,
      evidenceSummary: '高德高分补充',
    })
    expect(json.route.stops[0].socialEvidence).toBeUndefined()
  })

  it('rejects an invalid stopIndex', async () => {
    const res = await post('/api/plan/replace-stop', { ...valid, stopIndex: 5 })
    expect(res.status).toBe(400)
    expect(serviceMocks.replaceStop).not.toHaveBeenCalled()
  })

  it('defaults missing preferences to food', async () => {
    const res = await post('/api/plan/replace-stop', {
      route: validRoute,
      stopIndex: 0,
    })
    expect(res.status).toBe(200)
    expect(serviceMocks.replaceStop).toHaveBeenCalledWith(expect.objectContaining({
      preferences: ['food'],
      distance: 0,
    }))
  })

  it('returns NO_REPLACEMENT when service returns null', async () => {
    serviceMocks.replaceStop.mockResolvedValueOnce(null)
    const res = await post('/api/plan/replace-stop', { ...valid, distance: 3000 })
    expect(res.status).toBe(404)
    const json = await res.json() as { error: { code: string } }
    expect(json.error.code).toBe('NO_REPLACEMENT')
  })
})
