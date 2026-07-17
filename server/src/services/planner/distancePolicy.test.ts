import { describe, expect, it } from 'vitest'
import { estimateRouteTravel, normalizePoiDistance } from './distancePolicy.js'

const origin = { lat: 31.2304, lng: 121.4737 }

describe('normalizePoiDistance', () => {
  it('uses a positive finite Amap distance', () => {
    expect(normalizePoiDistance(321, origin, { lat: 30, lng: 120 })).toBe(321)
  })

  it('accepts a numeric string returned by Amap', () => {
    expect(normalizePoiDistance('42', origin, { lat: 30, lng: 120 })).toBe(42)
  })

  it('falls back to Haversine when distance is missing or zero', () => {
    const poi = { lat: 31.2314, lng: 121.4737 }
    expect(normalizePoiDistance(undefined, origin, poi)).toBeGreaterThan(100)
    expect(normalizePoiDistance(0, origin, poi)).toBeGreaterThan(100)
  })

  it('returns zero only for effectively identical coordinates', () => {
    expect(normalizePoiDistance(0, origin, origin)).toBe(0)
  })

  it('returns undefined when both distance and coordinates are unusable', () => {
    expect(normalizePoiDistance('', origin, { lat: Number.NaN, lng: 121 })).toBeUndefined()
    expect(normalizePoiDistance('12m', undefined, undefined)).toBeUndefined()
  })
})

describe('estimateRouteTravel', () => {
  it('includes origin → first stop and adjacent stop legs', () => {
    const result = estimateRouteTravel(origin, [
      { lat: 31.2314, lng: 121.4737 },
      { lat: 31.2324, lng: 121.4737 },
    ])
    expect(result.distanceMeters).toBeGreaterThan(200)
    expect(result.minutes).toBeGreaterThan(0)
  })
})
