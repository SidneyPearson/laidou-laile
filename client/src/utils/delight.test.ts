import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIRST_SPOT_TOAST,
  PLAN_FULL_TOAST,
  celebratePlanAdded,
  pickCopy,
  playfulPlanLimitMessage,
  prefersReducedMotion,
  timeGreeting,
} from './delight'

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

describe('playfulPlanLimitMessage', () => {
  it('always returns a non-empty playful line and rotates between calls', () => {
    const first = playfulPlanLimitMessage()
    expect(first.length).toBeGreaterThan(0)
    const seen = new Set([first, playfulPlanLimitMessage(), playfulPlanLimitMessage()])
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('prefersReducedMotion', () => {
  it('is false in non-DOM environments (safe no-op)', () => {
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('celebratePlanAdded', () => {
  it('warms up the copy for the very first spot', () => {
    expect(celebratePlanAdded(1, 3, null)).toBe(FIRST_SPOT_TOAST)
  })

  it('keeps the neutral copy for middle spots', () => {
    expect(celebratePlanAdded(2, 3, null)).toBe('已加入今日计划')
  })

  it('celebrates with the full-plan copy once the limit is reached', () => {
    expect(celebratePlanAdded(3, 3, null)).toBe(PLAN_FULL_TOAST)
    expect(celebratePlanAdded(4, 3, null)).toBe(PLAN_FULL_TOAST)
  })
})
