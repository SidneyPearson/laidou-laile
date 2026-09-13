import { computed, ref } from 'vue'
import { sanitizeTicket, useTickets, type TicketRecord, type TicketSpotSnapshot } from './useTickets'
import { cityKeyResolver, normalizeCityName } from '../utils/cityIdentity'
import type { TodaySpot } from '../types/todayPlan'

// 独立保存完成记录，不改写历史票根。同一天的多次行程也完整保留。
const STORAGE_KEY = 'laidou-v03-footprints'
const visits = ref<TicketRecord[]>([])
const storageAvailable = ref(true)
let loaded = false

export interface FootprintCity {
  key: string
  cityAdcode: string
  cityName: string
  spots: TicketSpotSnapshot[]
  dates: string[]
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, visits: visits.value }))
    storageAvailable.value = true
  } catch { storageAvailable.value = false }
}

export function useFootprints() {
  if (!loaded) {
    loaded = true
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (data.version === 1 && Array.isArray(data.visits)) {
        visits.value = data.visits.map(sanitizeTicket).filter((v: TicketRecord | null): v is TicketRecord => v !== null)
      }
    } catch { /* 无历史足迹时仍兼容已有票根。 */ }
  }
  const { tickets } = useTickets()
  const visitedCities = computed<FootprintCity[]>(() => {
    const records = [...visits.value, ...tickets.value].filter(r => !r.invalidated).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    const keyFor = cityKeyResolver(records)
    const groups = new Map<string, FootprintCity>()
    for (const record of records) {
      const key = keyFor(record)
      let city = groups.get(key)
      if (!city) {
        city = { key, cityAdcode: /^\d{6}$/.test(key) ? key : '', cityName: normalizeCityName(record.cityName), spots: [], dates: [] }
        groups.set(key, city)
      }
      if (!city.dates.includes(record.date)) city.dates.push(record.date)
      for (const spot of record.spots) {
        if (!city.spots.some(s => s.id === spot.id)) city.spots.push(spot)
      }
    }
    return [...groups.values()]
  })

  function recordCompletion(input: {
    journeyId?: string | null
    status: string; completedAt: string | null; completedIds: string[]
    cityAdcode?: string | null; spots: TodaySpot[]
  }): boolean {
    const { spots, completedAt } = input
    if (input.status !== 'complete' || !completedAt || !Number.isFinite(Date.parse(completedAt))
      || !spots.length || spots.some(s => !input.completedIds.includes(s.id))) return false
    const names = new Set(spots.map(s => normalizeCityName(s.city)))
    if (names.size !== 1 || ![...names][0]) return false
    const cityName = [...names][0]
    const cityAdcode = /^\d{6}$/.test(input.cityAdcode ?? '') ? input.cityAdcode! : ''
    const id = JSON.stringify([cityAdcode || cityName, completedAt, spots.map(s => s.id).sort()])
    const alreadyRecorded = visits.value.some(v => v.id === id)
    const date = new Date(completedAt)
    const record = sanitizeTicket({
      id, cityName, cityAdcode, generatedAt: completedAt, journeyId: input.journeyId,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      spots,
    })!
    if (alreadyRecorded) {
      visits.value = visits.value.map(v => v.id === id ? { ...v, journeyId: input.journeyId || v.journeyId, invalidated: false } : v)
    } else {
      visits.value = [record, ...visits.value.map(v => input.journeyId && v.journeyId === input.journeyId
        ? { ...v, invalidated: true } : v)]
    }
    persist()
    return true
  }
  function invalidateCompletion(journeyId: string | null, completedAt: string | null, spotIds: string[]) {
    visits.value = visits.value.map(visit => {
      const linked = journeyId && visit.journeyId === journeyId
      const legacyMatch = !visit.journeyId && completedAt && visit.generatedAt === completedAt
        && visit.spots.length === spotIds.length && visit.spots.every(s => spotIds.includes(s.id))
      return linked || legacyMatch ? { ...visit, invalidated: true } : visit
    })
    persist()
  }
  return { invalidateCompletion, visitedCities, visitedCount: computed(() => visitedCities.value.length), storageAvailable, recordCompletion }
}

export function resetFootprintsForTests() {
  loaded = false
  visits.value = []
  storageAvailable.value = true
}
