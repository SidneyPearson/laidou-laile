import type { SpotRecord } from '../../domain/curation.js'
import type { ExploreCategory, InspirationSpot, Persona, SpotTheme } from '../../types/explore.js'
import { haversineDist } from '../../utils/geo.js'

/** D1 编辑分类 → H5 城市灵感分类。 */
const CATEGORY_MAP: Record<SpotRecord['category'], Exclude<ExploreCategory, 'all'>> = {
  classic_landmark: 'landmark',
  featured_district: 'district',
  walk_street: 'street',
  theme_park: 'theme_park',
  nature: 'nature',
  mall: 'mall',
  food: 'food',
  museum_culture: 'museum',
}

/** 派生封面渐变色主题（D1 暂无 theme 列）。 */
const THEME_MAP: Record<SpotRecord['category'], SpotTheme> = {
  classic_landmark: 'city',
  featured_district: 'lane',
  walk_street: 'market',
  theme_park: 'wonderland',
  nature: 'garden',
  mall: 'city',
  food: 'night',
  museum_culture: 'museum',
}

/** 后台自由文本画像标签 → H5 营销画像。未命中的标签忽略。 */
const PERSONA_TAG_MAP: Record<string, Persona> = {
  family: 'family',
  theme_park: 'family',
  first_visit: 'fast',
  nature: 'fast',
  photography: 'couple',
  food: 'couple',
  culture: 'urban',
  museum: 'urban',
  history: 'urban',
  shopping: 'urban',
  city_walk: 'lazy',
  street: 'lazy',
}

const ALL_PERSONAS: Persona[] = ['fast', 'couple', 'family', 'lazy', 'urban']

function normalizedPlaceName(value: string): string {
  return compactPlaceName(value)
    .replace(/(?:国家级)?(?:旅游)?(?:风景名胜区|主题乐园|度假区|风景区|乐园|景区)$/u, '')
}

function compactPlaceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function isSamePublicPlace(a: InspirationSpot, b: InspirationSpot): boolean {
  if (a.id === b.id || (!!a.amapPoiId && a.amapPoiId === b.amapPoiId)) return true
  const aName = normalizedPlaceName(a.name)
  const bName = normalizedPlaceName(b.name)
  const relatedNames = (aName && aName === bName)
    || (aName.length >= 4
    && bName.length >= 4
    && (aName.includes(bName) || bName.includes(aName)))
  return !!relatedNames && haversineDist(a.lat, a.lng, b.lat, b.lng) <= 500
}

function deduplicatePublicPlaces(spots: InspirationSpot[]): InspirationSpot[] {
  const unique: InspirationSpot[] = []
  for (const spot of spots) {
    if (!unique.some(item => isSamePublicPlace(item, spot))) unique.push(spot)
  }
  return unique
}

export function mapSpotCategory(category: SpotRecord['category']): Exclude<ExploreCategory, 'all'> {
  return CATEGORY_MAP[category]
}

function mapPersonas(tags: string[]): Persona[] {
  const mapped = new Set<Persona>()
  for (const tag of tags) {
    const persona = PERSONA_TAG_MAP[tag.trim().toLowerCase()]
    if (persona) mapped.add(persona)
  }
  return mapped.size > 0 ? [...mapped] : ALL_PERSONAS
}

/** Convert a D1 published+verified spot to the H5 InspirationSpot shape.
 *  Returns null when the spot lacks the coordinates/POI id required to navigate. */
export function spotToInspiration(spot: SpotRecord, cityName: string): InspirationSpot | null {
  if (!spot.amapPoiId?.trim() || !Number.isFinite(spot.lng) || !Number.isFinite(spot.lat)) {
    return null
  }
  return {
    id: spot.id,
    city: cityName,
    name: spot.name,
    amapName: spot.amapName || spot.name,
    district: spot.district ?? '',
    category: CATEGORY_MAP[spot.category],
    reason: spot.reason,
    tags: spot.tags,
    suitablePersonas: mapPersonas(spot.personas),
    suggestedDuration: spot.suggestedDuration ?? '',
    bestTime: spot.bestTime ?? '',
    theme: THEME_MAP[spot.category],
    amapPoiId: spot.amapPoiId,
    address: spot.address ?? '',
    lng: spot.lng as number,
    lat: spot.lat as number,
    verifiedAt: spot.verifiedAt ?? new Date(0).toISOString(),
    verificationStatus: 'verified',
    source: 'amap_verified',
    mock: false,
    ...(spot.coverImageUrl ? { coverImageUrl: spot.coverImageUrl, coverImageSource: 'official' as const } : {}),
    reservationNote: spot.reservationNote ?? '',
  }
}

export interface InspirationSelection {
  persona?: Persona
  category: ExploreCategory
  isRainy: boolean
  cursor: number
  limit: number
  /** User's latitude/longitude, when authorized. Enables proximity ranking. */
  userLat?: number
  userLng?: number
}

/** Convert a distance in meters to a 0..~20 proximity score. The nearest
 *  spots get a meaningful boost; beyond ~12km the score tapers toward zero so
 *  far-away spots don't differ from each other on proximity. */
function proximityScore(distanceMeters: number): number {
  const km = distanceMeters / 1000
  if (km <= 0.5) return 20
  if (km >= 12) return 0
  // Roughly 20 at 0.5km, ~6 at 3km, ~1 at 8km.
  return Math.round(20 * Math.exp(-km / 3) * 10) / 10
}

/** Filter by the requested category, score for persona/weather/proximity, and
 *  paginate. When user coordinates are supplied the ranking blends persona/weather
 *  relevance with a strong proximity boost (nearest wins on equal relevance), and
 *  each returned spot carries `distanceMeters`; without coordinates it falls
 *  back to pure persona/weather relevance. D1 spots are already Amap-verified,
 *  so no runtime verification is needed. */
export function selectInspirationSpots(
  spots: SpotRecord[],
  cityName: string,
  selection: InspirationSelection,
): { spots: InspirationSpot[]; nextCursor: number | null } {
  const converted = deduplicatePublicPlaces(spots
    .map(spot => spotToInspiration(spot, cityName))
    .filter((spot): spot is InspirationSpot => spot !== null))

  const filtered = selection.category === 'all'
    ? converted
    : converted.filter(spot => spot.category === selection.category)

  const hasLocation = Number.isFinite(selection.userLat) && Number.isFinite(selection.userLng)

  const ranked = filtered
    .map((spot, index) => {
      let distanceMeters: number | undefined
      if (hasLocation) {
        distanceMeters = Math.round(
          haversineDist(selection.userLat as number, selection.userLng as number, spot.lat, spot.lng),
        )
      }
      let score = selection.persona && spot.suitablePersonas.includes(selection.persona) ? 10 : 0
      if (selection.isRainy) {
        if (spot.theme === 'garden' || spot.category === 'nature') score -= 8
        // D1 没有显式 indoor 标记；博物馆/商场类默认适合雨天。
        if (spot.category === 'museum' || spot.category === 'mall') score += 12
      }
      if (distanceMeters !== undefined) score += proximityScore(distanceMeters)
      return { spot: { ...spot, ...(distanceMeters !== undefined ? { distanceMeters } : {}) }, index, score, distanceMeters }
    })
    .sort((a, b) => {
      // With a location: rank by blended relevance score (persona + weather + a
      // strong proximity boost) first, then break ties by nearest distance. This
      // keeps nearby spots dominant without letting a random nearby spot beat a
      // notable place a little further away.
      if (a.distanceMeters !== undefined && b.distanceMeters !== undefined) {
        return b.score - a.score
          || a.distanceMeters - b.distanceMeters
          || a.index - b.index
      }
      return b.score - a.score || a.index - b.index
    })
    .map(item => item.spot)

  const start = Math.min(selection.cursor, ranked.length)
  const page = ranked.slice(start, start + selection.limit)
  const nextCursor = start + page.length < ranked.length ? start + page.length : null
  return { spots: page, nextCursor }
}
