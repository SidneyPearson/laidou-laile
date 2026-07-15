import { describe, it, expect } from 'vitest'
import { haversineDist } from './geo.js'

describe('haversineDist', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDist(31.23, 121.47, 31.23, 121.47)).toBe(0)
  })

  it('is symmetric', () => {
    const a = haversineDist(31.23, 121.47, 39.90, 116.40)
    const b = haversineDist(39.90, 116.40, 31.23, 121.47)
    expect(a).toBeCloseTo(b, 5)
  })

  // Shanghai People's Square → Beijing Tiananmen ≈ 1067 km (great-circle)
  it('matches known Shanghai↔Beijing great-circle distance', () => {
    const meters = haversineDist(31.2333, 121.4736, 39.9042, 116.4074)
    expect(meters).toBeGreaterThan(1_060_000)
    expect(meters).toBeLessThan(1_080_000)
  })

  it('handles small local distances (Beijing gulou ~500m)', () => {
    // Two points ~500m apart in Beijing
    const meters = haversineDist(39.94125, 116.40737, 39.94575, 116.40737)
    // 0.0045° lat ≈ 500m
    expect(meters).toBeGreaterThan(490)
    expect(meters).toBeLessThan(510)
  })

  it('handles equator crossing longitude wrap', () => {
    // Two points near the antimeridian — Haversine handles this correctly
    // because we go through cosines, not through raw ΔLng.
    const meters = haversineDist(0, 179, 0, -179)
    // 2° at the equator ≈ 222 km
    expect(meters).toBeGreaterThan(220_000)
    expect(meters).toBeLessThan(224_000)
  })

  it('handles poles', () => {
    // North pole (90) to south pole (-90) ≈ half circumference ≈ 20015 km
    const meters = haversineDist(90, 0, -90, 0)
    expect(meters).toBeGreaterThan(20_000_000)
    expect(meters).toBeLessThan(20_100_000)
  })
})
