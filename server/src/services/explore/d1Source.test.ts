import { describe, expect, it } from 'vitest'
import type { SpotRecord } from '../../domain/curation.js'
import { selectInspirationSpots } from './d1Source.js'

function spot(overrides: Partial<SpotRecord> = {}): SpotRecord {
  return {
    id: 'one', cityAdcode: '310000', name: '上海迪士尼度假区', searchName: '上海迪士尼度假区',
    amapName: '上海迪士尼度假区', amapPoiId: 'OLD', district: '浦东新区', address: '地址', lng: 121.66, lat: 31.14,
    category: 'theme_park', tier: 'S', priority: 100, reason: '推荐', tierReason: '理由', personas: [], tags: [],
    suggestedDuration: '建议一整天', bestTime: '上午', indoorFriendly: false, reservationRequired: true,
    reservationNote: null, coverImageUrl: null, verificationStatus: 'verified', verifiedAt: '2026-01-01T00:00:00Z',
    publicationStatus: 'published', sourceKind: 'admin', version: 1, createdAt: '', updatedAt: '', ...overrides,
  }
}

describe('D1 explore source', () => {
  it('deduplicates the same venue after id, POI id, or display-name migrations', () => {
    const result = selectInspirationSpots([
      spot(),
      spot({ id: 'two', name: '上海迪士尼乐园', searchName: '上海迪士尼乐园', amapPoiId: 'NEW', lng: 121.6601, lat: 31.1401 }),
    ], '上海', { category: 'all', isRainy: false, cursor: 0, limit: 6 })

    expect(result.spots).toHaveLength(1)
    expect(result.spots[0].id).toBe('one')
  })
})
