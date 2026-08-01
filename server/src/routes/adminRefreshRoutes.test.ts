import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSession } from '../auth/adminCrypto.js'
import type { Bindings } from '../config/env.js'
import type { CityRecord, SpotRecord } from '../domain/curation.js'
import { ADMIN_COOKIE } from '../middleware/adminAuth.js'
import type {
  CityRefreshRepository,
  RefreshCandidateDraft,
  RefreshCandidateRecord,
  RefreshRunRecord,
  ReviewCityRecord,
} from '../repositories/cityRefreshRepository.js'
import type {
  CityListQuery,
  CityWrite,
  CurationRepository,
  DashboardStats,
  Page,
  SpotListQuery,
  SpotWrite,
  VerificationWrite,
} from '../repositories/curationRepository.js'
import { createAdminRefreshRoutes } from './adminRefreshRoutes.js'

const secret = 'weekly-refresh-test-secret-at-least-thirty-two'
const env = {
  NODE_ENV: 'development',
  AMAP_WEB_API_KEY: 'x',
  LLM_API_KEY: 'x',
  LLM_BASE_URL: 'https://api.deepseek.com/v1',
  LLM_MODEL: 'deepseek-v4-flash',
  LLM_TIMEOUT_MS: 35000,
  AMAP_TIMEOUT_MS: 10000,
  ADMIN_PASSWORD_HASH: 'unused',
  ADMIN_SESSION_SECRET: secret,
  ADMIN_ALLOWED_ORIGINS: 'http://localhost:9090',
  ADMIN_SESSION_TTL_SECONDS: 3600,
  DB: {} as D1Database,
} satisfies Bindings

function city(): CityRecord {
  return {
    adcode: '310000', provinceName: '上海', name: '上海', slug: 'shanghai',
    intro: null, coverImageUrl: null, status: 'published', priority: 1,
    reviewIntervalDays: 7, lastContentReviewAt: null, lastRefreshRunId: null,
    createdAt: '', updatedAt: '', spotCount: 1, publishedSpotCount: 1,
  }
}

function spot(overrides: Partial<SpotRecord> = {}): SpotRecord {
  return {
    id: 'existing-spot', cityAdcode: '310000', name: '现有地点', searchName: '现有地点',
    amapName: '现有地点', amapPoiId: 'EXISTING_POI', district: null, address: null,
    lng: 121, lat: 31, category: 'classic_landmark', tier: 'A', priority: 1,
    reason: '推荐', tierReason: '理由', personas: [], tags: [], suggestedDuration: null,
    bestTime: null, indoorFriendly: false, reservationRequired: false,
    reservationNote: null, coverImageUrl: null, verificationStatus: 'verified',
    verifiedAt: '', publicationStatus: 'published', sourceKind: null, version: 2,
    createdAt: '', updatedAt: '', ...overrides,
  }
}

function run(overrides: Partial<RefreshRunRecord> = {}): RefreshRunRecord {
  return {
    id: 'a'.repeat(32), cityAdcode: '310000', status: 'reviewing', schemaVersion: '1.0',
    promptText: 'prompt', rawResultJson: null, importSummary: null,
    startedAt: '', promptGeneratedAt: '', resultImportedAt: '', completedAt: null,
    completedBy: null, createdAt: '', updatedAt: '', ...overrides,
  }
}

function candidate(overrides: Partial<RefreshCandidateRecord> = {}): RefreshCandidateRecord {
  return {
    id: 'b'.repeat(32), runId: 'a'.repeat(32), candidateType: 'new_spot',
    targetSpotId: null, proposedName: '新地点', proposedSearchName: '新地点',
    proposedCategory: 'nature', proposedTier: 'B', proposedReason: '推荐',
    proposedTierReason: '级别理由',
    proposedData: {
      name: '新地点', searchName: '新地点', category: 'nature', tier: 'B',
      reason: '推荐', tierReason: '级别理由', personas: [], tags: [],
      indoorFriendly: false, reservationRequired: false,
    },
    evidence: [
      { title: 'A', url: 'https://a.example/x', sourceName: 'A' },
      { title: 'B', url: 'https://b.example/y', sourceName: 'B' },
    ],
    diff: null, amapVerificationStatus: 'verified',
    amapVerification: {
      amapPoiId: 'NEW_POI', amapName: '新地点', address: '地址', lng: 121.2, lat: 31.2, images: [],
    },
    systemAssessment: 'recommended_update', systemAssessmentReason: '满足条件',
    decision: 'pending', decisionNote: null, createdAt: '', updatedAt: '', reviewedAt: null,
    ...overrides,
  }
}

class FakeRefreshRepository implements CityRefreshRepository {
  run: RefreshRunRecord | null = run()
  candidate: RefreshCandidateRecord | null = candidate()
  createResult: RefreshRunRecord | 'active_exists' | null = this.run
  completeResult: RefreshRunRecord | 'pending_candidates' | 'invalid_state' | null = this.run
  saveImportCalls = 0
  verificationAssessment: string | null = null

  async listReviewCities(): Promise<ReviewCityRecord[]> { return [{ ...city(), activeRunId: null, activeRunStatus: null, lastCompletedAt: null }] }
  async getCity(): Promise<CityRecord | null> { return city() }
  async getRun(): Promise<RefreshRunRecord | null> { return this.run }
  async getRunCandidates(): Promise<RefreshCandidateRecord[]> { return this.candidate ? [this.candidate] : [] }
  async getCandidate(): Promise<RefreshCandidateRecord | null> { return this.candidate }
  async listCitySpots(): Promise<SpotRecord[]> { return [spot()] }
  async createRun(): Promise<RefreshRunRecord | 'active_exists' | null> { return this.createResult }
  async savePrompt(): Promise<RefreshRunRecord | null> { return this.run }
  async saveImport(_runId: string, _raw: string, _summary: Record<string, unknown>, _candidates: RefreshCandidateDraft[]): Promise<RefreshRunRecord | 'invalid_state' | null> {
    this.saveImportCalls++
    return this.run
  }
  async updateCandidateVerification(
    _id: string,
    status: RefreshCandidateRecord['amapVerificationStatus'],
    verification: Record<string, unknown> | null,
    assessment: RefreshCandidateRecord['systemAssessment'],
    reason: string,
  ): Promise<RefreshCandidateRecord | null> {
    this.verificationAssessment = assessment
    this.candidate = { ...this.candidate!, amapVerificationStatus: status, amapVerification: verification, systemAssessment: assessment, systemAssessmentReason: reason }
    return this.candidate
  }
  async decideCandidate(_id: string, decision: 'accepted' | 'rejected' | 'ignored', note: string | null): Promise<RefreshCandidateRecord | null> {
    this.candidate = { ...this.candidate!, decision, decisionNote: note }
    return this.candidate
  }
  async completeRun(): Promise<RefreshRunRecord | 'pending_candidates' | 'invalid_state' | null> { return this.completeResult }
  async cancelRun(): Promise<RefreshRunRecord | 'invalid_state' | null> { return this.run }
}

class FakeCurationRepository implements CurationRepository {
  createdWrite: SpotWrite | null = null
  updateResult: 'conflict' | SpotRecord | null = spot({ version: 3 })
  updateCalls = 0
  audits: string[] = []

  async listCities(query: CityListQuery): Promise<Page<CityRecord>> { return { items: [city()], page: query.page, pageSize: query.pageSize, total: 1, totalPages: 1 } }
  async listPublishedCities(): Promise<CityRecord[]> { return [city()] }
  async createCity(_input: CityWrite): Promise<CityRecord> { return city() }
  async updateCity(): Promise<CityRecord | null> { return city() }
  async listSpots(query: SpotListQuery): Promise<Page<SpotRecord>> { return { items: [spot()], page: query.page, pageSize: query.pageSize, total: 1, totalPages: 1 } }
  async getSpot(): Promise<SpotRecord | null> { return spot() }
  async createSpot(input: SpotWrite): Promise<SpotRecord> {
    this.createdWrite = input
    return spot({ id: input.id, name: input.name, publicationStatus: input.publicationStatus, version: 1, verificationStatus: 'unverified', amapPoiId: null })
  }
  async updateSpot(): Promise<'conflict' | SpotRecord | null> { this.updateCalls++; return this.updateResult }
  async setVerification(_id: string, _version: number, input: VerificationWrite): Promise<'conflict' | SpotRecord | null> {
    return spot({ id: this.createdWrite?.id, name: this.createdWrite?.name, publicationStatus: 'draft', verificationStatus: input.verificationStatus, amapPoiId: input.amapPoiId, version: 2 })
  }
  async setPublication(): Promise<'conflict' | SpotRecord | null> { return null }
  async dashboard(): Promise<DashboardStats> { return { publishedCities: 1, draftSpots: 0, pendingReview: 0, publishedSpots: 1, verificationFailed: 0, staleSpots: 0 } }
  async audit(action: string): Promise<void> { this.audits.push(action) }
  async listPublished(): Promise<SpotRecord[]> { return [spot()] }
}

async function headers() {
  const token = await createSession(secret, Math.floor(Date.now() / 1000), 3600)
  return {
    Cookie: `${ADMIN_COOKIE}=${token}`,
    Origin: 'http://localhost:9090',
    'Content-Type': 'application/json',
  }
}

function app(refresh: FakeRefreshRepository, curation: FakeCurationRepository, verify?: any) {
  const value = new Hono<{ Bindings: Bindings }>()
  value.route('/api/admin', createAdminRefreshRoutes({
    refreshRepository: () => refresh,
    curationRepository: () => curation,
    verify,
    clock: () => '2026-07-26T00:00:00.000Z',
    idFactory: () => 'c'.repeat(32),
  }))
  return value
}

describe('admin weekly refresh routes', () => {
  let refresh: FakeRefreshRepository
  let curation: FakeCurationRepository
  beforeEach(() => { refresh = new FakeRefreshRepository(); curation = new FakeCurationRepository() })

  it('prevents two active runs for the same city', async () => {
    refresh.createResult = 'active_exists'
    const response = await app(refresh, curation).request('/api/admin/cities/310000/refresh-runs', {
      method: 'POST', headers: await headers(), body: '{}',
    }, env)
    expect(response.status).toBe(409)
  })

  it('keeps import preview read-only', async () => {
    refresh.run = run({ status: 'prompt_generated' })
    const rawJson = JSON.stringify({
      schemaVersion: '1.0', city: { name: '上海', adcode: '310000' },
      researchedAt: '2026-07-26T00:00:00.000Z', searchSummary: '无变化',
      noMaterialChange: true, sources: [], existingSpotChanges: [],
      newCandidates: [], possibleClosedOrRenamed: [],
    })
    const response = await app(refresh, curation).request(`/api/admin/refresh-runs/${refresh.run.id}/import-preview`, {
      method: 'POST', headers: await headers(), body: JSON.stringify({ rawJson }),
    }, env)
    expect(response.status).toBe(200)
    expect(refresh.saveImportCalls).toBe(0)
    expect(curation.createdWrite).toBeNull()
  })

  it('rejects refresh imports larger than 256KB', async () => {
    const response = await app(refresh, curation).request(`/api/admin/refresh-runs/${refresh.run!.id}/import-preview`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ rawJson: 'x'.repeat(256 * 1024) }),
    }, env)
    expect(response.status).toBe(413)
  })

  it('accepts a verified new candidate only as a draft', async () => {
    const response = await app(refresh, curation).request(`/api/admin/refresh-candidates/${refresh.candidate!.id}/accept`, {
      method: 'POST', headers: await headers(), body: JSON.stringify({}),
    }, env)
    expect(response.status).toBe(201)
    expect(curation.createdWrite?.publicationStatus).toBe('draft')
    expect((await response.json() as any).spot).toMatchObject({ publicationStatus: 'draft', verificationStatus: 'verified' })
  })

  it('does not recommend a new candidate before Amap verification', async () => {
    refresh.candidate = candidate({ amapVerificationStatus: 'unverified', amapVerification: null, systemAssessment: 'needs_amap_verification' })
    const response = await app(refresh, curation).request(`/api/admin/refresh-candidates/${refresh.candidate.id}/accept`, {
      method: 'POST', headers: await headers(), body: JSON.stringify({}),
    }, env)
    expect(response.status).toBe(422)
    expect(curation.createdWrite).toBeNull()
  })

  it('marks an Amap POI already used by another spot as a possible duplicate', async () => {
    refresh.candidate = candidate({ amapVerificationStatus: 'unverified', amapVerification: null, systemAssessment: 'needs_amap_verification' })
    const response = await app(refresh, curation, async () => ({
      id: 'EXISTING_POI', name: '重复地点', address: '', lng: 121, lat: 31, photos: [],
    })).request(`/api/admin/refresh-candidates/${refresh.candidate.id}/verify`, {
      method: 'POST', headers: await headers(), body: '{}',
    }, env)
    expect(response.status).toBe(200)
    expect(refresh.verificationAssessment).toBe('possible_duplicate')
  })

  it('never auto-applies a possible closure and requires high-risk confirmation', async () => {
    refresh.candidate = candidate({ candidateType: 'possible_closed', targetSpotId: 'existing-spot', systemAssessment: 'high_risk_manual_review' })
    const url = `/api/admin/refresh-candidates/${refresh.candidate.id}/accept`
    expect((await app(refresh, curation).request(url, {
      method: 'POST', headers: await headers(), body: JSON.stringify({}),
    }, env)).status).toBe(422)
    const accepted = await app(refresh, curation).request(url, {
      method: 'POST', headers: await headers(), body: JSON.stringify({ highRiskConfirmed: true }),
    }, env)
    expect(accepted.status).toBe(200)
    expect(curation.updateCalls).toBe(0)
  })

  it('rejects stale versions instead of overwriting an existing spot', async () => {
    refresh.candidate = candidate({ candidateType: 'tier_change', targetSpotId: 'existing-spot', proposedData: { tier: 'B', expectedVersion: 2 } })
    curation.updateResult = 'conflict'
    const response = await app(refresh, curation).request(`/api/admin/refresh-candidates/${refresh.candidate.id}/accept`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ expectedVersion: 2, applyToPublished: true }),
    }, env)
    expect(response.status).toBe(409)
  })

  it('blocks candidate mutations after a refresh run is cancelled', async () => {
    refresh.run = run({ status: 'cancelled' })
    const acceptResponse = await app(refresh, curation).request(`/api/admin/refresh-candidates/${refresh.candidate!.id}/accept`, {
      method: 'POST', headers: await headers(), body: JSON.stringify({}),
    }, env)
    const rejectResponse = await app(refresh, curation).request(`/api/admin/refresh-candidates/${refresh.candidate!.id}/reject`, {
      method: 'POST', headers: await headers(), body: JSON.stringify({}),
    }, env)
    const verifyResponse = await app(refresh, curation).request(`/api/admin/refresh-candidates/${refresh.candidate!.id}/verify`, {
      method: 'POST', headers: await headers(), body: '{}',
    }, env)
    expect(acceptResponse.status).toBe(409)
    expect(rejectResponse.status).toBe(409)
    expect(verifyResponse.status).toBe(409)
    expect(curation.createdWrite).toBeNull()
    expect(refresh.candidate!.decision).toBe('pending')
  })

  it('cannot complete while candidates are pending', async () => {
    refresh.completeResult = 'pending_candidates'
    const response = await app(refresh, curation).request(`/api/admin/refresh-runs/${refresh.run!.id}/complete`, {
      method: 'POST', headers: await headers(), body: '{}',
    }, env)
    expect(response.status).toBe(422)
  })

  it('requires an explicit administrator action to confirm no material change', async () => {
    refresh.candidate = candidate({
      candidateType: 'no_material_change',
      proposedName: null,
      systemAssessment: 'no_material_change',
      amapVerificationStatus: 'not_required',
      amapVerification: null,
    })
    const response = await app(refresh, curation).request(`/api/admin/refresh-runs/${refresh.run!.id}/confirm-no-change`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ confirmed: true }),
    }, env)
    expect(response.status).toBe(200)
    expect(refresh.candidate.decision).toBe('accepted')
  })
})
