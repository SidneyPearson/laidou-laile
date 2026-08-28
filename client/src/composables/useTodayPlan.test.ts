import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InspirationSpot } from '../types/explore'
import { isFullDaySuggestedDuration } from '../types/todayPlan'
import { durationMinutesOf, resetTodayPlanForTests, useTodayPlan } from './useTodayPlan'

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
    // v3 按城市分桶持久化。
    expect(localStorage.getItem('laidou-v03-today-plan')).toContain('"version":3')
    expect(plan.clear()).toBe(false)
  })

  it('rejects demo places and limits today to three unique places', () => {
    const plan = useTodayPlan()
    expect(plan.addSpot({
      ...verifiedSpot(0),
      verificationStatus: 'demo',
      source: 'local_demo',
      mock: true,
    }).status).toBe('unverified')

    for (let index = 1; index <= 3; index++) {
      expect(plan.addSpot(verifiedSpot(index)).status).toBe('added')
    }
    expect(plan.addSpot(verifiedSpot(4)).status).toBe('limit')
    expect(plan.count.value).toBe(3)
  })

  it('recognizes a curated full-day duration for enhanced feedback', () => {
    expect(isFullDaySuggestedDuration('建议一整天')).toBe(true)
    expect(isFullDaySuggestedDuration('建议 2–3 小时')).toBe(false)
  })

  it('reconciles a stale memory state before enforcing the limit', () => {
    const plan = useTodayPlan()
    for (let index = 1; index <= 3; index++) {
      expect(plan.addSpot(verifiedSpot(index)).status).toBe('added')
    }

    const onlySpot = { ...verifiedSpot(1), addedAt: new Date(0).toISOString() }
    localStorage.setItem('laidou-v03-today-plan', JSON.stringify({
      version: 1,
      spots: [onlySpot],
    }))

    expect(plan.addSpot(verifiedSpot(4)).status).toBe('added')
    expect(plan.spots.value.map(spot => spot.id)).toEqual(['spot-1', 'spot-4'])
  })

  it('keeps an existing over-limit plan on load but blocks new additions', () => {
    // 旧版本允许 6 个：已保存的计划不静默截断，只是不能再加入新地点。
    const stored = Array.from({ length: 4 }, (_, index) => verifiedSpot(index + 1))
    localStorage.setItem('laidou-v03-today-plan', JSON.stringify({ version: 2, spots: stored }))

    const plan = useTodayPlan()
    expect(plan.count.value).toBe(4)
    expect(plan.addSpot(verifiedSpot(9)).status).toBe('limit')
    expect(plan.count.value).toBe(4)
  })

  it('migrates legacy storage and collapses renamed copies of the same place', () => {
    const resort = {
      ...verifiedSpot(1),
      id: 'shanghai-disney',
      name: '上海迪士尼度假区',
      amapPoiId: 'OLD-POI',
      addedAt: new Date(0).toISOString(),
    }
    const park = {
      ...verifiedSpot(2),
      id: 'shanghai-disneyland',
      name: '上海迪士尼乐园',
      amapPoiId: 'NEW-POI',
      lng: (resort.lng as number) + 0.0001,
      lat: (resort.lat as number) + 0.0001,
      addedAt: new Date(0).toISOString(),
    }
    localStorage.setItem('laidou-v03-today-plan', JSON.stringify({ version: 1, spots: [resort, park] }))

    const plan = useTodayPlan()
    expect(plan.spots.value.map(spot => spot.id)).toEqual(['shanghai-disneyland'])
    // v1 旧存档迁移后写入 v3 分桶格式。
    expect(localStorage.getItem('laidou-v03-today-plan')).toContain('"version":3')
    expect(plan.addSpot(park).status).toBe('duplicate')
  })

  it('does not invent a duration when curation data is incomplete', () => {
    expect(durationMinutesOf('')).toBe(0)
    expect(durationMinutesOf('待补充')).toBe(0)
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

  it('keeps separate plans per city and restores when switching back', () => {
    const beijing = (index: number): InspirationSpot => ({
      ...verifiedSpot(index),
      city: '北京',
      id: `bj-${index}`,
      amapPoiId: `BJ-POI-${index}`,
      lng: 116.4 + index / 100,
      lat: 39.9 + index / 100,
    })

    const plan = useTodayPlan()
    // 上海加入 1 个
    plan.setActiveCity({ adcode: '310000', cityName: '上海' })
    expect(plan.addSpot(verifiedSpot(1)).status).toBe('added')
    expect(plan.count.value).toBe(1)

    // 切到北京：从空开始，上海的计划不丢失
    plan.setActiveCity({ adcode: '110000', cityName: '北京' })
    expect(plan.count.value).toBe(0)
    expect(plan.addSpot(beijing(1)).status).toBe('added')
    expect(plan.spots.value.map(s => s.city)).toEqual(['北京'])

    // 切回上海：原计划恢复
    plan.setActiveCity({ adcode: '310000', cityName: '上海' })
    expect(plan.count.value).toBe(1)
    expect(plan.spots.value.map(s => s.id)).toEqual(['spot-1'])

    // 持久化后重新 hydrate：两城计划都在，且激活城市是上海
    resetTodayPlanForTests()
    const restored = useTodayPlan()
    expect(restored.count.value).toBe(1)
    expect(restored.spots.value[0].city).toBe('上海')
  })

  it('falls back to city-name bucket key when no adcode is provided', () => {
    const plan = useTodayPlan()
    plan.setActiveCity({ cityName: '杭州' })
    expect(plan.addSpot({ ...verifiedSpot(1), city: '杭州', id: 'hz-1' }).status).toBe('added')
    plan.setActiveCity({ cityName: '成都市' }) // 去「市」后同 key
    expect(plan.count.value).toBe(0)
    plan.setActiveCity({ cityName: '杭州' })
    expect(plan.count.value).toBe(1)
  })
})
