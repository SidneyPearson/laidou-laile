import { describe, expect, it } from 'vitest'
import { buildKeywordProfile, scorePoiRelevance } from './keywordRelevance.js'

const score = (query: string, name: string, type = '', address = '') =>
  scorePoiRelevance({ name, type, address, tags: '' }, buildKeywordProfile([query]))

describe('keyword relevance', () => {
  it('matches 本帮面 to representative noodle dishes', () => {
    expect(score('本帮面', '老上海蟹黄面馆')).toBeGreaterThan(0)
    expect(score('本帮面', '阿娘葱油拌面')).toBeGreaterThan(0)
  })

  it('does not treat a generic xiaolongbao shop as 本帮面', () => {
    expect(score('本帮面', '上海小笼馆')).toBe(0)
  })

  it('matches common aliases', () => {
    expect(score('咖啡', 'Manner咖啡馆')).toBeGreaterThan(0)
    expect(score('日料', '山崎日本料理')).toBeGreaterThan(0)
  })

  it('uses an unknown custom keyword literally', () => {
    expect(score('火星菜', '火星菜研究所')).toBeGreaterThan(0)
    expect(score('火星菜', '普通餐厅')).toBe(0)
  })
})
