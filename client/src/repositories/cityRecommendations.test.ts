import { describe, expect, it, vi, afterEach } from 'vitest'
import { loadCityRecommendations } from './cityRecommendations'
vi.mock('axios', () => ({ default: { get: vi.fn() } }))
import axios from 'axios'
const get = vi.mocked(axios.get)
afterEach(() => vi.clearAllMocks())
describe('city recommendations', () => {
  it('maps D1 cities and derives center from the first located attraction', async () => {
    get.mockResolvedValue({
      data: {
        source: 'd1',
        cities: [
          {
            adcode: '310000', province: '上海', name: '上海', coverImageUrl: 'https://example.test/cover.jpg',
            attractions: [
              { id: 'a', name: '无坐标', lat: null, lng: null },
              { id: 'b', name: '外滩', lat: 31.2, lng: 121.4 },
            ],
          },
        ],
      },
    })
    const r = await loadCityRecommendations()
    expect(r.source).toBe('d1')
    expect(r.cities).toEqual([
      {
        adcode: '310000', name: '上海', province: '上海',
        coverImageUrl: 'https://example.test/cover.jpg',
        center: { lat: 31.2, lng: 121.4 },
      },
    ])
    expect(get).toHaveBeenCalledWith(
      '/api/recommendations/cities',
      expect.objectContaining({ headers: { 'Cache-Control': 'no-cache' } }),
    )
  })

  it('never fabricates cities on failure — returns an empty static_fallback', async () => {
    get.mockRejectedValue(new Error('offline'))
    const r = await loadCityRecommendations()
    expect(r.source).toBe('static_fallback')
    expect(r.cities).toEqual([])
  })
})
