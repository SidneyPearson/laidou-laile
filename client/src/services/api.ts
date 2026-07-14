import axios from 'axios'
import type { GenerateRoutesRequest, GenerateRoutesResponse, RefineRouteRequest, RefineRouteResponse, ReplaceStopRequest, ReplaceStopResponse } from '../types/api'

// Same-origin in production (Pages domain), Vite proxy handles /api in dev.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL,
  timeout: 30000, // 30s — within Pages wall-time limit
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => {
    // Guard against HTML responses (SPA fallback returning index.html)
    const contentType = String(res.headers['content-type'] || '')
    if (typeof res.data === 'string' && (contentType.includes('text/html') || res.data.trim().startsWith('<'))) {
      return Promise.reject(new ApiRequestError('INVALID_RESPONSE', '服务器返回异常，可能正在启动中'))
    }
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
      return Promise.reject(new ApiRequestError('TIMEOUT', '请求超时，请重试'))
    }
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      return Promise.reject(new ApiRequestError('NETWORK_ERROR', '网络连接失败，请稍后重试'))
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

/** Generate routes — synchronous POST, result returned directly. */
export async function generateRoutes(
  req: GenerateRoutesRequest,
  signal?: AbortSignal,
): Promise<GenerateRoutesResponse> {
  const { data } = await api.post<GenerateRoutesResponse>('/plan/generate', req, { signal })
  return data
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
