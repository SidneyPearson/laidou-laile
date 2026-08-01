import { Hono } from 'hono'
import { ZodError } from 'zod'
import type { Env } from '../config/env.js'
import { generateRoutes } from '../services/routeGenerator.js'
import { refinePlan, replaceStop } from '../services/aiPlannerService.js'
import { badRequest } from '../middleware/errorHandler.js'
import {
  generateRequestSchema,
  refineRequestSchema,
  replaceStopRequestSchema,
  suggestOrderRequestSchema,
} from './planRoutes.schemas.js'
import { suggestOrder, SuggestOrderError } from '../services/planner/suggestOrder.js'
import { formatShortageReason } from '../services/planner/qualityDiagnostics.js'
import { enforceEvidencePolicy } from '../services/planner/evidencePolicy.js'

const planRoutes = new Hono<{ Bindings: Env }>()

/** Reject request bodies larger than 64 KiB. The largest legitimate payload
 *  is a full Route + stops (~10 KB); anything much bigger is either a bug
 *  or an abuse attempt. Check runs before json() to avoid parsing garbage. */
const MAX_BODY_BYTES = 64 * 1024
const DEDUPE_TTL_MS = 5_000

interface DedupeEntry {
  expiresAt: number
  promise: Promise<unknown>
}

// Soft, best-effort dedupe only: this Map is local to one Cloudflare isolate.
// It is NOT a distributed rate limiter and must never be described as one.
// A successful result is reused for 5 seconds; failures are evicted immediately
// so transient provider errors can be retried.
const requestDedupe = new Map<string, DedupeEntry>()

/** Test helper: isolate test cases from the 5-second module-level cache. */
export function clearRequestDedupe(): void {
  requestDedupe.clear()
}

async function dedupeKey(path: string, body: unknown): Promise<string> {
  return `${path}::${JSON.stringify(body)}`
}

function withRequestDedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const existing = requestDedupe.get(key)
  if (existing && existing.expiresAt > now) {
    return existing.promise as Promise<T>
  }
  if (existing) requestDedupe.delete(key)

  const promise = run()
  requestDedupe.set(key, { expiresAt: now + DEDUPE_TTL_MS, promise })

  // Do not cache failures — only identical successful requests get the 5s reuse.
  void promise.catch(() => {
    if (requestDedupe.get(key)?.promise === promise) requestDedupe.delete(key)
  })
  setTimeout(() => {
    if (requestDedupe.get(key)?.promise === promise) requestDedupe.delete(key)
  }, DEDUPE_TTL_MS)

  return promise
}

async function parseJsonBody(c: import('hono').Context): Promise<unknown | Response> {
  const lenHeader = c.req.header('content-length')
  if (lenHeader) {
    const len = Number(lenHeader)
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return c.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' } },
        413,
      )
    }
  }
  try {
    const text = await c.req.text()
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return c.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' } },
        413,
      )
    }
    return JSON.parse(text) as unknown
  } catch {
    return c.json(
      { error: { code: 'INVALID_JSON', message: '请求格式错误' } },
      400,
    )
  }
}

// ── POST /suggest-order ──
// Only reorders the exact curated place references supplied by the user.
// Never searches for, generates, adds, or replaces a place.
planRoutes.post('/suggest-order', async (c) => {
  const raw = await parseJsonBody(c)
  if (raw instanceof Response) return raw

  let input
  try {
    input = suggestOrderRequestSchema.parse(raw)
  } catch (err) {
    if (err instanceof ZodError) return badRequest(c, err)
    throw err
  }

  try {
    const key = await dedupeKey('/suggest-order', input)
    const result = await withRequestDedupe(key, () => suggestOrder(input))
    c.header('Cache-Control', 'no-store')
    return c.json(result)
  } catch (err) {
    if (err instanceof SuggestOrderError) {
      return c.json({
        error: { code: err.code, message: err.message },
      }, 422)
    }
    console.error('suggestOrder failed:', err instanceof Error ? err.message : String(err))
    return c.json({
      error: { code: 'SUGGEST_ORDER_FAILED', message: '暂时无法给出参考顺序，请保留原顺序' },
    }, 500)
  }
})

// ── POST /generate ──
// Synchronous: LLM + Amap typically completes within 10-20s, well within
// the 30s wall-time limit. No more KV/polling complexity.
planRoutes.post('/generate', async (c) => {
  const raw = await parseJsonBody(c)
  if (raw instanceof Response) return raw

  let input
  try {
    input = generateRequestSchema.parse(raw)
  } catch (err) {
    if (err instanceof ZodError) return badRequest(c, err)
    throw err
  }

  try {
    const key = await dedupeKey('/generate', input)
    const result = await withRequestDedupe(key, () => generateRoutes({
      lat: input.lat,
      lng: input.lng,
      areaName: input.areaName,
      timeOption: input.timeOption,
      distance: input.distance,
      preferences: input.preferences,
      cuisineTypes: input.cuisineTypes,
      scenicTypes: input.scenicTypes,
      wanderTypes: input.wanderTypes,
      customCuisine: input.customCuisine,
      customScenic: input.customScenic,
      customWander: input.customWander,
    }))

    if (result.routes.length === 0) {
      if (result.diagnostics) {
        console.info('route candidate shortage', result.diagnostics)
      }
      return c.json({
        error: {
          code: 'NO_POIS_FOUND',
          message: result.diagnostics
            ? formatShortageReason(result.diagnostics)
            : '附近暂未找到合适的地点',
        },
      }, 404)
    }

    c.header('Cache-Control', 'no-store')
    return c.json({
      routes: result.routes.map(enforceEvidencePolicy),
      generatedAt: new Date().toISOString(),
      weatherNote: result.weatherNote,
      weather: result.weather,
      locationName: result.locationName,
      source: result.source,
      fallbackReason: result.fallbackReason,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('generateRoutes failed:', msg)
    return c.json({
      error: { code: 'INTERNAL_ERROR', message: '路线生成失败，请重试' },
    }, 500)
  }
})

// ── POST /refine ──
planRoutes.post('/refine', async (c) => {
  const raw = await parseJsonBody(c)
  if (raw instanceof Response) return raw

  let input
  try {
    input = refineRequestSchema.parse(raw)
  } catch (err) {
    if (err instanceof ZodError) return badRequest(c, err)
    throw err
  }

  const key = await dedupeKey('/refine', input)
  const refined = await withRequestDedupe(key, () => refinePlan({
    route: input.route,
    removeStopIndices: input.removeStopIndices,
    extraRequirements: input.extraRequirements,
    position: input.origin ?? (input.route.stops[0]
      ? { lat: input.route.stops[0].lat, lng: input.route.stops[0].lng }
      : { lat: 0, lng: 0 }),
    city: input.city,
    weather: input.weather,
    timeMinutes: input.timeMinutes,
    distance: input.distance,
    preferences: input.preferences,
    customCuisine: input.customCuisine,
    customScenic: input.customScenic,
    customWander: input.customWander,
  }))

  if (!refined) {
    return c.json({
      error: { code: 'REFINE_FAILED', message: '路线优化失败，请重试' },
    }, 404)
  }

  c.header('Cache-Control', 'no-store')
  return c.json({ routes: [enforceEvidencePolicy(refined)] })
})

// ── POST /replace-stop ──
planRoutes.post('/replace-stop', async (c) => {
  const raw = await parseJsonBody(c)
  if (raw instanceof Response) return raw

  let input
  try {
    input = replaceStopRequestSchema.parse(raw)
  } catch (err) {
    if (err instanceof ZodError) return badRequest(c, err)
    throw err
  }

  const key = await dedupeKey('/replace-stop', input)
  const replaced = await withRequestDedupe(key, () => replaceStop({
    route: input.route,
    stopIndex: input.stopIndex,
    preferences: input.preferences,
    distance: input.distance,
    adcode: input.adcode,
    timeMinutes: input.timeMinutes,
    origin: input.origin,
    customCuisine: input.customCuisine,
    customScenic: input.customScenic,
    customWander: input.customWander,
  }))

  if (!replaced) {
    return c.json({
      error: { code: 'NO_REPLACEMENT', message: '附近没有更多同类地点了' },
    }, 404)
  }

  c.header('Cache-Control', 'no-store')
  return c.json({ route: enforceEvidencePolicy(replaced) })
})

export default planRoutes
