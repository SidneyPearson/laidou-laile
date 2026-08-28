import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InspirationSpot } from '../types/explore'
import { resetFavoritesForTests, useFavorites } from './useFavorites'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
}

const verifiedSpot = (id = 'spot-1'): InspirationSpot => ({
  id,
  city: '上海',
  name: `地点${id}`,
  district: '黄浦区',
  category: 'landmark',
  reason: '值得去',
  tags: ['城市'],
  suitablePersonas: ['couple'],
  suggestedDuration: '建议 2 小时',
  bestTime: '傍晚',
  theme: 'river',
  amapPoiId: `poi-${id}`,
  address: '测试地址',
  lng: 121.49,
  lat: 31.24,
  verificationStatus: 'verified',
  source: 'amap_verified',
  mock: false,
})

describe('useFavorites', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    resetFavoritesForTests()
  })

  it('adds verified spots and persists their city descriptor', () => {
    const favorites = useFavorites()
    const result = favorites.toggle(verifiedSpot(), {
      adcode: '310000',
      name: '上海市',
      province: '上海市',
    })
    expect(result.status).toBe('added')
    expect(favorites.count.value).toBe(1)
    expect(favorites.spots.value[0].cityDescriptor.adcode).toBe('310000')
    expect(localStorage.getItem('laidou-v04-favorites')).toContain('spot-1')
  })

  it('toggles an existing POI off instead of duplicating it', () => {
    const favorites = useFavorites()
    favorites.toggle(verifiedSpot('old'))
    favorites.toggle({ ...verifiedSpot('new'), amapPoiId: 'poi-old' })
    expect(favorites.count.value).toBe(0)
  })

  it('rejects demo or incomplete spots', () => {
    const favorites = useFavorites()
    const result = favorites.toggle({
      ...verifiedSpot(),
      verificationStatus: 'demo',
      source: 'local_demo',
      mock: true,
    })
    expect(result.status).toBe('unverified')
    expect(favorites.count.value).toBe(0)
  })

  it('hydrates valid entries, drops invalid entries and sorts newest first', () => {
    const first = { ...verifiedSpot('first'), favoritedAt: '2026-01-01T00:00:00.000Z', cityDescriptor: { adcode: '', name: '上海', province: '', coverImageUrl: null, center: null } }
    const second = { ...verifiedSpot('second'), favoritedAt: '2026-02-01T00:00:00.000Z', cityDescriptor: { adcode: '', name: '上海', province: '', coverImageUrl: null, center: null } }
    localStorage.setItem('laidou-v04-favorites', JSON.stringify({ version: 1, spots: [first, { id: 'bad' }, second] }))
    resetFavoritesForTests()
    const favorites = useFavorites()
    expect(favorites.spots.value.map(spot => spot.id)).toEqual(['second', 'first'])
  })

  it('clears all favorites without touching other local state', () => {
    const favorites = useFavorites()
    favorites.toggle(verifiedSpot())
    localStorage.setItem('unrelated', 'keep')
    expect(favorites.clear()).toBe(true)
    expect(favorites.count.value).toBe(0)
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })

  it('keeps the in-memory favorite when persistence is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
    })
    resetFavoritesForTests()
    const favorites = useFavorites()
    expect(favorites.toggle(verifiedSpot()).status).toBe('added')
    expect(favorites.toggle(verifiedSpot('second')).status).toBe('added')
    expect(favorites.count.value).toBe(2)
    expect(favorites.storageAvailable.value).toBe(false)
  })
})
