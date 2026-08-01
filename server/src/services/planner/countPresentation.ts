import type { Route } from '../../types/route.js'
import { syncFoodListPresentation } from './foodPresentation.js'

/** Synchronize every supported count phrase with the route's final stop array. */
export function syncCountPresentation(route: Route): Route {
  const count = route.stops.length
  const tagline = route.tagline
    .replace(/TOP\s*\d+/gi, `TOP${count}`)
    .replace(/\d+\s*个地点/g, `${count}个地点`)
    .replace(/共\s*\d+\s*家/g, `共 ${count} 家`)

  return syncFoodListPresentation({ ...route, tagline })
}
