import { describe,expect,it } from 'vitest'
import { safeAmapImageUrl, safeCoverImageUrl, safeHttpsImageUrl } from './imagePolicy.js'

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

describe('safeCoverImageUrl', () => {
  it('accepts HTTPS image URLs like before', () => {
    expect(safeCoverImageUrl('https://cdn.example.com/cover.jpg')).toContain('cdn.example.com')
  })
  it('accepts same-origin local cover paths from the dev upload workflow', () => {
    expect(safeCoverImageUrl('/covers/shanghai-the-bund.jpg')).toBe('/covers/shanghai-the-bund.jpg')
    expect(safeCoverImageUrl('/covers/city-shanghai.jpg')).toBe('/covers/city-shanghai.jpg')
  })
  it.each([
    '/covers/../secret.jpg',          // traversal
    '/covers/UPPER.jpg',              // must stay slug-case
    '/covers/no-ext',                 // must be .jpg
    '/covers/a.png',                  // wrong extension
    '/covers/has space.jpg',
    '//evil.com/covers/a.jpg',        // protocol-relative, not same-origin
    '/covers/a.jpg?x=1',              // no query string
    '/other/a.jpg',                   // wrong prefix
    'http://cdn.example.com/a.jpg',   // still no plain HTTP
  ])('rejects unsafe cover path %s', value => {
    expect(safeCoverImageUrl(value)).toBeNull()
  })
})
