import type { InspirationSpot } from './explore'

/** 默认每日计划上限：一天最多认真逛 3 个地方，避免行程过满、体力透支。 */
export const TODAY_PLAN_LIMIT = 3
/** 历史版本曾允许 6 个；读取旧存档时保留该上限，避免静默丢弃已保存的计划。 */
export const TODAY_PLAN_LEGACY_LIMIT = 6

export function isFullDaySuggestedDuration(label: string): boolean {
  const normalized = label.trim()
  return normalized.includes('一整天') || /^建议\s*一天$/u.test(normalized)
}

export interface TodaySpot extends InspirationSpot {
  amapPoiId: string
  address: string
  lng: number
  lat: number
  verificationStatus: 'verified'
  source: 'amap_verified'
  mock: false
  addedAt: string
}

export type AddTodaySpotResult =
  | { status: 'added'; spot: TodaySpot }
  | { status: 'duplicate' }
  | { status: 'limit' }
  | {
      status: 'full_day_conflict'
      existingFullDayName: string | null
      candidateFullDay: boolean
    }
  | { status: 'unverified' }

export interface AddTodaySpotOptions {
  allowFullDayConflict?: boolean
}
