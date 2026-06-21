import axios from 'axios'
import { env } from '../../config/env.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionParams {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

/** OpenAI-compatible chat completion (works with DeepSeek) */
export async function chatCompletion(
  params: ChatCompletionParams,
  model?: string,
): Promise<string> {
  const url = `${env.LLM_BASE_URL}/chat/completions`
  const usedModel = model || env.LLM_MODEL

  const body: Record<string, unknown> = {
    model: usedModel,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 8192,
    response_format: { type: 'json_object' },
  }

  const { data } = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    timeout: env.LLM_TIMEOUT_MS,
  })

  const choice = data?.choices?.[0]
  const content = choice?.message?.content
  const finishReason = choice?.finish_reason

  if (!content) {
    throw new Error('LLM returned empty response')
  }

  // Detect truncation — LLM stopped because it hit max_tokens
  if (finishReason === 'length') {
    console.warn('⚠️ LLM response truncated (finish_reason=length), output may be incomplete')
  }

  return content
}

/** Try LLM with primary model, fallback to pro on failure */
export async function chatCompletionWithFallback(
  params: ChatCompletionParams,
): Promise<string> {
  try {
    return await chatCompletion(params, env.LLM_MODEL)
  } catch (err: any) {
    const isRetryable =
      err.code === 'ECONNABORTED' ||
      err.response?.status >= 500 ||
      err.response?.status === 429

    if (isRetryable && env.LLM_FALLBACK_MODEL !== env.LLM_MODEL) {
      console.log(`LLM primary model failed, falling back to ${env.LLM_FALLBACK_MODEL}`)
      return await chatCompletion(params, env.LLM_FALLBACK_MODEL)
    }
    throw err
  }
}
