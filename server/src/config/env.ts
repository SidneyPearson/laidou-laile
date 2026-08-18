import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  AMAP_WEB_API_KEY: z.string().min(1),
  AMAP_TIMEOUT_MS: z.coerce.number().default(10000),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  ADMIN_SESSION_SECRET: z.string().min(32),
  ADMIN_ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:9090,http://127.0.0.1:9090').refine(value => {
    try {
      return value.split(',').every(origin => new URL(origin.trim()).origin === origin.trim())
    } catch { return false }
  }, 'ADMIN_ALLOWED_ORIGINS must contain exact comma-separated origins'),
  ADMIN_SESSION_TTL_SECONDS: z.coerce.number().int().min(900).max(604800).default(28800),
})

export type Env = z.infer<typeof envSchema>

/** Hono Bindings type — what ctx.env provides in Pages `_worker.js`. */
export type Bindings = Env & {
  DB: D1Database
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
}

/** Extract and validate env from Hono context. Called once on first request. */
export function getEnv(envLike: unknown): Env {
  return envSchema.parse(envLike)
}
