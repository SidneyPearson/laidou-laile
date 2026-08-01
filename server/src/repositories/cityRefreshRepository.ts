import type { CityRecord, SpotCategory, SpotRecord, SpotTier } from '../domain/curation.js'
import type {
  RefreshAssessment,
  RefreshCandidateType,
  RefreshDecision,
  RefreshRunStatus,
} from '../domain/weeklyRefresh.js'

export interface RefreshRunRecord {
  id: string
  cityAdcode: string
  status: RefreshRunStatus
  schemaVersion: string
  promptText: string | null
  rawResultJson: string | null
  importSummary: Record<string, unknown> | null
  startedAt: string
  promptGeneratedAt: string | null
  resultImportedAt: string | null
  completedAt: string | null
  completedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface RefreshCandidateRecord {
  id: string
  runId: string
  candidateType: RefreshCandidateType
  targetSpotId: string | null
  proposedName: string | null
  proposedSearchName: string | null
  proposedCategory: SpotCategory | null
  proposedTier: SpotTier | null
  proposedReason: string | null
  proposedTierReason: string | null
  proposedData: Record<string, unknown>
  evidence: Array<Record<string, unknown>>
  diff: Record<string, unknown> | null
  amapVerificationStatus: 'not_required' | 'unverified' | 'verified' | 'failed'
  amapVerification: Record<string, unknown> | null
  systemAssessment: RefreshAssessment
  systemAssessmentReason: string | null
  decision: RefreshDecision
  decisionNote: string | null
  createdAt: string
  updatedAt: string
  reviewedAt: string | null
}

export interface RefreshCandidateDraft {
  id: string
  candidateType: RefreshCandidateType
  targetSpotId?: string | null
  proposedName?: string | null
  proposedSearchName?: string | null
  proposedCategory?: SpotCategory | null
  proposedTier?: SpotTier | null
  proposedReason?: string | null
  proposedTierReason?: string | null
  proposedData: Record<string, unknown>
  evidence: Array<Record<string, unknown>>
  diff?: Record<string, unknown> | null
  amapVerificationStatus: RefreshCandidateRecord['amapVerificationStatus']
  systemAssessment: RefreshAssessment
  systemAssessmentReason?: string | null
}

export interface ReviewCityRecord extends CityRecord {
  activeRunId: string | null
  activeRunStatus: RefreshRunStatus | null
  lastCompletedAt: string | null
}

export interface CityRefreshRepository {
  listReviewCities(): Promise<ReviewCityRecord[]>
  getCity(adcode: string): Promise<CityRecord | null>
  getRun(id: string): Promise<RefreshRunRecord | null>
  getRunCandidates(runId: string): Promise<RefreshCandidateRecord[]>
  getCandidate(id: string): Promise<RefreshCandidateRecord | null>
  listCitySpots(adcode: string): Promise<SpotRecord[]>
  createRun(id: string, adcode: string, now: string): Promise<RefreshRunRecord | 'active_exists' | null>
  savePrompt(runId: string, prompt: string, now: string): Promise<RefreshRunRecord | null>
  saveImport(runId: string, rawJson: string, summary: Record<string, unknown>, candidates: RefreshCandidateDraft[], now: string): Promise<RefreshRunRecord | 'invalid_state' | null>
  updateCandidateVerification(id: string, status: RefreshCandidateRecord['amapVerificationStatus'], verification: Record<string, unknown> | null, assessment: RefreshAssessment, reason: string, now: string): Promise<RefreshCandidateRecord | null>
  decideCandidate(id: string, decision: Exclude<RefreshDecision, 'pending'>, note: string | null, now: string): Promise<RefreshCandidateRecord | null>
  completeRun(runId: string, now: string): Promise<RefreshRunRecord | 'pending_candidates' | 'invalid_state' | null>
  cancelRun(runId: string, now: string): Promise<RefreshRunRecord | 'invalid_state' | null>
}
