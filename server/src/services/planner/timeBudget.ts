import { estimateRouteTravel, type Coordinate } from './distancePolicy.js'

export interface BudgetStop extends Coordinate {
  name: string
  visitDurationMinutes: number
  qualityScore?: number
  typecode?: string
}

export function getStopCountRange(minutes: number): { min: number; max: number } {
  if (minutes <= 60) return { min: 2, max: 2 }
  if (minutes <= 120) return { min: 3, max: 3 }
  if (minutes <= 240) return { min: 4, max: 5 }
  return { min: 5, max: 6 }
}

export function estimateVisitDuration(poi: { name?: string; typecode?: string }): number {
  const name = poi.name ?? ''
  const typecode = poi.typecode ?? ''
  if (/博物馆|美术馆|展览馆|纪念馆/.test(name) || typecode.startsWith('1401')) return 70
  if (/正餐|酒楼|饭店|餐厅/.test(name)) return 40
  if (/咖啡|茶馆|茶室/.test(name)) return 25
  if (/街|胡同|古镇|商场|购物中心/.test(name) || typecode.startsWith('0604')) return 45
  if (typecode.startsWith('05')) return 30
  if (typecode.startsWith('11') || typecode.startsWith('14')) return 40
  return 25
}

export function getMinimumVisitDuration(poi: { name?: string; typecode?: string }): number {
  const name = poi.name ?? ''
  const typecode = poi.typecode ?? ''
  if (/博物馆|美术馆|展览馆|纪念馆/.test(name) || typecode.startsWith('1401')) return 45
  if (/正餐|酒楼|饭店|餐厅/.test(name) || typecode.startsWith('0501')) return 30
  if (/咖啡|茶馆|茶室/.test(name) || typecode.startsWith('0505')) return 20
  if (/街|胡同|古镇|商场|购物中心/.test(name) || typecode.startsWith('0604')) return 30
  if (typecode.startsWith('11') || typecode.startsWith('14')) return 25
  if (typecode.startsWith('05')) return 20
  return 15
}

function metrics<T extends BudgetStop>(stops: T[], origin: Coordinate | undefined, budget: number) {
  const travel = estimateRouteTravel(origin, stops)
  const visits = stops.reduce((sum, stop) => sum + Math.max(5, stop.visitDurationMinutes), 0)
  const buffer = stops.length > 0 ? Math.max(5, Math.ceil(budget * 0.05)) : 0
  return { travel, totalMinutes: visits + travel.minutes + buffer }
}

/** Deterministically enforce stop-count and total-time limits. */
export function fitStopsToTimeBudget<T extends BudgetStop>(
  candidates: T[],
  budgetMinutes: number,
  origin?: Coordinate,
): { stops: T[]; totalMinutes: number; travelDistanceMeters: number } {
  const max = getStopCountRange(budgetMinutes).max
  let indexed = candidates.map((candidate, index) => ({
    stop: {
      ...candidate,
      visitDurationMinutes: Math.max(candidate.visitDurationMinutes, getMinimumVisitDuration(candidate)),
    } as T,
    index,
  }))
  if (indexed.length > max) {
    indexed = [...indexed]
      .sort((a, b) => (b.stop.qualityScore ?? 0) - (a.stop.qualityScore ?? 0) || a.index - b.index)
      .slice(0, max)
      .sort((a, b) => a.index - b.index)
  }

  let stops = indexed.map(item => item.stop)
  let result = metrics(stops, origin, budgetMinutes)
  while (stops.length > 1 && result.totalMinutes > budgetMinutes) {
    let dropIndex = 0
    for (let i = 1; i < stops.length; i++) {
      const current = stops[i]
      const selected = stops[dropIndex]
      if ((current.qualityScore ?? 0) < (selected.qualityScore ?? 0)
        || ((current.qualityScore ?? 0) === (selected.qualityScore ?? 0)
          && current.visitDurationMinutes > selected.visitDurationMinutes)) {
        dropIndex = i
      }
    }
    stops = stops.filter((_, index) => index !== dropIndex)
    result = metrics(stops, origin, budgetMinutes)
  }

  // A single long-duration POI (for example a museum) still needs a truthful
  // in-budget estimate. Shorten the suggested stay instead of reporting a
  // total that silently exceeds the user's hard budget.
  if (stops.length === 1 && result.totalMinutes > budgetMinutes) {
    const travel = estimateRouteTravel(origin, stops)
    const buffer = Math.max(5, Math.ceil(budgetMinutes * 0.05))
    const allowedVisit = budgetMinutes - travel.minutes - buffer
    const minimumVisit = getMinimumVisitDuration(stops[0])
    if (allowedVisit < minimumVisit) {
      return { stops: [], totalMinutes: 0, travelDistanceMeters: travel.distanceMeters }
    }
    stops = [{ ...stops[0], visitDurationMinutes: allowedVisit }]
    result = metrics(stops, origin, budgetMinutes)
    if (result.totalMinutes > budgetMinutes) {
      return { stops: [], totalMinutes: 0, travelDistanceMeters: travel.distanceMeters }
    }
  }

  return {
    stops,
    totalMinutes: result.totalMinutes,
    travelDistanceMeters: result.travel.distanceMeters,
  }
}
