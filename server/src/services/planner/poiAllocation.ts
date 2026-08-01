import { haversineDist } from '../../utils/geo.js'
import { normalizeName } from '../../utils/text.js'

export interface IdentityPoi {
  id?: string | null
  amapPoiId?: string | null
  name: string
  lng: number
  lat: number
  parentId?: string | null
  parentPoiId?: string | null
}

function parentIdentity(poi: IdentityPoi): string | null | undefined {
  return poi.parentPoiId ?? poi.parentId
}

export function samePoi(a: IdentityPoi, b: IdentityPoi): boolean {
  const aId = a.amapPoiId ?? a.id
  const bId = b.amapPoiId ?? b.id
  const aParent = parentIdentity(a)
  const bParent = parentIdentity(b)
  if (aId && bId && aId === bId) return true
  if (aId && bParent && aId === bParent) return true
  if (bId && aParent && bId === aParent) return true
  if (aParent && bParent && aParent === bParent) return true

  // Two different authoritative IDs with no parent relationship are distinct,
  // even when their display names happen to be the same.
  if (aId && bId) return false

  const aName = normalizeName(a.name).replace(/南门|北门|东门|西门|入口|出口/g, '')
  const bName = normalizeName(b.name).replace(/南门|北门|东门|西门|入口|出口/g, '')
  if (!aName || aName !== bName) return false
  return haversineDist(a.lat, a.lng, b.lat, b.lng) <= 120
}

export function allocateDistinctPois<T extends IdentityPoi>(
  candidatePools: T[][],
  requestedCounts: number[],
  minimumCounts: number[] = requestedCounts.map(() => 1),
): {
  routes: T[][]
  hadToRepeat: boolean
  candidateShortage: boolean
  repeatedRouteIndexes: number[]
} {
  const routes: T[][] = candidatePools.map(() => [])
  const globallyUsed: T[] = []
  let hadToRepeat = false
  const repeatedRouteIndexes = new Set<number>()

  const takeUnique = (routeIndex: number): boolean => {
    const selected = routes[routeIndex]
    const candidate = candidatePools[routeIndex].find(poi =>
      !selected.some(existing => samePoi(existing, poi))
      && !globallyUsed.some(existing => samePoi(existing, poi)),
    )
    if (!candidate) return false
    selected.push(candidate)
    globallyUsed.push(candidate)
    return true
  }

  // Fairness pass: every route reserves one distinct primary POI before an
  // earlier route can consume the shared reservoir.
  for (let routeIndex = 0; routeIndex < candidatePools.length; routeIndex++) {
    if ((requestedCounts[routeIndex] ?? 0) > 0) takeUnique(routeIndex)
  }

  // Round-robin fill preserves fairness while using every distinct candidate.
  let progressed = true
  while (progressed) {
    progressed = false
    for (let routeIndex = 0; routeIndex < candidatePools.length; routeIndex++) {
      if (routes[routeIndex].length >= (requestedCounts[routeIndex] ?? 1)) continue
      if (takeUnique(routeIndex)) progressed = true
    }
  }

  // Repeats are a last resort and only satisfy the minimum viable count, not
  // the recommended target. This avoids cloning the same full route merely to
  // hit a numerical lower bound.
  for (let routeIndex = 0; routeIndex < candidatePools.length; routeIndex++) {
    const requested = requestedCounts[routeIndex] ?? 1
    const repeatFloor = Math.min(requested, Math.max(1, minimumCounts[routeIndex] ?? 1))
    while (routes[routeIndex].length < repeatFloor) {
      const candidate = candidatePools[routeIndex].find(poi =>
        !routes[routeIndex].some(existing => samePoi(existing, poi)),
      )
      if (!candidate) break
      routes[routeIndex].push(candidate)
      if (globallyUsed.some(existing => samePoi(existing, candidate))) {
        hadToRepeat = true
        repeatedRouteIndexes.add(routeIndex)
      } else {
        globallyUsed.push(candidate)
      }
    }
  }

  return {
    routes,
    hadToRepeat,
    candidateShortage: routes.some((route, index) => route.length < (requestedCounts[index] ?? 1)),
    repeatedRouteIndexes: [...repeatedRouteIndexes],
  }
}
