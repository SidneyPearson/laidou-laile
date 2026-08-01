import { describe, expect, it } from 'vitest'

import { buildLocalCuisineTerms, hasRegionalCuisineConflict } from './localCuisinePolicy.js'
import { buildKeywordProfile, scorePoiRelevance } from './keywordRelevance.js'

describe('local-cuisine regional policy', () => {
  it('recognises a Chengdu restaurant from Amap cuisine type without requiring generic words in its name', () => {
    const profile = buildKeywordProfile(buildLocalCuisineTerms('青羊区 宽窄巷子'))

    expect(scorePoiRelevance({
      name: '成都吃客',
      type: '餐饮服务;中餐厅;四川菜(川菜)',
      address: '奎星楼街',
    }, profile)).toBeGreaterThan(0)
    expect(scorePoiRelevance({ name: '成都吃客', type: '050102' }, profile)).toBeGreaterThan(0)
  })

  it('recognises a Xi’an local restaurant from regional terms and reliable Amap type codes', () => {
    const profile = buildKeywordProfile(buildLocalCuisineTerms('西安 回民街'))

    expect(scorePoiRelevance({
      name: '马洪小炒泡馍馆',
      type: '餐饮服务;中餐厅;西北菜',
    }, profile)).toBeGreaterThan(0)
    expect(scorePoiRelevance({ name: '马洪小炒泡馍馆', type: '050115' }, profile)).toBeGreaterThan(0)
    expect(scorePoiRelevance({ name: '老米家泡馍', type: '050121' }, profile)).toBeGreaterThan(0)
  })

  it('does not treat an arbitrary generic restaurant type as proof of local cuisine', () => {
    const profile = buildKeywordProfile(buildLocalCuisineTerms('青羊区 宽窄巷子'))

    expect(scorePoiRelevance({ name: '普通西餐厅', type: '050200' }, profile)).toBe(0)
  })

  it('rejects an obviously out-of-region cuisine even when Amap labels it as generic local flavour', () => {
    expect(hasRegionalCuisineConflict({
      name: '东北劲水饺馆', type: '餐饮服务;中餐厅;特色/地方风味餐厅', typecode: '050118',
    }, '青羊区 宽窄巷子')).toBe(true)
    expect(hasRegionalCuisineConflict({
      name: '成都吃客', type: '餐饮服务;中餐厅;四川菜(川菜)', typecode: '050102',
    }, '青羊区 宽窄巷子')).toBe(false)
  })
})
