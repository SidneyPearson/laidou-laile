import { describe, expect, it } from 'vitest'
import type { RecommendationCity } from '../repositories/cityRecommendations'
import { matchRememberedCity } from './useExploreCity'

function city(adcode: string, name: string, lat = 31): RecommendationCity {
  return {
    adcode,
    name,
    province: name,
    coverImageUrl: `/${adcode}.jpg`,
    center: { lat, lng: 121 },
  }
}

describe('explore city state', () => {
  it('restores the remembered city and refreshes it from the latest API copy', () => {
    const remembered = city('510100', '成都市', 30)
    const latest = city('510100', '成都', 30.6)
    expect(matchRememberedCity(remembered, [city('310000', '上海'), latest])).toBe(latest)
  })

  it('falls back to a normalized name and drops cities that are no longer published', () => {
    const latest = city('510100', '成都')
    expect(matchRememberedCity(city('old-code', '成都市'), [latest])).toBe(latest)
    expect(matchRememberedCity(city('old-code', '旧城市'), [latest])).toBeNull()
  })
})
