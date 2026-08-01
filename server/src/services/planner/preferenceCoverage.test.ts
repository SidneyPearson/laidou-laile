import { describe, expect, it } from 'vitest'
import type { Route } from '../../types/route.js'

import { findMissingPreferences } from './preferenceCoverage.js'

function route(stops: Route['stops']): Route {
  return {
    id: 'route', name: '路线', tagline: '2个地点', stops,
    totalDurationMinutes: 120, walkingDistanceMeters: 300, tips: '',
  }
}

function stop(id: string, name: string, typecode?: string) {
  return {
    name, address: '', visitDurationMinutes: 30, notes: '', amapPoiId: id,
    typecode, lng: 108.94, lat: 34.26, distanceMeters: 100,
  }
}

describe('final preference coverage', () => {
  it('uses verified provider evidence after internal type fields are stripped from final stops', () => {
    const evidence = [route([
      stop('food', '马洪小炒泡馍馆', '050115'),
      stop('scenic', '钟楼', '110000'),
    ])]
    const final = [route([
      stop('food', '马洪小炒泡馍馆'),
      stop('scenic', '钟楼'),
    ])]

    expect(findMissingPreferences(final, evidence, ['food', 'scenic'])).toEqual([])
  })

  it('reports food missing when a mixed route only contains scenic provider types', () => {
    const evidence = [route([
      stop('bell', '钟楼', '110000'),
      stop('drum', '鼓楼', '110000'),
    ])]

    expect(findMissingPreferences(evidence, evidence, ['food', 'scenic'])).toEqual(['food'])
  })
})
