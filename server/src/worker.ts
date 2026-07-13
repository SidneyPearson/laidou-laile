import { Hono } from 'hono'
import { getEnv, type Bindings } from './config/env.js'
import { initAmapClient } from './services/amap/client.js'
import { initLlmClient } from './services/llm/client.js'
import { initJobStore } from './services/jobStore.js'
import planRoutes from './routes/planRoutes.js'
import { AppError } from './middleware/errorHandler.js'

const app = new Hono()

// ── Lazy one-time initialization (per isolate) ──
// Must call getEnv() to apply Zod defaults for vars not set in Pages env
// (e.g. AMAP_TIMEOUT_MS, LLM_TIMEOUT_MS). Raw env only has secrets + JOBS.
let initialized = false
function ensureInit(env: Bindings) {
  if (!initialized) {
    const validatedEnv = getEnv(env)
    initAmapClient(validatedEnv)
    initLlmClient(validatedEnv)
    initJobStore(env.JOBS)
    initialized = true
  }
}

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

// ── Pages _worker.js export ──
export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    ensureInit(env)

    const url = new URL(request.url)

    // API routes → Hono
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx)
    }

    // Static assets from Pages
    const assets = env.ASSETS
    if (!assets) {
      return new Response('ASSETS not available', { status: 500 })
    }

    const assetsRes = await assets.fetch(request)
    if (assetsRes.status !== 404) return assetsRes

    // SPA fallback: serve index.html for client-side routing
    return assets.fetch(new Request(new URL('/index.html', request.url)))
  },
}
