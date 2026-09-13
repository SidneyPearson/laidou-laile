import { computed, ref } from 'vue'
import { useTodayPlan } from './useTodayPlan'

const STORAGE_KEY = 'laidou-v03-today-journey'
const STORAGE_VERSION = 2
export type JourneyStatus = 'idle' | 'active' | 'complete'
interface StoredJourney {
  id: string | null
  status: JourneyStatus
  completedIds: string[]
  currentId: string | null
  startedAt: string | null
  completedAt: string | null
}
interface CityJourney { cityName: string; journey: StoredJourney }
const emptyJourney = (): StoredJourney => ({
  id: null, status: 'idle', completedIds: [], currentId: null, startedAt: null, completedAt: null,
})
const buckets = ref<Record<string, CityJourney>>(Object.create(null))
const storageAvailable = ref(true)
let loaded = false
const newJourneyId = () => globalThis.crypto?.randomUUID?.()
  ?? `journey-${Date.now()}-${Math.random().toString(36).slice(2)}`
const normalizeName = (name: string) => name.trim().replace(/市$/, '')

function sanitize(value: unknown): StoredJourney | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<StoredJourney>
  if (!['idle', 'active', 'complete'].includes(raw.status || '') || !Array.isArray(raw.completedIds)) return null
  return {
    id: typeof raw.id === 'string' ? raw.id : typeof raw.startedAt === 'string' ? raw.startedAt : typeof raw.completedAt === 'string' ? raw.completedAt : null,
    status: raw.status!, completedIds: [...new Set(raw.completedIds.filter((id): id is string => typeof id === 'string'))],
    currentId: typeof raw.currentId === 'string' ? raw.currentId : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
  }
}

function load() {
  if (loaded) return
  loaded = true
  const plan = useTodayPlan()
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (raw.version === STORAGE_VERSION && raw.cities && typeof raw.cities === 'object') {
      for (const [key, value] of Object.entries(raw.cities)) {
        const entry = value as Partial<CityJourney> | null
        const journey = sanitize(entry?.journey)
        if (journey) buckets.value[key] = { cityName: typeof entry?.cityName === 'string' ? entry.cityName : '', journey }
      }
    } else if (raw.version === 1) {
      const journey = sanitize(raw)
      if (journey) buckets.value[plan.cityKey.value || '__unassigned__'] = {
        cityName: normalizeName(plan.cities.value[0] || ''), journey,
      }
    }
  } catch { /* 首次使用或损坏的存档不妨碍本次行程。 */ }
}

// 与计划共享激活城市，所有切城入口都自动选中对应进度；同城名称/行政码兼容。
function currentKey() {
  const plan = useTodayPlan()
  const key = plan.cityKey.value || '__unassigned__'
  if (buckets.value[key]) return key
  const name = normalizeName(plan.cities.value[0] || '')
  const aliases = Object.entries(buckets.value).filter(([, b]) => name && b.cityName === name)
  return aliases.length === 1 ? aliases[0][0] : key
}
function currentState(): StoredJourney { return buckets.value[currentKey()]?.journey || emptyJourney() }
function updateState(journey: StoredJourney) {
  const plan = useTodayPlan()
  buckets.value[currentKey()] = { cityName: normalizeName(plan.cities.value[0] || ''), journey }
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, cities: buckets.value }))
    storageAvailable.value = true
  } catch { storageAvailable.value = false }
}

export function useTodayJourney() {
  load()
  const state = computed({ get: currentState, set: updateState })

  const status = computed(() => state.value.status)
  const completedIds = computed(() => state.value.completedIds)
  const currentId = computed(() => state.value.currentId)
  const startedAt = computed(() => state.value.startedAt)
  const completedAt = computed(() => state.value.completedAt)

  function syncWithSpots(validIds: string[]) {
    const valid = new Set(validIds)
    const completed = state.value.completedIds.filter(id => valid.has(id))
    let current = state.value.currentId && valid.has(state.value.currentId)
      && !completed.includes(state.value.currentId)
      ? state.value.currentId
      : null

    if (validIds.length === 0) {
      state.value = emptyJourney()
    } else if (state.value.status !== 'idle' && completed.length >= validIds.length) {
      state.value = {
        ...state.value,
        status: 'complete',
        completedIds: completed,
        currentId: null,
        completedAt: state.value.completedAt || new Date().toISOString(),
      }
    } else {
      const status = state.value.status === 'complete' ? 'active' : state.value.status
      if (status === 'active' && !current) {
        current = validIds.find(id => !completed.includes(id)) || null
      }
      state.value = { ...state.value, status, completedIds: completed, currentId: current, completedAt: null }
    }
    persist()
  }

  function start(validIds: string[]) {
    if (validIds.length === 0) return false
    const completed = state.value.completedIds.filter(id => validIds.includes(id))
    state.value = {
      ...state.value,
      status: 'active',
      id: state.value.id || newJourneyId(),
      completedIds: completed,
      currentId: validIds.find(id => !completed.includes(id)) || validIds[0],
      startedAt: state.value.startedAt || new Date().toISOString(),
      completedAt: null,
    }
    persist()
    return true
  }

  function chooseNext(id: string, validIds: string[]) {
    if (state.value.status !== 'active') return false
    if (!validIds.includes(id) || state.value.completedIds.includes(id)) return false
    state.value = { ...state.value, currentId: id }
    persist()
    return true
  }

  function completeSpot(id: string, validIds: string[]) {
    if (state.value.status !== 'active' || !validIds.includes(id) || state.value.completedIds.includes(id)) return false
    const completed = [...new Set([...state.value.completedIds, id])]
      .filter(spotId => validIds.includes(spotId))
    const remaining = validIds.filter(spotId => !completed.includes(spotId))
    state.value = {
      ...state.value,
      status: remaining.length === 0 ? 'complete' : 'active',
      completedIds: completed,
      currentId: remaining[0] || null,
      completedAt: remaining.length === 0 ? new Date().toISOString() : null,
    }
    persist()
    return true
  }

  function undoSpot(id: string, validIds: string[]) {
    if (!validIds.includes(id) || !state.value.completedIds.includes(id)) return false
    state.value = { ...state.value, status: 'active',
      completedIds: state.value.completedIds.filter(spotId => spotId !== id && validIds.includes(spotId)),
      currentId: id, completedAt: null }
    persist()
    return true
  }

  function reset() {
    state.value = emptyJourney()
    persist()
  }

  return {
    status,
    journeyId: computed(() => state.value.id),
    storageAvailable,
    completedIds,
    currentId,
    startedAt,
    completedAt,
    syncWithSpots,
    start,
    chooseNext,
    completeSpot,
    undoSpot,
    reset,
  }
}

export function resetTodayJourneyForTests() {
  buckets.value = Object.create(null)
  loaded = false
  storageAvailable.value = true
}
