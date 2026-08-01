import { describe,expect,it } from 'vitest'
import { safeAmapImageUrl } from './imagePolicy.js'
describe('Amap image policy',()=>{it('accepts HTTPS allowlisted hosts',()=>expect(safeAmapImageUrl('https://store.is.autonavi.com/a.jpg')).toContain('store.is.autonavi.com'));it.each(['http://store.is.autonavi.com/a.jpg','https://store.is.autonavi.com.evil.test/a.jpg','https://store.is.autonavi.com@evil.test/a.jpg','javascript:alert(1)'])('rejects unsafe URL %s',url=>expect(safeAmapImageUrl(url)).toBeNull())})
