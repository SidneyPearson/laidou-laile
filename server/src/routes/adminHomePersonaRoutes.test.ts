import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSession } from '../auth/adminCrypto.js'
import type { Bindings } from '../config/env.js'
import { ADMIN_COOKIE } from '../middleware/adminAuth.js'
import type { HomePersonaRecord, HomePersonaRepository, HomePersonaUpdate } from '../repositories/homePersonaRepository.js'
import { createAdminHomePersonaRoutes } from './adminHomePersonaRoutes.js'

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

function record(overrides: Partial<HomePersonaRecord> = {}): HomePersonaRecord {
  return {
    id: 'couple',
    title: '情侣约会',
    subtitle: '浪漫 · 夜景 · 出片',
    imageUrl: 'https://images.unsplash.com/x?w=300',
    sortOrder: 20,
    enabled: true,
    version: 1,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

class FakeRepository implements HomePersonaRepository {
  cards: HomePersonaRecord[] = [
    record({ id: 'fast', sortOrder: 10 }),
    record({ id: 'couple', sortOrder: 20 }),
  ]
  lastUpdate: { id: string; changes: HomePersonaUpdate; version: number } | null = null
  audits: unknown[] = []
  async list() { return this.cards }
  async listPublished() { return this.cards.filter(c => c.enabled) }
  async get(id: string) { return this.cards.find(c => c.id === id) ?? null }
  async update(id: string, expectedVersion: number, input: HomePersonaUpdate) {
    const current = this.cards.find(c => c.id === id)
    if (!current) return null
    if (current.version !== expectedVersion) return 'conflict'
    this.lastUpdate = { id, changes: input, version: expectedVersion }
    Object.assign(current, input, { version: current.version + 1, updatedAt: '2026-08-05T01:00:00.000Z' })
    return current
  }
  async audit(...args: unknown[]) { this.audits.push(args) }
}

function createApp(repository: FakeRepository) {
  const app = new Hono<{ Bindings: Bindings }>()
  app.route('/api/admin', createAdminHomePersonaRoutes({ repository: () => repository }))
  return app
}

async function authHeaders(origin = true) {
  const token = await createSession(sessionSecret, Math.floor(Date.now() / 1000), 3600)
  return {
    Cookie: `${ADMIN_COOKIE}=${token}`,
    ...(origin ? { Origin: 'http://localhost:9090' } : {}),
    'Content-Type': 'application/json',
  }
}

describe('admin home persona routes', () => {
  let repository: FakeRepository
  beforeEach(() => { repository = new FakeRepository() })

  it('rejects unauthenticated reads and cross-origin writes', async () => {
    expect((await createApp(repository).request('/api/admin/home-personas', {}, env)).status).toBe(401)
    const res = await createApp(repository).request('/api/admin/home-personas/couple', {
      method: 'PATCH',
      headers: await authHeaders(false),
      body: JSON.stringify({ title: 'x', expectedVersion: 1 }),
    }, env)
    expect(res.status).toBe(403)
  })

  it('lists all cards (including the fixed ids)', async () => {
    const res = await createApp(repository).request('/api/admin/home-personas', { headers: await authHeaders() }, env)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.total).toBe(2)
    expect(body.items.map((c: any) => c.id)).toEqual(['fast', 'couple'])
  })

  it('updates a card and bumps version + writes an audit log', async () => {
    const res = await createApp(repository).request('/api/admin/home-personas/couple', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ title: '情侣专属', enabled: false, expectedVersion: 1 }),
    }, env)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.title).toBe('情侣专属')
    expect(body.enabled).toBe(false)
    expect(body.version).toBe(2)
    expect(repository.lastUpdate?.changes).toMatchObject({ title: '情侣专属', enabled: false })
    expect(repository.audits).toHaveLength(1)
  })

  it('returns 409 on stale version', async () => {
    const res = await createApp(repository).request('/api/admin/home-personas/couple', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ title: 'x', expectedVersion: 99 }),
    }, env)
    expect(res.status).toBe(409)
  })

  it('returns 404 for unknown id', async () => {
    const res = await createApp(repository).request('/api/admin/home-personas/unknown', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ title: 'x', expectedVersion: 1 }),
    }, env)
    expect(res.status).toBe(404)
  })

  it('rejects non-https image urls', async () => {
    const res = await createApp(repository).request('/api/admin/home-personas/couple', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ imageUrl: 'http://example.com/a.png', expectedVersion: 1 }),
    }, env)
    expect(res.status).toBe(400)
  })
})
