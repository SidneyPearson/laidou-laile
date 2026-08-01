import { describe, expect, it } from 'vitest'
import todayPlanPage from '../../pages/TodayPlanPage.vue?raw'
import todayPlanMap from './TodayPlanMap.vue?raw'
import todaySpotCard from './TodaySpotCard.vue?raw'
import spotDetailSheet from '../explore/SpotDetailSheet.vue?raw'

describe('user-curated today plan UI contracts', () => {
  it('uses explicit navigation and local-list actions in place details', () => {
    expect(spotDetailSheet).toContain('就去这里')
    expect(spotDetailSheet).toContain('加入今天')
    expect(spotDetailSheet).toContain('已加入今天')
    expect(spotDetailSheet).not.toContain('围绕这里生成路线')
    expect(spotDetailSheet).not.toContain('2小时')
    expect(spotDetailSheet).toContain('暂不能导航或加入今天')
  })

  it('only maps user-selected places and gates dashed reference connections', () => {
    expect(todayPlanMap).toContain('props.spots.map')
    expect(todayPlanMap).toContain('props.connected && props.spots.length >= 2')
    expect(todayPlanMap).toContain("strokeStyle: 'dashed'")
    expect(todayPlanMap).toContain('只显示你加入的地点')
    expect(todayPlanMap).toContain('参考顺序')
    expect(todayPlanMap).not.toContain('searchNearby')
  })

  it('supports manual controls, navigation, advice, and restoring order', () => {
    expect(todaySpotCard).toContain('上移')
    expect(todaySpotCard).toContain('下移')
    expect(todaySpotCard).toContain('删除')
    expect(todaySpotCard).toContain('打开高德导航')
    expect(todayPlanPage).toContain('帮我顺一下')
    expect(todayPlanPage).toContain('采用建议')
    expect(todayPlanPage).toContain('保留当前顺序')
    expect(todayPlanPage).toContain('恢复原顺序')
    expect(todayPlanPage).toContain('validSuggestedOrder')
    expect(todayPlanPage).toContain('只包含你主动加入的地点')
  })
})
