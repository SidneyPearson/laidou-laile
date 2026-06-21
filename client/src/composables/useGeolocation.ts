import { ref } from 'vue'
import { getCurrentPosition, getMockPosition, LocationError, type Coords } from '../services/location'

export function useGeolocation() {
  const coords = ref<Coords | null>(null)
  const loading = ref(false)
  const error = ref<LocationError | null>(null)
  const isMock = ref(false)
  const manualLocationName = ref<string | null>(null)

  async function requestLocation(useMock = false) {
    loading.value = true
    error.value = null
    try {
      if (useMock) {
        coords.value = getMockPosition()
        isMock.value = true
        manualLocationName.value = null
      } else {
        coords.value = await getCurrentPosition()
        isMock.value = false
        manualLocationName.value = null
      }
    } catch (e) {
      if (e instanceof LocationError) {
        coords.value = getMockPosition()
        isMock.value = true
        manualLocationName.value = null
        error.value = e
      } else {
        coords.value = getMockPosition()
        isMock.value = true
        manualLocationName.value = null
        error.value = new LocationError('POSITION_UNAVAILABLE', '定位失败，已使用模拟位置')
      }
    } finally {
      loading.value = false
    }
  }

  /** Set a manually chosen location (e.g. from city picker) */
  function setManualLocation(lat: number, lng: number, locationName: string) {
    coords.value = { lat, lng }
    isMock.value = true
    manualLocationName.value = locationName
    error.value = null
    loading.value = false
  }

  return { coords, loading, error, isMock, manualLocationName, requestLocation, setManualLocation }
}
