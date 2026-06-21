import type { PreferenceTag, TimeOption } from './route'

export interface GenerateRoutesRequest {
  lat: number
  lng: number
  timeOption: TimeOption
  preferences: PreferenceTag[]
}

export interface GenerateRoutesResponse {
  routes: import('./route').Route[]
  generatedAt: string
  weatherNote: string | null
  locationName: string
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}
