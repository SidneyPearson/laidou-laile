import { SHANGHAI_HOTSPOTS } from './cities/shanghai.js'
import { BEIJING_HOTSPOTS } from './cities/beijing.js'
import { HANGZHOU_HOTSPOTS } from './cities/hangzhou.js'
import type { HotspotSeed } from '../../types/explore.js'

const CITY_DATASETS = [
  { names: ['上海'], adcodePrefix: '310', hotspots: SHANGHAI_HOTSPOTS },
  { names: ['北京'], adcodePrefix: '110', hotspots: BEIJING_HOTSPOTS },
  { names: ['杭州'], adcodePrefix: '3301', hotspots: HANGZHOU_HOTSPOTS },
]

function normalizeCityName(city: string): string {
  return city.trim().replace(/[市省]$/, '')
}

export function getCityHotspots(city: string, adcode?: string): HotspotSeed[] {
  const normalized = normalizeCityName(city)
  const dataset = CITY_DATASETS.find(item =>
    item.names.includes(normalized) || adcode?.startsWith(item.adcodePrefix))
  if (dataset) return dataset.hotspots.map(cloneHotspot)
  return []
}

export function getHotspotById(id: string): HotspotSeed | null {
  const spot = CITY_DATASETS
    .flatMap(item => item.hotspots)
    .find(item => item.id === id)
  return spot ? cloneHotspot(spot) : null
}

function cloneHotspot(spot: HotspotSeed): HotspotSeed {
  return {
    ...spot,
    tags: [...spot.tags],
    suitablePersonas: [...spot.suitablePersonas],
    officialCoverImage: spot.officialCoverImage
      ? { ...spot.officialCoverImage }
      : undefined,
  }
}
