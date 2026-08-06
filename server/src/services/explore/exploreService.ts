import type { CurationRepository } from '../../repositories/curationRepository.js'
import { selectInspirationSpots } from './d1Source.js'
import type {
  ExploreCategory,
  ExploreRecommendation,
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
  lat?: number
  lng?: number
}

export interface ExploreDependencies {
  repository: CurationRepository
}

/** Read published+verified spots for the requested city from D1 and shape them
 *  for the H5 city-inspiration feed. D1 spots are already Amap-verified, so this
 *  does no network calls. Returns null when the city is not published. */
export async function recommendCitySpots(
  input: RecommendInput,
  dependencies: ExploreDependencies,
): Promise<ExploreRecommendation | null> {
  const city = input.adcode
    ? await dependencies.repository.findPublishedCity(input.adcode)
    : await dependencies.repository.findPublishedCity(input.city)
  if (!city) return null

  const spots = await dependencies.repository.listPublished(city.adcode)
  const { spots: page, nextCursor } = selectInspirationSpots(spots, city.name, {
    persona: input.persona,
    category: input.category,
    isRainy: input.isRainy,
    cursor: input.cursor,
    limit: input.limit,
    ...(Number.isFinite(input.lat) && Number.isFinite(input.lng)
      ? { userLat: input.lat, userLng: input.lng }
      : {}),
  })

  return {
    spots: page,
    nextCursor,
    source: 'curated_amap_verified',
  }
}
