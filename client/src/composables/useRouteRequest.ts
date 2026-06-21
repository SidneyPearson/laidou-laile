import { ref } from 'vue'
import { generateRoutes, ApiRequestError } from '../services/api'
import type { GenerateRoutesRequest, GenerateRoutesResponse } from '../types/api'
import type { Route } from '../types/route'

// ── Singleton state — shared across all components ──────
const routes = ref<Route[]>([])
const locationName = ref('')
const weatherNote = ref<string | null>(null)
const loading = ref(false)
const error = ref<ApiRequestError | null>(null)
let lastRequest: GenerateRoutesRequest | null = null

export function useRouteRequest() {
  async function fetchRoutes(req: GenerateRoutesRequest) {
    loading.value = true
    error.value = null
    lastRequest = req
    try {
      const data: GenerateRoutesResponse = await generateRoutes(req)
      routes.value = data.routes
      locationName.value = data.locationName
      weatherNote.value = data.weatherNote
    } catch (e) {
      if (e instanceof ApiRequestError) {
        error.value = e
      } else {
        error.value = new ApiRequestError('UNKNOWN', '未知错误')
      }
    } finally {
      loading.value = false
    }
  }

  async function retry() {
    if (lastRequest) {
      await fetchRoutes(lastRequest)
    }
  }

  return { routes, locationName, weatherNote, loading, error, fetchRoutes, retry }
}
