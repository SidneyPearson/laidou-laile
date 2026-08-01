import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context, Next } from 'hono'
import type { Bindings, Env } from '../config/env.js'
import { verifySession } from '../auth/adminCrypto.js'

export const ADMIN_COOKIE = 'admin_session'

export function allowedOrigins(env: Env): Set<string> {
  return new Set(env.ADMIN_ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean).map(value => new URL(value).origin))
}

export function hasAllowedOrigin(c: Context<{ Bindings: Bindings }>, env: Env): boolean {
  const origin = c.req.header('origin')
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    return parsed.origin === origin && allowedOrigins(env).has(origin)
  } catch {
    return false
  }
}

export function setAdminCookie(c: Context, token: string, env: Env): void {
  setCookie(c, ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'Strict', secure: env.NODE_ENV === 'production', path: '/', maxAge: env.ADMIN_SESSION_TTL_SECONDS })
}

export function clearAdminCookie(c: Context, env: Env): void {
  deleteCookie(c, ADMIN_COOKIE, { httpOnly: true, sameSite: 'Strict', secure: env.NODE_ENV === 'production', path: '/' })
}

export async function requireAdmin(c: Context<{ Bindings: Bindings }>, next: Next): Promise<Response | void> {
  const token = getCookie(c, ADMIN_COOKIE)
  const secret = c.env.ADMIN_SESSION_SECRET
  if (!token || !secret || !await verifySession(token, secret, Math.floor(Date.now() / 1000))) {
    return c.json({ error: { code: 'AUTH_REQUIRED', message: '请先登录后台' } }, 401)
  }
  await next()
}

export async function requireMutationOrigin(c: Context<{ Bindings: Bindings }>, next: Next): Promise<Response | void> {
  if (!hasAllowedOrigin(c, c.env)) return c.json({ error: { code: 'INVALID_ORIGIN', message: '请求来源不合法' } }, 403)
  await next()
}
