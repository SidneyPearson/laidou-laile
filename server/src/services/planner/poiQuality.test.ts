import { describe, expect, it } from 'vitest'
import { PoiQualityReason, classifyPoiQuality, filterUsablePois } from './poiQuality.js'

const poi = (name: string, address = '正常地址') => ({ name, address, id: name, lat: 30, lng: 120 })

describe('classifyPoiQuality', () => {
  it('hard-filters a residence explicitly closed to visitors', () => {
    expect(classifyPoiQuality(poi('某某故居（不对外开放）'))).toEqual({
      decision: 'reject', reason: PoiQualityReason.NOT_PUBLIC,
    })
  })

  it('allows normal residences and historical sites', () => {
    expect(classifyPoiQuality(poi('胡雪岩故居')).decision).toBe('allow')
    expect(classifyPoiQuality(poi('良渚遗址公园')).decision).toBe('allow')
  })

  it('downranks fine-grained internal remains', () => {
    expect(classifyPoiQuality(poi('奏事殿阶沿石遗构'))).toEqual({
      decision: 'downrank', reason: PoiQualityReason.MINOR_INTERNAL_FEATURE,
    })
  })

  it('matches hard filters in the address too', () => {
    expect(classifyPoiQuality(poi('某展馆', '施工中，入口封闭')).decision).toBe('reject')
  })

  it('never re-adds rejected POIs when candidates are scarce', () => {
    const result = filterUsablePois([poi('正常公园'), poi('某院（暂停开放）')])
    expect(result.map(p => p.name)).toEqual(['正常公园'])
  })
})
