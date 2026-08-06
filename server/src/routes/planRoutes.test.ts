import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const serviceMocks = vi.hoisted(() => ({
  suggestOrder: vi.fn(),
}))

vi.mock('../services/explore/suggestOrder.js', () => ({
  suggestOrder: serviceMocks.suggestOrder,
  SuggestOrderError: class SuggestOrderError extends Error {
    constructor(public code: string, message: string) {
      super(message)
      this.name = 'SuggestOrderError'
    }
  },
}))

import planRoutes from './planRoutes.js'
import { SuggestOrderError } from '../services/explore/suggestOrder.js'

const app = new Hono()
app.route('/api/plan', planRoutes)

const env = { DB: {} as D1Database }

const validBody = {
  city: '上海',
  places: [
    { hotspotId: 'sh-bund', amapPoiId: 'B000A' },
    { hotspotId: 'sh-yu-garden', amapPoiId: 'B000B' },
  ],
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }, env)
}

beforeEach(() => {
  vi.clearAllMocks()
  serviceMocks.suggestOrder.mockResolvedValue({
    order: validBody.places.slice().reverse(),
    reason: '按相邻地点距离给出较少折返的参考顺序。',
    reminders: ['营业、预约和交通情况可能变化，请以当天信息为准。'],
    source: 'deterministic_distance',
  })
})

describe('POST /api/plan/suggest-order', () => {
  it('returns the suggested order on success', async () => {
    const res = await post('/api/plan/suggest-order', validBody)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = await res.json() as Record<string, unknown>
    expect(json).toMatchObject({ source: 'deterministic_distance' })
    expect(serviceMocks.suggestOrder).toHaveBeenCalledTimes(1)
  })

  it('returns 400 for a body with too few places', async () => {
    const res = await post('/api/plan/suggest-order', {
      city: '上海',
      places: [validBody.places[0]],
    })
    expect(res.status).toBe(400)
    expect(serviceMocks.suggestOrder).not.toHaveBeenCalled()
  })

  it('returns 400 for duplicate places', async () => {
    const res = await post('/api/plan/suggest-order', {
      city: '上海',
      places: [validBody.places[0], validBody.places[0]],
    })
    expect(res.status).toBe(400)
    expect(serviceMocks.suggestOrder).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await post('/api/plan/suggest-order', '{bad json')
    expect(res.status).toBe(400)
    const json = await res.json() as { error: { code: string } }
    expect(json.error.code).toBe('INVALID_JSON')
  })

  it('returns 413 for bodies over 64 KiB', async () => {
    const res = await post('/api/plan/suggest-order', validBody, {
      'content-length': String(65 * 1024),
    })
    expect(res.status).toBe(413)
    expect(serviceMocks.suggestOrder).not.toHaveBeenCalled()
  })

  it('maps SuggestOrderError to 422', async () => {
    serviceMocks.suggestOrder.mockRejectedValueOnce(
      new SuggestOrderError(
        'POI_MISMATCH',
        '有地点信息已经更新，请返回城市灵感页重新加入',
      ),
    )
    const res = await post('/api/plan/suggest-order', validBody)
    expect(res.status).toBe(422)
    const json = await res.json() as { error: { code: string; message: string } }
    expect(json.error.code).toBe('POI_MISMATCH')
  })

  it('returns a generic 500 without leaking unexpected errors', async () => {
    serviceMocks.suggestOrder.mockRejectedValueOnce(new Error('secret details'))
    const res = await post('/api/plan/suggest-order', validBody)
    expect(res.status).toBe(500)
    const json = await res.json() as { error: { code: string; message: string } }
    expect(json.error.code).toBe('SUGGEST_ORDER_FAILED')
    expect(json.error.message).not.toContain('secret details')
  })
})
