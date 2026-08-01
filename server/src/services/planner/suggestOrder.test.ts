import { describe, expect, it, vi } from 'vitest'
import type { HotspotSeed, InspirationSpot } from '../../types/explore.js'
import { suggestOrder } from './suggestOrder.js'

function seed(id: string, city = '上海'): HotspotSeed {
  return {
    id,
    city,
    adcode: '310000',
    name: id,
    searchName: id,
    district: '黄浦区',
    category: 'landmark',
    reason: '值得去',
    tags: [],
    suitablePersonas: ['couple'],
    suggestedDuration: '建议 1 小时',
    bestTime: '下午',
    theme: 'city',
    seedLng: 121,
    seedLat: 31,
  }
}

function verified(id: string, lng: number): InspirationSpot {
  return {
    id,
    city: '上海',
    name: id,
    amapName: id,
    district: '黄浦区',
    category: 'landmark',
    reason: '值得去',
    tags: [],
    suitablePersonas: ['couple'],
    suggestedDuration: '建议 1 小时',
    bestTime: '下午',
    theme: 'city',
    amapPoiId: `poi-${id}`,
    address: '地址',
    lng,
    lat: 31,
    verifiedAt: '2026-07-26T00:00:00.000Z',
    verificationStatus: 'verified',
    source: 'amap_verified',
    mock: false,
    reservationNote: '提醒',
  }
}

describe('suggestOrder', () => {
  it('returns exactly the selected set in deterministic nearest-neighbour order', async () => {
    const spots = [
      verified('a', 121),
      verified('b', 121.3),
      verified('c', 121.1),
    ]
    const result = await suggestOrder({
      city: '上海',
      places: spots.map(spot => ({ hotspotId: spot.id, amapPoiId: spot.amapPoiId })),
    }, {
      resolveHotspot: id => seed(id),
      verifySeeds: vi.fn().mockResolvedValue(spots),
    })

    expect(result.order.map(item => item.hotspotId)).toEqual(['a', 'c', 'b'])
    expect(new Set(result.order.map(item => item.hotspotId))).toEqual(new Set(['a', 'b', 'c']))
    expect(result.source).toBe('deterministic_distance')
  })

  it('rejects a stale POI id instead of trusting frontend data', async () => {
    await expect(suggestOrder({
      city: '上海',
      places: [
        { hotspotId: 'a', amapPoiId: 'stale' },
        { hotspotId: 'b', amapPoiId: 'poi-b' },
      ],
    }, {
      resolveHotspot: id => seed(id),
      verifySeeds: vi.fn().mockResolvedValue([verified('a', 121), verified('b', 121.1)]),
    })).rejects.toMatchObject({ code: 'POI_MISMATCH' })
  })

  it('rejects missing and mixed-city hotspots', async () => {
    await expect(suggestOrder({
      city: '上海',
      places: [
        { hotspotId: 'a', amapPoiId: 'poi-a' },
        { hotspotId: 'missing', amapPoiId: 'poi-missing' },
      ],
    }, {
      resolveHotspot: id => id === 'a' ? seed('a') : null,
    })).rejects.toMatchObject({ code: 'HOTSPOT_UNAVAILABLE' })

    await expect(suggestOrder({
      city: '上海',
      places: [
        { hotspotId: 'a', amapPoiId: 'poi-a' },
        { hotspotId: 'b', amapPoiId: 'poi-b' },
      ],
    }, {
      resolveHotspot: id => seed(id, id === 'b' ? '杭州' : '上海'),
    })).rejects.toMatchObject({ code: 'CITY_MISMATCH' })
  })
})
