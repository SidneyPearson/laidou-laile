import type { Context } from 'hono'

export async function parseJsonBody(c: Context, maxBytes = 64 * 1024): Promise<unknown | Response> {
  const length = Number(c.req.header('content-length'))
  if (Number.isFinite(length) && length > maxBytes) {
    return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' } }, 413)
  }
  try {
    const text = await c.req.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' } }, 413)
    }
    return JSON.parse(text) as unknown
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: '请求格式错误' } }, 400)
  }
}
