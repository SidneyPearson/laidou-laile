import axios from 'axios'
import { POPULAR_CITIES, type City } from '../data/popularCities'

export type RecommendationSource = 'd1' | 'mixed' | 'static_fallback'
export interface RecommendationResult { cities: City[]; source: RecommendationSource; fallbackReason?: string }
interface ApiCity { adcode: string; province: string; name: string; attractions: Array<{ id: string; name: string; lat: number; lng: number }> }
interface ApiResponse { cities: ApiCity[]; source: 'd1' | 'static_fallback'; managedAdcodes: string[]; fallbackReason?: string }

const STATIC_ADCODES: Record<string, string> = { 北京: '110000', 上海: '310000', 杭州: '330100' }
const EMOJI: Record<string, string> = { 北京: '🏯', 上海: '🏙️', 杭州: '🪷' }

export async function loadCityRecommendations(signal?: AbortSignal): Promise<RecommendationResult> {
  try {
    const { data } = await axios.get<ApiResponse>('/api/recommendations/cities', {
      signal,
      timeout: 8000,
      headers: { 'Cache-Control': 'no-cache' },
      validateStatus: status => status === 200 || status === 503,
    })
    if (!data || !Array.isArray(data.cities)) throw new Error('invalid response')
    if (data.source === 'static_fallback') return { cities: POPULAR_CITIES, source: 'static_fallback', fallbackReason: data.fallbackReason }
    const managed = new Set(data.managedAdcodes)
    const curated: City[] = data.cities.map(city => ({ name: city.name, province: city.province, emoji: EMOJI[city.name] ?? '📍', attractions: city.attractions.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).map(item => ({ name: item.name, lat: item.lat, lng: item.lng })) }))
    const legacy = POPULAR_CITIES.filter(city => !managed.has(STATIC_ADCODES[city.name] ?? ''))
    return { cities: [...curated, ...legacy], source: legacy.length ? 'mixed' : 'd1' }
  } catch {
    return { cities: POPULAR_CITIES, source: 'static_fallback', fallbackReason: 'RECOMMENDATION_API_UNAVAILABLE' }
  }
}
