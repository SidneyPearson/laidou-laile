import { describe, it, expect } from 'vitest'
import {
  axisDiffCount,
  meetsDivergence,
  enforceDivergence,
  inferAxes,
} from './structuralDivergence.js'
import type { Route } from '../types/route.js'

let routeCounter = 0

function makeRoute(overrides: Partial<Route>): Route {
  return {
    id: `r-${++routeCounter}`,
    name: 'route',
    tagline: 'tagline',
    stops: [{
      name: 'stop', address: '', visitDurationMinutes: 30,
      notes: '', amapPoiId: null, lng: 121.47, lat: 31.23,
    }],
    totalDurationMinutes: 60,
    walkingDistanceMeters: 500,
    tips: 't',
    ...overrides,
  }
}

describe('axisDiffCount', () => {
  it('returns 0 when identical', () => {
    const a = { goal: 'eat', behavior: 'deep_single', info: 'by_theme' }
    expect(axisDiffCount(a, a)).toBe(0)
  })
  it('counts one changed axis', () => {
    expect(axisDiffCount(
      { goal: 'eat', behavior: 'deep_single', info: 'by_theme' },
      { goal: 'eat', behavior: 'deep_single', info: 'by_time' },
    )).toBe(1)
  })
  it('counts two changed axes', () => {
    expect(axisDiffCount(
      { goal: 'eat', behavior: 'deep_single', info: 'by_theme' },
      { goal: 'shop', behavior: 'deep_single', info: 'by_ranking' },
    )).toBe(2)
  })
  it('counts three changed axes', () => {
    expect(axisDiffCount(
      { goal: 'eat', behavior: 'deep_single', info: 'by_theme' },
      { goal: 'nature', behavior: 'free_wander', info: 'by_geography' },
    )).toBe(3)
  })
})

describe('meetsDivergence (≥2 axes different = ≥30°)', () => {
  it('rejects <2 differences', () => {
    expect(meetsDivergence(
      { goal: 'eat', behavior: 'deep_single', info: 'by_theme' },
      { goal: 'eat', behavior: 'deep_single', info: 'by_time' },
    )).toBe(false)
  })
  it('accepts exactly 2 differences', () => {
    expect(meetsDivergence(
      { goal: 'eat', behavior: 'deep_single', info: 'by_theme' },
      { goal: 'shop', behavior: 'hop_multi', info: 'by_theme' },
    )).toBe(true)
  })
})

describe('enforceDivergence', () => {
  it('keeps a single route unchanged', () => {
    const routes = [makeRoute({
      axes: { goal: 'eat', behavior: 'deep_single', info: 'by_theme' },
    })]
    const { kept, dropped } = enforceDivergence(routes, { preferences: ['food'] })
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(0)
  })

  it('keeps three routes when all pairs meet the rule', () => {
    const routes = [
      makeRoute({ name: 'A', axes: { goal: 'eat', behavior: 'deep_single', info: 'by_theme' } }),
      makeRoute({ name: 'B', axes: { goal: 'shop', behavior: 'hop_multi', info: 'by_ranking' } }),
      makeRoute({ name: 'C', axes: { goal: 'nature', behavior: 'free_wander', info: 'by_geography' } }),
    ]
    const { kept, dropped } = enforceDivergence(routes, { preferences: ['food'] })
    expect(kept).toHaveLength(3)
    expect(dropped).toHaveLength(0)
    // Each kept route is annotated with direction + reason.
    for (const k of kept) {
      expect(k.direction).toBeTruthy()
      expect(k.reason).toBeTruthy()
    }
  })

  it('drops the second of two too-similar routes', () => {
    const routes = [
      makeRoute({ name: 'A', axes: { goal: 'eat', behavior: 'deep_single', info: 'by_theme' } }),
      makeRoute({ name: 'B', axes: { goal: 'eat', behavior: 'deep_single', info: 'by_time' } }), // 1 axis diff
    ]
    const { kept, dropped } = enforceDivergence(routes, { preferences: ['food'] })
    expect(kept).toHaveLength(1)
    expect(kept[0].name).toBe('A')
    expect(dropped).toHaveLength(1)
    expect(dropped[0].route.name).toBe('B')
    expect(dropped[0].reason).toContain('结构差异不足')
  })

  it('passes divergenceExempt routes through unconditionally', () => {
    const routes = [
      makeRoute({ name: 'Exempt-1', divergenceExempt: true,
        axes: { goal: 'eat', behavior: 'deep_single', info: 'by_theme' } }),
      makeRoute({ name: 'Exempt-2', divergenceExempt: true,
        axes: { goal: 'eat', behavior: 'deep_single', info: 'by_theme' } }),
    ]
    const { kept, dropped } = enforceDivergence(routes, { preferences: ['food'] })
    expect(kept).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })

  it('falls back to inferAxes when axes missing', () => {
    // Only one route, no axes provided — should still be kept.
    const routes = [makeRoute({ name: 'no-axes' })]
    const { kept, dropped } = enforceDivergence(routes, { preferences: ['food'] })
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(0)
  })
})

describe('inferAxes', () => {
  it('infers goal=eat from food preference', () => {
    const r = makeRoute({})
    const axes = inferAxes(r, { preferences: ['food'] })
    expect(axes.goal).toBe('eat')
  })

  it('infers goal=culture from notes mentioning museum', () => {
    const r = makeRoute({ stops: [{
      name: '博物馆', address: '', visitDurationMinutes: 60,
      notes: '历史博物展览', amapPoiId: null, lng: 121, lat: 31,
    }] })
    const axes = inferAxes(r, { preferences: ['scenic'] })
    expect(axes.goal).toBe('culture')
  })

  it('infers behavior=deep_single for a single long stop', () => {
    const r = makeRoute({ stops: [{
      name: '公园', address: '', visitDurationMinutes: 120,
      notes: '', amapPoiId: null, lng: 121, lat: 31,
    }] })
    const axes = inferAxes(r, { preferences: ['scenic'] })
    expect(axes.behavior).toBe('deep_single')
  })
})
