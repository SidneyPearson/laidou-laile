export type PreferenceTag =
  | 'food'
  | 'wander'
  | 'photo'
  | 'less_walk'
  | 'local'
  | 'rainy_day'

export type TimeOption = 30 | 60 | 120 | 240

export const TIME_LABELS: Record<TimeOption, string> = {
  30: '30分钟',
  60: '1小时',
  120: '2小时',
  240: '半天',
}

export const PREFERENCE_LABELS: Record<PreferenceTag, string> = {
  food: '🍜 吃点东西',
  wander: '🚶 随便逛逛',
  photo: '📷 拍照出片',
  less_walk: '🦯 少走路',
  local: '🏮 本地特色',
  rainy_day: '🌧️ 雨天方案',
}

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
