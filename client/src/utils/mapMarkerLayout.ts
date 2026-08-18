import { haversineDist } from './geo'

export interface MarkerPoint {
  id: string
  lng?: number
  lat?: number
}

export interface MarkerOffset {
  x: number
  y: number
}

/** Spread geographically close markers around their real point in screen
 *  pixels. This keeps dense downtown POIs individually tappable while the map
 *  is zoomed out to fit a whole city. */
export function layoutMarkerOffsets(
  points: MarkerPoint[],
  collisionMeters = 2_500,
): Map<string, MarkerOffset> {
  const valid = points.filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat))
  const offsets = new Map<string, MarkerOffset>()
  const visited = new Set<number>()

  for (let start = 0; start < valid.length; start += 1) {
    if (visited.has(start)) continue
    const component: number[] = []
    const queue = [start]
    visited.add(start)

    while (queue.length) {
      const current = queue.shift() as number
      component.push(current)
      for (let candidate = 0; candidate < valid.length; candidate += 1) {
        if (visited.has(candidate)) continue
        const distance = haversineDist(
          valid[current].lat as number,
          valid[current].lng as number,
          valid[candidate].lat as number,
          valid[candidate].lng as number,
        )
        if (distance <= collisionMeters) {
          visited.add(candidate)
          queue.push(candidate)
        }
      }
    }

    if (component.length === 1) {
      offsets.set(valid[component[0]].id, { x: 0, y: 0 })
      continue
    }

    const radius = component.length <= 4 ? 34 : Math.max(48, component.length * 8)
    component.forEach((pointIndex, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / component.length
      offsets.set(valid[pointIndex].id, {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius),
      })
    })
  }

  return offsets
}
