import type { Route, Stop, PreferenceTag } from '../../types/route.js'

// ── Public inputs / outputs ────────────────────────────

export interface PlanInput {
  /** User position */
  position: { lat: number; lng: number }
  /** City / district name from reverse geocode */
  city: string
  /** Current weather text, e.g. "多云" */
  weather: string
  /** Available time in minutes: 60 | 120 | 240 | 480 */
  timeMinutes: number
  /** Search distance in meters */
  distance: number
  /** Selected preference tags */
  preferences: PreferenceTag[]
  /** Food sub-preferences */
  cuisineTypes?: string[]
  /** Scenic sub-preferences */
  scenicTypes?: string[]
  /** Wander sub-preferences */
  wanderTypes?: string[]
  /** Adcode for Amap city-scoped search */
  adcode?: string
}

export interface PlanOutput {
  routes: Route[]
  /** How the routes were generated */
  source: 'ai' | 'fallback'
  /** Reason for fallback (null if AI succeeded) */
  fallbackReason: string | null
}

export interface RefineInput {
  route: Route
  removeStopIndices: number[]
  extraRequirements?: string
  position: { lat: number; lng: number }
  city: string
  weather: string
  timeMinutes: number
  distance: number
  adcode?: string
}

export interface ReplaceStopInput {
  route: Route
  stopIndex: number
  preferences: PreferenceTag[]
  distance: number
  adcode?: string
}

// Re-export commonly-used domain types so planner submodules don't have to
// reach outside the folder.
export type { Route, Stop, PreferenceTag }
