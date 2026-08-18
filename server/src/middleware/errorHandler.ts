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
    ? translateZodMessage(first.message)
    : '请求参数不合法'
  return { error: { code: 'INVALID_PARAMS', message: msg } }
}

/** Map Zod's default English messages to user-friendly Chinese. Schemas that
 *  already provide custom Chinese messages pass through untouched. */
const ZOD_MESSAGE_MAP: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Required$/, () => '缺少必填参数'],
  [/^Invalid input$/, () => '参数格式不正确'],
  [/^Invalid enum value/, () => '参数取值不合法'],
  [/^Expected .+, received .+$/, () => '参数格式不正确'],
  [/^Array must contain at least (\d+) element\(s\)$/, m => `至少需要 ${m[1]} 项`],
  [/^Array must contain at most (\d+) element\(s\)$/, m => `最多 ${m[1]} 项`],
  [/^String must contain at least (\d+) character\(s\)$/, m => `内容长度不能少于 ${m[1]} 个字符`],
  [/^String must contain at most (\d+) character\(s\)$/, m => `内容长度不能超过 ${m[1]} 个字符`],
  [/^Number must be greater than or equal to (-?\d+(?:\.\d+)?)$/, m => `数值不能小于 ${m[1]}`],
  [/^Number must be less than or equal to (-?\d+(?:\.\d+)?)$/, m => `数值不能大于 ${m[1]}`],
  [/^Number must be greater than (-?\d+(?:\.\d+)?)$/, m => `数值必须大于 ${m[1]}`],
  [/^Number must be less than (-?\d+(?:\.\d+)?)$/, m => `数值必须小于 ${m[1]}`],
  [/^Invalid (date|email|url|uuid)$/, () => '参数格式不正确'],
]

function translateZodMessage(message: string): string {
  for (const [pattern, render] of ZOD_MESSAGE_MAP) {
    const match = message.match(pattern)
    if (match) return render(match)
  }
  return message
}

/** Convenience: parse and either return the parsed value, or send a 400 response. */
export function badRequest(c: Context, err: ZodError) {
  return c.json(zodErrorToBody(err), 400)
}
