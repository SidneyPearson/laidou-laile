import { ZodError } from 'zod'
import type { CityRecord, SpotRecord } from '../domain/curation.js'
import {
  buildSpotDiff,
  externalRefreshResultSchema,
  normalizeSpotName,
  previewHash,
  uniqueEvidenceCount,
  type ExternalRefreshResult,
} from '../domain/weeklyRefresh.js'
import type { RefreshCandidateDraft } from '../repositories/cityRefreshRepository.js'

export class RefreshImportError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message)
  }
}

export interface RefreshPreview {
  previewHash: string
  valid: boolean
  errors: string[]
  summary: {
    researchedAt: string
    sourceCount: number
    newSpotCount: number
    existingChangeCount: number
    possibleClosedCount: number
    noMaterialChange: boolean
    duplicateCount: number
    errorCount: number
  }
  candidates: RefreshCandidateDraft[]
  parsed: ExternalRefreshResult
}

function evidenceFor(urls: string[], result: ExternalRefreshResult): Array<Record<string, unknown>> {
  const byUrl = new Map(result.sources.map(source => [source.url, source]))
  return urls.map(url => byUrl.get(url) ?? { title: '候选引用来源', url, sourceName: '未在来源列表说明', sourceKind: 'other' })
}

function similarity(left: string, right: string): number {
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.9
  const a = new Set(left)
  const b = new Set(right)
  const intersection = [...a].filter(char => b.has(char)).length
  return intersection / Math.max(a.size, b.size, 1)
}

export function parseExternalRefreshJson(rawJson: string): ExternalRefreshResult {
  const trimmed = rawJson.trim()
  if (trimmed.startsWith('```')) {
    throw new RefreshImportError('MARKDOWN_NOT_ALLOWED', '只接受JSON对象，请去掉Markdown代码块标记')
  }
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    throw new RefreshImportError('INVALID_JSON', '粘贴内容不是合法JSON对象')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RefreshImportError('INVALID_JSON_OBJECT', '只接受合法JSON对象')
  }
  try {
    return externalRefreshResultSchema.parse(raw)
  } catch (error) {
    if (error instanceof ZodError) {
      const schemaVersionIssue = error.issues.find(issue => issue.path[0] === 'schemaVersion')
      throw new RefreshImportError(
        schemaVersionIssue ? 'UNSUPPORTED_SCHEMA_VERSION' : 'INVALID_REFRESH_RESULT',
        schemaVersionIssue ? '不支持的schemaVersion，只接受1.0' : (error.issues[0]?.message ?? 'AI返回结构不合法'),
      )
    }
    throw error
  }
}

export async function buildRefreshPreview(
  rawJson: string,
  city: CityRecord,
  existingSpots: SpotRecord[],
  idFactory: () => string,
): Promise<RefreshPreview> {
  const parsed = parseExternalRefreshJson(rawJson)
  if (parsed.city.adcode !== city.adcode || parsed.city.name !== city.name) {
    throw new RefreshImportError('CITY_MISMATCH', `返回城市必须为${city.name}（${city.adcode}）`)
  }

  const errors: string[] = []
  const candidates: RefreshCandidateDraft[] = []
  const byId = new Map(existingSpots.map(spot => [spot.id, spot]))
  const normalized = existingSpots.map(spot => ({ spot, name: normalizeSpotName(spot.name) }))
  const seenTargets = new Set<string>()
  const seenNewNames = new Set<string>()
  let duplicateCount = 0

  for (const change of parsed.existingSpotChanges) {
    const current = byId.get(change.spotId)
    if (!current) {
      errors.push(`现有地点不存在：${change.spotId}`)
      continue
    }
    if (seenTargets.has(change.spotId)) {
      errors.push(`现有地点重复提交：${change.spotId}`)
      duplicateCount++
      continue
    }
    seenTargets.add(change.spotId)
    const diff = buildSpotDiff(current, change.proposed)
    const noMaterial = Object.keys(diff).length === 0
    candidates.push({
      id: idFactory(),
      candidateType: noMaterial ? 'no_material_change' : change.changeType,
      targetSpotId: current.id,
      proposedName: change.proposed.name ?? null,
      proposedSearchName: change.proposed.searchName ?? null,
      proposedCategory: change.proposed.category ?? null,
      proposedTier: change.proposed.tier ?? null,
      proposedReason: change.proposed.reason ?? null,
      proposedTierReason: change.proposed.tierReason ?? null,
      proposedData: { ...change.proposed, expectedVersion: current.version, aiReason: change.reason },
      evidence: evidenceFor(change.evidenceUrls, parsed),
      diff,
      amapVerificationStatus: change.changeType === 'rename' ? 'unverified' : 'not_required',
      systemAssessment: noMaterial ? 'no_material_change' : change.changeType === 'rename' ? 'high_risk_manual_review' : 'recommended_update',
      systemAssessmentReason: noMaterial ? '仅有空格、标点或等价内容变化' : change.changeType === 'rename' ? '改名属于高风险操作，必须人工确认' : '已生成字段级差异，等待人工审核',
    })
  }

  for (const proposal of parsed.newCandidates) {
    const normalizedName = normalizeSpotName(proposal.name)
    if (seenNewNames.has(normalizedName)) {
      errors.push(`新地点重复提交：${proposal.name}`)
      duplicateCount++
      continue
    }
    seenNewNames.add(normalizedName)
    const possibleMatch = normalized
      .map(item => ({ ...item, score: similarity(normalizedName, item.name) }))
      .sort((a, b) => b.score - a.score)[0]
    const possibleDuplicate = !!possibleMatch && possibleMatch.score >= 0.8
    if (possibleDuplicate) duplicateCount++
    const evidence = evidenceFor(proposal.evidenceUrls, parsed)
    const evidenceCount = uniqueEvidenceCount(proposal.evidenceUrls)
    candidates.push({
      id: idFactory(),
      candidateType: possibleDuplicate ? 'possible_duplicate' : 'new_spot',
      targetSpotId: possibleDuplicate ? possibleMatch.spot.id : null,
      proposedName: proposal.name,
      proposedSearchName: proposal.searchName,
      proposedCategory: proposal.category,
      proposedTier: proposal.suggestedTier,
      proposedReason: proposal.reason,
      proposedTierReason: proposal.tierReason,
      proposedData: {
        name: proposal.name,
        searchName: proposal.searchName,
        category: proposal.category,
        tier: proposal.suggestedTier,
        reason: proposal.reason,
        tierReason: proposal.tierReason,
        tags: proposal.tags,
        personas: proposal.personas,
        bestTime: proposal.bestTime,
        suggestedDuration: proposal.suggestedDuration,
        indoorFriendly: proposal.indoorFriendly,
        reservationRequired: proposal.reservationRequired,
        reservationNote: proposal.reservationNote,
      },
      evidence,
      diff: null,
      amapVerificationStatus: 'unverified',
      systemAssessment: possibleDuplicate ? 'possible_duplicate' : evidenceCount < 2 ? 'needs_more_evidence' : 'needs_amap_verification',
      systemAssessmentReason: possibleDuplicate
        ? `名称与现有地点“${possibleMatch.spot.name}”高度相似`
        : evidenceCount < 2 ? '新地点需要至少两个不同域名的HTTPS来源' : '来源数量满足要求，仍需高德验证地点真实存在',
    })
  }

  for (const risk of parsed.possibleClosedOrRenamed) {
    const current = byId.get(risk.spotId)
    if (!current) {
      errors.push(`高风险地点不存在：${risk.spotId}`)
      continue
    }
    if (seenTargets.has(risk.spotId)) {
      errors.push(`同一地点存在多条互相冲突的建议：${risk.spotId}`)
      duplicateCount++
      continue
    }
    seenTargets.add(risk.spotId)
    const proposed = risk.changeType === 'rename' ? { name: risk.proposedName } : {}
    candidates.push({
      id: idFactory(),
      candidateType: risk.changeType,
      targetSpotId: current.id,
      proposedName: risk.proposedName || null,
      proposedSearchName: risk.proposedName || current.searchName,
      proposedData: { ...proposed, expectedVersion: current.version, aiReason: risk.reason },
      evidence: evidenceFor(risk.evidenceUrls, parsed),
      diff: buildSpotDiff(current, proposed),
      amapVerificationStatus: 'unverified',
      systemAssessment: 'high_risk_manual_review',
      systemAssessmentReason: '关闭、迁址或改名不得自动应用，必须逐项人工确认',
    })
  }

  if (parsed.noMaterialChange) {
    candidates.push({
      id: idFactory(),
      candidateType: 'no_material_change',
      proposedData: { searchSummary: parsed.searchSummary, researchedAt: parsed.researchedAt },
      evidence: parsed.sources,
      diff: null,
      amapVerificationStatus: 'not_required',
      systemAssessment: 'no_material_change',
      systemAssessmentReason: '外部检索声明本周无实质变化，仍需管理员主动确认',
    })
  }

  return {
    previewHash: await previewHash(rawJson),
    valid: errors.length === 0,
    errors,
    summary: {
      researchedAt: parsed.researchedAt,
      sourceCount: parsed.sources.length,
      newSpotCount: parsed.newCandidates.length,
      existingChangeCount: parsed.existingSpotChanges.length,
      possibleClosedCount: parsed.possibleClosedOrRenamed.length,
      noMaterialChange: parsed.noMaterialChange,
      duplicateCount,
      errorCount: errors.length,
    },
    candidates,
    parsed,
  }
}
