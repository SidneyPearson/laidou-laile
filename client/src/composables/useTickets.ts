import { computed, ref } from 'vue'
import { cityKeyResolver, normalizeCityName } from '../utils/cityIdentity'
import type { TodaySpot } from '../types/todayPlan'

/**
 * 城市票根：用户在「今日计划」完成行程后生成票根时落一条记录。
 * 票根按「城市 + 日期」去重（同一天同一座城市再生成只刷新不叠加）；
 * 旧票根作为历史足迹来源；新完成的行程由 useFootprints 独立保存。
 * 数据只存当前浏览器 localStorage，和收藏/计划一样不上传。
 */

export interface TicketSpotSnapshot {
  id: string
  name: string
  category: string
  lng: number
  lat: number
  /** 票根扇形卡片用的封面（可选，缺失时弹层走渐变兜底）。 */
  coverImageUrl?: string
  coverImageFallbackUrl?: string
}

export interface TicketRecord {
  journeyId?: string
  invalidated?: boolean
  /** `${cityKey}-${yyyy-mm-dd}`，同城同日只保留最新一张 */
  id: string
  cityAdcode: string
  cityName: string
  /** yyyy-mm-dd（生成时的本地日期） */
  date: string
  generatedAt: string
  persona: string
  duration: string
  spots: TicketSpotSnapshot[]
}

interface StoredTickets {
  version: number
  tickets: TicketRecord[]
}

const STORAGE_KEY = 'laidou-v03-tickets'
const STORAGE_VERSION = 1

const tickets = ref<TicketRecord[]>([])
const storageAvailable = ref(true)
let loaded = false

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function sanitizeTicket(value: unknown): TicketRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<TicketRecord>
  if (
    typeof record.id !== 'string'
    || typeof record.cityName !== 'string'
    || typeof record.date !== 'string'
    || typeof record.generatedAt !== 'string'
    || !Array.isArray(record.spots)
  ) return null
  const spots: TicketSpotSnapshot[] = []
  for (const raw of record.spots) {
    if (!raw || typeof raw !== 'object') continue
    const spot = raw as Partial<TicketSpotSnapshot>
    if (
      typeof spot.id === 'string'
      && typeof spot.name === 'string'
      && Number.isFinite(spot.lng)
      && Number.isFinite(spot.lat)
    ) {
      spots.push({
        id: spot.id,
        name: spot.name,
        category: typeof spot.category === 'string' ? spot.category : '',
        lng: Number(spot.lng),
        lat: Number(spot.lat),
        coverImageUrl: typeof spot.coverImageUrl === 'string' ? spot.coverImageUrl : undefined,
        coverImageFallbackUrl: typeof spot.coverImageFallbackUrl === 'string' ? spot.coverImageFallbackUrl : undefined,
      })
    }
  }
  return {
    id: record.id,
    journeyId: typeof record.journeyId === 'string' ? record.journeyId : undefined,
    invalidated: record.invalidated === true,
    cityAdcode: typeof record.cityAdcode === 'string' ? record.cityAdcode : '',
    cityName: record.cityName,
    date: record.date,
    generatedAt: record.generatedAt,
    persona: typeof record.persona === 'string' ? record.persona : '',
    duration: typeof record.duration === 'string' ? record.duration : '',
    spots,
  }
}

function loadFromStorage(): TicketRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredTickets>
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.tickets)) return []
    return parsed.tickets
      .map(sanitizeTicket)
      .filter((item): item is TicketRecord => item !== null)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  } catch {
    return []
  }
}

function hydrate() {
  if (loaded) return
  loaded = true
  tickets.value = loadFromStorage()
}

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      tickets: tickets.value,
    } satisfies StoredTickets))
    storageAvailable.value = true
  } catch {
    storageAvailable.value = false
  }
}

export function useTickets() {
  hydrate()

  const visitedCities = computed(() => {
    const keyFor = cityKeyResolver(tickets.value)
    const byKey = new Map<string, TicketRecord>()
    for (const ticket of tickets.value) {
      if (ticket.invalidated) continue
      const key = keyFor(ticket)
      if (!byKey.has(key)) byKey.set(key, ticket)
    }
    return [...byKey.values()]
  })
  const visitedCount = computed(() => visitedCities.value.length)

  /** 记录一张票根：同城同日刷新，其余追加。返回去重后的 id。 */
  function recordTicket(input: {
    journeyId?: string | null
    cityAdcode?: string | null
    cityName: string
    persona?: string
    duration?: string
    spots: TodaySpot[]
  }): string {
    hydrate()
    const now = new Date()
    const date = localDateKey(now)
    const adcode = input.cityAdcode && /^\d{6}$/.test(input.cityAdcode) ? input.cityAdcode : ''
    const cityName = normalizeCityName(input.cityName) || '未知城市'
    const id = `${adcode || normalizeCityName(cityName)}-${date}`
    const record: TicketRecord = {
      id,
      journeyId: input.journeyId || undefined,
      cityAdcode: adcode,
      cityName,
      date,
      generatedAt: now.toISOString(),
      persona: input.persona ?? '',
      duration: input.duration ?? '',
      spots: input.spots.map(spot => ({
        id: spot.id,
        name: spot.name,
        category: spot.category,
        lng: Number(spot.lng),
        lat: Number(spot.lat),
        coverImageUrl: spot.coverImageUrl,
        coverImageFallbackUrl: spot.coverImageFallbackUrl,
      })),
    }
    const index = tickets.value.findIndex(item => item.id === id)
    if (index >= 0) tickets.value[index] = record
    else tickets.value = [record, ...tickets.value]
    tickets.value = [...tickets.value].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    persist()
    return id
  }

  function invalidateJourney(journeyId: string | null) {
    if (!journeyId) return
    let changed = false
    tickets.value = tickets.value.map(ticket => {
      if (ticket.journeyId !== journeyId || ticket.invalidated) return ticket
      changed = true
      return { ...ticket, invalidated: true }
    })
    if (changed) persist()
  }

  return {
    invalidateJourney,
    tickets,
    storageAvailable,
    visitedCount,
    visitedCities,
    recordTicket,
  }
}

export function resetTicketsForTests() {
  tickets.value = []
  storageAvailable.value = true
  loaded = false
}
