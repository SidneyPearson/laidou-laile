import { describe, expect, it } from 'vitest'
import type { InspirationSpot } from '../types/explore'
import { OFFICIAL_NOTICE, departureReminder, departureReminders, whySpotFitsPersona } from './exploreDetails'

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

  it('collapses two near-duplicate "see official notice" reminders into one', () => {
    // 后台录了两条只差几个字的“以官方公告为准”，前端应只渲染一条统一文案。
    const list = departureReminders({
      ...spot,
      theme: 'city',
      category: 'landmark',
      reservationNote: '预约、票务与开放时间请以运营方最新公告为准',
    })
    expect(list).toHaveLength(1)
    expect(list[0]).toBe(OFFICIAL_NOTICE)
  })

  it('deduplicates a generic reservationNote against the fallback official notice', () => {
    const list = departureReminders({
      ...spot,
      theme: 'city',
      category: 'landmark',
      reservationNote: '预约、票务与营业信息以当天官方公告为准。',
    })
    expect(list).toEqual([OFFICIAL_NOTICE])
  })

  it('keeps a specific reservation note distinct from the category reminder', () => {
    const list = departureReminders(spot) // 实名预约 + 博物馆闭馆提醒
    expect(list).toHaveLength(2)
    expect(list[0]).toBe('需要提前实名预约。')
    expect(list[1]).toContain('闭馆')
  })

  it('always returns at least one reminder and filters empty strings', () => {
    expect(departureReminders({
      ...spot,
      theme: 'city',
      category: 'landmark',
      reservationNote: '   ',
    })).toEqual([OFFICIAL_NOTICE])
  })
})
