import { describe, it, expect } from 'vitest'
import { buildFallbackRoutes } from './fallbackPlanner.js'
import type { AmapPOI } from '../../types/poi.js'

function poi(overrides: Partial<AmapPOI> & { id: string }): AmapPOI {
  return {
    name: overrides.id, type: '', typecode: '050000',
    address: '地址', lng: 121.47, lat: 31.23,
    distance: 500, rating: null, cost: null,
    ...overrides,
  } as AmapPOI
}

describe('buildFallbackRoutes', () => {
  it('returns [] when given no POIs', () => {
    expect(buildFallbackRoutes([], 60, ['food'])).toEqual([])
  })

  it('dedupes POIs by id before splitting', () => {
    const pois = [
      poi({ id: 'a', distance: 100 }),
      poi({ id: 'a', distance: 100 }), // duplicate
      poi({ id: 'b', distance: 200 }),
    ]
    const routes = buildFallbackRoutes(pois, 60, ['food'])
    const allIds = routes.flatMap(r => r.stops.map(s => s.amapPoiId))
    // Should have only one 'a' across all routes.
    expect(allIds.filter(x => x === 'a')).toHaveLength(1)
  })

  it('caps each route at 5 stops and total at 3 routes', () => {
    const pois = Array.from({ length: 20 }, (_, i) =>
      poi({ id: `p${i}`, distance: i * 50, lng: 121.47 + i * 0.001, lat: 31.23 }))
    const routes = buildFallbackRoutes(pois, 60, ['food'])
    expect(routes.length).toBeLessThanOrEqual(3)
    for (const r of routes) {
      expect(r.stops.length).toBeLessThanOrEqual(5)
    }
  })

  it('sets a food label when preference is food', () => {
    const routes = buildFallbackRoutes([
      poi({ id: 'a', distance: 100 }),
      poi({ id: 'b', distance: 200 }),
    ], 60, ['food'])
    expect(routes[0].name).toContain('美食')
  })

  it('combines multiple preference labels', () => {
    const routes = buildFallbackRoutes([
      poi({ id: 'a', distance: 100 }),
      poi({ id: 'b', distance: 200 }),
    ], 60, ['food', 'wander'])
    // '美食' + '休闲' concatenated.
    expect(routes[0].name).toContain('美食')
    expect(routes[0].name).toContain('休闲')
  })

  it('sorts stops within a route by ascending Amap distance', () => {
    const pois = [
      poi({ id: 'far', distance: 900, lng: 121.500, lat: 31.230 }),
      poi({ id: 'near', distance: 100, lng: 121.471, lat: 31.230 }),
      poi({ id: 'mid', distance: 500, lng: 121.485, lat: 31.230 }),
    ]
    const routes = buildFallbackRoutes(pois, 60, ['food'])
    // First route should have the closest first.
    const firstStopName = routes[0].stops[0].amapPoiId
    expect(firstStopName).toBe('near')
  })

  it('recomputes totalDurationMinutes to include walking overhead', () => {
    const routes = buildFallbackRoutes([
      poi({ id: 'a', distance: 100, lng: 121.47, lat: 31.23 }),
      poi({ id: 'b', distance: 500, lng: 121.48, lat: 31.24 }),
    ], 60, ['food'])
    const r = routes[0]
    const stopSum = r.stops.reduce((s, st) => s + st.visitDurationMinutes, 0)
    expect(r.totalDurationMinutes).toBeGreaterThanOrEqual(stopSum)
  })
})
