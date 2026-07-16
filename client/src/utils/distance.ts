export function formatMeters(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`
}

export function formatOriginDistance(distanceMeters?: number): string {
  return distanceMeters == null || !Number.isFinite(distanceMeters)
    ? '距离未知'
    : `距出发点${distanceMeters === 0 ? '' : '约'} ${formatMeters(distanceMeters)}`
}
