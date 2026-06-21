import { ref } from 'vue'
import { getCurrentPosition, getMockPosition, LocationError, type Coords } from '../services/location'

export function useGeolocation() {
  const coords = ref<Coords | null>(null)
  const loading = ref(false)
  const error = ref<LocationError | null>(null)
  const isMock = ref(false)

  async function requestLocation(useMock = false) {
    loading.value = true
    error.value = null
    try {
      if (useMock) {
        coords.value = getMockPosition()
        isMock.value = true
      } else {
        coords.value = await getCurrentPosition()
        isMock.value = false
      }
    } catch (e) {
      if (e instanceof LocationError) {
        // Auto fallback to mock on any error: mobile HTTP blocks Geolocation entirely,
        // permission denied, timeout, etc. All get mock position so user can proceed.
        coords.value = getMockPosition()
        isMock.value = true
        error.value = e
      } else {
        coords.value = getMockPosition()
        isMock.value = true
        error.value = new LocationError('POSITION_UNAVAILABLE', '定位失败，已使用模拟位置')
      }
    } finally {
      loading.value = false
    }
  }

  return { coords, loading, error, isMock, requestLocation }
}
