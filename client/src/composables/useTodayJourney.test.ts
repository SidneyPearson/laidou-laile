import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTodayJourneyForTests, useTodayJourney } from './useTodayJourney'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  resetTodayJourneyForTests()
})

describe('useTodayJourney', () => {
  it('starts, changes the next stop and completes the journey', () => {
    const journey = useTodayJourney()
    const ids = ['a', 'b', 'c']

    expect(journey.start(ids)).toBe(true)
    expect(journey.currentId.value).toBe('a')
    expect(journey.chooseNext('c', ids)).toBe(true)
    expect(journey.currentId.value).toBe('c')

    expect(journey.completeSpot('c', ids)).toBe(true)
    expect(journey.completedIds.value).toEqual(['c'])
    expect(journey.currentId.value).toBe('a')
    journey.completeSpot('a', ids)
    journey.completeSpot('b', ids)
    expect(journey.status.value).toBe('complete')
    expect(journey.currentId.value).toBeNull()
  })

  it('removes stale progress when the plan changes', () => {
    const journey = useTodayJourney()
    journey.start(['a', 'b'])
    journey.completeSpot('a', ['a', 'b'])

    journey.syncWithSpots(['b', 'c'])
    expect(journey.completedIds.value).toEqual([])
    expect(journey.currentId.value).toBe('b')
  })
})
