import { describe, expect, it } from 'vitest'
import { buildTransportHint } from './transportHint.js'

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
  })
})
