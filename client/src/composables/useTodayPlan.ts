import { computed, ref } from 'vue'
import type { InspirationSpot } from '../types/explore'
import {
  TODAY_PLAN_LIMIT,
  type AddTodaySpotResult,
  type TodaySpot,
} from '../types/todayPlan'

const STORAGE_KEY = 'laidou-v03-today-plan'
const STORAGE_VERSION = 1

interface StoredTodayPlan {
  version: number
  spots: TodaySpot[]
}

type VerifiedInspirationSpot = InspirationSpot & {
  amapPoiId: string
  address: string
  lng: number
  lat: number
  verificationStatus: 'verified'
  source: 'amap_verified'
  mock: false
}

const spots = ref<TodaySpot[]>([])
const storageAvailable = ref(true)
let loaded = false

function isVerifiedSpot(spot: InspirationSpot): spot is VerifiedInspirationSpot {
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

function sanitizeSpot(value: unknown): TodaySpot | null {
  if (!value || typeof value !== 'object') return null
  const spot = value as Partial<TodaySpot>
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
  ) return null

  return {
    ...spot,
    tags: spot.tags.filter((tag): tag is string => typeof tag === 'string'),
    suitablePersonas: spot.suitablePersonas,
    addedAt: typeof spot.addedAt === 'string' ? spot.addedAt : new Date(0).toISOString(),
  } as TodaySpot
}

function readStoredSpots(): TodaySpot[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredTodayPlan>
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.spots)) return []

    const seen = new Set<string>()
    const seenPoiIds = new Set<string>()
    return parsed.spots
      .map(sanitizeSpot)
      .filter((spot): spot is TodaySpot => {
        if (!spot || seen.has(spot.id) || seenPoiIds.has(spot.amapPoiId)) return false
        seen.add(spot.id)
        seenPoiIds.add(spot.amapPoiId)
        return true
      })
      .slice(0, TODAY_PLAN_LIMIT)
  } catch {
    return []
  }
}

function loadFromStorage() {
  if (loaded) return
  loaded = true
  spots.value = readStoredSpots()
}

/** Reconcile state changed in another tab or before a hot reload. */
function syncFromStorage() {
  if (typeof localStorage === 'undefined') return
  spots.value = readStoredSpots()
}

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      spots: spots.value,
    } satisfies StoredTodayPlan))
    storageAvailable.value = true
  } catch {
    storageAvailable.value = false
  }
}

function snapshotSpot(spot: VerifiedInspirationSpot): TodaySpot {
  return {
    id: spot.id,
    city: spot.city,
    name: spot.name,
    district: spot.district,
    category: spot.category,
    reason: spot.reason,
    tags: [...spot.tags],
    suitablePersonas: [...spot.suitablePersonas],
    suggestedDuration: spot.suggestedDuration,
    bestTime: spot.bestTime,
    theme: spot.theme,
    amapName: spot.amapName,
    amapPoiId: spot.amapPoiId,
    address: spot.address,
    lng: spot.lng,
    lat: spot.lat,
    verifiedAt: spot.verifiedAt,
    verificationStatus: 'verified',
    source: 'amap_verified',
    mock: false,
    coverImageUrl: spot.coverImageUrl,
    coverImageFallbackUrl: spot.coverImageFallbackUrl,
    coverImageSource: spot.coverImageSource,
    coverImageSourceName: spot.coverImageSourceName,
    coverImageSourceUrl: spot.coverImageSourceUrl,
    reservationNote: spot.reservationNote,
    addedAt: new Date().toISOString(),
  }
}

export function durationMinutesOf(label: string): number {
  if (label.includes('一整天') || label.includes('一天')) return 480
  if (label.includes('半天')) return 240
  const range = label.match(/(\d+(?:\.\d+)?)\s*[–—~-]\s*(\d+(?:\.\d+)?)\s*小时/)
  if (range) return Math.round(((Number(range[1]) + Number(range[2])) / 2) * 60)
  const matched = label.match(/(\d+(?:\.\d+)?)\s*(小时|分钟)/)
  if (!matched) return 90
  const value = Number(matched[1])
  return matched[2] === '小时' ? Math.round(value * 60) : Math.round(value)
}

export function useTodayPlan() {
  loadFromStorage()

  const count = computed(() => spots.value.length)
  const totalStayMinutes = computed(() =>
    spots.value.reduce((sum, spot) => sum + durationMinutesOf(spot.suggestedDuration), 0),
  )
  const cities = computed(() => [...new Set(spots.value.map(spot => spot.city))])

  function hasSpot(id: string): boolean {
    return spots.value.some(spot => spot.id === id)
  }

  function addSpot(spot: InspirationSpot): AddTodaySpotResult {
    syncFromStorage()
    if (
      hasSpot(spot.id)
      || (!!spot.amapPoiId && spots.value.some(item => item.amapPoiId === spot.amapPoiId))
    ) return { status: 'duplicate' }
    if (!isVerifiedSpot(spot)) return { status: 'unverified' }
    if (spots.value.length >= TODAY_PLAN_LIMIT) return { status: 'limit' }

    const snapshot = snapshotSpot(spot)
    spots.value = [...spots.value, snapshot]
    persist()
    return { status: 'added', spot: snapshot }
  }

  function removeSpot(id: string): boolean {
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

  function moveSpot(id: string, direction: -1 | 1): boolean {
    const index = spots.value.findIndex(spot => spot.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= spots.value.length) return false
    const next = [...spots.value]
    ;[next[index], next[target]] = [next[target], next[index]]
    spots.value = next
    persist()
    return true
  }

  function replaceOrder(ids: string[]): boolean {
    if (
      ids.length !== spots.value.length
      || new Set(ids).size !== ids.length
      || ids.some(id => !hasSpot(id))
    ) return false

    const byId = new Map(spots.value.map(spot => [spot.id, spot]))
    spots.value = ids.map(id => byId.get(id) as TodaySpot)
    persist()
    return true
  }

  return {
    spots,
    count,
    totalStayMinutes,
    cities,
    storageAvailable,
    hasSpot,
    addSpot,
    removeSpot,
    clear,
    moveSpot,
    replaceOrder,
  }
}

export function resetTodayPlanForTests() {
  spots.value = []
  storageAvailable.value = true
  loaded = false
}
