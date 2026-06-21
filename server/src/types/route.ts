export type PreferenceTag =
  | 'food'
  | 'wander'
  | 'photo'
  | 'less_walk'
  | 'local'
  | 'rainy_day'

export type TimeOption = 30 | 60 | 120 | 240

export interface Stop {
  name: string
  address: string
  visitDurationMinutes: number
  notes: string
  amapPoiId: string | null
  lng: number
  lat: number
}

export interface Route {
  id: string
  name: string
  tagline: string
  stops: Stop[]
  totalDurationMinutes: number
  walkingDistanceMeters: number
  tips: string
}

export interface GenerateRoutesRequest {
  lat: number
  lng: number
  timeOption: TimeOption
  preferences: PreferenceTag[]
}

export interface GenerateRoutesResponse {
  routes: Route[]
  generatedAt: string
  weatherNote: string | null
  locationName: string
}
