import { describe, expect, it } from 'vitest'
import { planEffort } from './planEffort'

describe('行程强度解释', () => {
  it('两站游玩五小时但相距较远时，说明距离原因且不更改身份', () => {
    const effort = planEffort(300, 2, 12000)
    expect(effort.label).toBe('偏满')
    expect(effort.note).toContain('游玩约 5 小时')
    expect(effort.note).toContain('直线相隔约 12.0 公里')
    expect(effort.percent).toBe(75)
    expect(effort.note).not.toContain('车程')
  })
  it('同样两个地点，短途轻松行程的强度条更低', () => {
    expect(planEffort(60, 2, 1000).percent).toBeLessThan(planEffort(450, 2, 1000).percent)
    expect(planEffort(60, 2, 1000).label).toBe('轻松')
  })
})
