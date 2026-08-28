import { computed, ref } from 'vue'
import type { InspirationSpot } from '../types/explore'
import type {
  FavoriteCityDescriptor,
  FavoriteSpot,
  ToggleFavoriteResult,
} from '../types/favorites'

const STORAGE_KEY = 'laidou-v04-favorites'
const STORAGE_VERSION = 1

interface StoredFavorites {
  version: number
  spots: FavoriteSpot[]
}

const spots = ref<FavoriteSpot[]>([])
const storageAvailable = ref(true)
let loaded = false

function isVerifiedSpot(spot: InspirationSpot): spot is InspirationSpot & {
  amapPoiId: string
  address: string
  lng: number
  lat: number
  verificationStatus: 'verified'
  source: 'amap_verified'
  mock: false
} {
  return spot.verificationStatus === 'verified'
    && spot.source === 'amap_verified'
    && spot.mock === false
    && typeof spot.amapPoiId === 'string'
    && spot.amapPoiId.length > 0
    && typeof spot.address === 'string'
    && Number.isFinite(spot.lng)
    && Number.isFinite(spot.lat)
    && Math.abs(spot.lng as number) <= 180
    && Math.abs(spot.lat as number) <= 90
}

function normalizeCityDescriptor(
  spot: InspirationSpot,
  descriptor?: Partial<FavoriteCityDescriptor> | null,
): FavoriteCityDescriptor {
  const center = descriptor?.center
  return {
    adcode: typeof descriptor?.adcode === 'string' ? descriptor.adcode : '',
    name: typeof descriptor?.name === 'string' && descriptor.name.trim()
      ? descriptor.name
      : spot.city,
    province: typeof descriptor?.province === 'string' ? descriptor.province : '',
    coverImageUrl: typeof descriptor?.coverImageUrl === 'string' ? descriptor.coverImageUrl : null,
    center: center && Number.isFinite(center.lat) && Number.isFinite(center.lng)
      ? { lat: center.lat, lng: center.lng }
      : null,
  }
}

function snapshotSpot(
  spot: InspirationSpot & {
    amapPoiId: string
    address: string
    lng: number
    lat: number
    verificationStatus: 'verified'
    source: 'amap_verified'
    mock: false
  },
  cityDescriptor?: Partial<FavoriteCityDescriptor> | null,
): FavoriteSpot {
  return {
    ...spot,
    tags: [...spot.tags],
    suitablePersonas: [...spot.suitablePersonas],
    amapPoiId: spot.amapPoiId,
    address: spot.address,
    lng: spot.lng,
    lat: spot.lat,
    verificationStatus: 'verified',
    source: 'amap_verified',
    mock: false,
    favoritedAt: new Date().toISOString(),
    cityDescriptor: normalizeCityDescriptor(spot, cityDescriptor),
  }
}

function sanitizeFavorite(value: unknown): FavoriteSpot | null {
  if (!value || typeof value !== 'object') return null
  const spot = value as Partial<FavoriteSpot>
  if (
    typeof spot.id !== 'string'
    || typeof spot.city !== 'string'
    || typeof spot.name !== 'string'
    || typeof spot.district !== 'string'
    || typeof spot.category !== 'string'
    || typeof spot.reason !== 'string'
    || !Array.isArray(spot.tags)
    || !Array.isArray(spot.suitablePersonas)
    || typeof spot.suggestedDuration !== 'string'
    || typeof spot.bestTime !== 'string'
    || typeof spot.theme !== 'string'
    || typeof spot.amapPoiId !== 'string'
    || !spot.amapPoiId
    || typeof spot.address !== 'string'
    || !Number.isFinite(spot.lng)
    || !Number.isFinite(spot.lat)
    || Math.abs(spot.lng as number) > 180
    || Math.abs(spot.lat as number) > 90
    || spot.verificationStatus !== 'verified'
    || spot.source !== 'amap_verified'
    || spot.mock !== false
    || typeof spot.favoritedAt !== 'string'
  ) return null

  return {
    ...spot,
    tags: spot.tags.filter((tag): tag is string => typeof tag === 'string'),
    suitablePersonas: spot.suitablePersonas,
    cityDescriptor: normalizeCityDescriptor(spot as InspirationSpot, spot.cityDescriptor),
  } as FavoriteSpot
}

function isSameFavorite(a: Pick<FavoriteSpot, 'id' | 'amapPoiId'>, b: Pick<FavoriteSpot, 'id' | 'amapPoiId'>): boolean {
  return a.id === b.id || a.amapPoiId === b.amapPoiId
}

function readStored(): FavoriteSpot[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as Partial<StoredFavorites>
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.spots)) return []
    const unique: FavoriteSpot[] = []
    for (const value of parsed.spots) {
      const spot = sanitizeFavorite(value)
      if (!spot) continue
      const duplicateIndex = unique.findIndex(item => isSameFavorite(item, spot))
      if (duplicateIndex >= 0) {
        if (spot.favoritedAt > unique[duplicateIndex].favoritedAt) unique[duplicateIndex] = spot
      } else unique.push(spot)
    }
    return unique.sort((a, b) => b.favoritedAt.localeCompare(a.favoritedAt))
  } catch {
    return []
  }
}

function hydrate() {
  if (loaded) return
  loaded = true
  spots.value = readStored()
}

function syncFromStorage() {
  // 持久化已失败时继续保留当前会话内存态；再次读取空存储会把用户刚收藏的
  // 地点抹掉，与“仅本次打开期间保留”的提示相矛盾。
  if (!storageAvailable.value || typeof localStorage === 'undefined') return
  spots.value = readStored()
}

function persist() {
  if (typeof localStorage === 'undefined') {
    storageAvailable.value = false
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      spots: spots.value,
    } satisfies StoredFavorites))
    storageAvailable.value = true
  } catch {
    storageAvailable.value = false
  }
}

export function useFavorites() {
  hydrate()

  const count = computed(() => spots.value.length)
  const cities = computed(() => [...new Set(spots.value.map(spot => spot.city))])

  function hasSpot(spotOrId: InspirationSpot | string): boolean {
    if (typeof spotOrId === 'string') return spots.value.some(spot => spot.id === spotOrId)
    return spots.value.some(spot => spot.id === spotOrId.id
      || (!!spotOrId.amapPoiId && spot.amapPoiId === spotOrId.amapPoiId))
  }

  function toggle(
    spot: InspirationSpot,
    cityDescriptor?: Partial<FavoriteCityDescriptor> | null,
  ): ToggleFavoriteResult {
    syncFromStorage()
    if (!isVerifiedSpot(spot)) return { status: 'unverified' }
    const existing = spots.value.find(item => item.id === spot.id || item.amapPoiId === spot.amapPoiId)
    if (existing) {
      spots.value = spots.value.filter(item => !isSameFavorite(item, existing))
      persist()
      return { status: 'removed', spot: existing }
    }
    const snapshot = snapshotSpot(spot, cityDescriptor)
    spots.value = [snapshot, ...spots.value]
    persist()
    return { status: 'added', spot: snapshot }
  }

  function remove(id: string): boolean {
    syncFromStorage()
    const next = spots.value.filter(spot => spot.id !== id)
    if (next.length === spots.value.length) return false
    spots.value = next
    persist()
    return true
  }

  function clear(): boolean {
    syncFromStorage()
    if (spots.value.length === 0) return false
    spots.value = []
    persist()
    return true
  }

  return {
    spots,
    count,
    cities,
    storageAvailable,
    hasSpot,
    toggle,
    remove,
    clear,
  }
}

export function resetFavoritesForTests() {
  spots.value = []
  storageAvailable.value = true
  loaded = false
}
