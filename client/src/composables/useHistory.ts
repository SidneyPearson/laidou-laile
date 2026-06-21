import { ref, computed } from 'vue'
import type { Route, PreferenceTag, TimeOption, DistanceOption, MealType, CuisineType, PhotoType, ScenicType, WanderType, WalkLevel } from '../types/route'
import { PREFERENCE_LABELS, TIME_LABELS, DISTANCE_LABELS, MEAL_LABELS, CUISINE_LABELS, PHOTO_LABELS, SCENIC_LABELS, WANDER_LABELS, WALK_LEVEL_LABELS } from '../types/route'

export interface HistoryRequest {
  timeOption: TimeOption
  distance: DistanceOption
  preferences: PreferenceTag[]
  mealTypes?: MealType[]
  cuisineTypes?: CuisineType[]
  photoTypes?: PhotoType[]
  scenicTypes?: ScenicType[]
  wanderTypes?: WanderType[]
  walkLevel?: WalkLevel
}

export interface HistoryEntry {
  id: string
  createdAt: string
  locationName: string
  request: HistoryRequest
  routes: Route[]
  weather: { weather: string; temperature: string; isRainy: boolean } | null
}

const STORAGE_KEY = 'citywalk_history'
const MAX_ENTRIES = 20

// ── Singleton state ──
const entries = ref<HistoryEntry[]>([])

function loadFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HistoryEntry[]
  } catch {
    return []
  }
}

function saveToStorage(list: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage full — remove oldest entries
    const trimmed = list.slice(0, MAX_ENTRIES - 5)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  }
}

export function useHistory() {
  // Lazy load on first access
  if (entries.value.length === 0) {
    entries.value = loadFromStorage()
  }

  const hasEntries = computed(() => entries.value.length > 0)

  /** Add a new history entry (newest first) */
  function addEntry(entry: Omit<HistoryEntry, 'id' | 'createdAt'>) {
    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
    }
    entries.value.unshift(newEntry)
    if (entries.value.length > MAX_ENTRIES) {
      entries.value = entries.value.slice(0, MAX_ENTRIES)
    }
    saveToStorage(entries.value)
    return newEntry
  }

  /** Remove a history entry by id */
  function removeEntry(id: string) {
    entries.value = entries.value.filter((e) => e.id !== id)
    saveToStorage(entries.value)
  }

  /** Clear all history */
  function clearAll() {
    entries.value = []
    saveToStorage([])
  }

  /** Format preference summary for display */
  function formatPrefSummary(req: HistoryRequest): string {
    const parts: string[] = []

    // Main preferences
    parts.push(req.preferences.map((p) => PREFERENCE_LABELS[p]?.replace(/[^一-龥]/g, '') || p).join('·'))

    // Sub-preferences
    if (req.mealTypes?.length) parts.push(req.mealTypes.map((m) => MEAL_LABELS[m]?.replace(/[^一-龥]/g, '') || m).join('/'))
    if (req.cuisineTypes?.length) parts.push(req.cuisineTypes.map((c) => CUISINE_LABELS[c]?.replace(/[^一-龥]/g, '') || c).join('/'))
    if (req.photoTypes?.length) parts.push(req.photoTypes.map((p) => PHOTO_LABELS[p]?.replace(/[^一-龥]/g, '') || p).join('/'))
    if (req.scenicTypes?.length) parts.push(req.scenicTypes.map((s) => SCENIC_LABELS[s]?.replace(/[^一-龥]/g, '') || s).join('/'))
    if (req.wanderTypes?.length) parts.push(req.wanderTypes.map((w) => WANDER_LABELS[w]?.replace(/[^一-龥]/g, '') || w).join('/'))
    if (req.walkLevel) parts.push(WALK_LEVEL_LABELS[req.walkLevel]?.replace(/[^一-龥]/g, '') || req.walkLevel)

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
