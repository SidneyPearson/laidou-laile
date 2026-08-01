import type { ExploreCategory, HotspotSeed, Persona } from '../../types/explore.js'

export function filterAndRankHotspots(
  spots: HotspotSeed[],
  persona: Persona,
  category: ExploreCategory,
  isRainy = false,
): HotspotSeed[] {
  return spots
    .filter(spot => category === 'all' || spot.category === category)
    .map((spot, index) => {
      let score = spot.suitablePersonas.includes(persona) ? 10 : 0
      if (isRainy && spot.indoorFriendly) score += 12
      if (isRainy && spot.category === 'nature') score -= 8
      return { spot, index, score }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.spot)
}
