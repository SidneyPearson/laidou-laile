import axios, { type AxiosInstance } from 'axios'
import { env } from '../../config/env.js'

// Create Amap API client with auto key injection
export function createAmapClient(): AxiosInstance {
  const client = axios.create({
    baseURL: 'https://restapi.amap.com/v3',
    timeout: env.AMAP_TIMEOUT_MS,
  })

  // Inject key into every request
  client.interceptors.request.use((config) => {
    config.params = {
      ...config.params,
      key: env.AMAP_WEB_API_KEY,
    }
    return config
  })

  // Response interceptor: normalize errors
  client.interceptors.response.use(
    (res) => {
      if (res.data?.status === '0') {
        throw new Error(`Amap API error: ${res.data?.info || 'unknown'}`)
      }
      return res
    },
    (error) => {
      if (axios.isAxiosError(error)) {
        throw new Error(`Amap network error: ${error.message}`)
      }
      throw error
    },
  )

  return client
}

// Singleton
let _client: AxiosInstance | null = null

export function getAmapClient(): AxiosInstance {
  if (!_client) {
    _client = createAmapClient()
  }
  return _client
}
