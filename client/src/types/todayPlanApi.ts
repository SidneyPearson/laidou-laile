export interface SuggestOrderRequest {
  city: string
  places: Array<{
    hotspotId: string
    amapPoiId: string
  }>
  startPeriod?: 'morning' | 'afternoon' | 'evening'
  weather?: {
    weather: string
    isRainy: boolean
    note?: string
  }
}

export interface SuggestOrderResponse {
  order: Array<{
    hotspotId: string
    amapPoiId: string
  }>
  reason: string
  reminders: string[]
  source: 'deterministic_distance'
}

