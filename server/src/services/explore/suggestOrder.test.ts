import { describe, expect, it } from 'vitest'
import { suggestOrder, SuggestOrderError } from './suggestOrder.js'
import type { CityRecord, SpotRecord } from '../../domain/curation.js'
import type { CurationRepository } from '../../repositories/curationRepository.js'

const shanghai: CityRecord = {
  adcode: '310000', provinceName: '上海', name: '上海', slug: 'shanghai',
  intro: null, coverImageUrl: null, status: 'published', priority: 1,
  reviewIntervalDays: 7, lastContentReviewAt: null, lastRefreshRunId: null,
  createdAt: '', updatedAt: '',
}

function spot(id: string, lng: number, overrides: Partial<SpotRecord> = {}): SpotRecord {
  return {
    id, cityAdcode: '310000', name: id, searchName: id, amapName: id,
    amapPoiId: `poi-${id}`, district: '黄浦区', address: '地址',
    lng, lat: 31, category: 'classic_landmark', tier: 'A', priority: 1,
    reason: '值得去', tierReason: '核心', personas: ['first_visit'], tags: [],
    suggestedDuration: '1h', bestTime: '下午', indoorFriendly: false,
    reservationRequired: false, reservationNote: null, coverImageUrl: null,
    verificationStatus: 'verified', verifiedAt: '2026-07-26T00:00:00.000Z',
    publicationStatus: 'published', sourceKind: null, version: 1,
    createdAt: '', updatedAt: '', ...overrides,
  }
}

function repo(city: CityRecord | null, spots: SpotRecord[]): CurationRepository {
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

function places(spots: SpotRecord[]) {
  return spots.map(s => ({ hotspotId: s.id, amapPoiId: s.amapPoiId as string }))
}

describe('suggestOrder', () => {
  it('returns exactly the selected set in deterministic nearest-neighbour order', async () => {
    const spots = [spot('a', 121), spot('b', 121.3), spot('c', 121.1)]
    const result = await suggestOrder(
      { city: '上海', places: places(spots) },
      { repository: repo(shanghai, spots) },
    )

    expect(result.order.map(item => item.hotspotId)).toEqual(['a', 'c', 'b'])
    expect(new Set(result.order.map(item => item.hotspotId))).toEqual(new Set(['a', 'b', 'c']))
    expect(result.source).toBe('deterministic_distance')
  })

  it('rejects a city that is not published', async () => {
    await expect(suggestOrder(
      { city: '北京', places: [{ hotspotId: 'a', amapPoiId: 'poi-a' }] },
      { repository: repo(null, []) },
    )).rejects.toBeInstanceOf(SuggestOrderError)
    await expect(suggestOrder(
      { city: '北京', places: [{ hotspotId: 'a', amapPoiId: 'poi-a' }] },
      { repository: repo(null, []) },
    )).rejects.toMatchObject({ code: 'CITY_MISMATCH' })
  })

  it('rejects a stale POI id instead of trusting frontend data', async () => {
    const spots = [spot('a', 121), spot('b', 121.1)]
    await expect(suggestOrder({
      city: '上海',
      places: [
        { hotspotId: 'a', amapPoiId: 'stale' },
        { hotspotId: 'b', amapPoiId: 'poi-b' },
      ],
    }, { repository: repo(shanghai, spots) })).rejects.toMatchObject({ code: 'POI_MISMATCH' })
  })

  it('rejects a hotspot absent from the published city list', async () => {
    const spots = [spot('a', 121)]
    await expect(suggestOrder({
      city: '上海',
      places: [
        { hotspotId: 'a', amapPoiId: 'poi-a' },
        { hotspotId: 'missing', amapPoiId: 'poi-missing' },
      ],
    }, { repository: repo(shanghai, spots) })).rejects.toMatchObject({ code: 'HOTSPOT_UNAVAILABLE' })
  })

  it('rejects a spot missing valid coordinates', async () => {
    const spots = [spot('a', 121, { lng: null, lat: null })]
    await expect(suggestOrder({
      city: '上海',
      places: [{ hotspotId: 'a', amapPoiId: 'poi-a' }],
    }, { repository: repo(shanghai, spots) })).rejects.toMatchObject({ code: 'HOTSPOT_UNAVAILABLE' })
  })
})
