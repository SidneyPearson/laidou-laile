import axios from 'axios'
import type { GenerateRoutesRequest, GenerateRoutesResponse } from '../types/api'

// In dev, Vite proxy handles /api → localhost:3000.
// In production, VITE_API_BASE_URL points to the deployed backend.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL,
  timeout: 120000, // 2min — LLM推理+重试需要时间
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.data?.error) {
      const { code, message } = error.response.data.error
      return Promise.reject(new ApiRequestError(code, message))
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new ApiRequestError('LLM_TIMEOUT', '请求超时，请稍后重试'))
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

export async function generateRoutes(
  req: GenerateRoutesRequest,
): Promise<GenerateRoutesResponse> {
  const { data } = await api.post<GenerateRoutesResponse>('/plan/generate', req)
  return data
}
