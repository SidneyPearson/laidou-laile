import type { CityRecord, SpotRecord } from '../domain/curation.js'
import type { RefreshAssessment, RefreshDecision } from '../domain/weeklyRefresh.js'
import type {
  CityRefreshRepository,
  RefreshCandidateDraft,
  RefreshCandidateRecord,
  RefreshRunRecord,
  ReviewCityRecord,
} from './cityRefreshRepository.js'
import { D1CurationRepository } from './d1CurationRepository.js'

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseArray(value: unknown): Array<Record<string, unknown>> {
  if (!value) return []
  try {
    const parsed = JSON.parse(String(value))
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : []
  } catch {
    return []
  }
}

function mapRun(row: any): RefreshRunRecord {
  return {
    id: row.id,
    cityAdcode: row.city_adcode,
    status: row.status,
    schemaVersion: row.schema_version,
    promptText: row.prompt_text,
    rawResultJson: row.raw_result_json,
    importSummary: parseObject(row.import_summary_json),
    startedAt: row.started_at,
    promptGeneratedAt: row.prompt_generated_at,
    resultImportedAt: row.result_imported_at,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCandidate(row: any): RefreshCandidateRecord {
  return {
    id: row.id,
    runId: row.run_id,
    candidateType: row.candidate_type,
    targetSpotId: row.target_spot_id,
    proposedName: row.proposed_name,
    proposedSearchName: row.proposed_search_name,
    proposedCategory: row.proposed_category,
    proposedTier: row.proposed_tier,
    proposedReason: row.proposed_reason,
    proposedTierReason: row.proposed_tier_reason,
    proposedData: parseObject(row.proposed_data_json) ?? {},
    evidence: parseArray(row.evidence_json),
    diff: parseObject(row.diff_json),
    amapVerificationStatus: row.amap_verification_status,
    amapVerification: parseObject(row.amap_verification_json),
    systemAssessment: row.system_assessment,
    systemAssessmentReason: row.system_assessment_reason,
    decision: row.decision,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  }
}

function mapCity(row: any): CityRecord {
  return {
    adcode: row.adcode,
    provinceName: row.province_name,
    name: row.name,
    slug: row.slug,
    intro: row.intro,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    priority: row.priority,
    reviewIntervalDays: Number(row.review_interval_days ?? 7) as 7 | 14 | 30,
    lastContentReviewAt: row.last_content_review_at ?? null,
    lastRefreshRunId: row.last_refresh_run_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    spotCount: Number(row.spot_count ?? 0),
    publishedSpotCount: Number(row.published_spot_count ?? 0),
  }
}

export class D1CityRefreshRepository implements CityRefreshRepository {
  constructor(private readonly db: D1Database) {}

  async listReviewCities(): Promise<ReviewCityRecord[]> {
    const rows = await this.db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM spots s WHERE s.city_adcode=c.adcode) spot_count,
        (SELECT COUNT(*) FROM spots s WHERE s.city_adcode=c.adcode AND s.publication_status='published') published_spot_count,
        r.id active_run_id, r.status active_run_status,
        (SELECT MAX(completed_at) FROM city_refresh_runs cr WHERE cr.city_adcode=c.adcode AND cr.status='completed') last_completed_at
      FROM cities c
      LEFT JOIN city_refresh_runs r ON r.city_adcode=c.adcode
        AND r.status NOT IN ('completed','cancelled','failed')
      ORDER BY c.priority DESC,c.name
    `).all<any>()
    return rows.results.map(row => ({
      ...mapCity(row),
      activeRunId: row.active_run_id ?? null,
      activeRunStatus: row.active_run_status ?? null,
      lastCompletedAt: row.last_completed_at ?? null,
    }))
  }

  async getCity(adcode: string): Promise<CityRecord | null> {
    const row = await this.db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM spots s WHERE s.city_adcode=c.adcode) spot_count,
        (SELECT COUNT(*) FROM spots s WHERE s.city_adcode=c.adcode AND s.publication_status='published') published_spot_count
      FROM cities c WHERE c.adcode=?
    `).bind(adcode).first<any>()
    return row ? mapCity(row) : null
  }

  async getRun(id: string): Promise<RefreshRunRecord | null> {
    const row = await this.db.prepare('SELECT * FROM city_refresh_runs WHERE id=?').bind(id).first()
    return row ? mapRun(row) : null
  }

  async getRunCandidates(runId: string): Promise<RefreshCandidateRecord[]> {
    const rows = await this.db.prepare('SELECT * FROM city_refresh_candidates WHERE run_id=? ORDER BY created_at,id').bind(runId).all()
    return rows.results.map(mapCandidate)
  }

  async getCandidate(id: string): Promise<RefreshCandidateRecord | null> {
    const row = await this.db.prepare('SELECT * FROM city_refresh_candidates WHERE id=?').bind(id).first()
    return row ? mapCandidate(row) : null
  }

  async listCitySpots(adcode: string): Promise<SpotRecord[]> {
    const repository = new D1CurationRepository(this.db)
    const result: SpotRecord[] = []
    for (let page = 1; ; page++) {
      const batch = await repository.listSpots({ page, pageSize: 100, cityAdcode: adcode })
      result.push(...batch.items)
      if (page >= batch.totalPages) return result
    }
  }

  async createRun(id: string, adcode: string, now: string): Promise<RefreshRunRecord | 'active_exists' | null> {
    if (!await this.getCity(adcode)) return null
    try {
      await this.db.prepare(`
        INSERT INTO city_refresh_runs(
          id,city_adcode,status,schema_version,started_at,created_at,updated_at
        ) VALUES(?,?,'draft','1.0',?,?,?)
      `).bind(id, adcode, now, now, now).run()
    } catch (error) {
      if (String(error).includes('UNIQUE')) return 'active_exists'
      throw error
    }
    return this.getRun(id)
  }

  async savePrompt(runId: string, prompt: string, now: string): Promise<RefreshRunRecord | null> {
    const result = await this.db.prepare(`
      UPDATE city_refresh_runs SET status='prompt_generated',prompt_text=?,
        prompt_generated_at=?,updated_at=?
      WHERE id=? AND status IN ('draft','prompt_generated')
    `).bind(prompt, now, now, runId).run()
    return result.meta.changes ? this.getRun(runId) : null
  }

  async saveImport(
    runId: string,
    rawJson: string,
    summary: Record<string, unknown>,
    candidates: RefreshCandidateDraft[],
    now: string,
  ): Promise<RefreshRunRecord | 'invalid_state' | null> {
    const run = await this.getRun(runId)
    if (!run) return null
    if (!['draft', 'prompt_generated'].includes(run.status)) return 'invalid_state'
    const statements = candidates.map(candidate => this.db.prepare(`
      INSERT INTO city_refresh_candidates(
        id,run_id,candidate_type,target_spot_id,proposed_name,proposed_search_name,
        proposed_category,proposed_tier,proposed_reason,proposed_tier_reason,
        proposed_data_json,evidence_json,diff_json,amap_verification_status,
        system_assessment,system_assessment_reason,decision,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending',?,?)
    `).bind(
      candidate.id, runId, candidate.candidateType, candidate.targetSpotId ?? null,
      candidate.proposedName ?? null, candidate.proposedSearchName ?? null,
      candidate.proposedCategory ?? null, candidate.proposedTier ?? null,
      candidate.proposedReason ?? null, candidate.proposedTierReason ?? null,
      JSON.stringify(candidate.proposedData), JSON.stringify(candidate.evidence),
      candidate.diff ? JSON.stringify(candidate.diff) : null,
      candidate.amapVerificationStatus, candidate.systemAssessment,
      candidate.systemAssessmentReason ?? null, now, now,
    ))
    await this.db.batch([
      this.db.prepare(`
        UPDATE city_refresh_runs SET status='reviewing',raw_result_json=?,
          import_summary_json=?,result_imported_at=?,updated_at=?
        WHERE id=?
      `).bind(rawJson, JSON.stringify(summary), now, now, runId),
      ...statements,
    ])
    return this.getRun(runId)
  }

  async updateCandidateVerification(
    id: string,
    status: RefreshCandidateRecord['amapVerificationStatus'],
    verification: Record<string, unknown> | null,
    assessment: RefreshAssessment,
    reason: string,
    now: string,
  ): Promise<RefreshCandidateRecord | null> {
    const result = await this.db.prepare(`
      UPDATE city_refresh_candidates SET amap_verification_status=?,
        amap_verification_json=?,system_assessment=?,system_assessment_reason=?,
        updated_at=? WHERE id=? AND decision='pending'
    `).bind(status, verification ? JSON.stringify(verification) : null, assessment, reason, now, id).run()
    return result.meta.changes ? this.getCandidate(id) : null
  }

  async decideCandidate(
    id: string,
    decision: Exclude<RefreshDecision, 'pending'>,
    note: string | null,
    now: string,
  ): Promise<RefreshCandidateRecord | null> {
    const result = await this.db.prepare(`
      UPDATE city_refresh_candidates SET decision=?,decision_note=?,reviewed_at=?,updated_at=?
      WHERE id=? AND decision='pending'
    `).bind(decision, note, now, now, id).run()
    return result.meta.changes ? this.getCandidate(id) : null
  }

  async completeRun(runId: string, now: string): Promise<RefreshRunRecord | 'pending_candidates' | 'invalid_state' | null> {
    const run = await this.getRun(runId)
    if (!run) return null
    if (run.status !== 'reviewing') return 'invalid_state'
    const pending = await this.db.prepare(`
      SELECT COUNT(*) total FROM city_refresh_candidates WHERE run_id=? AND decision='pending'
    `).bind(runId).first<{ total: number }>()
    if (Number(pending?.total ?? 0) > 0) return 'pending_candidates'
    await this.db.batch([
      this.db.prepare(`
        UPDATE city_refresh_runs SET status='completed',completed_at=?,completed_by='single_admin',updated_at=?
        WHERE id=? AND status='reviewing'
      `).bind(now, now, runId),
      this.db.prepare(`
        UPDATE cities SET last_content_review_at=?,last_refresh_run_id=?,updated_at=?
        WHERE adcode=?
      `).bind(now, runId, now, run.cityAdcode),
    ])
    return this.getRun(runId)
  }

  async cancelRun(runId: string, now: string): Promise<RefreshRunRecord | 'invalid_state' | null> {
    const run = await this.getRun(runId)
    if (!run) return null
    if (['completed', 'cancelled', 'failed'].includes(run.status)) return 'invalid_state'
    await this.db.prepare(`
      UPDATE city_refresh_runs SET status='cancelled',updated_at=? WHERE id=?
    `).bind(now, runId).run()
    return this.getRun(runId)
  }
}
