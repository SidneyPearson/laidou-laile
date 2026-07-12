import axios from 'axios'
import type { GenerateRoutesRequest, GenerateRoutesResponse, RefineRouteRequest, RefineRouteResponse, ReplaceStopRequest, ReplaceStopResponse, JobPollResponse } from '../types/api'

// In dev, Vite proxy handles /api → localhost:3000.
// In production, VITE_API_BASE_URL points to the deployed backend.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL,
  timeout: 90000, // 90s — enough for LLM but not too long
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => {
    // Guard against HTML responses (SPA fallback returning index.html)
    const contentType = String(res.headers['content-type'] || '')
    if (typeof res.data === 'string' && (contentType.includes('text/html') || res.data.trim().startsWith('<'))) {
      return Promise.reject(new ApiRequestError('INVALID_RESPONSE', '服务器返回异常，可能正在启动中'))
    }
    // Guard against non-object responses
    if (!res.data || typeof res.data !== 'object') {
      return Promise.reject(new ApiRequestError('INVALID_RESPONSE', '服务器返回格式异常'))
    }
    return res
  },
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(new ApiRequestError('CANCELLED', '请求已取消'))
    }
    if (error.response?.data?.error) {
      const { code, message } = error.response.data.error
      return Promise.reject(new ApiRequestError(code, message))
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new ApiRequestError('LLM_TIMEOUT', '请求超时，服务器可能正忙'))
    }
    // Network error — could be cold start
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      return Promise.reject(new ApiRequestError('NETWORK_ERROR', '网络连接失败，服务器可能在启动中，请稍后重试'))
    }
    return Promise.reject(new ApiRequestError('NETWORK_ERROR', '网络连接失败'))
  },
)

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

// ── Polling helpers ──
const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 50 // ~100s total

async function pollJobOnce(jobId: string, signal?: AbortSignal): Promise<JobPollResponse> {
  const { data } = await api.get<JobPollResponse>(`/plan/job/${jobId}`, { signal })
  return data
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new ApiRequestError('CANCELLED', '请求已取消'))
    }, { once: true })
  })
}

/** Generate routes with polling.
 *  POST /plan/generate → { jobId }
 *  Poll GET /plan/job/:id until status === 'done' or 'error'
 */
export async function generateRoutes(
  req: GenerateRoutesRequest,
  signal?: AbortSignal,
): Promise<GenerateRoutesResponse> {
  // Step 1: POST to initiate async processing
  const { data: initData } = await api.post<{ jobId: string }>('/plan/generate', req, { signal })
  const { jobId } = initData

  // Step 2: Poll until done, error, or timeout
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    if (signal?.aborted) {
      throw new ApiRequestError('CANCELLED', '请求已取消')
    }

    await delay(POLL_INTERVAL_MS, signal)

    const jobResult = await pollJobOnce(jobId, signal)

    if (jobResult.status === 'done' && jobResult.result) {
      return jobResult.result
    }

    if (jobResult.status === 'error') {
      throw new ApiRequestError(
        jobResult.error?.code || 'JOB_ERROR',
        jobResult.error?.message || '任务处理失败',
      )
    }

    // status === 'processing' → continue polling
  }

  throw new ApiRequestError('POLL_TIMEOUT', '路线生成超时，请重试')
}

export async function refineRoute(
  req: RefineRouteRequest,
  signal?: AbortSignal,
): Promise<RefineRouteResponse> {
  const { data } = await api.post<RefineRouteResponse>('/plan/refine', req, { signal })
  return data
}

export async function replaceStop(
  req: ReplaceStopRequest,
  signal?: AbortSignal,
): Promise<ReplaceStopResponse> {
  const { data } = await api.post<ReplaceStopResponse>('/plan/replace-stop', req, { signal })
  return data
}
