import { describe, expect, it } from 'vitest'
import { formatOriginDistance } from './distance'

describe('formatOriginDistance', () => {
  it('does not turn an unknown distance into 0m', () => {
    expect(formatOriginDistance(undefined)).toBe('距离未知')
    expect(formatOriginDistance(Number.NaN)).toBe('距离未知')
  })

  it('labels the reference as the departure point', () => {
    expect(formatOriginDistance(321)).toBe('距出发点约 321m')
    expect(formatOriginDistance(1200)).toBe('距出发点约 1.2km')
  })

  it('keeps a verified same-coordinate zero distinct from unknown', () => {
    expect(formatOriginDistance(0)).toBe('距出发点 0m')
  })
})
