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

/** Reconcile the remembered city with the latest published city list.
 *  The API copy wins so renamed cities, covers and representative centers do
 *  not stay stale in localStorage forever. */
export function matchRememberedCity(
  remembered: RecommendationCity | null,
  cities: RecommendationCity[],
): RecommendationCity | null {
  if (!remembered) return null
  const rememberedName = remembered.name.trim().replace(/市$/, '')
  return cities.find(item => item.adcode === remembered.adcode)
    ?? cities.find(item => item.name.trim().replace(/市$/, '') === rememberedName)
    ?? null
}

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
