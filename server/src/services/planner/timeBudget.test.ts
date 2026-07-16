import { describe, expect, it } from 'vitest'
import { fitStopsToTimeBudget, getStopCountRange } from './timeBudget.js'

describe('getStopCountRange', () => {
  it.each([
    [60, 2, 3], [120, 3, 4], [240, 4, 5], [480, 5, 7],
  ])('%i minutes → %i-%i stops', (minutes, min, max) => {
    expect(getStopCountRange(minutes)).toEqual({ min, max })
  })
})

describe('fitStopsToTimeBudget', () => {
  const stops = Array.from({ length: 8 }, (_, i) => ({
    name: `地点${i}`, lat: 31.23 + i * 0.001, lng: 121.47,
    visitDurationMinutes: 30, qualityScore: 100 - i,
  }))

  it.each([[60, 3], [120, 4], [240, 5], [480, 7]])(
    '%i minutes never exceeds %i stops or the total budget',
    (minutes, max) => {
      const result = fitStopsToTimeBudget(stops, minutes, { lat: 31.23, lng: 121.47 })
      expect(result.stops.length).toBeLessThanOrEqual(max)
      expect(result.totalMinutes).toBeLessThanOrEqual(minutes)
    },
  )
})
