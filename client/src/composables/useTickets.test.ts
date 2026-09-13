import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTicketsForTests, useTickets } from './useTickets'
import type { TodaySpot } from '../types/todayPlan'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
}

const ticketSpot = (id: string, city = '上海'): TodaySpot => ({
  id,
  city,
  name: `地点${id}`,
  district: '黄浦区',
  category: 'landmark',
  reason: '值得去',
  tags: ['城市'],
  suitablePersonas: ['couple'],
  suggestedDuration: '2 小时',
  bestTime: '傍晚',
  theme: 'river',
  amapName: `地点${id}`,
  amapPoiId: `poi-${id}`,
  address: '测试地址',
  lng: city === '北京' ? 116.4 : 121.49,
  lat: city === '北京' ? 39.9 : 31.24,
  verifiedAt: '2026-01-01T00:00:00.000Z',
  verificationStatus: 'verified',
  source: 'amap_verified',
  mock: false,
  addedAt: '2026-09-06T10:00:00.000Z',
})

describe('useTickets', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    resetTicketsForTests()
  })

  it('records a ticket and lights up its city', () => {
    const tickets = useTickets()
    tickets.recordTicket({
      cityAdcode: '310000',
      cityName: '上海',
      persona: '特种兵式',
      duration: '4 小时',
      spots: [ticketSpot('s1')],
    })
    expect(tickets.tickets.value).toHaveLength(1)
    expect(tickets.visitedCount.value).toBe(1)
    expect(tickets.visitedCities.value[0]?.cityName).toBe('上海')
    expect(tickets.tickets.value[0]?.spots[0]?.name).toBe('地点s1')
    expect(tickets.tickets.value[0]?.persona).toBe('特种兵式')
  })

  it('deduplicates same city on the same day and counts distinct cities', () => {
    const tickets = useTickets()
    tickets.recordTicket({ cityAdcode: '310000', cityName: '上海市', spots: [ticketSpot('s1')] })
    tickets.recordTicket({ cityAdcode: '310000', cityName: '上海', spots: [ticketSpot('s2')] })
    tickets.recordTicket({ cityAdcode: '110000', cityName: '北京', spots: [ticketSpot('b1', '北京')] })

    expect(tickets.tickets.value).toHaveLength(2)
    expect(tickets.visitedCount.value).toBe(2)
    // 同城同日重复生成只刷新内容，不叠加新票根
    const shanghai = tickets.visitedCities.value.find(ticket => ticket.cityAdcode === '310000')
    expect(shanghai?.spots.some(spot => spot.id === 's2')).toBe(true)
    expect(shanghai?.spots.some(spot => spot.id === 's1')).toBe(false)
  })

  it('falls back to city name when no adcode is available', () => {
    const tickets = useTickets()
    tickets.recordTicket({ cityName: '杭州市', spots: [ticketSpot('h1', '杭州')] })
    expect(tickets.visitedCount.value).toBe(1)
    expect(tickets.visitedCities.value[0]?.cityName).toBe('杭州')
  })

  it('persists tickets across store re-hydration', () => {
    useTickets().recordTicket({ cityAdcode: '310000', cityName: '上海', spots: [ticketSpot('s1')] })
    resetTicketsForTests()
    const rehydrated = useTickets()
    expect(rehydrated.tickets.value).toHaveLength(1)
    expect(rehydrated.visitedCount.value).toBe(1)
  })

  it('survives malformed storage without throwing', () => {
    localStorage.setItem('laidou-v03-tickets', '{not-json')
    resetTicketsForTests()
    expect(useTickets().tickets.value).toHaveLength(0)
  })
})
