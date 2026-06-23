import { ref, shallowRef, onMounted, onUnmounted } from 'vue'

const sdkReady = ref(false)

export function useAmapMap() {
  const mapInstance = shallowRef<any>(null)
  const markerRef = shallowRef<any>(null)

  function waitForSDK(): Promise<boolean> {
    if (sdkReady.value) return Promise.resolve(true)

    return new Promise((resolve) => {
      const win = window as any
      if (win.AMap) {
        sdkReady.value = true
        resolve(true)
        return
      }

      let attempts = 0
      const maxAttempts = 100 // 10s
      const check = setInterval(() => {
        attempts++
        if (win.AMap) {
          clearInterval(check)
          sdkReady.value = true
          resolve(true)
        } else if (attempts >= maxAttempts) {
          clearInterval(check)
          console.warn('Amap SDK load timeout')
          resolve(false)
        }
      }, 100)
    })
  }

  /**
   * Create a map in the given container element.
   * Returns the map instance.
   */
  function createMap(
    containerId: string,
    center: [number, number], // [lng, lat]
    zoom = 15,
  ): Promise<any> {
    return waitForSDK().then((ready) => {
      if (!ready) {
        console.warn('Amap SDK not ready, cannot create map')
        return null
      }

      // Ensure the container element exists
      const el = document.getElementById(containerId)
      if (!el) {
        console.warn(`Amap container #${containerId} not found`)
        return null
      }

      try {
        const AMap = (window as any).AMap
        const map = new AMap.Map(containerId, {
          zoom,
          center,
          viewMode: '2D',
          resizeEnable: true,
          touchZoom: true,
          dragEnable: true,
          zoomEnable: true,
        })

        // Listen for tile load errors (e.g. invalid key, domain not whitelisted)
        map.on('complete', () => {
          console.log('Amap tiles loaded successfully')
        })

        mapInstance.value = map
        return map
      } catch (err) {
        console.error('Failed to create Amap map:', err)
        return null
      }
    })
  }

  /** Place a marker at the given position on the map */
  function setMarker(lng: number, lat: number) {
    if (!mapInstance.value) return
    const AMap = (window as any).AMap

    if (markerRef.value) {
      markerRef.value.setPosition([lng, lat])
    } else {
      markerRef.value = new AMap.Marker({
        position: [lng, lat],
        map: mapInstance.value,
        animation: 'AMAP_ANIMATION_DROP',
      })
    }
    mapInstance.value.setCenter([lng, lat])
  }

  /** Listen for map clicks, callback receives [lng, lat] */
  function onClickMap(cb: (lng: number, lat: number) => void) {
    if (!mapInstance.value) return
    mapInstance.value.on('click', (e: any) => {
      cb(e.lnglat.getLng(), e.lnglat.getLat())
    })
  }

  /** Reverse geocode: [lng,lat] → address string */
  async function reverseGeocode(lng: number, lat: number): Promise<string> {
    await waitForSDK()
    const AMap = (window as any).AMap
    return new Promise((resolve) => {
      const geocoder = new AMap.Geocoder({})
      geocoder.getAddress([lng, lat], (status: string, result: any) => {
        if (status === 'complete' && result.regeocode) {
          resolve(result.regeocode.formattedAddress || '')
        } else {
          resolve('')
        }
      })
    })
  }

  /**
   * Search for address suggestions (autocomplete).
   * Returns array of { name, address, location: {lng, lat} }
   */
  async function searchAddress(keyword: string): Promise<
    Array<{ name: string; address: string; lng: number; lat: number }>
  > {
    await waitForSDK()
    const AMap = (window as any).AMap
    return new Promise((resolve) => {
      const auto = new AMap.AutoComplete({ city: '全国', citylimit: false })
      auto.search(keyword, (status: string, result: any) => {
        if (status === 'complete' && result.tips) {
          resolve(
            result.tips
              .filter((t: any) => t.location && t.location.lng)
              .map((t: any) => ({
                name: t.name,
                address: t.district + t.address || t.name,
                lng: t.location.lng,
                lat: t.location.lat,
              })),
          )
        } else {
          resolve([])
        }
      })
    })
  }

  /** Geolocate the user via browser GPS */
  function getUserLocation(): Promise<{ lng: number; lat: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
        () => resolve(null),
        { timeout: 10000, enableHighAccuracy: true },
      )
    })
  }

  /** Clean up map instance */
  function destroyMap() {
    if (mapInstance.value) {
      mapInstance.value.destroy()
      mapInstance.value = null
    }
    markerRef.value = null
  }

  return {
    sdkReady,
    mapInstance,
    waitForSDK,
    createMap,
    setMarker,
    onClickMap,
    reverseGeocode,
    searchAddress,
    getUserLocation,
    destroyMap,
  }
}
