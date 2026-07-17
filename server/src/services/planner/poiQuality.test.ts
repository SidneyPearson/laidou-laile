import { describe, expect, it } from 'vitest'
import { PoiQualityReason, classifyPoiQuality, filterUsablePois } from './poiQuality.js'

const poi = (name: string, address = '正常地址') => ({ name, address, id: name, lat: 30, lng: 120 })

describe('classifyPoiQuality', () => {
  it.each([
    ['西安市回民中学', '科教文化服务;学校', '141200'],
    ['浙江省卫生计生系统培训中心', '科教文化服务;培训机构', '141400'],
    ['美的星级服务站', '生活服务;维修站点', '071600'],
    ['湖滨发行站', '生活服务', '070000'],
    ['上城区青少年活动中心', '科教文化服务', '140000'],
  ])('rejects non-visitor venue %s', (name, type, typecode) => {
    expect(classifyPoiQuality({ name, type, typecode }).decision).toBe('reject')
  })

  it('keeps a real museum despite the education type prefix', () => {
    expect(classifyPoiQuality({
      name: '孙庆海历史博物馆', type: '科教文化服务;博物馆', typecode: '140100',
    }).decision).not.toBe('reject')
  })

  it('hard-filters a residence explicitly closed to visitors', () => {
    expect(classifyPoiQuality(poi('某某故居（不对外开放）'))).toEqual({
      decision: 'reject', reason: PoiQualityReason.NOT_PUBLIC,
    })
  })

  it('allows normal residences and historical sites', () => {
    expect(classifyPoiQuality(poi('胡雪岩故居')).decision).toBe('allow_with_caution')
    expect(classifyPoiQuality(poi('良渚遗址公园')).decision).toBe('allow_with_caution')
  })

  it('downranks fine-grained internal remains', () => {
    expect(classifyPoiQuality(poi('奏事殿阶沿石遗构'))).toEqual({
      decision: 'downrank', reason: PoiQualityReason.MINOR_INTERNAL_FEATURE,
    })
  })

  it('downranks short POIs explicitly located inside a scenic parent', () => {
    expect(classifyPoiQuality(poi('翠光亭', '柳浪闻莺公园内')).decision).toBe('downrank')
    expect(classifyPoiQuality(poi('西湖博物馆-壁画展品(打卡点)', '西湖博物馆内')).decision).toBe('downrank')
    expect(classifyPoiQuality(poi('杭州西湖风景名胜区-功德坊', '南山路89号')).decision).toBe('downrank')
    expect(classifyPoiQuality(poi('西湖风景区-馆藏珍玩展', '孤山路')).decision).toBe('downrank')
    expect(classifyPoiQuality(poi('功在东南', '杭州西湖风景名胜区-钱王祠')).decision).toBe('downrank')
    expect(classifyPoiQuality(poi('宋元明清漆器艺术陈列', '浙江省博物馆内')).decision).toBe('downrank')
    expect(classifyPoiQuality(poi('清行宫连廊遗迹', '杭州西湖风景名胜区内')).decision).toBe('downrank')
    expect(classifyPoiQuality(poi('小瀛洲', '西湖景区小瀛洲岛内')).decision).not.toBe('downrank')
  })

  it('matches hard filters in the address too', () => {
    expect(classifyPoiQuality(poi('某展馆', '施工中，入口封闭')).decision).toBe('reject')
  })

  it('never re-adds rejected POIs when candidates are scarce', () => {
    const result = filterUsablePois([poi('正常公园'), poi('某院（暂停开放）')])
    expect(result.map(p => p.name)).toEqual(['正常公园'])
  })
})
