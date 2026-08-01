export type DiagnosticCount = number | 'unknown'

/**
 * Counts are reported only at stage boundaries that can be observed without
 * overlap. A stage remains `unknown` until that stage records its own count;
 * callers must never derive it by subtraction.
 */
export interface QualityDiagnostics {
  /** Candidates returned across the search-to-generator boundary. */
  recalled: DiagnosticCount
  /** Candidates rejected by the semantic/type gate, when measured there. */
  rejectedByType: DiagnosticCount
  /** Candidates rejected by the final distance gate, when measured there. */
  rejectedByDistance: DiagnosticCount
  /** Distinct stops surviving the final route policies. */
  qualified: DiagnosticCount
}

function known(value: DiagnosticCount): value is number {
  return typeof value === 'number'
}

export function formatShortageReason(diagnostics: QualityDiagnostics): string {
  const { recalled, rejectedByType, rejectedByDistance, qualified } = diagnostics

  if (recalled === 0) {
    return '当前品类暂无可用地点；可尝试放宽类型'
  }

  if (known(recalled) && known(qualified) && qualified === 0) {
    if (known(rejectedByType) && known(rejectedByDistance)) {
      const remainingAfterKnownRejections = recalled - rejectedByType - rejectedByDistance
      if (rejectedByDistance > 0 && remainingAfterKnownRejections <= 0) {
        return `已找到${recalled}个候选，但合格地点均超出当前距离；可尝试扩大探索范围`
      }
      if (rejectedByType > 0 && remainingAfterKnownRejections <= 0) {
        return `已找到${recalled}个候选，但均不符合当前类型；可尝试放宽类型`
      }
    }

    return `已找到${recalled}个候选，但筛选后暂无合格地点；可尝试扩大探索范围或放宽类型`
  }

  return '附近暂未找到合适的地点；可尝试扩大探索范围或放宽类型'
}
