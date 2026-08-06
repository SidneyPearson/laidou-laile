import { describe,expect,it } from 'vitest'
import { safeAmapImageUrl, safeHttpsImageUrl } from './imagePolicy.js'

describe('Amap image policy',()=>{
  it('accepts HTTPS allowlisted hosts',()=>expect(safeAmapImageUrl('https://store.is.autonavi.com/a.jpg')).toContain('store.is.autonavi.com'))
  it.each([
    'http://store.is.autonavi.com/a.jpg',
    'https://store.is.autonavi.com.evil.test/a.jpg',
    'https://store.is.autonavi.com@evil.test/a.jpg',
    'javascript:alert(1)',
  ])('rejects unsafe URL %s',url=>expect(safeAmapImageUrl(url)).toBeNull())
})

describe('safeHttpsImageUrl', () => {
  it('accepts any HTTPS host (admin-provided cover)', () => {
    expect(safeHttpsImageUrl('https://cdn.example.com/cover.jpg')).toContain('cdn.example.com')
    expect(safeHttpsImageUrl('https://store.is.autonavi.com/a.jpg')).toContain('autonavi.com')
  })
  it.each([
    'http://cdn.example.com/a.jpg',
    'javascript:alert(1)',
    'https://user:pass@cdn.example.com/a.jpg',
    'not a url',
  ])('rejects non-HTTPS/unsafe URL %s', url => {
    expect(safeHttpsImageUrl(url)).toBeNull()
  })
})
