import type { Env } from '../../config/env.js'

// ── Module-level env (set once via initAmapClient) ──
let _env: Env | null = null

export function initAmapClient(env: Env): void {
  _env = env
  _client = null
}

// ── Fetch-based Amap client ──

interface AmapClientInstance {
  get<T>(path: string, config: { params: Record<string, string | number | undefined> }): Promise<{ data: T }>
}

class FetchAmapClient implements AmapClientInstance {
  private baseURL = 'https://restapi.amap.com/v3'
  private apiKey: string
  private timeoutMs: number

  constructor(env: Env) {
    this.apiKey = env.AMAP_WEB_API_KEY
    this.timeoutMs = env.AMAP_TIMEOUT_MS
  }

  async get<T>(path: string, config: { params: Record<string, string | number | undefined> }): Promise<{ data: T }> {
    // Build query string manually (not via URLSearchParams) to avoid encoding
    // commas and pipes which Amap requires as-is.
    const qs = Object.entries({ key: this.apiKey, ...config.params })
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('&')
    const fullUrl = `${this.baseURL}${path}?${qs}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(fullUrl, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        throw new Error(`Amap network error: HTTP ${res.status}`)
      }

      const data = await res.json() as { status?: string; info?: string }
      if (data.status === '0') {
        throw new Error(`Amap API error: ${data.info || 'unknown'}`)
      }

      return { data: data as T }
    } catch (err: any) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        throw new Error(`Amap network error: request timeout after ${this.timeoutMs}ms`)
      }
      throw err
    }
  }
}

// ── Singleton ──
let _client: FetchAmapClient | null = null

export function getAmapClient(): AmapClientInstance {
  if (!_env) throw new Error('Amap client not initialized. Call initAmapClient(env) first.')
  if (!_client) {
    _client = new FetchAmapClient(_env)
  }
  return _client
}
