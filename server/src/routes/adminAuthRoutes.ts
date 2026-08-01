import { Hono } from 'hono'
import { ZodError } from 'zod'
import type { Bindings } from '../config/env.js'
import { getEnv } from '../config/env.js'
import { createSession, verifyPassword } from '../auth/adminCrypto.js'
import { clearAdminCookie, hasAllowedOrigin, requireAdmin, requireMutationOrigin, setAdminCookie } from '../middleware/adminAuth.js'
import { parseJsonBody } from '../utils/requestBody.js'
import { badRequest } from '../middleware/errorHandler.js'
import { loginSchema } from './adminSchemas.js'

const LOGIN_WINDOW_SECONDS = 15 * 60
const LOGIN_BLOCK_SECONDS = 15 * 60
const MAX_LOGIN_FAILURES = 5

async function clientKey(request: Request): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

async function loginIsBlocked(db: D1Database, key: string, now: number): Promise<boolean> {
  const row = await db.prepare('SELECT blocked_until FROM admin_login_attempts WHERE client_key=?').bind(key).first<{ blocked_until: number }>()
  return Number(row?.blocked_until ?? 0) > now
}

async function recordLoginFailure(db: D1Database, key: string, now: number): Promise<void> {
  const row = await db.prepare('SELECT failed_count,window_started_at FROM admin_login_attempts WHERE client_key=?').bind(key).first<{ failed_count: number; window_started_at: number }>()
  const withinWindow = row && row.window_started_at > now - LOGIN_WINDOW_SECONDS
  const failedCount = withinWindow ? row.failed_count + 1 : 1
  const windowStartedAt = withinWindow ? row.window_started_at : now
  const blockedUntil = failedCount >= MAX_LOGIN_FAILURES ? now + LOGIN_BLOCK_SECONDS : 0
  await db.prepare(`INSERT INTO admin_login_attempts(client_key,failed_count,window_started_at,blocked_until) VALUES(?,?,?,?)
    ON CONFLICT(client_key) DO UPDATE SET failed_count=excluded.failed_count,window_started_at=excluded.window_started_at,blocked_until=excluded.blocked_until`)
    .bind(key, failedCount, windowStartedAt, blockedUntil).run()
}

export function createAdminAuthRoutes() {
  const routes = new Hono<{ Bindings: Bindings }>()
  routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
  routes.post('/login', async c => {
    const env = getEnv(c.env)
    if (!hasAllowedOrigin(c, env)) return c.json({ error: { code: 'INVALID_ORIGIN', message: '请求来源不合法' } }, 403)
    const now = Math.floor(Date.now() / 1000)
    const key = await clientKey(c.req.raw)
    if (await loginIsBlocked(c.env.DB, key, now)) return c.json({ error: { code: 'LOGIN_RATE_LIMITED', message: '登录失败次数过多，请稍后再试' } }, 429)
    const raw = await parseJsonBody(c, 4096); if (raw instanceof Response) return raw
    try {
      const input = loginSchema.parse(raw)
      if (!await verifyPassword(input.password, env.ADMIN_PASSWORD_HASH)) {
        await recordLoginFailure(c.env.DB, key, now)
        return c.json({ error: { code: 'INVALID_CREDENTIALS', message: '密码错误' } }, 401)
      }
      await c.env.DB.prepare('DELETE FROM admin_login_attempts WHERE client_key=?').bind(key).run()
      const token = await createSession(env.ADMIN_SESSION_SECRET, now, env.ADMIN_SESSION_TTL_SECONDS)
      setAdminCookie(c, token, env)
      return c.json({ authenticated: true, expiresIn: env.ADMIN_SESSION_TTL_SECONDS })
    } catch (error) { if (error instanceof ZodError) return badRequest(c, error); throw error }
  })
  routes.post('/logout', requireMutationOrigin, c => { clearAdminCookie(c, getEnv(c.env)); return c.json({ authenticated: false }) })
  routes.get('/me', requireAdmin, c => c.json({ authenticated: true }))
  return routes
}
