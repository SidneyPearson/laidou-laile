import { ref } from 'vue'
import { generateRoutes, ApiRequestError } from '../services/api'
import type { GenerateRoutesRequest, GenerateRoutesResponse } from '../types/api'
import type { Route } from '../types/route'
import { useHistory } from './useHistory'

export type RouteRequestOutcome = 'success' | 'cancelled' | 'error'

// ── Singleton state — shared across all components ──────
const routes = ref<Route[]>([])
const locationName = ref('')
const weatherNote = ref<string | null>(null)
const weather = ref<{ weather: string; temperature: string; isRainy: boolean } | null>(null)
const loading = ref(false)
const loadingStage = ref(0)
const error = ref<ApiRequestError | null>(null)
const lastResponse = ref<GenerateRoutesResponse | null>(null)
const lastRequest = ref<GenerateRoutesRequest | null>(null)
const historySaved = ref(false)

let stageTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryResolve: ((continueRetry: boolean) => void) | null = null
let abortController: AbortController | null = null
let activeRequestId = 0

function isRetryableError(value: unknown): boolean {
  return value instanceof ApiRequestError && value.code === 'NETWORK_ERROR'
}

function isCancelledError(value: unknown): boolean {
  return (value instanceof ApiRequestError && value.code === 'CANCELLED')
    || (value instanceof DOMException && value.name === 'AbortError')
}

function isValidResponse(data: unknown): data is GenerateRoutesResponse {
  if (!data || typeof data !== 'object') return false
  const candidate = data as Partial<GenerateRoutesResponse>
  return Array.isArray(candidate.routes) && typeof candidate.locationName === 'string'
}

function clearStageTimer() {
  if (stageTimer) clearTimeout(stageTimer)
  stageTimer = null
}

function cancelRetryDelay() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryResolve?.(false)
  retryResolve = null
}

function waitForRetry(requestId: number): Promise<boolean> {
  cancelRetryDelay()
  return new Promise(resolve => {
    retryResolve = resolve
    retryTimer = setTimeout(() => {
      retryTimer = null
      retryResolve = null
      resolve(requestId === activeRequestId)
    }, 1500)
  })
}

function runStages(requestId: number) {
  clearStageTimer()
  stageTimer = setTimeout(() => {
    if (loading.value && requestId === activeRequestId) loadingStage.value = 1
    stageTimer = setTimeout(() => {
      if (loading.value && requestId === activeRequestId) loadingStage.value = 2
    }, 15000)
  }, 3000)
}

export function useRouteRequest() {
  async function runAttempt(
    req: GenerateRoutesRequest,
    requestId: number,
    retryCount: number,
  ): Promise<RouteRequestOutcome> {
    if (requestId !== activeRequestId) return 'cancelled'

    const controller = new AbortController()
    abortController = controller
    try {
      const data = await generateRoutes(req, controller.signal)
      if (requestId !== activeRequestId) return 'cancelled'
      if (!isValidResponse(data)) {
        throw new ApiRequestError('INVALID_RESPONSE', '服务器返回格式异常，请重试')
      }

      routes.value = data.routes
      locationName.value = data.locationName
      weatherNote.value = data.weatherNote ?? null
      weather.value = data.weather ?? null
      lastResponse.value = data
      historySaved.value = !!useHistory().addEntry({
        locationName: data.locationName,
        request: {
          timeOption: req.timeOption,
          distance: req.distance,
          preferences: [...req.preferences],
          cuisineTypes: req.cuisineTypes ? [...req.cuisineTypes] : undefined,
          scenicTypes: req.scenicTypes ? [...req.scenicTypes] : undefined,
          wanderTypes: req.wanderTypes ? [...req.wanderTypes] : undefined,
        },
        routes: data.routes,
        weather: data.weather,
        anchorName: data.anchorName,
      })
      return 'success'
    } catch (caught: unknown) {
      if (requestId !== activeRequestId || isCancelledError(caught)) return 'cancelled'

      if (retryCount < 1 && isRetryableError(caught)) {
        const shouldRetry = await waitForRetry(requestId)
        if (!shouldRetry) return 'cancelled'
        return runAttempt(req, requestId, retryCount + 1)
      }

      error.value = caught instanceof ApiRequestError
        ? caught
        : new ApiRequestError('UNKNOWN', '未知错误，请稍后重试')
      return 'error'
    }
  }

  async function fetchRoutes(req: GenerateRoutesRequest): Promise<RouteRequestOutcome> {
    const previous = abortController
    const requestId = ++activeRequestId
    previous?.abort()
    cancelRetryDelay()

    loading.value = true
    loadingStage.value = 0
    error.value = null
    routes.value = []
    lastRequest.value = req
    historySaved.value = false
    runStages(requestId)

    const outcome = await runAttempt(req, requestId, 0)
    if (requestId === activeRequestId) {
      clearStageTimer()
      cancelRetryDelay()
      abortController = null
      loading.value = false
      loadingStage.value = 0
      if (outcome === 'cancelled') error.value = null
    }
    return outcome
  }

  function cancelRequest() {
    activeRequestId++
    abortController?.abort()
    abortController = null
    cancelRetryDelay()
    clearStageTimer()
    loading.value = false
    loadingStage.value = 0
    error.value = null
    historySaved.value = false
  }

  async function retry(): Promise<RouteRequestOutcome> {
    return lastRequest.value ? fetchRoutes(lastRequest.value) : 'error'
  }

  return {
    routes, locationName, weatherNote, weather,
    loading, loadingStage, error,
    lastRequest, lastResponse,
    historySaved,
    fetchRoutes, retry, cancelRequest,
  }
}
