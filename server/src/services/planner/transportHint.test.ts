import { describe, expect, it } from 'vitest'
import { buildTransportHint, replaceUnsupportedTransportClaim } from './transportHint.js'

describe('buildTransportHint', () => {
  it('uses walking only for a 500m exploration range', () => {
    const hint = buildTransportHint(500, 450, [])
    expect(hint).toContain('步行')
    expect(hint).not.toContain('共享单车')
  })

  it('may suggest cycling at 3km', () => {
    expect(buildTransportHint(3000, 2400, [])).toContain('共享单车')
  })

  it('warns that 小瀛洲 may require a boat', () => {
    expect(buildTransportHint(3000, 1000, [{ name: '小瀛洲' }])).toContain('乘船')
    expect(buildTransportHint(3000, 1000, [{ name: '西湖游船码头' }])).toContain('乘船')
  })

  it('removes contradictory fixed walking claims before appending the computed hint', () => {
    expect(replaceUnsupportedTransportClaim(
      '全程步行即可，距离很近',
      '距离较长，可步行与共享单车结合；请以现场可骑行条件为准。',
    )).toBe('距离较长，可步行与共享单车结合；请以现场可骑行条件为准。')
  })
})
