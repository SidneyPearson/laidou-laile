import { computed, ref } from 'vue'
import type { InspirationSpot } from '../types/explore'
import { haversineDist } from '../utils/geo'
import {
  TODAY_PLAN_LIMIT,
  type AddTodaySpotResult,
  type TodaySpot,
} from '../types/todayPlan'

const STORAGE_KEY = 'laidou-v03-today-plan'
const STORAGE_VERSION = 2

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
let storageNeedsMigration = false

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

/** Stable identity across curation migrations where ids/POI ids may change. */
export function isSameTodayPlace(a: Pick<TodaySpot, 'id' | 'city' | 'name' | 'amapPoiId' | 'lng' | 'lat'>, b: Pick<TodaySpot, 'id' | 'city' | 'name' | 'amapPoiId' | 'lng' | 'lat'>): boolean {
  if (a.id === b.id || (!!a.amapPoiId && a.amapPoiId === b.amapPoiId)) return true
  if (normalizedPlaceName(a.city) !== normalizedPlaceName(b.city)) return false
  const aName = normalizedPlaceName(a.name)
  const bName = normalizedPlaceName(b.name)
  const relatedNames = (aName && aName === bName)
    || (aName.length >= 4
    && bName.length >= 4
    && (aName.includes(bName) || bName.includes(aName)))
  return !!relatedNames && haversineDist(a.lat, a.lng, b.lat, b.lng) <= 500
}

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
  storageNeedsMigration = false
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredTodayPlan>
    if (![1, STORAGE_VERSION].includes(parsed.version as number) || !Array.isArray(parsed.spots)) return []
    storageNeedsMigration = parsed.version !== STORAGE_VERSION

    const unique: TodaySpot[] = []
    for (const value of parsed.spots) {
      const spot = sanitizeSpot(value)
      if (!spot) {
        storageNeedsMigration = true
        continue
      }
      const duplicateIndex = unique.findIndex(item => isSameTodayPlace(item, spot))
      if (duplicateIndex >= 0) {
        // Later snapshots normally come from the latest curation response.
        unique[duplicateIndex] = spot
        storageNeedsMigration = true
        continue
      }
      unique.push(spot)
      if (unique.length === TODAY_PLAN_LIMIT) break
    }
    if (unique.length !== parsed.spots.length) storageNeedsMigration = true
    return unique
  } catch {
    return []
  }
}

function loadFromStorage() {
  if (loaded) return
  loaded = true
  spots.value = readStoredSpots()
  if (storageNeedsMigration) persist()
}

/** Reconcile state changed in another tab or before a hot reload. */
function syncFromStorage() {
  if (typeof localStorage === 'undefined') return
  spots.value = readStoredSpots()
  if (storageNeedsMigration) persist()
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
  if (!matched) return 0
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
    if (!isVerifiedSpot(spot)) return { status: 'unverified' }
    const snapshot = snapshotSpot(spot)
    const duplicateIndex = spots.value.findIndex(item => isSameTodayPlace(item, snapshot))
    if (duplicateIndex >= 0) {
      spots.value = spots.value.map((item, index) => index === duplicateIndex ? snapshot : item)
      persist()
      return { status: 'duplicate' }
    }
    if (spots.value.length >= TODAY_PLAN_LIMIT) return { status: 'limit' }

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

  /** 用策展库里的最新快照刷新某个地点的字段（保持位置与 addedAt 不变），
   *  供「POI 已变更」场景一键修复本地过期信息。 */
  function updateSpot(id: string, patch: Partial<TodaySpot>): boolean {
    const index = spots.value.findIndex(spot => spot.id === id)
    if (index < 0) return false
    const next = [...spots.value]
    next[index] = {
      ...next[index],
      ...patch,
      id,
      addedAt: next[index].addedAt,
    }
    spots.value = next
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
    updateSpot,
  }
}

export function resetTodayPlanForTests() {
  spots.value = []
  storageAvailable.value = true
  loaded = false
}
