import { describe, expect, it } from 'vitest'
import { allocateDistinctPois, samePoi } from './poiAllocation.js'

const p = (id: string | null, name: string, lng: number, lat = 31) => ({ id, name, lng, lat })

describe('POI identity and allocation', () => {
  it('allocates distinct primary POIs when candidates are sufficient', () => {
    const a = p('a', 'A', 121), b = p('b', 'B', 121.01), c = p('c', 'C', 121.02)
    const result = allocateDistinctPois([[a, b, c], [a, b, c], [a, b, c]], [1, 1, 1])
    expect(new Set(result.routes.flat().map(x => x.id)).size).toBe(3)
    expect(result.hadToRepeat).toBe(false)
  })

  it('allows a documented repeat when only two candidates exist', () => {
    const a = p('a', 'A', 121), b = p('b', 'B', 121.01)
    const result = allocateDistinctPois([[a, b], [a, b], [a, b]], [1, 1, 1])
    expect(result.routes).toHaveLength(3)
    expect(result.hadToRepeat).toBe(true)
  })

  it('falls back to normalized name and nearby coordinates without IDs', () => {
    expect(samePoi(p(null, '豫园（南门）', 121), p(null, '豫园', 121.00001))).toBe(true)
    expect(samePoi(p(null, '星巴克', 121), p(null, '星巴克', 122))).toBe(false)
  })
})
