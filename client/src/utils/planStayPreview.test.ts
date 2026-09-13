import { describe, expect, it } from 'vitest'
import { planStayPreview } from './planStayPreview'
import { personaLabel } from './personaLabels'
import { cityHeroImage } from '../assets/homepage/cityHeroes'
import type { InspirationSpot } from '../types/explore'

const spot = (id: string, suggestedDuration: string) => ({ id, suggestedDuration } as InspirationSpot)
describe('mobile trip consistency', () => {
  it('warns before adding a second half-day visit in relaxed mode', () => {
    expect(planStayPreview([spot('lake', '建议半天')], spot('wetland', '建议半天'), 'lazy'))
      .toContain('加入这站后约 8 小时（不含交通），建议少选一站')
  })
  it('does not double count an already selected place', () => {
    const lake = spot('lake', '建议半天')
    expect(planStayPreview([lake], lake, 'lazy')).toBe('已选地点约 4 小时（不含交通）')
  })
  it('keeps incomplete duration explicit instead of presenting a complete total', () => {
    expect(planStayPreview([spot('lake', '建议半天')], spot('unknown', ''), 'fast')).toContain('部分时长待补充')
  })
  it('shows historical persona aliases consistently without changing unknown editor labels', () => {
    expect(personaLabel('懒人')).toBe('自由')
    expect(personaLabel('都市丽人')).toBe('精致')
    expect(personaLabel('自定义体验')).toBe('自定义体验')
  })
  it('never shows another city hero for a missing city', () => {
    expect(cityHeroImage('杭州市')).toBe('/city-heroes/hangzhou-20260911.webp')
    expect(cityHeroImage('成都')).not.toBe(cityHeroImage('上海'))
    expect(cityHeroImage('未收录城市')).toBeUndefined()
    expect(cityHeroImage(null)).toBeUndefined()
  })
})
