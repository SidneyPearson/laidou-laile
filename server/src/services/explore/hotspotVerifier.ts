import { verifyPlace } from '../amap/poiSearch.js'
import type { HotspotSeed, InspirationSpot } from '../../types/explore.js'
import type { AmapPOI } from '../../types/poi.js'

type VerifyPlaceFn = (
  name: string,
  lng: number,
  lat: number,
  adcode?: string,
  maxDistance?: number,
) => Promise<AmapPOI | null>

interface CacheEntry {
  expiresAt: number
  spot: InspirationSpot
}

function reservationNoteFor(seed: HotspotSeed): string {
  if (seed.reservationNote) return seed.reservationNote
  if (seed.tags.includes('需预约')) {
    return '建议出发前通过场馆官方渠道确认实名预约、放票时间与当日开放安排。'
  }
  if (seed.category === 'theme_park') {
    return '门票、开园时间和演出项目可能调整，出发前请查看景区官方当天公告。'
  }
  if (seed.theme === 'museum' || seed.indoorFriendly) {
    return '场馆可能实行预约或周一闭馆，出发前请查看官方开放公告。'
  }
  if (seed.category === 'nature') {
    return '户外停留时间较长，请结合降雨、高温和日落时间安排出发。'
  }
  if (seed.category === 'food') {
    return '晚餐和夜宵高峰可能排队，建议到店前确认营业时间。'
  }
  return '营业与临时管控可能变化，出发前建议再通过官方渠道确认。'
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const verificationCache = new Map<string, CacheEntry>()

export function clearHotspotVerificationCache(): void {
  verificationCache.clear()
}

function fromVerifiedPoi(seed: HotspotSeed, poi: AmapPOI, verifiedAt: string): InspirationSpot {
  const officialCover = seed.officialCoverImage
  return {
    id: seed.id,
    city: seed.city,
    name: seed.name,
    amapName: poi.name,
    district: seed.district,
    category: seed.category,
    reason: seed.reason,
    tags: [...seed.tags],
    suitablePersonas: [...seed.suitablePersonas],
    suggestedDuration: seed.suggestedDuration,
    bestTime: seed.bestTime,
    theme: seed.theme,
    amapPoiId: poi.id,
    address: poi.address,
    lng: poi.lng,
    lat: poi.lat,
    verifiedAt,
    verificationStatus: 'verified',
    source: 'amap_verified',
    mock: false,
    coverImageUrl: officialCover?.url ?? poi.photoUrl,
    coverImageFallbackUrl: officialCover ? poi.photoUrl : undefined,
    coverImageSource: officialCover ? 'official' : poi.photoUrl ? 'amap' : undefined,
    coverImageSourceName: officialCover?.sourceName ?? (poi.photoUrl ? '高德 POI 数据' : undefined),
    coverImageSourceUrl: officialCover?.sourcePageUrl,
    reservationNote: reservationNoteFor(seed),
  }
}

export async function verifyHotspotSeeds(
  seeds: HotspotSeed[],
  options: {
    verify?: VerifyPlaceFn
    delayMs?: number
    now?: () => Date
  } = {},
): Promise<InspirationSpot[]> {
  const verify = options.verify ?? verifyPlace
  const delayMs = options.delayMs ?? 350
  const now = options.now ?? (() => new Date())
  const results: InspirationSpot[] = []

  for (let index = 0; index < seeds.length; index++) {
    const seed = seeds[index]
    const cached = verificationCache.get(seed.id)
    if (cached && cached.expiresAt > Date.now()) {
      results.push(cached.spot)
      continue
    }

    const poi = await verify(
      seed.searchName,
      seed.seedLng,
      seed.seedLat,
      seed.adcode,
      12_000,
    )

    if (poi) {
      const verifiedAt = now().toISOString()
      const spot = fromVerifiedPoi(seed, poi, verifiedAt)
      verificationCache.set(seed.id, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        spot,
      })
      results.push(spot)
    }

    if (delayMs > 0 && index < seeds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}
