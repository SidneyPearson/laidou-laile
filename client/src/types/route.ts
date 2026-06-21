export type PreferenceTag =
  | 'food'
  | 'wander'
  | 'photo'
  | 'less_walk'
  | 'scenic'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type CuisineType =
  | 'hotpot' | 'noodles' | 'pastries' | 'bbq'
  | 'local_cuisine' | 'western' | 'coffee_tea'

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
  scenic: '🏯 本地景点',
}

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '🌅 早餐',
  lunch: '☀️ 午餐',
  dinner: '🌙 晚餐',
  snack: '🍰 下午茶',
}

export const CUISINE_LABELS: Record<CuisineType, string> = {
  hotpot: '🫕 火锅',
  noodles: '🍜 面馆',
  pastries: '🥮 糕点',
  bbq: '🍖 烧烤',
  local_cuisine: '🥢 本地菜',
  western: '🍝 西餐',
  coffee_tea: '☕ 咖啡茶饮',
}

export interface Stop {
  name: string
  address: string
  visitDurationMinutes: number
  notes: string
  amapPoiId: string | null
  lng: number
  lat: number
  photoTip?: string
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
