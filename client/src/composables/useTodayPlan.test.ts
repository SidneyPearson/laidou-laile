import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InspirationSpot } from '../types/explore'
import { resetTodayPlanForTests, useTodayPlan } from './useTodayPlan'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  get length() { return this.data.size }
}

function verifiedSpot(index: number): InspirationSpot {
  return {
    id: `spot-${index}`,
    city: '上海',
    name: `地点 ${index}`,
    district: '黄浦区',
    category: 'landmark',
    reason: '值得去',
    tags: ['地标'],
    suitablePersonas: ['couple'],
    suggestedDuration: index === 1 ? '建议 1.5 小时' : '建议 45 分钟',
    bestTime: '下午',
    theme: 'city',
    amapPoiId: `POI-${index}`,
    address: `地址 ${index}`,
    lng: 121 + index / 100,
    lat: 31 + index / 100,
    verificationStatus: 'verified',
    source: 'amap_verified',
    mock: false,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  resetTodayPlanForTests()
})

describe('useTodayPlan', () => {
  it('persists public place snapshots, deduplicates, and totals stay time', () => {
    const plan = useTodayPlan()
    expect(plan.addSpot(verifiedSpot(1)).status).toBe('added')
    expect(plan.addSpot(verifiedSpot(1)).status).toBe('duplicate')
    expect(plan.addSpot(verifiedSpot(2)).status).toBe('added')

    expect(plan.count.value).toBe(2)
    expect(plan.totalStayMinutes.value).toBe(135)
    expect(localStorage.getItem('laidou-v03-today-plan')).not.toContain('"origin"')

    resetTodayPlanForTests()
    const restored = useTodayPlan()
    expect(restored.spots.value.map(spot => spot.id)).toEqual(['spot-1', 'spot-2'])
  })

  it('clears the persisted plan for a new recommendation round', () => {
    const plan = useTodayPlan()
    expect(plan.addSpot(verifiedSpot(1)).status).toBe('added')

    expect(plan.clear()).toBe(true)
    expect(plan.count.value).toBe(0)
    expect(localStorage.getItem('laidou-v03-today-plan')).toContain('"spots":[]')
    expect(plan.clear()).toBe(false)
  })

  it('rejects demo places and limits today to six unique places', () => {
    const plan = useTodayPlan()
    expect(plan.addSpot({
      ...verifiedSpot(0),
      verificationStatus: 'demo',
      source: 'local_demo',
      mock: true,
    }).status).toBe('unverified')

    for (let index = 1; index <= 6; index++) {
      expect(plan.addSpot(verifiedSpot(index)).status).toBe('added')
    }
    expect(plan.addSpot(verifiedSpot(7)).status).toBe('limit')
    expect(plan.count.value).toBe(6)
  })

  it('reconciles a stale six-item memory state before enforcing the limit', () => {
    const plan = useTodayPlan()
    for (let index = 1; index <= 6; index++) {
      expect(plan.addSpot(verifiedSpot(index)).status).toBe('added')
    }

    const onlySpot = { ...verifiedSpot(1), addedAt: new Date(0).toISOString() }
    localStorage.setItem('laidou-v03-today-plan', JSON.stringify({
      version: 1,
      spots: [onlySpot],
    }))

    expect(plan.addSpot(verifiedSpot(7)).status).toBe('added')
    expect(plan.spots.value.map(spot => spot.id)).toEqual(['spot-1', 'spot-7'])
  })

  it('moves, removes, and accepts only an exact replacement order', () => {
    const plan = useTodayPlan()
    ;[1, 2, 3].forEach(index => plan.addSpot(verifiedSpot(index)))

    expect(plan.moveSpot('spot-2', -1)).toBe(true)
    expect(plan.spots.value.map(spot => spot.id)).toEqual(['spot-2', 'spot-1', 'spot-3'])
    expect(plan.replaceOrder(['spot-3', 'spot-2', 'spot-1'])).toBe(true)
    expect(plan.replaceOrder(['spot-3', 'spot-2'])).toBe(false)
    expect(plan.removeSpot('spot-2')).toBe(true)
    expect(plan.spots.value.map(spot => spot.id)).toEqual(['spot-3', 'spot-1'])
  })

  it('recovers from corrupt storage without throwing', () => {
    localStorage.setItem('laidou-v03-today-plan', '{bad')
    const plan = useTodayPlan()
    expect(plan.spots.value).toEqual([])
  })
})
