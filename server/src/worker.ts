import { Hono } from 'hono'
import { getEnv, type Bindings } from './config/env.js'
import { initAmapClient } from './services/amap/client.js'
import planRoutes from './routes/planRoutes.js'
import exploreRoutes from './routes/exploreRoutes.js'
import cityRoutes from './routes/cityRoutes.js'
import { createAdminAuthRoutes } from './routes/adminAuthRoutes.js'
import { createAdminRoutes } from './routes/adminRoutes.js'
import { createRecommendationRoutes } from './routes/recommendationRoutes.js'
import { createAdminRefreshRoutes } from './routes/adminRefreshRoutes.js'
import { createAdminHomePersonaRoutes } from './routes/adminHomePersonaRoutes.js'
import { createHomePersonaRoutes } from './routes/homePersonaRoutes.js'
import { AppError } from './middleware/errorHandler.js'

const app = new Hono<{ Bindings: Bindings }>()

// ── Lazy one-time initialization (per isolate) ──
// Must call getEnv() to apply Zod defaults for vars not set in Pages env
// (e.g. AMAP_TIMEOUT_MS).
let initialized = false
function ensureInit(env: Bindings) {
  if (!initialized) {
    const validatedEnv = getEnv(env)
    initAmapClient(validatedEnv)
    initialized = true
  }
}

// ── Health check ──
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() })
})

// ── API routes ──
app.route('/api/plan', planRoutes)
app.route('/api/admin/auth', createAdminAuthRoutes())
app.route('/api/admin', createAdminRoutes())
app.route('/api/admin', createAdminRefreshRoutes())
app.route('/api/admin', createAdminHomePersonaRoutes())
app.route('/api/recommendations/cities', createRecommendationRoutes())
app.route('/api/home/personas', createHomePersonaRoutes())
app.route('/api/explore', exploreRoutes)
app.route('/api/city', cityRoutes)

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
    const url = new URL(request.url)

    // API routes → Hono
    if (url.pathname.startsWith('/api/')) {
      try {
        ensureInit(env)
      } catch (error) {
        console.error('Worker configuration error:', error instanceof Error ? error.message : 'invalid configuration')
        return Response.json({
          error: { code: 'CONFIGURATION_ERROR', message: '服务配置不完整，请联系管理员' },
        }, { status: 500 })
      }
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
