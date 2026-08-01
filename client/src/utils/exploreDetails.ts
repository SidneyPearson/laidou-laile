import type { InspirationSpot, Persona } from '../types/explore'

const PERSONA_FIT: Record<Persona, string> = {
  fast: '它是内容密度较高的主目的地，适合围绕这里继续串联周边点位。',
  couple: '这里更适合留出拍照、散步和看夜景的时间，不必把行程排得太满。',
  family: '停留方式相对完整，便于控制折返和休息节奏，也容易安排亲子互动。',
  lazy: '可以把较长时间留在一个区域，减少频繁换乘和反复找下一站。',
  urban: '街区、文化内容或城市商业体验集中，适合做一条有主题感的半日线。',
}

export function whySpotFitsPersona(spot: InspirationSpot, persona: Persona): string {
  if (spot.suitablePersonas.includes(persona)) return PERSONA_FIT[persona]
  return `它不是当前画像的优先项，但“${spot.tags.slice(0, 2).join('、')}”仍可能值得你专程体验。`
}

export function departureReminder(spot: InspirationSpot): string {
  if (spot.reservationNote) return spot.reservationNote
  if (spot.verificationStatus !== 'verified') {
    return '这是本地演示内容，预约、营业和票务信息尚未实时校验。'
  }
  if (spot.category === 'theme_park') {
    return '门票、开园时间和演出项目可能调整，请出发前查看景区官方公告。'
  }
  if (spot.category === 'nature') {
    return '户外停留时间较长，请结合降雨、高温和日落时间安排出发。'
  }
  if (spot.theme === 'museum') {
    return '场馆可能实行预约或周一闭馆，请出发前查看官方开放公告。'
  }
  return '营业和临时管控可能变化，出发前建议通过官方渠道再次确认。'
}
