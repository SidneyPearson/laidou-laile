import { describe, expect, it } from 'vitest'
import loadingOverlay from './LoadingOverlay.vue?raw'
import cityPicker from './CityPicker.vue?raw'
import routePage from '../pages/RoutePage.vue?raw'
import historyPage from '../pages/HistoryPage.vue?raw'
import dayTripStop from './DayTripStop.vue?raw'

describe('loading and accessibility UI contracts', () => {
  it('offers cancellation immediately and slow-wait choices after 15 seconds', () => {
    expect(loadingOverlay).toContain('取消生成')
    expect(loadingOverlay).toContain('elapsedSeconds.value >= 15')
    expect(loadingOverlay).toContain('继续等待')
    expect(loadingOverlay).toContain('AI仍在规划')
    expect(loadingOverlay).not.toContain('{{ progressWidth }}')
  })

  it('gives every requested back icon an accessible name', () => {
    expect(cityPicker).toContain('aria-label="返回"')
    expect(routePage).toContain('aria-label="返回"')
    expect(historyPage).toContain('aria-label="返回"')
  })

  it('labels destructive and expandable day-trip controls', () => {
    expect(dayTripStop).toContain(':aria-label="`移除${stop.name}`"')
    expect(dayTripStop).toContain(':aria-label="`${expanded ? \'收起\' : \'展开\'}${stop.name}详情`"')
    expect(dayTripStop).toContain(':aria-label="`替换${stop.name}`"')
  })
})
