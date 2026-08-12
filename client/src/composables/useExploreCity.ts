import { ref } from 'vue'
import type { RecommendationCity } from '../repositories/cityRecommendations'

const STORAGE_KEY = 'laidou-v04-explore-city'

function readCity(): RecommendationCity | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as Partial<RecommendationCity>
    if (
      typeof value.adcode !== 'string'
      || typeof value.name !== 'string'
      || typeof value.province !== 'string'
    ) return null
    return {
      adcode: value.adcode,
      name: value.name,
      province: value.province,
      coverImageUrl: typeof value.coverImageUrl === 'string' ? value.coverImageUrl : null,
      center: value.center
        && Number.isFinite(value.center.lat)
        && Number.isFinite(value.center.lng)
        ? { lat: value.center.lat, lng: value.center.lng }
        : null,
    }
  } catch {
    return null
  }
}

const city = ref<RecommendationCity | null>(readCity())

export function useExploreCity() {
  function setExploreCity(next: RecommendationCity) {
    city.value = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* The in-memory city still works when storage is unavailable. */
    }
  }

  return { city, setExploreCity }
}
