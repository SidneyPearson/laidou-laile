import { describe, expect, it } from 'vitest'
import { filterAndRankSpots, getExploreSpots } from './mockExploreSpots'

describe('city inspiration mock data', () => {
  it('provides a richer Shanghai preview without fabricated ratings', () => {
    const spots = getExploreSpots('上海')

    expect(spots.length).toBeGreaterThanOrEqual(10)
    expect(spots.every(spot => spot.mock)).toBe(true)
    expect(JSON.stringify(spots)).not.toContain('rating')
    expect(JSON.stringify(spots)).not.toContain('reviews')
  })

  it('provides curated but explicitly unverified previews for Beijing and Hangzhou', () => {
    for (const city of ['北京', '杭州']) {
      const spots = getExploreSpots(city)
      expect(spots.length).toBeGreaterThanOrEqual(8)
      expect(spots.every(spot => spot.mock)).toBe(true)
      expect(spots.some(spot => spot.category === 'theme_park')).toBe(true)
      expect(spots.some(spot => spot.category === 'food')).toBe(true)
    }
  })

  it('uses generic transparent cards for a city without curated preview data', () => {
    const spots = getExploreSpots('成都')
    expect(spots).toHaveLength(4)
    expect(spots.every(spot => spot.tags.includes('演示数据'))).toBe(true)
  })

  it('filters by the selected category', () => {
    const spots = filterAndRankSpots(getExploreSpots('上海'), 'couple', 'nature')

    expect(spots.length).toBeGreaterThan(0)
    expect(spots.every(spot => spot.category === 'nature')).toBe(true)
  })

  it('ranks persona-matched cards before unmatched cards', () => {
    const spots = filterAndRankSpots(getExploreSpots('上海'), 'urban', 'all')
    const firstUnmatched = spots.findIndex(spot => !spot.suitablePersonas.includes('urban'))
    const lastMatched = spots.reduce(
      (last, spot, index) => spot.suitablePersonas.includes('urban') ? index : last,
      -1,
    )

    expect(firstUnmatched).toBeGreaterThan(-1)
    expect(lastMatched).toBeLessThan(firstUnmatched)
  })

  it('returns an empty feed for a city that is not in the local preview', () => {
    expect(getExploreSpots('当前城市')).toEqual([])
  })
})
