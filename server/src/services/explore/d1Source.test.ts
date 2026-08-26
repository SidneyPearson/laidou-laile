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

  it('filters the city feed to spots matching the selected persona (backend ids)', () => {
    // 后台直接写入画像 id（与 H5 首页画像同源）：选了什么画像，就只推荐这些地点，
    // 不再把整座城市的点库都推给用户。
    const fastSpot = spot({ id: 'fast-spot', name: '快刷地标', searchName: '快刷地标', amapPoiId: 'FAST', lng: 121.4, lat: 31.2, personas: ['fast', 'lazy'] })
    const otherSpot = spot({ id: 'other', name: '约会好去处', searchName: '约会好去处', amapPoiId: 'COUPLE', lng: 121.5, lat: 31.3, personas: ['couple'] })

    const forFast = selectInspirationSpots([fastSpot, otherSpot], '上海', {
      persona: 'fast', category: 'all', isRainy: false, cursor: 0, limit: 10,
    })
    expect(forFast.spots.map(s => s.id)).toEqual(['fast-spot'])
    expect(forFast.spots[0].suitablePersonas).toEqual(['fast', 'lazy'])

    const forCouple = selectInspirationSpots([fastSpot, otherSpot], '上海', {
      persona: 'couple', category: 'all', isRainy: false, cursor: 0, limit: 10,
    })
    expect(forCouple.spots.map(s => s.id)).toEqual(['other'])

    // 未选画像时不筛，保留全量（天气/距离排序仍生效）。
    const noPersona = selectInspirationSpots([fastSpot, otherSpot], '上海', {
      category: 'all', isRainy: false, cursor: 0, limit: 10,
    })
    expect(noPersona.spots.map(s => s.id)).toEqual(['fast-spot', 'other'])
  })

  it('excludes spots without any backend persona from persona-filtered views', () => {
    const untagged = spot({ id: 'untagged', name: '未标注', searchName: '未标注', amapPoiId: 'UNTAG', lng: 121.6, lat: 31.1, personas: [] })
    const result = selectInspirationSpots([untagged], '上海', {
      persona: 'fast', category: 'all', isRainy: false, cursor: 0, limit: 10,
    })
    expect(result.spots).toHaveLength(0)
  })

  it('still maps legacy free-text tags to personas when no id is present', () => {
    const legacySpot = spot({ id: 'legacy', personas: ['photography', 'food'] })
    const ranked = selectInspirationSpots([legacySpot], '上海', {
      persona: 'couple', category: 'all', isRainy: false, cursor: 0, limit: 10,
    })
    expect(ranked.spots[0].suitablePersonas).toEqual(['couple'])
  })
})
