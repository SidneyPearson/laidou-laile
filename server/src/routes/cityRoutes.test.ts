import { describe, expect, it, vi } from 'vitest'
import { createCityRoutes } from './cityRoutes.js'

describe('GET /context', () => {
  it('returns city and weather without echoing exact user coordinates', async () => {
    const reverseGeocode = vi.fn().mockResolvedValue({
      city: '上海市',
      district: '长宁区',
      township: '北新泾街道',
      adcode: '310105',
      formatted: '上海市长宁区',
    })
    const getWeather = vi.fn().mockResolvedValue({
      weather: '多云',
      temperature: '31',
      isRainy: false,
      note: null,
    })
    const app = createCityRoutes({ reverseGeocode, getWeather })
    const response = await app.request('/context?lat=31.2&lng=121.4')
    const body = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.city).toBe('上海市')
    expect(body).not.toHaveProperty('lat')
    expect(body).not.toHaveProperty('lng')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('rejects invalid coordinates before calling Amap', async () => {
    const reverseGeocode = vi.fn()
    const app = createCityRoutes({ reverseGeocode })
    const response = await app.request('/context?lat=200&lng=121')

    expect(response.status).toBe(400)
    expect(reverseGeocode).not.toHaveBeenCalled()
  })

  it('asks for manual selection when Amap cannot identify a city', async () => {
    const app = createCityRoutes({
      reverseGeocode: vi.fn().mockResolvedValue({
        city: '', district: '', township: '', adcode: '', formatted: '当前位置附近',
      }),
    })
    const response = await app.request('/context?lat=31.2&lng=121.4')

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: { code: 'CITY_NOT_FOUND' },
    })
  })
})

describe('GET /static-map', () => {
  const env = {
    AMAP_WEB_API_KEY: 'test-key',
    AMAP_TIMEOUT_MS: 1000,
  } as any

  it('proxies a marked static map without exposing the Amap key to the client URL', async () => {
    const fetchStaticMap = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'image/png' },
    }))
    const app = createCityRoutes({ fetchStaticMap })
    const response = await app.request(
      '/static-map?points=121.473700,31.230400;121.438000,31.194000',
      undefined,
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toContain('max-age=86400')
    const upstreamUrl = String(fetchStaticMap.mock.calls[0][0])
    expect(upstreamUrl).toContain('key=test-key')
    expect(upstreamUrl).toContain('markers=')
    expect(upstreamUrl).toContain('paths=')
  })

  it('rejects malformed or excessive map points', async () => {
    const fetchStaticMap = vi.fn()
    const app = createCityRoutes({ fetchStaticMap })
    const response = await app.request('/static-map?points=999,31', undefined, env)
    expect(response.status).toBe(400)
    expect(fetchStaticMap).not.toHaveBeenCalled()
  })
})
