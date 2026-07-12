import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getEnv, type Bindings } from './config/env.js'
import { initAmapClient } from './services/amap/client.js'
import { initLlmClient } from './services/llm/client.js'
import { initJobStore } from './services/jobStore.js'
import planRoutes from './routes/planRoutes.js'
import { AppError } from './middleware/errorHandler.js'

const app = new Hono<{ Bindings: Bindings }>()

// ── Lazy one-time initialization (per isolate) ──
// ctx.env is per-request, so we init on first request and cache the env reference.
let initialized = false
app.use('*', async (c, next) => {
  if (!initialized) {
    const env = getEnv(c.env)
    initAmapClient(env)
    initLlmClient(env)
    initJobStore(c.env.JOBS)
    initialized = true
  }
  await next()
})

// ── CORS ──
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// ── Health check ──
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() })
})

// ── API routes ──
app.route('/api/plan', planRoutes)

// ── Global error handler ──
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({
      error: { code: err.code, message: err.message },
    }, err.statusCode as any)
  }
  console.error('Unhandled error:', err)
  return c.json({
    error: { code: 'INTERNAL_ERROR', message: '服务异常，请稍后重试' },
  }, 500)
})

export default app
