import { Hono } from 'hono'
import type { Env } from '../config/env.js'
import { generateRoutes } from '../services/routeGenerator.js'
import { refinePlan, replaceStop } from '../services/aiPlannerService.js'
import { createJob, completeJob, failJob, getJob } from '../services/jobStore.js'

const planRoutes = new Hono<{ Bindings: Env }>()

// ── POST /generate ──
// Async with polling: returns jobId immediately, client polls GET /job/:id
planRoutes.post('/generate', async (c) => {
  const body = await c.req.json()
  const { lat, lng, timeOption, distance, preferences, cuisineTypes, scenicTypes, wanderTypes, customCuisine, customScenic, customWander } = body

  if (lat == null || lng == null || timeOption == null || distance == null || !preferences?.length) {
    return c.json({
      error: { code: 'INVALID_PARAMS', message: '请提供位置、时间、距离和至少一个偏好' },
    }, 400)
  }

  const mergedCuisine = [...(cuisineTypes || []), ...(customCuisine || [])]
  const mergedScenic = [...(scenicTypes || []), ...(customScenic || [])]
  const mergedWander = [...(wanderTypes || []), ...(customWander || [])]

  const jobId = createJob()

  // Background processing: Worker stays alive via ctx.waitUntil
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const result = await generateRoutes({
          lat, lng, timeOption, distance, preferences,
          cuisineTypes: mergedCuisine, scenicTypes: mergedScenic, wanderTypes: mergedWander,
        })

        if (result.routes.length === 0) {
          failJob(jobId, { code: 'NO_POIS_FOUND', message: '附近暂未找到合适的地点' })
          return
        }

        completeJob(jobId, {
          routes: result.routes,
          generatedAt: new Date().toISOString(),
          weatherNote: result.weatherNote,
          weather: result.weather,
          locationName: result.locationName,
          source: result.source,
          fallbackReason: result.fallbackReason,
        })
      } catch (err: any) {
        console.error('generateRoutes job failed:', err.message)
        failJob(jobId, { code: 'INTERNAL_ERROR', message: '路线生成失败，请重试' })
      }
    })(),
  )

  c.header('Cache-Control', 'no-store')
  return c.json({ jobId })
})

// ── GET /job/:id ──
// Poll for job result. Returns { status, result? } or { status, error? }
planRoutes.get('/job/:id', (c) => {
  const jobId = c.req.param('id')
  const job = getJob(jobId)

  if (!job) {
    return c.json({ error: { code: 'JOB_NOT_FOUND', message: '任务不存在或已过期' } }, 404)
  }

  c.header('Cache-Control', 'no-store')

  if (job.status === 'processing') {
    return c.json({ status: 'processing' })
  }

  if (job.status === 'error') {
    return c.json({ status: 'error', error: job.error }, 500)
  }

  return c.json({ status: 'done', result: job.result })
})

// ── POST /refine ──
// Synchronous: LLM regeneration is fast enough to stay within 30s
planRoutes.post('/refine', async (c) => {
  const body = await c.req.json()
  const { route, removeStopIndices, extraRequirements, city, weather, timeMinutes, distance } = body

  if (!route || !route.stops?.length) {
    return c.json({
      error: { code: 'INVALID_PARAMS', message: '请提供需要优化的路线' },
    }, 400)
  }

  const refined = await refinePlan({
    route,
    removeStopIndices: removeStopIndices || [],
    extraRequirements,
    position: route.stops[0]
      ? { lat: route.stops[0].lat, lng: route.stops[0].lng }
      : { lat: 0, lng: 0 },
    city: city || '',
    weather: weather || '晴',
    timeMinutes: timeMinutes || 240,
    distance: distance || 0,
  })

  if (!refined) {
    return c.json({
      error: { code: 'REFINE_FAILED', message: '路线优化失败，请重试' },
    }, 404)
  }

  c.header('Cache-Control', 'no-store')
  return c.json({ routes: [refined] })
})

// ── POST /replace-stop ──
// Synchronous: Amap around-search replaces one stop, well within 30s
planRoutes.post('/replace-stop', async (c) => {
  const body = await c.req.json()
  const { route, stopIndex, preferences, distance, adcode } = body

  if (!route || !route.stops?.length || typeof stopIndex !== 'number' || !route.stops[stopIndex]) {
    return c.json({
      error: { code: 'INVALID_PARAMS', message: '请提供有效的路线和要替换的地点' },
    }, 400)
  }

  const replaced = await replaceStop({
    route,
    stopIndex,
    preferences: Array.isArray(preferences) && preferences.length ? preferences : ['food'],
    distance: typeof distance === 'number' ? distance : 0,
    adcode,
  })

  if (!replaced) {
    return c.json({
      error: { code: 'NO_REPLACEMENT', message: '附近没有更多同类地点了' },
    }, 404)
  }

  c.header('Cache-Control', 'no-store')
  return c.json({ route: replaced })
})

export default planRoutes
