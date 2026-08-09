import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSession } from '../auth/adminCrypto.js'
import type { Bindings } from '../config/env.js'
import type { CityRecord, SpotRecord } from '../domain/curation.js'
import { ADMIN_COOKIE } from '../middleware/adminAuth.js'
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
import { createAdminRoutes } from './adminRoutes.js'

const sessionSecret = 'session-secret-at-least-thirty-two-characters'
const env = {
  NODE_ENV: 'development',
  AMAP_WEB_API_KEY: 'x',
  AMAP_TIMEOUT_MS: 10000,
  ADMIN_PASSWORD_HASH: 'unused',
  ADMIN_SESSION_SECRET: sessionSecret,
  ADMIN_ALLOWED_ORIGINS: 'http://localhost:9090',
  ADMIN_SESSION_TTL_SECONDS: 3600,
  DB: {} as D1Database,
} satisfies Bindings

function makeSpot(overrides: Partial<SpotRecord> = {}): SpotRecord {
  return {
    id: 'spot-id',
    cityAdcode: '310000',
    name: '地点',
    searchName: '地点',
    amapName: null,
    amapPoiId: null,
    district: null,
    address: null,
    lng: 121,
    lat: 31,
    category: 'classic_landmark',
    tier: 'A',
    priority: 1,
    reason: '推荐',
    tierReason: '级别理由',
    personas: [],
    tags: [],
    suggestedDuration: null,
    bestTime: null,
    indoorFriendly: false,
    reservationRequired: false,
    reservationNote: null,
    coverImageUrl: null,
    verificationStatus: 'unverified',
    verifiedAt: null,
    publicationStatus: 'draft',
    sourceKind: 'admin',
    version: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

class FakeRepository implements CurationRepository {
  spot: SpotRecord | null = makeSpot()
  lastSpotQuery: SpotListQuery | null = null
  audits: unknown[] = []

  async listCities(query: CityListQuery): Promise<Page<CityRecord>> {
    return { items: [], page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 }
  }
  async listPublishedCities(): Promise<CityRecord[]> { return [] }
  async findPublishedCity(): Promise<CityRecord | null> { return null }
  async createCity(_input: CityWrite, _now: string): Promise<CityRecord> { throw new Error('unused') }
  async updateCity(_adcode: string, _input: Partial<Omit<CityWrite, 'adcode'>>, _now: string): Promise<CityRecord | null> { return null }
  async listSpots(query: SpotListQuery): Promise<Page<SpotRecord>> {
    this.lastSpotQuery = query
    const items = this.spot ? [this.spot] : []
    return { items, page: query.page, pageSize: query.pageSize, total: items.length, totalPages: items.length ? 1 : 0 }
  }
  async getSpot(id: string): Promise<SpotRecord | null> { return this.spot?.id === id ? this.spot : null }
  async createSpot(input: SpotWrite, _now: string): Promise<SpotRecord> {
    this.spot = makeSpot(input)
    return this.spot
  }
  async updateSpot(id: string, expectedVersion: number, input: Partial<SpotWrite>, _now: string): Promise<'conflict' | SpotRecord | null> {
    if (!this.spot || this.spot.id !== id) return null
    if (this.spot.version !== expectedVersion) return 'conflict'
    this.spot = { ...this.spot, ...input, version: this.spot.version + 1 }
    return this.spot
  }
  async setVerification(_id: string, _expectedVersion: number, _input: VerificationWrite, _now: string): Promise<'conflict' | SpotRecord | null> { return this.spot }
  async setPublication(id: string, expectedVersion: number, status: SpotRecord['publicationStatus'], _now: string): Promise<'conflict' | SpotRecord | null> {
    if (!this.spot || this.spot.id !== id) return null
    if (this.spot.version !== expectedVersion) return 'conflict'
    this.spot = { ...this.spot, publicationStatus: status, version: this.spot.version + 1 }
    return this.spot
  }
  async deleteSpot(id: string, expectedVersion: number): Promise<'conflict' | 'published' | null> {
    if (!this.spot || this.spot.id !== id) return null
    if (this.spot.publicationStatus === 'published') return 'published'
    if (this.spot.version !== expectedVersion) return 'conflict'
    this.spot = null
    return null
  }
  async dashboard(_now: string): Promise<DashboardStats> {
    return { publishedCities: 0, draftSpots: 1, pendingReview: 0, publishedSpots: 0, verificationFailed: 0, staleSpots: 0 }
  }
  async audit(action: string, entityType: string, entityId: string, payload: unknown): Promise<void> {
    this.audits.push({ action, entityType, entityId, payload })
  }
  async listPublished(): Promise<SpotRecord[]> { return [] }
}

function createApp(repository: FakeRepository) {
  const app = new Hono<{ Bindings: Bindings }>()
  app.route('/api/admin', createAdminRoutes({ repository: () => repository }))
  return app
}

async function authHeaders(origin = true) {
  const now = Math.floor(Date.now() / 1000)
  const token = await createSession(sessionSecret, now, 3600)
  return {
    Cookie: `${ADMIN_COOKIE}=${token}`,
    ...(origin ? { Origin: 'http://localhost:9090' } : {}),
    'Content-Type': 'application/json',
  }
}

describe('admin curation routes', () => {
  let repository: FakeRepository

  beforeEach(() => { repository = new FakeRepository() })

  it('rejects unauthenticated reads and cross-origin writes', async () => {
    expect((await createApp(repository).request('/api/admin/spots', {}, env)).status).toBe(401)
    const response = await createApp(repository).request('/api/admin/spots/spot-id/publish', {
      method: 'POST',
      headers: await authHeaders(false),
      body: JSON.stringify({ expectedVersion: 1 }),
    }, env)
    expect(response.status).toBe(403)
  })

  it('passes validated pagination and filters to the repository', async () => {
    const response = await createApp(repository).request(
      '/api/admin/spots?page=2&pageSize=10&cityAdcode=310000&category=nature&tier=B&verificationStatus=failed&publicationStatus=draft&keyword=%E6%B9%96',
      { headers: await authHeaders() },
      env,
    )
    expect(response.status).toBe(200)
    expect(repository.lastSpotQuery).toEqual({
      page: 2,
      pageSize: 10,
      cityAdcode: '310000',
      category: 'nature',
      tier: 'B',
      verificationStatus: 'failed',
      publicationStatus: 'draft',
      keyword: '湖',
    })
  })

  it('does not publish an unverified spot or a spot without tierReason', async () => {
    const unverified = await createApp(repository).request('/api/admin/spots/spot-id/publish', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ expectedVersion: 1 }),
    }, env)
    expect(unverified.status).toBe(422)

    repository.spot = makeSpot({
      verificationStatus: 'verified',
      amapPoiId: 'B0TEST',
      tierReason: '',
    })
    const missingReason = await createApp(repository).request('/api/admin/spots/spot-id/publish', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ expectedVersion: 1 }),
    }, env)
    expect(missingReason.status).toBe(422)
    expect(await missingReason.text()).toContain('级别理由不能为空')
  })

  it('publishes a valid spot, increments version and writes an audit record', async () => {
    repository.spot = makeSpot({
      verificationStatus: 'verified',
      amapPoiId: 'B0TEST',
    })
    const response = await createApp(repository).request('/api/admin/spots/spot-id/publish', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ expectedVersion: 1 }),
    }, env)
    expect(response.status).toBe(200)
    expect((await response.json() as SpotRecord).version).toBe(2)
    expect(repository.audits).toEqual([
      expect.objectContaining({ action: 'spot.publish', entityId: 'spot-id' }),
    ])
  })

  it('returns a conflict when an update uses a stale version', async () => {
    repository.spot = makeSpot({ version: 2 })
    const response = await createApp(repository).request('/api/admin/spots/spot-id', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ expectedVersion: 1, name: '新名称' }),
    }, env)
    expect(response.status).toBe(409)
    expect(await response.text()).toContain('VERSION_CONFLICT')
  })
})
