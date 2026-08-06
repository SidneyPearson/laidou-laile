import { Hono } from 'hono'
import { ZodError } from 'zod'
import type { Bindings } from '../config/env.js'
import { badRequest } from '../middleware/errorHandler.js'
import { suggestOrderRequestSchema } from './planRoutes.schemas.js'
import { suggestOrder, SuggestOrderError } from '../services/explore/suggestOrder.js'
import { D1CurationRepository } from '../repositories/d1CurationRepository.js'

const planRoutes = new Hono<{ Bindings: Bindings }>()

/** Reject request bodies larger than 64 KiB. */
const MAX_BODY_BYTES = 64 * 1024

async function parseJsonBody(c: import('hono').Context): Promise<unknown | Response> {
  const lenHeader = c.req.header('content-length')
  if (lenHeader) {
    const len = Number(lenHeader)
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' } }, 413)
    }
  }
  try {
    const text = await c.req.text()
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' } }, 413)
    }
    return JSON.parse(text) as unknown
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: '请求格式错误' } }, 400)
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
    const repository = new D1CurationRepository(c.env.DB)
    const result = await suggestOrder(input, { repository })
    c.header('Cache-Control', 'no-store')
    return c.json(result)
  } catch (err) {
    if (err instanceof SuggestOrderError) {
      return c.json({ error: { code: err.code, message: err.message } }, 422)
    }
    console.error('suggestOrder failed:', err instanceof Error ? err.message : String(err))
    return c.json({
      error: { code: 'SUGGEST_ORDER_FAILED', message: '暂时无法给出参考顺序，请保留原顺序' },
    }, 500)
  }
})

export default planRoutes
