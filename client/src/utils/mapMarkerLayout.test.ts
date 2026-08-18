import { describe, expect, it } from 'vitest'
import { layoutMarkerOffsets } from './mapMarkerLayout'

describe('map marker layout', () => {
  it('spreads nearby markers while leaving isolated markers on their coordinates', () => {
    const offsets = layoutMarkerOffsets([
      { id: 'forbidden-city', lng: 116.397, lat: 39.918 },
      { id: 'national-museum', lng: 116.401, lat: 39.905 },
      { id: 'badaling', lng: 116.017, lat: 40.356 },
    ])

    expect(offsets.get('forbidden-city')).not.toEqual({ x: 0, y: 0 })
    expect(offsets.get('national-museum')).not.toEqual({ x: 0, y: 0 })
    expect(offsets.get('forbidden-city')).not.toEqual(offsets.get('national-museum'))
    expect(offsets.get('badaling')).toEqual({ x: 0, y: 0 })
  })

  it('uses connected groups so a dense chain does not leave an overlapping marker behind', () => {
    const offsets = layoutMarkerOffsets([
      { id: 'a', lng: 121.000, lat: 31 },
      { id: 'b', lng: 121.015, lat: 31 },
      { id: 'c', lng: 121.030, lat: 31 },
    ], 1_700)
    expect([...offsets.values()].every(offset => offset.x !== 0 || offset.y !== 0)).toBe(true)
  })
})
