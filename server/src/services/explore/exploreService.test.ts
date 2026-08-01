import { describe, expect, it, vi } from 'vitest'
import { recommendCitySpots } from './exploreService.js'
import { getCityHotspots } from './hotspotRepository.js'
import type { HotspotSeed, InspirationSpot } from '../../types/explore.js'

function asVerified(seed: HotspotSeed): InspirationSpot {
  return {
    id: seed.id,
    city: seed.city,
    name: seed.name,
    amapName: seed.searchName,
    district: seed.district,
    category: seed.category,
    reason: seed.reason,
    tags: seed.tags,
    suitablePersonas: seed.suitablePersonas,
    suggestedDuration: seed.suggestedDuration,
    bestTime: seed.bestTime,
    theme: seed.theme,
    amapPoiId: `poi-${seed.id}`,
    address: '上海市',
    lng: seed.seedLng,
    lat: seed.seedLat,
    verifiedAt: '2026-07-24T00:00:00.000Z',
    verificationStatus: 'verified',
    source: 'amap_verified',
    mock: false,
    reservationNote: '出发前请确认当天开放安排。',
  }
}

describe('recommendCitySpots', () => {
  const base = {
    city: '上海',
    adcode: '310000',
    persona: 'couple' as const,
    category: 'all' as const,
    cursor: 0,
    limit: 6,
    isRainy: false,
  }

  it('returns null for a city without curated candidates', async () => {
    const result = await recommendCitySpots(
      { ...base, city: '北京', adcode: '110000' },
      { getHotspots: () => [] },
    )
    expect(result).toBeNull()
  })

  it('verifies extra candidates and caps the response limit', async () => {
    const verify = vi.fn(async (seeds: HotspotSeed[]) => seeds.map(asVerified))
    const result = await recommendCitySpots(base, {
      getHotspots: getCityHotspots,
      verify,
    })

    expect(verify.mock.calls[0][0]).toHaveLength(12)
    expect(result?.spots).toHaveLength(6)
    expect(result?.source).toBe('curated_amap_verified')
  })

  it('applies category filtering before verification', async () => {
    const verify = vi.fn(async (seeds: HotspotSeed[]) => seeds.map(asVerified))
    const result = await recommendCitySpots(
      { ...base, category: 'nature' },
      { getHotspots: getCityHotspots, verify },
    )

    expect(verify.mock.calls[0][0].every((spot: HotspotSeed) => spot.category === 'nature')).toBe(true)
    expect(result?.spots.every(spot => spot.category === 'nature')).toBe(true)
  })
})
