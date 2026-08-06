import { describe, expect, it } from 'vitest'
import { recommendCitySpots } from './exploreService.js'
import type { CityRecord, SpotRecord } from '../../domain/curation.js'
import type { CurationRepository } from '../../repositories/curationRepository.js'

const shanghai: CityRecord = {
  adcode: '310000', provinceName: '上海', name: '上海', slug: 'shanghai',
  intro: null, coverImageUrl: null, status: 'published', priority: 1,
  reviewIntervalDays: 7, lastContentReviewAt: null, lastRefreshRunId: null,
  createdAt: '', updatedAt: '',
}

function spot(overrides: Partial<SpotRecord> = {}): SpotRecord {
  return {
    id: 'spot-1', cityAdcode: '310000', name: '外滩', searchName: '外滩',
    amapName: '外滩', amapPoiId: 'B0TEST', district: '黄浦区', address: '中山东一路',
    lng: 121.49, lat: 31.24, category: 'classic_landmark', tier: 'A', priority: 1,
    reason: '城市天际线', tierReason: '核心地标', personas: ['first_visit', 'photography'],
    tags: ['夜景'], suggestedDuration: '1.5h', bestTime: '黄昏', indoorFriendly: false,
    reservationRequired: false, reservationNote: null, coverImageUrl: null,
    verificationStatus: 'verified', verifiedAt: '2026-07-24T00:00:00.000Z',
    publicationStatus: 'published', sourceKind: null, version: 1,
    createdAt: '', updatedAt: '', ...overrides,
  }
}

function fakeRepository(city: CityRecord | null, spots: SpotRecord[] = []): CurationRepository {
  return {
    listCities: async () => ({ items: city ? [city] : [], page: 1, pageSize: 100, total: city ? 1 : 0, totalPages: city ? 1 : 0 }),
    listPublishedCities: async () => (city ? [city] : []),
    findPublishedCity: async () => city,
    listPublished: async () => spots,
    createCity: async () => { throw new Error('unused') },
    updateCity: async () => null,
    listSpots: async () => ({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
    getSpot: async () => null,
    createSpot: async () => { throw new Error('unused') },
    updateSpot: async () => null,
    setVerification: async () => null,
    setPublication: async () => null,
    dashboard: async () => ({ publishedCities: 0, draftSpots: 0, pendingReview: 0, publishedSpots: 0, verificationFailed: 0, staleSpots: 0 }),
    audit: async () => {},
  } as CurationRepository
}

const base = {
  city: '上海',
  adcode: '310000',
  persona: 'couple' as const,
  category: 'all' as const,
  cursor: 0,
  limit: 6,
  isRainy: false,
}

describe('recommendCitySpots', () => {
  it('returns null for an unpublished city', async () => {
    const result = await recommendCitySpots(
      { ...base, city: '北京', adcode: '110000' },
      { repository: fakeRepository(null) },
    )
    expect(result).toBeNull()
  })

  it('maps D1 spots and caps the response to the requested limit', async () => {
    const spots = Array.from({ length: 8 }, (_, index) =>
      spot({ id: `spot-${index}`, amapPoiId: `B0${index}` }))
    const result = await recommendCitySpots(base, { repository: fakeRepository(shanghai, spots) })

    expect(result?.spots).toHaveLength(6)
    expect(result?.nextCursor).toBe(6)
    expect(result?.source).toBe('curated_amap_verified')
    expect(result?.spots[0]).toMatchObject({
      id: 'spot-0', source: 'amap_verified', mock: false, verificationStatus: 'verified',
    })
  })

  it('drops spots missing coordinates or a POI id and filters by category', async () => {
    const spots = [
      spot({ id: 'museum', category: 'museum_culture', personas: ['culture'] }),
      spot({ id: 'no-coords', amapPoiId: 'B0X', lng: null, lat: null }),
      spot({ id: 'no-poi', amapPoiId: null }),
      spot({ id: 'mall', category: 'mall', personas: ['shopping'] }),
    ]
    const result = await recommendCitySpots(
      { ...base, category: 'museum' },
      { repository: fakeRepository(shanghai, spots) },
    )
    expect(result?.spots.map(s => s.id)).toEqual(['museum'])
  })

  it('prefers museum/mall over outdoor spots when rainy', async () => {
    const spots = [
      spot({ id: 'park', category: 'nature', personas: ['nature'] }),
      spot({ id: 'gallery', category: 'museum_culture', personas: ['culture'] }),
    ]
    const result = await recommendCitySpots(
      { ...base, isRainy: true },
      { repository: fakeRepository(shanghai, spots) },
    )
    expect(result?.spots.map(s => s.id)[0]).toBe('gallery')
  })

  it('ranks nearer spots higher and returns distanceMeters when user coords are given', async () => {
    // User stands near the first spot (~31.24,121.48); the second is ~1.4km away.
    const near = spot({ id: 'near', lng: 121.481, lat: 31.239, personas: ['first_visit'] })
    const far = spot({ id: 'far', lng: 121.495, lat: 31.245, amapPoiId: 'B0FAR', personas: ['first_visit'] })
    const result = await recommendCitySpots(
      { ...base, lat: 31.24, lng: 121.48 },
      { repository: fakeRepository(shanghai, [far, near]) },
    )

    expect(result?.spots.map(s => s.id)).toEqual(['near', 'far'])
    expect(result?.spots[0].distanceMeters).toBeGreaterThan(0)
    expect(result?.spots[0].distanceMeters).toBeLessThan(result?.spots[1].distanceMeters ?? 0)
  })

  it('omits distanceMeters when no user coords are given', async () => {
    const result = await recommendCitySpots(
      base,
      { repository: fakeRepository(shanghai, [spot()]) },
    )
    expect(result?.spots[0].distanceMeters).toBeUndefined()
  })
})
