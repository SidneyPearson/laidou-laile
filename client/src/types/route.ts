export type PreferenceTag =
  | 'food'
  | 'wander'
  | 'photo'
  | 'less_walk'
  | 'scenic'

// ── Food sub-preferences ──
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type CuisineType =
  | 'hotpot' | 'noodles' | 'pastries' | 'bbq'
  | 'local_cuisine' | 'western' | 'coffee_tea'

// ── Photo sub-preferences ──
export type PhotoType = 'landmark' | 'street'

// ── Scenic sub-preferences ──
export type ScenicType = 'popular' | 'museum' | 'hidden'

// ── Wander sub-preferences ──
export type WanderType = 'shopping' | 'cafe' | 'entertainment' | 'park'

// ── Walk level sub-preferences ──
export type WalkLevel = 'minimal' | 'moderate'

// ── Distance options ──
export type DistanceOption = 500 | 1000 | 2000 | 3000 | 5000

// ── Time options ──
export type TimeOption = 30 | 60 | 120 | 240

// ── Labels ────────────────────────────────────────────

export const TIME_LABELS: Record<TimeOption, string> = {
  30: '30分钟',
  60: '1小时',
  120: '2小时',
  240: '半天',
}

export const DISTANCE_LABELS: Record<DistanceOption, string> = {
  500: '500m',
  1000: '1km',
  2000: '2km',
  3000: '3km',
  5000: '5km',
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

export const PHOTO_LABELS: Record<PhotoType, string> = {
  landmark: '🏛️ 地标景点',
  street: '📸 街拍打卡',
}

export const SCENIC_LABELS: Record<ScenicType, string> = {
  popular: '🗺️ 热门景点',
  museum: '🏛️ 博物馆/文化',
  hidden: '🔍 小众秘境',
}

export const WANDER_LABELS: Record<WanderType, string> = {
  shopping: '🛍️ 逛街购物',
  cafe: '☕ 咖啡茶馆',
  entertainment: '🎮 休闲娱乐',
  park: '🌿 公园散步',
}

export const WALK_LEVEL_LABELS: Record<WalkLevel, string> = {
  minimal: '🦯 尽量少走',
  moderate: '🚶 可以走一段',
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
