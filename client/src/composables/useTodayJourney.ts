import { computed, ref } from 'vue'

const STORAGE_KEY = 'laidou-v03-today-journey'
const STORAGE_VERSION = 1

export type JourneyStatus = 'idle' | 'active' | 'complete'

interface StoredJourney {
  version: number
  status: JourneyStatus
  completedIds: string[]
  currentId: string | null
  startedAt: string | null
  completedAt: string | null
}

const emptyJourney = (): StoredJourney => ({
  version: STORAGE_VERSION,
  status: 'idle',
  completedIds: [],
  currentId: null,
  startedAt: null,
  completedAt: null,
})

const state = ref<StoredJourney>(emptyJourney())
let loaded = false

function readStored(): StoredJourney {
  if (typeof localStorage === 'undefined') return emptyJourney()
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as Partial<StoredJourney>
    if (
      parsed.version !== STORAGE_VERSION
      || !['idle', 'active', 'complete'].includes(parsed.status || '')
      || !Array.isArray(parsed.completedIds)
    ) return emptyJourney()
    return {
      version: STORAGE_VERSION,
      status: parsed.status as JourneyStatus,
      completedIds: [...new Set(parsed.completedIds.filter((id): id is string => typeof id === 'string'))],
      currentId: typeof parsed.currentId === 'string' ? parsed.currentId : null,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
    }
  } catch {
    return emptyJourney()
  }
}

function load() {
  if (loaded) return
  loaded = true
  state.value = readStored()
}

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
  } catch {
    /* The journey still works for this page even if storage is unavailable. */
  }
}

export function useTodayJourney() {
  load()

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
      if (state.value.status === 'active' && !current) {
        current = validIds.find(id => !completed.includes(id)) || null
      }
      state.value = { ...state.value, completedIds: completed, currentId: current }
    }
    persist()
  }

  function start(validIds: string[]) {
    if (validIds.length === 0) return false
    const completed = state.value.completedIds.filter(id => validIds.includes(id))
    state.value = {
      ...state.value,
      status: 'active',
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
    if (state.value.status !== 'active' || !validIds.includes(id)) return false
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

  function reset() {
    state.value = emptyJourney()
    persist()
  }

  return {
    status,
    completedIds,
    currentId,
    startedAt,
    completedAt,
    syncWithSpots,
    start,
    chooseNext,
    completeSpot,
    reset,
  }
}

export function resetTodayJourneyForTests() {
  state.value = emptyJourney()
  loaded = false
}
