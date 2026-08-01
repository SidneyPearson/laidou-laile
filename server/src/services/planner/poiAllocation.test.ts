import { describe, expect, it } from 'vitest'
import { allocateDistinctPois, samePoi } from './poiAllocation.js'

const p = (id: string | null, name: string, lng: number, lat = 31, parentId?: string | null) => ({
  id, name, lng, lat, parentId,
})

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

  it('treats different child IDs with the same parent as one scenic group', () => {
    expect(samePoi(
      p('child-a', '奏事殿阶沿石', 120, 30, 'west-lake'),
      p('child-b', '镜湖厅', 120.0001, 30, 'west-lake'),
    )).toBe(true)
  })

  it('treats a parent POI and its child as one scenic group', () => {
    expect(samePoi(
      p('west-lake', '西湖风景名胜区', 120, 30),
      p('child-a', '西湖景区内部景点', 120.0001, 30, 'west-lake'),
    )).toBe(true)
  })

  it('reserves a distinct primary candidate for every route before filling', () => {
    const a = p('a', 'A', 121), b = p('b', 'B', 121.01), c = p('c', 'C', 121.02)
    const result = allocateDistinctPois([[a, b, c], [a, b, c], [a, b, c]], [2, 2, 2], [1, 1, 1])
    expect(result.routes.every(route => route.length >= 1)).toBe(true)
    expect(new Set(result.routes.map(route => route[0].id)).size).toBe(3)
    expect(result.candidateShortage).toBe(true)
  })
})
