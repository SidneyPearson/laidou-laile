import { haversineDist } from '../../utils/geo.js'
import type { CurationRepository } from '../../repositories/curationRepository.js'
import type { SpotRecord } from '../../domain/curation.js'

export interface SuggestOrderInput {
  city: string
  places: Array<{ hotspotId: string; amapPoiId: string }>
  startPeriod?: 'morning' | 'afternoon' | 'evening'
  weather?: {
    weather: string
    isRainy: boolean
    note?: string
  }
}

export interface SuggestedOrderResult {
  order: Array<{ hotspotId: string; amapPoiId: string }>
  reason: string
  reminders: string[]
  source: 'deterministic_distance'
}

export class SuggestOrderError extends Error {
  constructor(
    public code: 'HOTSPOT_UNAVAILABLE' | 'POI_MISMATCH' | 'CITY_MISMATCH',
    message: string,
  ) {
    super(message)
    this.name = 'SuggestOrderError'
  }
}

interface OrderableSpot {
  id: string
  amapPoiId: string
  lng: number
  lat: number
}

function nearestNeighbour(spots: OrderableSpot[]): OrderableSpot[] {
  if (spots.length < 2) return [...spots]
  const remaining = spots.slice(1)
  const ordered = [spots[0]]

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1]
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index]
      const distance = haversineDist(current.lat, current.lng, candidate.lat, candidate.lng)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    }
    ordered.push(remaining.splice(nearestIndex, 1)[0])
  }

  return ordered
}

function routeSpan(spots: OrderableSpot[]): number {
  let total = 0
  for (let index = 1; index < spots.length; index++) {
    total += haversineDist(
      spots[index - 1].lat,
      spots[index - 1].lng,
      spots[index].lat,
      spots[index].lng,
    )
  }
  return total
}

function toOrderable(spot: SpotRecord, referenceAmapPoiId: string): OrderableSpot {
  if (!spot.amapPoiId?.trim()) {
    throw new SuggestOrderError('POI_MISMATCH', '有地点信息已经更新，请返回城市灵感页重新加入')
  }
  if (spot.amapPoiId !== referenceAmapPoiId) {
    throw new SuggestOrderError('POI_MISMATCH', '有地点信息已经更新，请返回城市灵感页重新加入')
  }
  if (!Number.isFinite(spot.lng) || !Number.isFinite(spot.lat)) {
    throw new SuggestOrderError('HOTSPOT_UNAVAILABLE', '有地点缺少有效坐标，暂时无法给出参考顺序')
  }
  return {
    id: spot.id,
    amapPoiId: spot.amapPoiId,
    lng: spot.lng as number,
    lat: spot.lat as number,
  }
}

export async function suggestOrder(
  input: SuggestOrderInput,
  dependencies: { repository: CurationRepository },
): Promise<SuggestedOrderResult> {
  const city = await dependencies.repository.findPublishedCity(input.city)
  if (!city) {
    throw new SuggestOrderError('CITY_MISMATCH', '所选城市暂未开放灵感内容，请返回重新选择')
  }

  const published = await dependencies.repository.listPublished(city.adcode)
  const byId = new Map(published.map(spot => [spot.id, spot]))

  const spotsInOriginalOrder = input.places.map(reference => {
    const spot = byId.get(reference.hotspotId)
    if (!spot) {
      throw new SuggestOrderError('HOTSPOT_UNAVAILABLE', '有地点已不在当前城市灵感列表中，请刷新后重试')
    }
    return toOrderable(spot, reference.amapPoiId)
  })

  const ordered = nearestNeighbour(spotsInOriginalOrder)
  const originalIds = new Set(input.places.map(place => place.hotspotId))
  const orderedIds = new Set(ordered.map(spot => spot.id))
  if (
    originalIds.size !== orderedIds.size
    || [...originalIds].some(id => !orderedIds.has(id))
  ) {
    throw new SuggestOrderError('HOTSPOT_UNAVAILABLE', '参考顺序校验失败，请保留原顺序')
  }

  const changed = ordered.some((spot, index) => spot.id !== input.places[index].hotspotId)
  const spanKm = routeSpan(ordered) / 1000
  const reminders: string[] = []
  if (spanKm >= 15) reminders.push('地点跨度较大，实际出发前建议再删减一处。')
  if (input.weather?.isRainy) reminders.push('今天可能有雨，请优先确认户外地点开放情况并预留交通时间。')
  if (input.startPeriod === 'evening') reminders.push('从傍晚开始时间较紧，留意闭馆和停止入场时间。')
  if (reminders.length === 0) reminders.push('营业、预约和交通情况可能变化，请以当天信息为准。')

  return {
    order: ordered.map(spot => ({
      hotspotId: spot.id,
      amapPoiId: spot.amapPoiId,
    })),
    reason: changed
      ? '在保留全部已选地点的前提下，按相邻地点距离给出较少折返的参考顺序。'
      : '你当前的顺序已经比较连贯，可以按这个顺序作为参考。',
    reminders,
    source: 'deterministic_distance',
  }
}
