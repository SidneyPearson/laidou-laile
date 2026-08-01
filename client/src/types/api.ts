import type { PreferenceTag, TimeOption, CuisineType, ScenicType, WanderType, DistanceOption } from './route'

export interface RouteAnchorRequest {
  hotspotId: string
  amapPoiId: string
}

export interface GenerateRoutesRequest {
  lat: number
  lng: number
  timeOption: TimeOption
  distance: DistanceOption
  preferences: PreferenceTag[]
  anchor?: RouteAnchorRequest
  cuisineTypes?: CuisineType[]
  scenicTypes?: ScenicType[]
  wanderTypes?: WanderType[]
  customCuisine?: string[]
  customScenic?: string[]
  customWander?: string[]
}

export interface GenerateRoutesResponse {
  routes: import('./route').Route[]
  generatedAt: string
  weatherNote: string | null
  weather: { weather: string; temperature: string; isRainy: boolean } | null
  locationName: string
  anchorName?: string
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

export interface RefineRouteRequest {
  route: import('./route').Route
  removeStopIndices?: number[]
  extraRequirements?: string
  city: string
  weather: string
  timeMinutes: number
  distance: number
  preferences?: PreferenceTag[]
  origin?: { lat: number; lng: number }
}

export interface RefineRouteResponse {
  routes: import('./route').Route[]
}

export interface ReplaceStopRequest {
  route: import('./route').Route
  stopIndex: number
  preferences: PreferenceTag[]
  distance: number
  adcode?: string
  timeMinutes?: number
  origin?: { lat: number; lng: number }
}

export interface ReplaceStopResponse {
  route: import('./route').Route
}
