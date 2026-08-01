import { getCityHotspots } from './hotspotRepository.js'
import { filterAndRankHotspots } from './personaRanker.js'
import { verifyHotspotSeeds } from './hotspotVerifier.js'
import type {
  ExploreCategory,
  ExploreRecommendation,
  HotspotSeed,
  InspirationSpot,
  Persona,
} from '../../types/explore.js'

interface RecommendInput {
  city: string
  adcode?: string
  persona: Persona
  category: ExploreCategory
  cursor: number
  limit: number
  isRainy: boolean
}

interface ExploreDependencies {
  getHotspots?: (city: string, adcode?: string) => HotspotSeed[]
  verify?: (seeds: HotspotSeed[]) => Promise<InspirationSpot[]>
}

export async function recommendCitySpots(
  input: RecommendInput,
  dependencies: ExploreDependencies = {},
): Promise<ExploreRecommendation | null> {
  const getHotspots = dependencies.getHotspots ?? getCityHotspots
  const verify = dependencies.verify ?? verifyHotspotSeeds
  const seeds = getHotspots(input.city, input.adcode)
  if (seeds.length === 0) return null

  const ranked = filterAndRankHotspots(
    seeds,
    input.persona,
    input.category,
    input.isRainy,
  )

  const start = Math.min(input.cursor, ranked.length)
  // Verify extra candidates so failed Amap matches can be backfilled.
  const candidateEnd = Math.min(start + input.limit * 2, ranked.length)
  const candidates = ranked.slice(start, candidateEnd)
  const verified = await verify(candidates)
  const spots = verified.slice(0, input.limit)
  const consumed = candidates.length

  return {
    spots,
    nextCursor: start + consumed < ranked.length ? start + consumed : null,
    source: 'curated_amap_verified',
  }
}
