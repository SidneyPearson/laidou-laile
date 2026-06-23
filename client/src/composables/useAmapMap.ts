import { ref, shallowRef } from 'vue'

const AMAP_KEY = 'a281efc44143fc4d3680ed164609a565'
const AMAP_PLUGINS = ['AMap.Geocoder', 'AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.Geolocation']

const sdkReady = ref(false)
const sdkDiag = ref<{ loaded: boolean; attempts: number; hasAMap: boolean; scriptFound: boolean; error?: string }>({
  loaded: false,
  attempts: 0,
  hasAMap: false,
  scriptFound: false,
})

export function useAmapMap() {
  const mapInstance = shallowRef<any>(null)
  const markerRef = shallowRef<any>(null)

  function waitForSDK(): Promise<boolean> {
    if (sdkReady.value) return Promise.resolve(true)

    const win = window as any

    // Already loaded (e.g. via Loader or direct script)
    if (win.AMap) {
      sdkReady.value = true
      sdkDiag.value = { loaded: true, attempts: 0, hasAMap: true, scriptFound: true }
      return Promise.resolve(true)
    }

    // Use AMapLoader if available (official v2 approach)
    if (win.AMapLoader) {
      sdkDiag.value.scriptFound = true
      return win.AMapLoader.load({
        key: AMAP_KEY,
        version: '2.0',
        plugins: AMAP_PLUGINS,
      }).then((AMap: any) => {
        win.AMap = AMap
        sdkReady.value = true
        sdkDiag.value = { loaded: true, attempts: 0, hasAMap: true, scriptFound: true }
        return true
      }).catch((err: any) => {
        console.error('AMapLoader.load failed:', err)
        sdkDiag.value = { loaded: false, attempts: 0, hasAMap: false, scriptFound: true, error: 'Loader failed: ' + String(err) }
        return false
      })
    }

    // Fallback: poll for window.AMap (direct script approach)
    return new Promise((resolve) => {
      const scripts = document.querySelectorAll('script[src]')
      sdkDiag.value.scriptFound = Array.from(scripts).some(s =>
        (s as HTMLScriptElement).src.includes('webapi.amap.com')
      )

      let attempts = 0
      const maxAttempts = 100
      const check = setInterval(() => {
        attempts++
        sdkDiag.value.attempts = attempts
        if (win.AMapLoader) {
          clearInterval(check)
          // Loader just appeared, use it
          waitForSDK().then(resolve)
        } else if (win.AMap) {
          clearInterval(check)
          sdkReady.value = true
          sdkDiag.value = { ...sdkDiag.value, loaded: true, hasAMap: true, attempts }
          resolve(true)
        } else if (attempts >= maxAttempts) {
          clearInterval(check)
          sdkDiag.value = { ...sdkDiag.value, loaded: false, hasAMap: false, attempts, error: 'SDK 10s timeout' }
          resolve(false)
        }
      }, 100)
    })
  }

  function getDiagInfo() {
    // Also check for common Amap error messages injected into the page
    const win = window as any
    const hasAMap = !!win.AMap
    const amapVersion = hasAMap ? (win.AMap.version || 'unknown') : 'N/A'
    const scriptOnload = win._amap_script_loaded === true
    const scriptError = win._amap_error || ''

    // Check if the SDK script failed to load (network error)
    const scripts = document.querySelectorAll('script[src]')
    const amapScript = Array.from(scripts).find(s =>
      (s as HTMLScriptElement).src.includes('webapi.amap.com')
    ) as HTMLScriptElement | undefined

    // Try to extract key from script URL for debugging
    const keyMatch = amapScript?.src.match(/key=([^&]+)/)
    const keyPreview = keyMatch ? keyMatch[1].substring(0, 8) + '...' : 'N/A'

    return {
      ...sdkDiag.value,
      amapVersion,
      hasAMap,
      scriptOnload,
      scriptError,
      keyPreview,
      scriptSrc: amapScript?.src || 'NOT FOUND',
      userAgent: navigator.userAgent.substring(0, 100),
      location: window.location.href,
    }
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
      AMap.plugin('AMap.Geocoder', () => {
        const geocoder = new AMap.Geocoder({})
        geocoder.getAddress([lng, lat], (status: string, result: any) => {
          if (status === 'complete' && result.regeocode) {
            resolve(result.regeocode.formattedAddress || '')
          } else {
            resolve('')
          }
        })
      })
    })
  }

  /**
   * Search for address suggestions (autocomplete).
   * Returns array of { name, address, lng, lat }
   */
  async function searchAddress(keyword: string): Promise<
    Array<{ name: string; address: string; lng: number; lat: number }>
  > {
    await waitForSDK()
    const AMap = (window as any).AMap
    return new Promise((resolve) => {
      AMap.plugin('AMap.AutoComplete', () => {
        try {
          const auto = new AMap.AutoComplete({ city: '全国', citylimit: false })
          auto.search(keyword, (status: string, result: any) => {
            console.log('Amap AutoComplete result:', status, result)
            if (status === 'complete' && result.tips) {
              const mapped = result.tips
                .filter((t: any) => t.location && t.location.lng)
                .map((t: any) => ({
                  name: t.name,
                  address: (t.district || '') + (t.address || '') || t.name,
                  lng: t.location.lng,
                  lat: t.location.lat,
                }))
              console.log('Mapped suggestions:', mapped)
              resolve(mapped)
            } else {
              resolve([])
            }
          })
        } catch (err) {
          console.error('Amap AutoComplete error:', err)
          resolve([])
        }
      })
    })
  }

  /**
   * Search POI by keyword using PlaceSearch.
   * Returns array of { name, address, lng, lat }
   */
  async function searchPOI(keyword: string): Promise<
    Array<{ name: string; address: string; lng: number; lat: number }>
  > {
    await waitForSDK()
    const AMap = (window as any).AMap
    return new Promise((resolve) => {
      AMap.plugin('AMap.PlaceSearch', () => {
        try {
          const ps = new AMap.PlaceSearch({
            city: '全国',
            citylimit: false,
            pageSize: 10,
          })
          ps.search(keyword, (status: string, result: any) => {
            console.log('Amap PlaceSearch result:', status, result)
            if (status === 'complete' && result.poiList) {
              const pois = result.poiList.pois || []
              const mapped = pois.map((p: any) => ({
                name: p.name,
                address: [p.adname, p.address].filter(Boolean).join(' ') || p.name,
                lng: p.location.lng,
                lat: p.location.lat,
              }))
              console.log('PlaceSearch mapped:', mapped)
              resolve(mapped)
            } else {
              resolve([])
            }
          })
        } catch (err) {
          console.error('Amap PlaceSearch error:', err)
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
    searchPOI,
    getUserLocation,
    destroyMap,
    getDiagInfo,
  }
}
