import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFootprints, resetFootprintsForTests } from './useFootprints'
import { useTickets, resetTicketsForTests } from './useTickets'
import { useTodayJourney, resetTodayJourneyForTests } from './useTodayJourney'
import { resetTodayPlanForTests } from './useTodayPlan'
import type { TodaySpot } from '../types/todayPlan'

const spot = (id: string, city = '杭州') => ({ id, city, name: id, lng: 120.15, lat: 30.25, category: 'nature' }) as TodaySpot
const completed = (spots = [spot('西湖')]) => ({
  status: 'complete', completedAt: '2026-09-12T02:00:00.000Z',
  completedIds: spots.map(s => s.id), cityAdcode: '330100', spots,
})

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) })
  resetFootprintsForTests()
  resetTicketsForTests()
  resetTodayPlanForTests()
  resetTodayJourneyForTests()
})

describe('完成行程的足迹', () => {
  it('全程完成即可记录足迹，无需生成票根，并能重新载入', () => {
    const journey = useTodayJourney()
    const footprints = useFootprints()
    journey.start(['西湖', '河坊街'])
    journey.completeSpot('西湖', ['西湖', '河坊街'])
    const save = () => footprints.recordCompletion({ ...completed([spot('西湖'), spot('河坊街')]),
      status: journey.status.value, completedIds: journey.completedIds.value, completedAt: journey.completedAt.value })
    expect(save()).toBe(false)
    expect(footprints.visitedCount.value).toBe(0)
    journey.completeSpot('河坊街', ['西湖', '河坊街'])
    expect(save()).toBe(true)
    expect(useTickets().tickets.value).toHaveLength(0)
    resetFootprintsForTests()
    expect(useFootprints().visitedCities.value[0]?.spots).toHaveLength(2)
  })

  it('重复进入完成页不重复记录；同日新行程保留此前地点', () => {
    const footprints = useFootprints()
    footprints.recordCompletion(completed())
    footprints.recordCompletion(completed())
    expect(JSON.parse(localStorage.getItem('laidou-v03-footprints')!).visits).toHaveLength(1)
    footprints.recordCompletion({ ...completed([spot('河坊街')]), completedAt: '2026-09-12T03:00:00.000Z' })
    expect(footprints.visitedCount.value).toBe(1)
    expect(footprints.visitedCities.value[0].spots.map(s => s.id)).toEqual(['河坊街', '西湖'])
    expect(footprints.visitedCities.value[0].dates).toHaveLength(1)
  })

  it('名称历史票根和行政码新足迹归入同城，历史原文保持不变', () => {
    useTickets().recordTicket({ cityName: '杭州市', spots: [spot('河坊街')] })
    const before = localStorage.getItem('laidou-v03-tickets')
    const footprints = useFootprints()
    footprints.recordCompletion(completed())
    expect(footprints.visitedCount.value).toBe(1)
    expect(footprints.visitedCities.value[0].cityAdcode).toBe('330100')
    expect(footprints.visitedCities.value[0].spots).toHaveLength(2)
    expect(localStorage.getItem('laidou-v03-tickets')).toBe(before)
  })

  it('旧票根中名称和行政码的同城记录只点亮一次，但两张票根都保留', () => {
    const tickets = useTickets()
    tickets.recordTicket({ cityName: '杭州市', spots: [spot('西湖')] })
    tickets.recordTicket({ cityName: '杭州', cityAdcode: '330100', spots: [spot('河坊街')] })
    expect(tickets.tickets.value).toHaveLength(2)
    expect(tickets.visitedCount.value).toBe(1)
    expect(useFootprints().visitedCount.value).toBe(1)
  })

  it('不把不同有效行政码因重名合并', () => {
    const tickets = useTickets()
    tickets.recordTicket({ cityName: '测试城', cityAdcode: '110000', spots: [spot('一')] })
    tickets.recordTicket({ cityName: '测试城', cityAdcode: '120000', spots: [spot('二')] })
    expect(useFootprints().visitedCount.value).toBe(2)
  })

  it('空计划、伪完成、跨城计划、无完成时间都不点亮', () => {
    const footprints = useFootprints()
    expect(footprints.recordCompletion(completed([]))).toBe(false)
    expect(footprints.recordCompletion({ ...completed(), completedIds: [] })).toBe(false)
    expect(footprints.recordCompletion({ ...completed(), completedAt: null })).toBe(false)
    expect(footprints.recordCompletion(completed([spot('西湖'), spot('外滩', '上海')]))).toBe(false)
    expect(footprints.visitedCount.value).toBe(0)
  })

  it('已完成计划新增地点后恢复进行中，不能错误点亮', () => {
    const journey = useTodayJourney()
    journey.start(['西湖'])
    journey.completeSpot('西湖', ['西湖'])
    journey.syncWithSpots(['西湖', '河坊街'])
    expect(journey.status.value).toBe('active')
    expect(journey.currentId.value).toBe('河坊街')
    expect(journey.completedAt.value).toBeNull()
  })

  it('保存失败仍展示本次足迹并暴露未保存提示', () => {
    const footprints = useFootprints()
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    footprints.recordCompletion(completed())
    expect(footprints.visitedCount.value).toBe(1)
    expect(footprints.storageAvailable.value).toBe(false)
    write.mockRestore()
    footprints.recordCompletion(completed())
    expect(footprints.storageAvailable.value).toBe(true)
    expect(JSON.parse(localStorage.getItem('laidou-v03-footprints')!).visits).toHaveLength(1)
  })
})

describe('撤销到达与历史记录一致性', () => {
  it('撤销本次完成只失效本次足迹和关联票根，更早记录仍保留', () => {
    const footprints = useFootprints()
    const tickets = useTickets()
    footprints.recordCompletion({ ...completed([spot('旧日地点')]), completedAt: '2026-09-11T02:00:00Z', journeyId: 'older' })
    footprints.recordCompletion({ ...completed(), journeyId: 'current' })
    tickets.recordTicket({ cityName: '杭州', cityAdcode: '330100', spots: [spot('西湖')], journeyId: 'current' })
    const oldVisit = JSON.parse(localStorage.getItem('laidou-v03-footprints')!).visits.find((v: { journeyId: string }) => v.journeyId === 'older')
    footprints.invalidateCompletion('current', completed().completedAt, ['西湖'])
    tickets.invalidateJourney('current')
    expect(footprints.visitedCount.value).toBe(1)
    expect(footprints.visitedCities.value[0].spots.map(s => s.id)).toEqual(['旧日地点'])
    expect(tickets.tickets.value).toHaveLength(1)
    expect(tickets.tickets.value[0].invalidated).toBe(true)
    expect(JSON.parse(localStorage.getItem('laidou-v03-footprints')!).visits.find((v: { journeyId: string }) => v.journeyId === 'older')).toEqual(oldVisit)
    resetFootprintsForTests()
    resetTicketsForTests()
    expect(useFootprints().visitedCities.value[0].spots.map(s => s.id)).toEqual(['旧日地点'])
  })

  it('只有本次足迹的城市撤销后取消点亮，再次完成可恢复，票根需重新生成', () => {
    const footprints = useFootprints()
    const tickets = useTickets()
    footprints.recordCompletion({ ...completed(), journeyId: 'current' })
    tickets.recordTicket({ cityName: '杭州', cityAdcode: '330100', spots: [spot('西湖')], journeyId: 'current' })
    footprints.invalidateCompletion('current', completed().completedAt, ['西湖'])
    tickets.invalidateJourney('current')
    expect(footprints.visitedCount.value).toBe(0)
    footprints.recordCompletion({ ...completed(), completedAt: '2026-09-12T02:01:00Z', journeyId: 'current' })
    expect(footprints.visitedCount.value).toBe(1)
    expect(tickets.tickets.value[0].invalidated).toBe(true)
    tickets.recordTicket({ cityName: '杭州', cityAdcode: '330100', spots: [spot('西湖')], journeyId: 'current' })
    expect(tickets.tickets.value[0].invalidated).not.toBe(true)
  })

  it('旧足迹用完成时间及地点精确更正，不改未关联的历史票根', () => {
    const footprints = useFootprints()
    footprints.recordCompletion(completed())
    useTickets().recordTicket({ cityName: '上海', spots: [spot('外滩', '上海')] })
    const oldTickets = localStorage.getItem('laidou-v03-tickets')
    footprints.invalidateCompletion('migrated-journey', completed().completedAt, ['西湖'])
    expect(footprints.visitedCities.value.map(c => c.cityName)).toEqual(['上海'])
    expect(localStorage.getItem('laidou-v03-tickets')).toBe(oldTickets)
  })
})

it('同一完成时间的更正再确认不会永远停留在失效状态', () => {
  const footprints = useFootprints()
  const input = { ...completed(), journeyId: 'same-tick' }
  footprints.recordCompletion(input)
  footprints.invalidateCompletion('same-tick', input.completedAt, ['西湖'])
  expect(footprints.visitedCount.value).toBe(0)
  footprints.recordCompletion(input)
  expect(footprints.visitedCount.value).toBe(1)
  expect(JSON.parse(localStorage.getItem('laidou-v03-footprints')!).visits).toHaveLength(1)
})
