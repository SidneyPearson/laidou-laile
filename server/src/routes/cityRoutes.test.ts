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
