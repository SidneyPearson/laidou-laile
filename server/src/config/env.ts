import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  CORS_ORIGIN: z.string().default('*'),
  AMAP_WEB_API_KEY: z.string().min(1),
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().default('https://api.deepseek.com/v1'),
  LLM_MODEL: z.string().default('deepseek-v4-pro'),
  LLM_TIMEOUT_MS: z.coerce.number().default(35000),
  AMAP_TIMEOUT_MS: z.coerce.number().default(10000),
})

export type Env = z.infer<typeof envSchema>

/** Hono Bindings type — what ctx.env provides in Workers/Pages */
export type Bindings = Env & {
  JOBS: KVNamespace
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
}

/** Extract and validate env from Hono context. Called once on first request. */
export function getEnv(envLike: unknown): Env {
  return envSchema.parse(envLike)
}
