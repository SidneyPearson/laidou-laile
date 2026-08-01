import { describe, expect, it } from 'vitest'
import { fitStopsToTimeBudget, getMinimumVisitDuration, getStopCountRange } from './timeBudget.js'

describe('getStopCountRange', () => {
  it.each([
    [60, { min: 2, max: 2 }],
    [120, { min: 3, max: 3 }],
    [240, { min: 4, max: 5 }],
    [480, { min: 5, max: 6 }],
  ])('maps %i minutes to the agreed range', (minutes, expected) => {
    expect(getStopCountRange(minutes)).toEqual(expected)
  })
})

describe('fitStopsToTimeBudget', () => {
  const stops = Array.from({ length: 8 }, (_, i) => ({
    name: `地点${i}`, lat: 31.23 + i * 0.001, lng: 121.47,
    visitDurationMinutes: 30, qualityScore: 100 - i,
  }))

  it.each([[60, 2], [120, 3], [240, 5], [480, 6]])(
    '%i minutes never exceeds %i stops or the total budget',
    (minutes, max) => {
      const result = fitStopsToTimeBudget(stops, minutes, { lat: 31.23, lng: 121.47 })
      expect(result.stops.length).toBeLessThanOrEqual(max)
      expect(result.totalMinutes).toBeLessThanOrEqual(minutes)
    },
  )

  it('does not compress a museum visit below its reasonable minimum', () => {
    const result = fitStopsToTimeBudget([
      { name: '城市博物馆', typecode: '140100', lat: 31.3, lng: 121.47, visitDurationMinutes: 70 },
    ], 60, { lat: 31.23, lng: 121.47 })
    expect(result.stops).toHaveLength(0)
  })

  it('defines different minimums for meals, cafes, museums and streets', () => {
    expect(getMinimumVisitDuration({ name: '城市博物馆', typecode: '140100' })).toBeGreaterThanOrEqual(45)
    expect(getMinimumVisitDuration({ name: '本帮菜餐厅', typecode: '050100' })).toBeGreaterThanOrEqual(30)
    expect(getMinimumVisitDuration({ name: '胡同咖啡馆', typecode: '050500' })).toBeLessThan(30)
    expect(getMinimumVisitDuration({ name: '南锣鼓巷', typecode: '060400' })).toBeGreaterThanOrEqual(30)
  })
})
