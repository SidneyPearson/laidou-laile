import { describe, expect, it } from 'vitest'
import { formatShortageReason, type QualityDiagnostics } from './qualityDiagnostics.js'

describe('formatShortageReason', () => {
  it('explains when every otherwise-qualified candidate is outside the requested distance', () => {
    expect(formatShortageReason({
      recalled: 18,
      rejectedByType: 3,
      rejectedByDistance: 15,
      qualified: 0,
    })).toBe('已找到18个候选，但合格地点均超出当前距离；可尝试扩大探索范围')
  })

  it('explains when recall found no candidates', () => {
    expect(formatShortageReason({
      recalled: 0,
      rejectedByType: 0,
      rejectedByDistance: 0,
      qualified: 0,
    })).toBe('当前品类暂无可用地点；可尝试放宽类型')
  })

  it('does not invent a rejection stage when detailed counts are unknown', () => {
    const diagnostics: QualityDiagnostics = {
      recalled: 6,
      rejectedByType: 'unknown',
      rejectedByDistance: 'unknown',
      qualified: 0,
    }

    expect(formatShortageReason(diagnostics))
      .toBe('已找到6个候选，但筛选后暂无合格地点；可尝试扩大探索范围或放宽类型')
  })
})
