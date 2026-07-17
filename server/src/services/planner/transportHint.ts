const WATER_ACCESS_RE = /岛|洲|湖心|潭塔|小瀛洲/

export function buildTransportHint(
  explorationDistance: number,
  estimatedRouteDistance: number,
  stops: Array<{ name: string }>,
): string {
  const waterWarning = stops.some(stop => WATER_ACCESS_RE.test(stop.name))
    ? '部分地点可能需要乘船或其他交通，请出发前确认。'
    : ''

  let base: string
  if (explorationDistance > 0 && explorationDistance <= 500) {
    base = '范围较小，建议全程步行。'
  } else if (explorationDistance > 0 && explorationDistance <= 1000) {
    base = estimatedRouteDistance <= 1800 ? '优先步行，按体力灵活调整。' : '可步行，较远路段再考虑骑行。'
  } else if (explorationDistance >= 3000 || estimatedRouteDistance >= 2500) {
    base = '距离较长，可步行与共享单车结合；请以现场可骑行条件为准。'
  } else {
    base = '以步行为主，请按实际路况调整。'
  }
  return `${base}${waterWarning}`
}

export function replaceUnsupportedTransportClaim(tips: string, hint: string): string {
  let cleaned = tips
    .replace(/可步行\+共享单车结合[。；;]?/g, '')
    .replace(/步行\+共享单车[。；;]?/g, '')
    .trim()
  if (!hint.includes('共享单车')) {
    cleaned = cleaned.replace(/[^。！？]*共享单车[^。！？]*[。！？]?/g, '').trim()
  }
  return [cleaned, hint].filter(Boolean).join(' ')
}
