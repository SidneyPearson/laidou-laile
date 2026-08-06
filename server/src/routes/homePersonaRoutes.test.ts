import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Bindings } from '../config/env.js'
import type { HomePersonaRecord, HomePersonaRepository } from '../repositories/homePersonaRepository.js'
import { createHomePersonaRoutes } from './homePersonaRoutes.js'

const env = {
  NODE_ENV: 'development',
  AMAP_WEB_API_KEY: 'x',
  AMAP_TIMEOUT_MS: 10000,
  ADMIN_PASSWORD_HASH: 'unused',
  ADMIN_SESSION_SECRET: 'session-secret-at-least-thirty-two-characters',
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
  throwOnList = false
  async list() { return this.cards }
  async listPublished() {
    if (this.throwOnList) throw new Error('D1 unavailable')
    return this.cards.filter(c => c.enabled)
  }
  async get() { return null }
  async update() { return null }
  async audit() {}
}

function createApp(repository: HomePersonaRepository) {
  const app = new Hono<{ Bindings: Bindings }>()
  app.route('/api/home/personas', createHomePersonaRoutes({ repository: () => repository }))
  return app
}

describe('GET /api/home/personas', () => {
  it('returns only enabled cards as the public wire shape', async () => {
    const repo = new FakeRepository()
    repo.cards[1] = record({ id: 'urban', enabled: false, sortOrder: 50 })
    const app = createApp(repo)

    const res = await app.request('/api/home/personas', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.source).toBe('d1')
    expect(body.cards).toHaveLength(1)
    expect(body.cards[0]).toEqual({
      id: 'fast',
      title: '情侣约会',
      tagline: '浪漫 · 夜景 · 出片',
      imageUrl: 'https://images.unsplash.com/x?w=300',
      sortOrder: 10,
    })
  })

  it('degrades to a 503 static fallback when D1 fails', async () => {
    const repo = new FakeRepository()
    repo.throwOnList = true
    const app = createApp(repo)

    const res = await app.request('/api/home/personas', {}, env)
    expect(res.status).toBe(503)
    const body = await res.json() as any
    expect(body.source).toBe('static_fallback')
    expect(body.cards).toEqual([])
  })
})
