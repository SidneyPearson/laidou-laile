import type { Env } from '../../config/env.js'

// ── Module-level env (set once via initLlmClient) ──
let _env: Env | null = null

export function initLlmClient(env: Env): void {
  _env = env
}

// ── Types ─────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionParams {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string }
    finish_reason?: string
  }>
}

class LlmRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'LlmRequestError'
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === 'AbortError'
    : err instanceof Error && err.name === 'AbortError'
}

function isChatCompletionResponse(value: unknown): value is ChatCompletionResponse {
  if (typeof value !== 'object' || value === null) return false
  const choices = (value as Record<string, unknown>).choices
  if (choices === undefined) return true
  return Array.isArray(choices)
}

// ── Chat completion (fetch-based) ──

export async function chatCompletion(
  params: ChatCompletionParams,
  model?: string,
  timeoutMs?: number,
): Promise<string> {
  if (!_env) throw new Error('LLM client not initialized. Call initLlmClient(env) first.')

  const url = `${_env.LLM_BASE_URL}/chat/completions`
  const usedModel = model || _env.LLM_MODEL
  const effectiveTimeout = timeoutMs ?? _env.LLM_TIMEOUT_MS

  const body = JSON.stringify({
    model: usedModel,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 8192,
    response_format: { type: 'json_object' },
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), effectiveTimeout)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${_env.LLM_API_KEY}`,
      },
      body,
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new LlmRequestError(`LLM HTTP ${res.status}`, res.status)
    }

    const data: unknown = await res.json()
    if (!isChatCompletionResponse(data)) {
      throw new Error('LLM returned malformed response')
    }

    const choice = data.choices?.[0]
    const content = choice?.message?.content
    const finishReason = choice?.finish_reason

    if (!content) {
      throw new Error('LLM returned empty response')
    }

    if (finishReason === 'length') {
      console.warn('⚠️ LLM response truncated (finish_reason=length), output may be incomplete')
    }

    return content
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw new LlmRequestError('LLM request timeout', undefined, 'ECONNABORTED')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Chat completion — single attempt, no retry. Caller handles timeoutMs. */
export async function chatCompletionWithFallback(
  params: ChatCompletionParams,
  timeoutMs?: number,
): Promise<string> {
  if (!_env) throw new Error('LLM client not initialized. Call initLlmClient(env) first.')
  return chatCompletion(params, _env.LLM_MODEL, timeoutMs)
}
