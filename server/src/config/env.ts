import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env from project root (works regardless of cwd)
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })

import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  AMAP_WEB_API_KEY: z.string().default('mock_key'),
  LLM_API_KEY: z.string().default('mock_key'),
  LLM_BASE_URL: z.string().default('https://api.deepseek.com/v1'),
  LLM_MODEL: z.string().default('deepseek-v4-flash'),
  LLM_FALLBACK_MODEL: z.string().default('deepseek-v4-pro'),
  LLM_TIMEOUT_MS: z.coerce.number().default(30000),
  AMAP_TIMEOUT_MS: z.coerce.number().default(10000),
})

export const env = envSchema.parse(process.env)
