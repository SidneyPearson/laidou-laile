import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Bindings } from '../config/env.js'
import { createSession } from '../auth/adminCrypto.js'
import { createAdminAuthRoutes } from './adminAuthRoutes.js'
import { ADMIN_COOKIE } from '../middleware/adminAuth.js'

function fakeDb(): D1Database {
  const statement = {
    bind: () => statement,
    first: async () => null,
    run: async () => ({ success: true, meta: { changes: 1 } }),
  }
  return { prepare: () => statement } as unknown as D1Database
}

const env = {
  NODE_ENV: 'development', AMAP_WEB_API_KEY: 'x', LLM_API_KEY: 'x', LLM_BASE_URL: 'https://api.deepseek.com/v1', LLM_MODEL: 'deepseek-v4-flash', LLM_TIMEOUT_MS: 35000, AMAP_TIMEOUT_MS: 10000,
  ADMIN_PASSWORD_HASH: 'not-a-valid-hash', ADMIN_SESSION_SECRET: 'session-secret-at-least-thirty-two-characters', ADMIN_ALLOWED_ORIGINS: 'http://localhost:9090', ADMIN_SESSION_TTL_SECONDS: 3600,
  DB: fakeDb(),
} satisfies Bindings

function app() { const value = new Hono<{ Bindings: Bindings }>(); value.route('/api/admin/auth', createAdminAuthRoutes()); return value }

describe('admin authentication routes', () => {
  it('does not expose the password hash after failed login', async () => {
    const response = await app().request('/api/admin/auth/login', { method: 'POST', headers: { Origin: 'http://localhost:9090', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) }, env)
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain(env.ADMIN_PASSWORD_HASH)
  })
  it('rejects missing and cross-origin login requests', async () => {
    expect((await app().request('/api/admin/auth/login', { method: 'POST', body: '{}' }, env)).status).toBe(403)
    expect((await app().request('/api/admin/auth/login', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' }, env)).status).toBe(403)
    expect((await app().request('/api/admin/auth/login', { method: 'POST', headers: { Origin: 'http://localhost:9090/spoofed' }, body: '{}' }, env)).status).toBe(403)
  })
  it('rejects invalid and expired signed cookies', async () => {
    const invalid = await app().request('/api/admin/auth/me', { headers: { Cookie: `${ADMIN_COOKIE}=invalid` } }, env)
    expect(invalid.status).toBe(401)
    const expired = await createSession(env.ADMIN_SESSION_SECRET, 1000, 900)
    const response = await app().request('/api/admin/auth/me', { headers: { Cookie: `${ADMIN_COOKIE}=${expired}` } }, env)
    expect(response.status).toBe(401)
  })
})
