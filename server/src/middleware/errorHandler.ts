import type { Context } from 'hono'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/** Turn a ZodError into the app-standard `{ error: { code, message } }` shape.
 *  Uses the FIRST issue's Chinese message when provided; never leaks the raw
 *  Zod path/stack to callers. */
export function zodErrorToBody(err: ZodError): { error: { code: string; message: string } } {
  const first = err.issues[0]
  const msg = first?.message && first.message.length <= 100
    ? first.message
    : '请求参数不合法'
  return { error: { code: 'INVALID_PARAMS', message: msg } }
}

/** Convenience: parse and either return the parsed value, or send a 400 response. */
export function badRequest(c: Context, err: ZodError) {
  return c.json(zodErrorToBody(err), 400)
}
