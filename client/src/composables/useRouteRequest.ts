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
let stageTimer: ReturnType<typeof setInterval> | null = null

export function useRouteRequest() {
  async function fetchRoutes(req: GenerateRoutesRequest) {
    loading.value = true
    loadingStage.value = 0
    error.value = null
    lastRequest = req

    // Progress stages on a timer
    if (stageTimer) clearInterval(stageTimer)
    stageTimer = setInterval(() => {
      if (loadingStage.value < 2) loadingStage.value++
    }, 2500)

    try {
      const data: GenerateRoutesResponse = await generateRoutes(req)
      loadingStage.value = 2 // final stage
      routes.value = data.routes
      locationName.value = data.locationName
      weatherNote.value = data.weatherNote
      weather.value = data.weather || null
      lastResponse.value = data
    } catch (e) {
      if (e instanceof ApiRequestError) {
        error.value = e
      } else {
        error.value = new ApiRequestError('UNKNOWN', '未知错误')
      }
    } finally {
      if (stageTimer) { clearInterval(stageTimer); stageTimer = null }
      loading.value = false
      loadingStage.value = 0
    }
  }

  async function retry() {
    if (lastRequest) {
      await fetchRoutes(lastRequest)
    }
  }

  return { routes, locationName, weatherNote, weather, loading, loadingStage, error, lastRequest, lastResponse, fetchRoutes, retry }
}
