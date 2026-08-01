import { describe, expect, it } from 'vitest'
import type { InspirationSpot } from '../types/explore'
import { departureReminder, whySpotFitsPersona } from './exploreDetails'

const spot: InspirationSpot = {
  id: 'beijing-palace-museum',
  city: '北京',
  name: '故宫博物院',
  district: '东城区',
  category: 'landmark',
  reason: '中轴线核心地点',
  tags: ['世界遗产', '博物馆'],
  suitablePersonas: ['fast', 'family'],
  suggestedDuration: '建议半天',
  bestTime: '上午',
  theme: 'museum',
  mock: false,
  verificationStatus: 'verified',
  reservationNote: '需要提前实名预约。',
}

describe('explore detail copy', () => {
  it('explains why a matched persona should care', () => {
    expect(whySpotFitsPersona(spot, 'family')).toContain('亲子')
  })

  it('does not pretend an unmatched persona was the primary target', () => {
    expect(whySpotFitsPersona(spot, 'urban')).toContain('不是当前画像的优先项')
  })

  it('prefers a curated reservation reminder', () => {
    expect(departureReminder(spot)).toBe('需要提前实名预约。')
  })

  it('labels unverified demo content explicitly', () => {
    expect(departureReminder({
      ...spot,
      verificationStatus: 'demo',
      reservationNote: undefined,
    })).toContain('演示内容')
  })
})
