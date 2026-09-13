import { durationMinutesOf } from '../composables/useTodayPlan'
import type { InspirationSpot, Persona } from '../types/explore'

export function planStayPreview(selected: InspirationSpot[], candidate: InspirationSpot | undefined, persona: Persona): string {
  const adding = candidate && !selected.some(spot => spot.id === candidate.id)
  const projected = adding ? [...selected, candidate] : selected
  if (!projected.length) return '先选一站，给今天留点余地'
  const minutes = projected.reduce((sum, spot) => sum + durationMinutesOf(spot.suggestedDuration), 0)
  const missing = projected.some(spot => durationMinutesOf(spot.suggestedDuration) === 0)
  if (!minutes) return '停留时长待补充，请给交通和休息留出时间。'
  const hours = Math.round(minutes / 6) / 10
  const label = `${adding ? '加入这站后' : '已选地点'}约 ${hours} 小时${missing ? '，部分时长待补充' : ''}（不含交通）`
  const threshold = persona === 'lazy' || persona === 'family' ? 360 : 480
  return minutes >= threshold
    ? `${label}，建议少选一站，留出休息时间。`
    : label
}
