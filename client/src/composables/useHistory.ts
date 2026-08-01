import { ref, computed } from 'vue'
import type { Route, PreferenceTag, TimeOption, DistanceOption, CuisineType, ScenicType, WanderType } from '../types/route'
import { PREFERENCE_LABELS, TIME_LABELS, DISTANCE_LABELS, CUISINE_LABELS, SCENIC_LABELS, WANDER_LABELS } from '../types/route'

export interface HistoryRequest {
  timeOption: TimeOption
  distance: DistanceOption
  preferences: PreferenceTag[]
  cuisineTypes?: CuisineType[]
  scenicTypes?: ScenicType[]
  wanderTypes?: WanderType[]
}

export interface HistoryEntry {
  id: string
  createdAt: string
  locationName: string
  request: HistoryRequest
  routes: Route[]
  weather: { weather: string; temperature: string; isRainy: boolean } | null
  anchorName?: string
}

const STORAGE_KEY = 'citywalk_history'
export const MAX_HISTORY_ENTRIES = 20

// ── Singleton state ──
const entries = ref<HistoryEntry[]>([])

function loadFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES)
  } catch {
    return []
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<HistoryEntry>
  return typeof entry.id === 'string'
    && typeof entry.createdAt === 'string'
    && typeof entry.locationName === 'string'
    && !!entry.request
    && typeof entry.request.timeOption === 'number'
    && typeof entry.request.distance === 'number'
    && Array.isArray(entry.request.preferences)
    && Array.isArray(entry.routes)
    && entry.routes.every(route =>
      !!route
      && typeof route === 'object'
      && typeof route.name === 'string'
      && Array.isArray(route.stops))
}

/** Persist newest entries first, dropping only the oldest on quota pressure. */
function saveToStorage(list: HistoryEntry[]): HistoryEntry[] | null {
  let candidate = list.slice(0, MAX_HISTORY_ENTRIES)
  while (candidate.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate))
      return candidate
    } catch {
      candidate = candidate.slice(0, -1)
    }
  }
  if (list.length > 0) return null
  try {
    localStorage.setItem(STORAGE_KEY, '[]')
    return []
  } catch {
    return null
  }
}

function routeFingerprint(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): string {
  const request = entry.request
  const routes = entry.routes.map(route => ({
    name: route.name,
    stops: route.stops.map(stop => stop.amapPoiId || `${stop.name}:${stop.lng},${stop.lat}`),
  }))
  return JSON.stringify({
    locationName: entry.locationName,
    anchorName: entry.anchorName || '',
    request: {
      timeOption: request.timeOption,
      distance: request.distance,
      preferences: [...request.preferences].sort(),
      cuisineTypes: [...(request.cuisineTypes ?? [])].sort(),
      scenicTypes: [...(request.scenicTypes ?? [])].sort(),
      wanderTypes: [...(request.wanderTypes ?? [])].sort(),
    },
    routes,
  })
}

export function useHistory() {
  // Lazy load on first access
  if (entries.value.length === 0) {
    entries.value = loadFromStorage()
  }

  const hasEntries = computed(() => entries.value.length > 0)

  /** Add a new history entry (newest first) */
  function addEntry(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): HistoryEntry | null {
    const fingerprint = routeFingerprint(entry)
    const duplicate = entries.value.find(existing => routeFingerprint(existing) === fingerprint)
    const newEntry: HistoryEntry = {
      ...entry,
      id: duplicate?.id
        || crypto.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
    }
    const previous = entries.value
    const next = [
      newEntry,
      ...previous.filter(existing => existing.id !== duplicate?.id),
    ].slice(0, MAX_HISTORY_ENTRIES)
    const persisted = saveToStorage(next)
    if (persisted === null || persisted.length === 0) {
      entries.value = previous
      return null
    }
    entries.value = persisted
    return newEntry
  }

  /** Remove a history entry by id */
  function removeEntry(id: string) {
    const next = entries.value.filter((e) => e.id !== id)
    const persisted = saveToStorage(next)
    if (persisted !== null) entries.value = persisted
  }

  /** Clear all history */
  function clearAll() {
    const persisted = saveToStorage([])
    if (persisted !== null) entries.value = []
  }

  /** Format preference summary for display */
  function formatPrefSummary(req: HistoryRequest): string {
    const parts: string[] = []

    // Main preferences
    parts.push(req.preferences.map((p) => PREFERENCE_LABELS[p]?.replace(/[^一-龥]/g, '') || p).join('·'))

    // Sub-preferences
    if (req.cuisineTypes?.length) parts.push(req.cuisineTypes.map((c) => CUISINE_LABELS[c]?.replace(/[^一-龥]/g, '') || c).join('/'))
    if (req.scenicTypes?.length) parts.push(req.scenicTypes.map((s) => SCENIC_LABELS[s]?.replace(/[^一-龥]/g, '') || s).join('/'))
    if (req.wanderTypes?.length) parts.push(req.wanderTypes.map((w) => WANDER_LABELS[w]?.replace(/[^一-龥]/g, '') || w).join('/'))

    return parts.join(' · ')
  }

  function formatTimeLabel(t: TimeOption): string {
    return TIME_LABELS[t] || `${t}分钟`
  }

  function formatDistanceLabel(d: DistanceOption): string {
    return DISTANCE_LABELS[d] || `${d}m`
  }

  return {
    entries,
    hasEntries,
    addEntry,
    removeEntry,
    clearAll,
    formatPrefSummary,
    formatTimeLabel,
    formatDistanceLabel,
  }
}
