import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../services/api'

const { generateRoutes } = vi.hoisted(() => ({ generateRoutes: vi.fn() }))
vi.mock('../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/api')>()
  return { ...original, generateRoutes }
})

const response = {
  routes: [{ id: 'r', name: '路线', tagline: '', stops: [], totalDurationMinutes: 0, walkingDistanceMeters: 0, tips: '' }],
  generatedAt: new Date(0).toISOString(), locationName: '测试地点', weatherNote: null, weather: null,
}
const request = { lat: 31, lng: 121, timeOption: 60 as const, distance: 500 as const, preferences: ['wander' as const] }

describe('useRouteRequest', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    generateRoutes.mockReset()
    vi.resetModules()
  })

  it('completes normally', async () => {
    generateRoutes.mockResolvedValue(response)
    const { useRouteRequest } = await import('./useRouteRequest')
    const state = useRouteRequest()
    await expect(state.fetchRoutes(request)).resolves.toBe('success')
    expect(state.routes.value).toHaveLength(1)
    expect(state.error.value).toBeNull()
  })

  it('user cancellation is immediate, silent, and never retried', async () => {
    generateRoutes.mockImplementation((_req, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new ApiRequestError('CANCELLED', '请求已取消')))
    }))
    const { useRouteRequest } = await import('./useRouteRequest')
    const state = useRouteRequest()
    const pending = state.fetchRoutes(request)
    state.cancelRequest()
    await expect(pending).resolves.toBe('cancelled')
    expect(state.loading.value).toBe(false)
    expect(state.error.value).toBeNull()
    expect(generateRoutes).toHaveBeenCalledTimes(1)
  })

  it('retries one network failure', async () => {
    generateRoutes
      .mockRejectedValueOnce(new ApiRequestError('NETWORK_ERROR', '网络错误'))
      .mockResolvedValueOnce(response)
    const { useRouteRequest } = await import('./useRouteRequest')
    const state = useRouteRequest()
    const pending = state.fetchRoutes(request)
    await vi.advanceTimersByTimeAsync(1500)
    await expect(pending).resolves.toBe('success')
    expect(generateRoutes).toHaveBeenCalledTimes(2)
  })

  it('cancel during retry backoff prevents the retry', async () => {
    generateRoutes.mockRejectedValueOnce(new ApiRequestError('NETWORK_ERROR', '网络错误'))
    const { useRouteRequest } = await import('./useRouteRequest')
    const state = useRouteRequest()
    const pending = state.fetchRoutes(request)
    await Promise.resolve()
    state.cancelRequest()
    await vi.runAllTimersAsync()
    await expect(pending).resolves.toBe('cancelled')
    expect(generateRoutes).toHaveBeenCalledTimes(1)
    expect(state.error.value).toBeNull()
  })

  it('a new request aborts the old request without clearing new state', async () => {
    generateRoutes
      .mockImplementationOnce((_req, signal: AbortSignal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new ApiRequestError('CANCELLED', '请求已取消')))
      }))
      .mockResolvedValueOnce(response)
    const { useRouteRequest } = await import('./useRouteRequest')
    const state = useRouteRequest()
    const old = state.fetchRoutes(request)
    const current = state.fetchRoutes({ ...request, lat: 32 })
    await expect(old).resolves.toBe('cancelled')
    await expect(current).resolves.toBe('success')
    expect(state.routes.value).toHaveLength(1)
    expect(state.loading.value).toBe(false)
  })
})
