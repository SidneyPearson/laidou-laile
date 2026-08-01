import { describe, expect, it } from 'vitest'
import { getCityHotspots, getHotspotById } from './hotspotRepository.js'

describe('hotspotRepository', () => {
  it('resolves Shanghai by city name or adcode', () => {
    expect(getCityHotspots('上海市').length).toBeGreaterThanOrEqual(10)
    expect(getCityHotspots('未知', '310000').length).toBeGreaterThanOrEqual(10)
  })

  it('resolves Beijing and Hangzhou by city name or adcode', () => {
    expect(getCityHotspots('北京市').length).toBeGreaterThanOrEqual(10)
    expect(getCityHotspots('未知', '110000').length).toBeGreaterThanOrEqual(10)
    expect(getCityHotspots('杭州市').length).toBeGreaterThanOrEqual(10)
    expect(getCityHotspots('未知', '330106').length).toBeGreaterThanOrEqual(10)
  })

  it('does not pretend unsupported cities have curated data', () => {
    expect(getCityHotspots('成都', '510100')).toEqual([])
  })

  it('provides traceable HTTPS official covers for every Shanghai hotspot', () => {
    const spots = getCityHotspots('上海')

    expect(spots).toHaveLength(12)
    expect(spots.every(spot =>
      spot.officialCoverImage?.url.startsWith('https://')
      && spot.officialCoverImage.sourcePageUrl.startsWith('https://')
      && !!spot.officialCoverImage.sourceName,
    )).toBe(true)
  })

  it('returns defensive copies and supports id lookup', () => {
    const first = getCityHotspots('上海')[0]
    const originalName = first.name
    const originalCoverUrl = first.officialCoverImage?.url
    first.name = '被修改'
    if (first.officialCoverImage) first.officialCoverImage.url = 'https://example.com/changed.jpg'

    expect(getCityHotspots('上海')[0].name).toBe(originalName)
    expect(getCityHotspots('上海')[0].officialCoverImage?.url).toBe(originalCoverUrl)
    expect(getHotspotById('shanghai-bund')?.name).toBe('外滩')
    expect(getHotspotById('beijing-palace-museum')?.name).toBe('故宫博物院')
    expect(getHotspotById('hangzhou-west-lake')?.name).toBe('西湖风景名胜区')
    expect(getHotspotById('missing')).toBeNull()
  })

  it('keeps ids unique and covers every product category in all three cities', () => {
    const cities = ['上海', '北京', '杭州']
    const all = cities.flatMap(city => getCityHotspots(city))
    expect(new Set(all.map(spot => spot.id)).size).toBe(all.length)

    const requiredCategories = [
      'landmark', 'district', 'theme_park', 'nature', 'street', 'mall', 'food',
    ] as const
    for (const city of cities) {
      const categories = new Set(getCityHotspots(city).map(spot => spot.category))
      for (const category of requiredCategories) {
        expect(categories.has(category), `${city} missing ${category}`).toBe(true)
      }
    }
  })
})
