import { describe, expect, it } from 'vitest'
import { isOrdinaryDineInPoi } from './foodSuitability.js'

describe('isOrdinaryDineInPoi', () => {
  it.each([
    '圣拉维滨江宴会中心·银河厅',
    '浦东婚礼会馆',
    '某大学第二食堂',
    '员工餐厅',
    '云端商务会所',
    '滨江大酒店中餐厅',
    '上海世博洲际酒店',
  ])('rejects non-public or occasion-only dining venue: %s', (name) => {
    expect(isOrdinaryDineInPoi({ name, type: '餐饮服务', typecode: '050000' })).toBe(false)
  })

  it.each([
    '额尔敦传统涮(世博大道店)',
    '茶然居',
    '阿娘面馆',
    '商场里的独立品牌咖啡馆',
  ])('keeps ordinary independently visitable venue: %s', (name) => {
    expect(isOrdinaryDineInPoi({ name, type: '餐饮服务', typecode: '050000' })).toBe(true)
  })

  it('rejects a lodging POI even when its name looks like a restaurant', () => {
    expect(isOrdinaryDineInPoi({ name: '和平饭店', type: '住宿服务', typecode: '100101' })).toBe(false)
  })
})
