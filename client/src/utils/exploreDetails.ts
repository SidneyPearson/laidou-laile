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

/** 统一的预约/票务/开放时间兜底提醒。后台未填或重复时都归一到这一句。 */
export const OFFICIAL_NOTICE = '预约、票务与开放时间请以运营方当天官方公告为准。'

function categoryReminder(spot: InspirationSpot): string | null {
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
  return null
}

/** 把文案归一化成可比较的形式：去掉标点/空白，便于识别“预约票务开放时间以官方为准”
 *  这类语义重复、只差几个字的提醒。 */
function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** 判断两条提醒是否语义重复：归一化后相同，或一条是另一条的子串（且有一定长度）。 */
function isDuplicate(a: string, b: string): boolean {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const minLen = 8
  return na.length >= minLen && nb.length >= minLen
    && (na.includes(nb) || nb.includes(na))
}

/** 收集「出发前提醒」：后台 reservationNote + 分类提醒，做空值过滤与去重。
 *  当后台文案本身就是“预约/票务/开放时间以官方公告为准”这类泛化提醒时，
 *  用统一文案 OFFICIAL_NOTICE 替代，避免和其他提醒形成近似重复。 */
export function departureReminders(spot: InspirationSpot): string[] {
  const candidates: string[] = []

  const rawNote = spot.reservationNote?.trim()
  if (rawNote) {
    // 后台填的若只是“以官方公告/营业信息为准”这类兜底句，统一成标准文案。
    const normalized = normalizeForCompare(rawNote)
    const looksGeneric = (normalized.includes('预约') || normalized.includes('票务') || normalized.includes('开放') || normalized.includes('营业'))
      && (normalized.includes('官方') || normalized.includes('公告') || normalized.includes('为准'))
      && normalized.length <= 30
    candidates.push(looksGeneric ? OFFICIAL_NOTICE : rawNote)
  }

  const categoryNote = categoryReminder(spot)
  if (categoryNote) candidates.push(categoryNote)

  if (candidates.length === 0) candidates.push(OFFICIAL_NOTICE)

  // 去重：保留首次出现的顺序，丢弃与已保留项语义重复的条目。
  const result: string[] = []
  for (const text of candidates) {
    const trimmed = text.trim()
    if (!trimmed) continue
    if (result.some(kept => isDuplicate(kept, trimmed))) continue
    result.push(trimmed)
  }
  return result
}

/** 单条文案（兼容旧调用方）：取去重后的第一条。 */
export function departureReminder(spot: InspirationSpot): string {
  return departureReminders(spot)[0] ?? OFFICIAL_NOTICE
}
