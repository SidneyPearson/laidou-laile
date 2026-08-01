import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCityHotspots } from './hotspotRepository.js'
import {
  clearHotspotVerificationCache,
  verifyHotspotSeeds,
} from './hotspotVerifier.js'
import type { AmapPOI } from '../../types/poi.js'

function poi(name: string): AmapPOI {
  return {
    id: `amap-${name}`,
    name,
    type: '风景名胜',
    typecode: '110000',
    address: '上海市测试地址',
    lng: 121.49,
    lat: 31.24,
    distance: 120,
    rating: null,
    cost: null,
    photoUrl: 'https://aos-comment.amap.com/test.jpg',
  }
}

describe('verifyHotspotSeeds', () => {
  beforeEach(() => clearHotspotVerificationCache())

  it('returns only Amap-resolved candidates with traceable metadata', async () => {
    const seeds = getCityHotspots('上海').slice(0, 2).map(({
      officialCoverImage: _officialCoverImage,
      ...seed
    }) => seed)
    const verify = vi.fn(async (name: string) => poi(name))
    const result = await verifyHotspotSeeds(seeds, {
      verify,
      delayMs: 0,
      now: () => new Date('2026-07-24T00:00:00.000Z'),
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      source: 'amap_verified',
      verificationStatus: 'verified',
      mock: false,
      verifiedAt: '2026-07-24T00:00:00.000Z',
      coverImageUrl: 'https://aos-comment.amap.com/test.jpg',
    })
    expect(result[0].reservationNote).toBeTruthy()
    expect(result[0].amapPoiId).toContain('amap-')
    expect(verify).toHaveBeenCalledWith(
      seeds[0].searchName,
      seeds[0].seedLng,
      seeds[0].seedLat,
      '310000',
      12000,
    )
  })

  it('omits candidates that Amap cannot resolve', async () => {
    const seeds = getCityHotspots('上海').slice(0, 2)
    const verify = vi.fn()
      .mockResolvedValueOnce(poi(seeds[0].searchName))
      .mockResolvedValueOnce(null)
    const result = await verifyHotspotSeeds(seeds, { verify, delayMs: 0 })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(seeds[0].id)
  })

  it('prefers a curated official cover and keeps the Amap photo as fallback', async () => {
    const seed = {
      ...getCityHotspots('上海')[0],
      officialCoverImage: {
        url: 'https://english.shanghai.gov.cn/official.jpg',
        sourceName: '上海市政府英文网',
        sourcePageUrl: 'https://english.shanghai.gov.cn/place',
      },
    }
    const result = await verifyHotspotSeeds([seed], {
      verify: async name => poi(name),
      delayMs: 0,
    })

    expect(result[0]).toMatchObject({
      coverImageUrl: 'https://english.shanghai.gov.cn/official.jpg',
      coverImageFallbackUrl: 'https://aos-comment.amap.com/test.jpg',
      coverImageSource: 'official',
      coverImageSourceName: '上海市政府英文网',
      coverImageSourceUrl: 'https://english.shanghai.gov.cn/place',
    })
  })

  it('reuses successful verification inside the isolate cache', async () => {
    const seeds = getCityHotspots('上海').slice(0, 1)
    const verify = vi.fn(async (name: string) => poi(name))

    await verifyHotspotSeeds(seeds, { verify, delayMs: 0 })
    await verifyHotspotSeeds(seeds, { verify, delayMs: 0 })

    expect(verify).toHaveBeenCalledTimes(1)
  })
})
