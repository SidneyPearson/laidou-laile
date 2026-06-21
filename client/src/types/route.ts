export type PreferenceTag =
  | 'food'
  | 'wander'
  | 'scenic'

// ── Food sub-preferences ──
export type CuisineType =
  | 'hotpot' | 'noodles' | 'pastries' | 'bbq'
  | 'local_cuisine' | 'western' | 'coffee_tea'
  | 'buffet'

// ── Scenic sub-preferences ──
export type ScenicType = 'popular' | 'street'

// ── Wander sub-preferences ──
export type WanderType = 'shopping' | 'cafe' | 'entertainment' | 'hidden' | 'museum'

// ── Distance options ──
export type DistanceOption = 0 | 500 | 1000 | 2000 | 3000 | 5000

// ── Time options ──
export type TimeOption = 30 | 60 | 120 | 240 | 480

// ── Labels ────────────────────────────────────────────

export const TIME_LABELS: Record<TimeOption, string> = {
  30: '30分钟',
  60: '1小时',
  120: '2小时',
  240: '半天',
  480: '一天',
}

export const DISTANCE_LABELS: Record<DistanceOption, string> = {
  0: '全城范围',
  500: '500m',
  1000: '1km',
  2000: '2km',
  3000: '3km',
  5000: '5km',
}

export const PREFERENCE_LABELS: Record<PreferenceTag, string> = {
  food: '🍜 吃点东西',
  wander: '🚶 随便逛逛',
  scenic: '🏯 景点打卡',
}

export const CUISINE_LABELS: Record<CuisineType, string> = {
  hotpot: '🫕 火锅',
  noodles: '🍜 面馆',
  pastries: '🥮 糕点',
  bbq: '🍖 烧烤',
  local_cuisine: '🥢 本地菜',
  western: '🍝 西餐',
  coffee_tea: '🧋 奶茶咖啡',
  buffet: '🍽️ 自助餐',
}

export const SCENIC_LABELS: Record<ScenicType, string> = {
  popular: '🗺️ 热门景点',
  street: '📸 街拍打卡',
}

export const WANDER_LABELS: Record<WanderType, string> = {
  shopping: '🛍️ 逛街购物',
  cafe: '☕ 咖啡茶馆',
  entertainment: '🎮 休闲娱乐',
  hidden: '🔍 小众秘境',
  museum: '🏛️ 博物馆/文化',
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
  distanceMeters?: number
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
