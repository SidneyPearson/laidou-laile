import { describe, it, expect } from 'vitest'
import {
  estimateWalkDistFromStops,
  estimateWalkDist,
  estimateDuration,
  fmtDist,
  extractCuisineKeyword,
} from './routeMetrics.js'
import type { Stop } from '../../types/route.js'
import type { AmapPOI } from '../../types/poi.js'

function makeStop(overrides: Partial<Stop> & { lng: number; lat: number }): Stop {
  return {
    name: 's', address: '', visitDurationMinutes: 30,
    notes: '', amapPoiId: null,
    ...overrides,
  }
}

describe('estimateWalkDistFromStops', () => {
  it('returns 0 for empty', () => {
    expect(estimateWalkDistFromStops([])).toBe(0)
  })
  it('returns 0 for a single stop', () => {
    expect(estimateWalkDistFromStops([makeStop({ lng: 121.47, lat: 31.23 })])).toBe(0)
  })
  it('computes a positive integer for two distinct points', () => {
    const d = estimateWalkDistFromStops([
      makeStop({ lng: 121.47, lat: 31.23 }),
      makeStop({ lng: 121.48, lat: 31.24 }),
    ])
    expect(d).toBeGreaterThan(0)
    expect(Number.isInteger(d)).toBe(true)
  })
  it('is order-independent (projection sort normalises)', () => {
    const a = estimateWalkDistFromStops([
      makeStop({ lng: 121.47, lat: 31.23 }),
      makeStop({ lng: 121.48, lat: 31.24 }),
      makeStop({ lng: 121.49, lat: 31.25 }),
    ])
    const b = estimateWalkDistFromStops([
      makeStop({ lng: 121.49, lat: 31.25 }),
      makeStop({ lng: 121.47, lat: 31.23 }),
      makeStop({ lng: 121.48, lat: 31.24 }),
    ])
    expect(a).toBe(b)
  })
})

describe('estimateWalkDist (AmapPOI signature)', () => {
  const poi = (id: string, lng: number, lat: number): AmapPOI => ({
    id, name: id, type: '', typecode: '', address: '',
    lng, lat, distance: 0, rating: null, cost: null,
  })

  it('returns 0 for one POI', () => {
    expect(estimateWalkDist([poi('a', 121.47, 31.23)])).toBe(0)
  })
  it('computes non-zero for two distinct POIs', () => {
    expect(estimateWalkDist([
      poi('a', 121.47, 31.23),
      poi('b', 121.48, 31.24),
    ])).toBeGreaterThan(0)
  })
})

describe('estimateDuration', () => {
  const at = (typecode: string) =>
    estimateDuration({ id: '', name: '', type: '', typecode, address: '',
      lng: 0, lat: 0, distance: 0, rating: null, cost: null })
  it('typecode 05xxxx (food) → 25min', () => { expect(at('050000')).toBe(25) })
  it('typecode 0604xx (scenic) → 45min', () => { expect(at('060400')).toBe(45) })
  it('typecode 11xxxx (business) → 35min', () => { expect(at('110000')).toBe(35) })
  it('typecode 14xxxx (education) → 35min', () => { expect(at('140000')).toBe(35) })
  it('unknown typecode → 20min', () => { expect(at('990000')).toBe(20) })
})

describe('fmtDist', () => {
  it('formats <1km as m', () => {
    expect(fmtDist(0)).toBe('0m')
    expect(fmtDist(999)).toBe('999m')
  })
  it('formats ≥1000m as km with one decimal', () => {
    expect(fmtDist(1000)).toBe('1.0km')
    expect(fmtDist(1459)).toBe('1.5km')
    expect(fmtDist(12345)).toBe('12.3km')
  })
})

describe('extractCuisineKeyword', () => {
  it('returns null when no match', () => {
    expect(extractCuisineKeyword('随便逛逛')).toBeNull()
  })
  it('matches short single-char keys', () => {
    expect(extractCuisineKeyword('吃个面')).not.toBeNull()
    expect(extractCuisineKeyword('喝杯茶')).not.toBeNull()
  })
  it('prefers the longest matching key', () => {
    // Both "自助" and "自助餐" appear as keys — the longer wins.
    const result = extractCuisineKeyword('想吃自助餐')
    expect(result).toBe('自助餐|自助')
  })
  it('returns the mapped Amap keyword group', () => {
    expect(extractCuisineKeyword('吃火锅')).toContain('火锅')
    expect(extractCuisineKeyword('喝咖啡')).toContain('咖啡')
  })
})
