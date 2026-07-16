import { describe, expect, it } from 'vitest'
import { ensureDistinctRouteTitles } from './routeTitle.js'

describe('ensureDistinctRouteTitles', () => {
  it('replaces numeric-only fallback titles with deterministic themes', () => {
    const routes = [1, 2, 3].map(i => ({
      name: `景点路线${i}`, stops: [{ name: i === 1 ? '岳王庙' : i === 2 ? '北山街' : '曲院风荷' }],
    }))
    const titles = ensureDistinctRouteTitles(routes, ['scenic'])
    expect(new Set(titles).size).toBe(3)
    expect(titles.every(t => !/路线\d+$/.test(t))).toBe(true)
  })
})
