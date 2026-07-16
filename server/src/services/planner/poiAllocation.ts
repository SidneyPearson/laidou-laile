import { haversineDist } from '../../utils/geo.js'
import { normalizeName } from '../../utils/text.js'

export interface IdentityPoi {
  id?: string | null
  amapPoiId?: string | null
  name: string
  lng: number
  lat: number
  parentId?: string | null
}

export function samePoi(a: IdentityPoi, b: IdentityPoi): boolean {
  const aId = a.amapPoiId ?? a.id
  const bId = b.amapPoiId ?? b.id
  if (aId && bId) return aId === bId
  if (a.parentId && b.parentId && a.parentId === b.parentId) return true

  const aName = normalizeName(a.name).replace(/南门|北门|东门|西门|入口|出口/g, '')
  const bName = normalizeName(b.name).replace(/南门|北门|东门|西门|入口|出口/g, '')
  if (!aName || aName !== bName) return false
  return haversineDist(a.lat, a.lng, b.lat, b.lng) <= 120
}

export function allocateDistinctPois<T extends IdentityPoi>(
  candidatePools: T[][],
  requestedCounts: number[],
): { routes: T[][]; hadToRepeat: boolean } {
  const routes: T[][] = []
  const globallyUsed: T[] = []
  let hadToRepeat = false

  for (let routeIndex = 0; routeIndex < candidatePools.length; routeIndex++) {
    const pool = candidatePools[routeIndex]
    const count = requestedCounts[routeIndex] ?? 1
    const selected: T[] = []
    for (const candidate of pool) {
      if (selected.some(poi => samePoi(poi, candidate))) continue
      if (globallyUsed.some(poi => samePoi(poi, candidate))) continue
      selected.push(candidate)
      globallyUsed.push(candidate)
      if (selected.length >= count) break
    }
    if (selected.length < count) {
      for (const candidate of pool) {
        if (selected.some(poi => samePoi(poi, candidate))) continue
        selected.push(candidate)
        hadToRepeat = true
        if (selected.length >= count) break
      }
    }
    routes.push(selected)
  }
  return { routes, hadToRepeat }
}
