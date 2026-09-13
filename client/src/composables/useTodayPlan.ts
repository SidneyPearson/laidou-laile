import { computed, ref } from 'vue'
import type { InspirationSpot } from '../types/explore'
import { haversineDist } from '../utils/geo'
import {
  TODAY_PLAN_LEGACY_LIMIT,
  TODAY_PLAN_LIMIT,
  type AddTodaySpotResult,
  type TodaySpot,
} from '../types/todayPlan'

const STORAGE_KEY = 'laidou-v03-today-plan'
const STORAGE_VERSION = 3

/** 按城市分桶的今日计划：key 优先用城市 6 位 adcode，没有 adcode 时用城市名。
 *  切换城市时保留各城市各自的计划，切回原城市可恢复。 */
interface StoredTodayPlan {
  version: number
  cities: Record<string, TodaySpot[]>
  activeCityKey: string | null
  /** 激活城市名称（去「市」），用于 adcode 与名称两种 key 之间的去重。 */
  activeCityName?: string | null
}

/** 旧版（v1/v2）单城市计划结构，仅用于迁移读取。 */
interface LegacyStoredTodayPlan {
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
/** 当前激活城市的分桶 key；spots 始终对应该城市的计划。 */
const activeCityKey = ref<string | null>(null)
/** 激活城市的名称（去「市」归一化），用于判断地点是否属于当前桶——
 *  因为同一个城市可能用 adcode(310000) 或名称(上海)两种 key 被设置。 */
let activeCityName = ''
/** 各城市的计划桶。只有激活城市的 spots 是响应式的，其余只在切换/持久化时读写。 */
let cityBuckets: Record<string, TodaySpot[]> = {}
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

/** 把城市名归一成与分桶 key 名称分支一致的形式（trim + 去「市」）。 */
function normalizeCityName(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/市$/, '')
}

/** 把 adcode / 城市名归一成稳定的分桶 key：优先 6 位 adcode，否则用去「市」的城市名。 */
function resolveCityKey(descriptor: { adcode?: string | null; cityName?: string | null }): string {
  const adcode = (descriptor.adcode ?? '').trim()
  if (/^\d{6}$/.test(adcode)) return adcode
  return normalizeCityName(descriptor.cityName)
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

/** 清洗并去重一桶地点，保留上限按 cap（迁移旧存档用 legacy 6，正常读取用当前 3）。 */
function cleanBucket(raw: unknown[], cap: number, markMigration: () => void): TodaySpot[] {
  const unique: TodaySpot[] = []
  if (!Array.isArray(raw)) return unique
  for (const value of raw) {
    const spot = sanitizeSpot(value)
    if (!spot) { markMigration(); continue }
    const duplicateIndex = unique.findIndex(item => isSameTodayPlace(item, spot))
    if (duplicateIndex >= 0) {
      unique[duplicateIndex] = spot
      markMigration()
      continue
    }
    unique.push(spot)
    if (unique.length === cap) break
  }
  if (unique.length !== raw.length) markMigration()
  return unique
}

/** 把旧版单城市数组按城市名分桶，迁移到 v3。 */
function migrateLegacySpots(rawSpots: unknown): { cities: Record<string, TodaySpot[]>; activeCityKey: string | null } {
  const byCity = new Map<string, TodaySpot[]>()
  if (!Array.isArray(rawSpots)) return { cities: {}, activeCityKey: null }
  for (const value of rawSpots) {
    const spot = sanitizeSpot(value)
    if (!spot) continue
    const key = resolveCityKey({ cityName: spot.city }) || '__legacy__'
    if (!byCity.has(key)) byCity.set(key, [])
    byCity.get(key)!.push(spot)
  }
  const cities: Record<string, TodaySpot[]> = {}
  for (const [key, list] of byCity) {
    cities[key] = cleanBucket(list, TODAY_PLAN_LEGACY_LIMIT, () => { storageNeedsMigration = true })
  }
  const firstKey = Object.keys(cities)[0] ?? null
  return { cities, activeCityKey: firstKey }
}

/** 把同一城市因 adcode/名称两种 key 产生的碎片桶合并成一个：
 *  例如 310000（空，当前激活）与「上海」（有地点）合并为 310000 一个桶。
 *  以 activeKey 作为该城市的规范 key（优先 adcode），其余按城市名归并。 */
function coalesceCityBuckets(
  buckets: Record<string, TodaySpot[]>,
  activeKey: string | null,
  activeNameHint: string,
): { cities: Record<string, TodaySpot[]>; activeCityKey: string | null; activeCityName: string } {
  // 先确定每个非空桶的城市名。
  const entries = Object.entries(buckets).map(([key, list]) => ({
    key,
    list,
    name: list.length > 0 ? normalizeCityName(list[0].city) : '',
  }))

  // 找到激活城市名：优先 hint，其次从与 activeKey 同城市名的非空桶里取。
  let activeName = normalizeCityName(activeNameHint)
  if (!activeName) {
    const activeNonEmpty = entries.find(e => e.key === activeKey && e.name)
    if (activeNonEmpty) activeName = activeNonEmpty.name
  }

  // 按城市名归并；若该城市名对应 activeKey，则规范 key 用 activeKey。
  const byName = new Map<string, { key: string; spots: TodaySpot[] }>()
  const orphans: { key: string; list: TodaySpot[] }[] = []
  for (const e of entries) {
    if (!e.name) { orphans.push(e); continue }
    if (activeName && e.name === activeName && activeKey) {
      // 归到激活 key
      const existing = byName.get(activeName)
      const target = existing ?? { key: activeKey, spots: [] }
      for (const spot of e.list) {
        const dup = target.spots.findIndex(item => isSameTodayPlace(item, spot))
        if (dup >= 0) target.spots[dup] = spot
        else target.spots.push(spot)
      }
      byName.set(activeName, target)
      if (e.key !== activeKey) storageNeedsMigration = true
    } else {
      const existing = byName.get(e.name)
      if (!existing) byName.set(e.name, { key: e.key, spots: [...e.list] })
      else {
        storageNeedsMigration = true
        for (const spot of e.list) {
          const dup = existing.spots.findIndex(item => isSameTodayPlace(item, spot))
          if (dup >= 0) existing.spots[dup] = spot
          else existing.spots.push(spot)
        }
      }
    }
  }

  const cities: Record<string, TodaySpot[]> = {}
  let resolvedActiveKey = activeKey
  for (const [name, { key, spots: list }] of byName) {
    cities[key] = list.slice(0, TODAY_PLAN_LEGACY_LIMIT)
    if (name === activeName) resolvedActiveKey = key
  }
  // 激活城市当前没有任何地点时，保留一个空桶（key 用 activeKey 或名称）。
  if (resolvedActiveKey && !(resolvedActiveKey in cities)) {
    cities[resolvedActiveKey] = []
  }
  if (!resolvedActiveKey) {
    resolvedActiveKey = Object.keys(cities)[0] ?? null
  }
  return { cities, activeCityKey: resolvedActiveKey, activeCityName: activeName }
}

interface LoadedPlan {
  cities: Record<string, TodaySpot[]>
  activeCityKey: string | null
  activeCityName: string
}

function loadFromStorage(): LoadedPlan {
  storageNeedsMigration = false
  if (typeof localStorage === 'undefined') return { cities: {}, activeCityKey: null, activeCityName: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { cities: {}, activeCityKey: null, activeCityName: '' }
    const parsed = JSON.parse(raw) as Partial<StoredTodayPlan & LegacyStoredTodayPlan>

    // v3：按城市分桶。
    if (parsed.version === STORAGE_VERSION && parsed.cities && typeof parsed.cities === 'object') {
      const rawBuckets: Record<string, TodaySpot[]> = {}
      const storedActive = typeof parsed.activeCityKey === 'string' ? parsed.activeCityKey : null
      const storedName = typeof parsed.activeCityName === 'string' ? normalizeCityName(parsed.activeCityName) : ''
      for (const [key, value] of Object.entries(parsed.cities)) {
        const clean = cleanBucket(value, TODAY_PLAN_LEGACY_LIMIT, () => { storageNeedsMigration = true })
        if (clean.length > 0) rawBuckets[key] = clean
      }
      return coalesceCityBuckets(rawBuckets, storedActive, storedName)
    }

    // v1/v2：单城市数组 → 按城市名分桶迁移。
    if ([1, 2].includes(parsed.version as number) && Array.isArray(parsed.spots)) {
      storageNeedsMigration = true
      const migrated = migrateLegacySpots(parsed.spots)
      return coalesceCityBuckets(migrated.cities, migrated.activeCityKey, '')
    }

    return { cities: {}, activeCityKey: null, activeCityName: '' }
  } catch {
    return { cities: {}, activeCityKey: null, activeCityName: '' }
  }
}

function applyLoaded(loaded: LoadedPlan) {
  cityBuckets = loaded.cities
  activeCityKey.value = loaded.activeCityKey
  activeCityName = loaded.activeCityName
  spots.value = loaded.activeCityKey && cityBuckets[loaded.activeCityKey]
    ? [...cityBuckets[loaded.activeCityKey]]
    : []
}

function hydrate() {
  if (loaded) return
  loaded = true
  applyLoaded(loadFromStorage())
  if (storageNeedsMigration) persist()
}

/** Reconcile state changed in another tab or before a hot reload. */
function syncFromStorage() {
  if (typeof localStorage === 'undefined') return
  applyLoaded(loadFromStorage())
  if (storageNeedsMigration) persist()
}

function persist() {
  if (typeof localStorage === 'undefined') return
  if (activeCityKey.value) {
    // 即使当前城市计划为空也写一个空桶，保证 activeCityKey 能被正确读回，
    // 否则另一标签页/重复 hydrate 时会把激活城市误判为 null。
    cityBuckets[activeCityKey.value] = [...spots.value]
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      cities: cityBuckets,
      activeCityKey: activeCityKey.value,
      activeCityName,
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
  hydrate()

  const count = computed(() => spots.value.length)
  const totalStayMinutes = computed(() =>
    spots.value.reduce((sum, spot) => sum + durationMinutesOf(spot.suggestedDuration), 0),
  )
  const cities = computed(() => [...new Set(spots.value.map(spot => spot.city))])

  /** 切换到某城市的计划桶。没有该城市的计划时从空计划开始；原城市的计划保留在本地，
   *  切回原城市会自动恢复。传空 descriptor 时不切换。返回实际生效的分桶 key。 */
  function setActiveCity(descriptor: { adcode?: string | null; cityName?: string | null }): string | null {
    const key = resolveCityKey(descriptor)
    if (!key) return activeCityKey.value
    const nextCityName = normalizeCityName(descriptor.cityName)
    // 逆地理编码返回的通常是区县 adcode（如东城区 110101），策展城市使用
    // 城市级 adcode（北京 110000）。城市名一致时两者必须继续使用同一个桶，
    // 否则从 Swipe 页进入普通探索页会看起来像把刚选的计划清空了。
    if (activeCityKey.value && nextCityName && nextCityName === activeCityName) {
      return activeCityKey.value
    }
    if (key === activeCityKey.value) {
      if (nextCityName) activeCityName = nextCityName
      return key
    }
    if (activeCityKey.value) cityBuckets[activeCityKey.value] = [...spots.value]
    activeCityKey.value = key
    activeCityName = nextCityName || cityBuckets[key]?.[0]?.city?.replace(/市$/, '') || ''
    spots.value = cityBuckets[key] ? [...cityBuckets[key]] : []
    persist()
    return key
  }

  function spotsForCity(cityName: string): TodaySpot[] {
    const name = normalizeCityName(cityName)
    if (name === activeCityName) return spots.value
    return Object.values(cityBuckets).find(list => normalizeCityName(list[0]?.city) === name) ?? []
  }

  function hasSpot(id: string): boolean {
    return spots.value.some(spot => spot.id === id)
  }

  function addSpot(spot: InspirationSpot): AddTodaySpotResult {
    syncFromStorage()
    if (!isVerifiedSpot(spot)) return { status: 'unverified' }
    // v3 按城市分桶：若地点属于与当前桶不同的城市，切到该城市的桶，
    // 避免把 A 城的地点存进 B 城的计划。按城市名比较，避免 adcode 与名称
    // 两种 key 把同一城市拆成两个桶。
    const spotCity = normalizeCityName(spot.city)
    const spotCityKey = spotCity && spotCity !== activeCityName
      ? resolveCityKey({ cityName: spot.city })
      : null
    if (spotCityKey && spotCityKey !== activeCityKey.value) {
      setActiveCity({ cityName: spot.city })
    }
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
    cityKey: activeCityKey,
    storageAvailable,
    setActiveCity,
    hasSpot,
    spotsForCity,
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
  cityBuckets = {}
  activeCityKey.value = null
  activeCityName = ''
  storageAvailable.value = true
  loaded = false
}
