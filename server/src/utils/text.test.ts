import { describe, it, expect } from 'vitest'
import { normalizeName } from './text.js'

describe('normalizeName', () => {
  it('strips whitespace', () => {
    expect(normalizeName('  Foo  Bar  ')).toBe('foobar')
  })

  it('lower-cases ASCII', () => {
    expect(normalizeName('Starbucks Coffee')).toBe('starbuckscoffee')
  })

  it('strips both half-width and full-width parentheses', () => {
    expect(normalizeName('外婆家(新天地店)')).toBe('外婆家新天地店')
    expect(normalizeName('外婆家（新天地店）')).toBe('外婆家新天地店')
  })

  it('strips punctuation used to separate cuisine hints', () => {
    expect(normalizeName('海底捞·火锅')).toBe('海底捞火锅')
    expect(normalizeName('小笼-包')).toBe('小笼包')
    expect(normalizeName('肉夹馍/凉皮')).toBe('肉夹馍凉皮')
  })

  it('strips Chinese book/quote brackets', () => {
    expect(normalizeName('【推荐】外婆家')).toBe('推荐外婆家')
    expect(normalizeName('《本帮菜》餐厅')).toBe('本帮菜餐厅')
  })

  it('strips commas of both scripts', () => {
    expect(normalizeName('a,b，c、d')).toBe('abcd')
  })

  it('is idempotent', () => {
    const once = normalizeName('外婆家（新天地店）')
    const twice = normalizeName(once)
    expect(twice).toBe(once)
  })
})
