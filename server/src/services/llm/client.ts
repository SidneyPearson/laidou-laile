import type { Env } from '../../config/env.js'

// ── Module-level env (set once via initLlmClient) ──
let _env: Env | null = null

export function initLlmClient(env: Env): void {
  _env = env
}

// ── Types (unchanged) ──

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionParams {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

// ── Chat completion (fetch-based) ──

export async function chatCompletion(
  params: ChatCompletionParams,
  model?: string,
): Promise<string> {
  if (!_env) throw new Error('LLM client not initialized. Call initLlmClient(env) first.')

  const url = `${_env.LLM_BASE_URL}/chat/completions`
  const usedModel = model || _env.LLM_MODEL

  const body = JSON.stringify({
    model: usedModel,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 8192,
    response_format: { type: 'json_object' },
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), _env.LLM_TIMEOUT_MS)

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
    clearTimeout(timer)

    if (!res.ok) {
      // Synthesize axios-compatible error shape for fallback detection
      const err: any = new Error(`LLM HTTP ${res.status}`)
      err.response = { status: res.status }
      throw err
    }

    const data = await res.json() as any
    const choice = data?.choices?.[0]
    const content = choice?.message?.content
    const finishReason = choice?.finish_reason

    if (!content) {
      throw new Error('LLM returned empty response')
    }

    if (finishReason === 'length') {
      console.warn('⚠️ LLM response truncated (finish_reason=length), output may be incomplete')
    }

    return content
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      // Synthesize axios-compatible error shape for fallback detection
      const timeoutErr: any = new Error('LLM request timeout')
      timeoutErr.code = 'ECONNABORTED'
      throw timeoutErr
    }
    throw err
  }
}

// ── Fallback (unchanged logic) ──

export async function chatCompletionWithFallback(
  params: ChatCompletionParams,
): Promise<string> {
  if (!_env) throw new Error('LLM client not initialized. Call initLlmClient(env) first.')

  try {
    return await chatCompletion(params, _env.LLM_MODEL)
  } catch (err: any) {
    const isRetryable =
      err.code === 'ECONNABORTED' ||
      err.response?.status >= 500 ||
      err.response?.status === 429

    if (isRetryable && _env.LLM_FALLBACK_MODEL !== _env.LLM_MODEL) {
      console.log(`LLM primary model failed, falling back to ${_env.LLM_FALLBACK_MODEL}`)
      return await chatCompletion(params, _env.LLM_FALLBACK_MODEL)
    }
    throw err
  }
}
