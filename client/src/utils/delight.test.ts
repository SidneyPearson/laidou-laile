import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickCopy, prefersReducedMotion, timeGreeting } from './delight'

describe('timeGreeting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [2, '夜深了'],
    [8, '早上好'],
    [12, '中午好'],
    [15, '下午好'],
    [21, '晚上好'],
  ] as Array<[number, string]>)('greets appropriately at hour %i', (hour, prefix) => {
    vi.setSystemTime(new Date(2026, 7, 17, hour, 0, 0))
    expect(timeGreeting()).toContain(prefix)
  })
})

describe('pickCopy', () => {
  it('rotates through the pool by a stable index', () => {
    const pool = ['a', 'b', 'c']
    expect(pickCopy(pool, 0)).toBe('a')
    expect(pickCopy(pool, 3)).toBe('a')
    expect(pickCopy(pool, 7)).toBe('b')
  })

  it('handles negative indexes', () => {
    expect(pickCopy(['a', 'b'], -1)).toBe('b')
  })

  it('returns an empty string for an empty pool', () => {
    expect(pickCopy([], 0)).toBe('')
  })
})

describe('prefersReducedMotion', () => {
  it('is false in non-DOM environments (safe no-op)', () => {
    expect(prefersReducedMotion()).toBe(false)
  })
})
