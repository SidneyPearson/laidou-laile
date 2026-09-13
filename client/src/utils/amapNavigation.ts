import { readonly, shallowRef } from 'vue'

export interface AmapNavigationTarget {
  name: string
  placeName?: string
  lng: number
  lat: number
}

const navigationTarget = shallowRef<AmapNavigationTarget | null>(null)

export function amapNavigationUrl(
  name: string,
  lng: number,
  lat: number,
  callnative: 0 | 1 = 0,
): string {
  const destination = `${lng},${lat},${encodeURIComponent(name)}`
  return `https://uri.amap.com/navigation?to=${destination}&mode=walk&callnative=${callnative}`
}

export function openAmapNavigation(name: string, lng: number, lat: number, placeName?: string): void {
  navigationTarget.value = { name, lng, lat, ...(placeName && placeName !== name ? { placeName } : {}) }
}

export function closeAmapNavigation(): void {
  navigationTarget.value = null
}

export function useAmapNavigation() {
  return {
    target: readonly(navigationTarget),
    close: closeAmapNavigation,
  }
}
