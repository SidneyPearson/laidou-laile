import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Route } from '../types/route'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

const route: Route = {
  id: 'route-1',
  name: '西湖慢游',
  tagline: '湖边散步',
  stops: [{
    name: '西湖',
    address: '杭州市西湖区',
    visitDurationMinutes: 60,
    notes: '湖景',
    amapPoiId: 'WEST-LAKE',
    lng: 120.145,
    lat: 30.245,
  }],
  totalDurationMinutes: 90,
  walkingDistanceMeters: 1000,
  tips: '穿舒适的鞋',
}

function entry(stopId = 'WEST-LAKE') {
  return {
    locationName: '杭州 · 西湖',
    request: {
      timeOption: 240 as const,
      distance: 3000 as const,
      preferences: ['scenic' as const],
    },
    routes: [{
      ...route,
      stops: [{ ...route.stops[0], amapPoiId: stopId }],
    }],
    weather: { weather: '晴', temperature: '28', isRainy: false },
    anchorName: '西湖',
  }
}

describe('useHistory', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  it('persists a route locally and marks it as available', async () => {
    const { useHistory } = await import('./useHistory')
    const history = useHistory()
    expect(history.addEntry(entry())).not.toBeNull()
    expect(history.entries.value).toHaveLength(1)
    expect(localStorage.getItem('citywalk_history')).toContain('WEST-LAKE')
  })

  it('moves an identical result to the front instead of duplicating it', async () => {
    const { useHistory } = await import('./useHistory')
    const history = useHistory()
    const first = history.addEntry(entry())
    const second = history.addEntry(entry())
    expect(history.entries.value).toHaveLength(1)
    expect(second?.id).toBe(first?.id)
  })

  it('keeps at most twenty newest entries', async () => {
    const { MAX_HISTORY_ENTRIES, useHistory } = await import('./useHistory')
    const history = useHistory()
    for (let index = 0; index < 25; index++) {
      history.addEntry(entry(`POI-${index}`))
    }
    expect(history.entries.value).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(JSON.stringify(history.entries.value)).toContain('POI-24')
    expect(JSON.stringify(history.entries.value)).not.toContain('POI-0"')
  })

  it('does not break route generation when browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('blocked') },
    })
    const { useHistory } = await import('./useHistory')
    expect(useHistory().addEntry(entry())).toBeNull()
  })
})
