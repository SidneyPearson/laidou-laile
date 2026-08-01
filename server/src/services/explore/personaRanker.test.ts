import { describe, expect, it } from 'vitest'
import { getCityHotspots } from './hotspotRepository.js'
import { filterAndRankHotspots } from './personaRanker.js'

describe('filterAndRankHotspots', () => {
  const spots = getCityHotspots('上海')

  it('filters by category', () => {
    const result = filterAndRankHotspots(spots, 'family', 'nature')
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(spot => spot.category === 'nature')).toBe(true)
  })

  it('puts persona matches before unmatched candidates', () => {
    const result = filterAndRankHotspots(spots, 'urban', 'all')
    const firstUnmatched = result.findIndex(spot => !spot.suitablePersonas.includes('urban'))
    const lastMatched = result.reduce(
      (last, spot, index) => spot.suitablePersonas.includes('urban') ? index : last,
      -1,
    )

    expect(firstUnmatched).toBeGreaterThan(-1)
    expect(lastMatched).toBeLessThan(firstUnmatched)
  })

  it('raises indoor candidates and lowers nature in rainy weather', () => {
    const dry = filterAndRankHotspots(spots, 'couple', 'all', false)
    const rainy = filterAndRankHotspots(spots, 'couple', 'all', true)
    const museumDry = dry.findIndex(spot => spot.id === 'shanghai-museum-east')
    const museumRainy = rainy.findIndex(spot => spot.id === 'shanghai-museum-east')
    const westBundDry = dry.findIndex(spot => spot.id === 'shanghai-west-bund')
    const westBundRainy = rainy.findIndex(spot => spot.id === 'shanghai-west-bund')

    expect(museumRainy).toBeLessThan(museumDry)
    expect(westBundRainy).toBeGreaterThanOrEqual(westBundDry)
  })
})
