import { ref } from 'vue'
import { generateRoutes, ApiRequestError } from '../services/api'
import type { GenerateRoutesRequest, GenerateRoutesResponse } from '../types/api'
import type { Route } from '../types/route'

// ── Singleton state — shared across all components ──────
const routes = ref<Route[]>([])
const locationName = ref('')
const weatherNote = ref<string | null>(null)
const weather = ref<{ weather: string; temperature: string; isRainy: boolean } | null>(null)
const loading = ref(false)
const loadingStage = ref(0)
const error = ref<ApiRequestError | null>(null)
const lastResponse = ref<GenerateRoutesResponse | null>(null)
let lastRequest: GenerateRoutesRequest | null = null
let stageTimer: ReturnType<typeof setTimeout> | null = null
let abortController: AbortController | null = null

// ── Helpers ─────────────────────────────────────────────

function isRetryableError(e: unknown): boolean {
  if (e instanceof ApiRequestError) {
    return e.code === 'NETWORK_ERROR' || e.code === 'LLM_TIMEOUT'
  }
  return false
}

function isValidResponse(data: unknown): data is GenerateRoutesResponse {
  return (
    !!data &&
    typeof data === 'object' &&
    Array.isArray((data as any).routes) &&
    typeof (data as any).locationName === 'string'
  )
}

// ── Composable ──────────────────────────────────────────

export function useRouteRequest() {
  async function fetchRoutes(req: GenerateRoutesRequest, retryCount = 0): Promise<void> {
    // Clear stale state before starting
    loading.value = true
    loadingStage.value = 0
    error.value = null
    routes.value = []
    lastRequest = req

    // Abort any in-flight request
    if (abortController) {
      abortController.abort()
    }
    abortController = new AbortController()

    // Progress stages — staged delays: search quick, AI slow
    if (stageTimer) clearTimeout(stageTimer)
    const runStages = () => {
      // Stage 1: AI 规划 (from 3s ~ 18s)
      stageTimer = setTimeout(() => {
        if (loading.value) loadingStage.value = 1
        // Stage 2: 即将出炉 (after 18s)
        stageTimer = setTimeout(() => {
          if (loading.value) loadingStage.value = 2
        }, 15000)
      }, 3000)
    }
    runStages()

    try {
      const data = await generateRoutes(req, abortController.signal)

      // Validate response structure before trusting it
      if (!isValidResponse(data)) {
        console.error('Invalid API response shape:', typeof data, Object.keys(data ?? {}))
        throw new ApiRequestError('INVALID_RESPONSE', '服务器返回格式异常，请重试')
      }

      loadingStage.value = 2 // final stage
      routes.value = data.routes
      locationName.value = data.locationName
      weatherNote.value = data.weatherNote ?? null
      weather.value = data.weather || null
      lastResponse.value = data
    } catch (e: unknown) {
      // Auto-retry on network errors (once)
      if (retryCount < 1 && isRetryableError(e)) {
        console.log(`Retrying request (attempt ${retryCount + 1})...`)
        // Small delay before retry
        await new Promise((r) => setTimeout(r, 1500))
        return fetchRoutes(req, retryCount + 1)
      }

      if (e instanceof ApiRequestError) {
        error.value = e
      } else if (e instanceof DOMException && e.name === 'AbortError') {
        error.value = new ApiRequestError('CANCELLED', '请求已取消')
      } else {
        console.error('Unexpected fetch error:', e)
        error.value = new ApiRequestError('UNKNOWN', '未知错误，请稍后重试')
      }
    } finally {
      if (stageTimer) { clearTimeout(stageTimer); stageTimer = null }
      loading.value = false
      loadingStage.value = 0
      abortController = null
    }
  }

  function cancelRequest() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    loading.value = false
    loadingStage.value = 0
    if (stageTimer) { clearTimeout(stageTimer); stageTimer = null }
  }

  async function retry() {
    if (lastRequest) {
      await fetchRoutes(lastRequest)
    }
  }

  return {
    routes, locationName, weatherNote, weather,
    loading, loadingStage, error,
    lastRequest, lastResponse,
    fetchRoutes, retry, cancelRequest,
  }
}
