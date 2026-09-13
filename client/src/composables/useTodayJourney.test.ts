import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTodayPlanForTests, useTodayPlan } from './useTodayPlan'
import { resetTodayJourneyForTests, useTodayJourney } from './useTodayJourney'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  resetTodayPlanForTests()
  resetTodayJourneyForTests()
})

describe('useTodayJourney', () => {
  it('starts, changes the next stop and completes the journey', () => {
    const journey = useTodayJourney()
    const ids = ['a', 'b', 'c']

    expect(journey.start(ids)).toBe(true)
    expect(journey.currentId.value).toBe('a')
    expect(journey.chooseNext('c', ids)).toBe(true)
    expect(journey.currentId.value).toBe('c')

    expect(journey.completeSpot('c', ids)).toBe(true)
    expect(journey.completedIds.value).toEqual(['c'])
    expect(journey.currentId.value).toBe('a')
    journey.completeSpot('a', ids)
    journey.completeSpot('b', ids)
    expect(journey.status.value).toBe('complete')
    expect(journey.currentId.value).toBeNull()
  })

  it('removes stale progress when the plan changes', () => {
    const journey = useTodayJourney()
    journey.start(['a', 'b'])
    journey.completeSpot('a', ['a', 'b'])

    journey.syncWithSpots(['b', 'c'])
    expect(journey.completedIds.value).toEqual([])
    expect(journey.currentId.value).toBe('b')
  })
})

describe('按城市恢复与更正', () => {
  it('切城后保留两城进度，重新加载仍恢复正确下一站', () => {
    const plan = useTodayPlan()
    plan.setActiveCity({ adcode: '320100', cityName: '南京' })
    const journey = useTodayJourney()
    journey.start(['n1', 'n2'])
    journey.completeSpot('n1', ['n1', 'n2'])
    const startedAt = journey.startedAt.value
    const id = journey.journeyId.value
    plan.setActiveCity({ adcode: '500000', cityName: '重庆' })
    expect(journey.status.value).toBe('idle')
    journey.start(['c1'])
    journey.completeSpot('c1', ['c1'])
    plan.setActiveCity({ adcode: '320100', cityName: '南京' })
    expect(journey.completedIds.value).toEqual(['n1'])
    expect(journey.currentId.value).toBe('n2')
    expect(journey.startedAt.value).toBe(startedAt)
    expect(journey.journeyId.value).toBe(id)
    resetTodayJourneyForTests()
    const restored = useTodayJourney()
    expect(restored.currentId.value).toBe('n2')
    plan.setActiveCity({ adcode: '500000', cityName: '重庆' })
    expect(restored.status.value).toBe('complete')
    expect(restored.completedIds.value).toEqual(['c1'])
  })

  it('重复选择同城和只清空另一城都不影响进度', () => {
    const plan = useTodayPlan()
    plan.setActiveCity({ adcode: '320100', cityName: '南京' })
    const journey = useTodayJourney()
    journey.start(['a', 'b'])
    journey.completeSpot('a', ['a', 'b'])
    plan.setActiveCity({ adcode: '320102', cityName: '南京市' })
    expect(journey.currentId.value).toBe('b')
    plan.setActiveCity({ adcode: '500000', cityName: '重庆' })
    journey.reset()
    plan.setActiveCity({ adcode: '320100', cityName: '南京' })
    expect(journey.completedIds.value).toEqual(['a'])
  })

  it('升级旧版单城存档时保留状态和时间，随后保存为多城', () => {
    useTodayPlan().setActiveCity({ adcode: '320100', cityName: '南京' })
    const raw = JSON.stringify({ version: 1, status: 'active', completedIds: ['a'], currentId: 'b',
      startedAt: '2026-09-12T01:00:00Z', completedAt: null })
    localStorage.setItem('laidou-v03-today-journey', raw)
    const journey = useTodayJourney()
    expect(journey.completedIds.value).toEqual(['a'])
    expect(journey.startedAt.value).toBe('2026-09-12T01:00:00Z')
    expect(localStorage.getItem('laidou-v03-today-journey')).toBe(raw)
    journey.completeSpot('b', ['a', 'b'])
    const saved = JSON.parse(localStorage.getItem('laidou-v03-today-journey')!)
    expect(saved.version).toBe(2)
    expect(saved.cities['320100'].journey.status).toBe('complete')
  })

  it('更正最后一站恢复进行中，保留此前到达，并允许再次完成', () => {
    const journey = useTodayJourney()
    journey.start(['a', 'b'])
    journey.completeSpot('a', ['a', 'b'])
    expect(journey.completeSpot('a', ['a', 'b'])).toBe(false)
    journey.completeSpot('b', ['a', 'b'])
    const id = journey.journeyId.value
    expect(journey.undoSpot('b', ['a', 'b'])).toBe(true)
    expect(journey.completedIds.value).toEqual(['a'])
    expect(journey.currentId.value).toBe('b')
    expect(journey.completedAt.value).toBeNull()
    expect(journey.status.value).toBe('active')
    expect(journey.undoSpot('b', ['a', 'b'])).toBe(false)
    journey.completeSpot('b', ['a', 'b'])
    expect(journey.journeyId.value).toBe(id)
    expect(journey.status.value).toBe('complete')
  })

  it('重新开始生成新行程标识，保存失败明确暴露状态', () => {
    const journey = useTodayJourney()
    journey.start(['a'])
    const id = journey.journeyId.value
    journey.reset()
    journey.start(['a'])
    expect(journey.journeyId.value).not.toBe(id)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    journey.completeSpot('a', ['a'])
    expect(journey.storageAvailable.value).toBe(false)
    expect(journey.status.value).toBe('complete')
  })
})
