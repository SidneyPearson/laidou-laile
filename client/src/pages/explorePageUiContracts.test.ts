import { describe, expect, it } from 'vitest'
import explorePage from './ExplorePage.vue?raw'
import exploreMap from '../components/explore/ExploreSpotMap.vue?raw'
import router from '../router/index.ts?raw'
import homePage from './HomePage.vue?raw'
import app from '../App.vue?raw'
import cityPicker from '../components/CityPicker.vue?raw'

describe('ExplorePage browse experience contracts', () => {
  it('uses a dedicated explore route without replacing the swipe flow', () => {
    expect(router).toContain("path: '/explore'")
    expect(router).toContain("path: '/city', name: 'city-explore'")
    expect(router).toContain("import('../pages/CityExplorePage.vue')")
    expect(app).toContain("router.replace({ name: 'explore' })")
    expect(homePage).toContain("name: 'city-explore'")
  })

  it('requires an explicit or remembered city instead of defaulting to Shanghai', () => {
    expect(explorePage).toContain('先选择想探索的城市')
    expect(explorePage).toContain('<CityPicker')
    expect(explorePage).toContain('restoreLegacyRecentCity')
    expect(explorePage).not.toContain("name: '上海'")
  })

  it('supports search, category filtering, complete pagination, and map view', () => {
    expect(explorePage).toContain('搜索地点、街区或体验')
    expect(explorePage).toContain('EXPLORE_CATEGORIES')
    expect(explorePage).toContain('while (cursor !== null')
    expect(explorePage).toContain('<ExploreSpotMap')
    expect(exploreMap).toContain("marker.on('click'")
    expect(exploreMap).toContain('layoutMarkerOffsets')
  })

  it('keeps public search inputs at 16px to prevent iOS WeChat auto-zoom', () => {
    expect(cityPicker).toContain('.city-picker-search input')
    expect(cityPicker).toContain('font-size: 16px')
    expect(explorePage).toContain('.search-box input')
    expect(explorePage).toContain('font-size:16px')
  })

  it('opens real details and lets verified spots join today directly', () => {
    expect(explorePage).toContain('<SpotDetailSheet')
    expect(explorePage).toContain('todayPlan.addSpot')
    expect(explorePage).toContain('todayPlan.removeSpot')
    expect(explorePage).toContain('加入今日计划')
  })

  it('confirms before switching today plan and journey progress when switching cities', () => {
    expect(explorePage).toContain('useTodayJourney')
    expect(explorePage).toContain('pendingCity')
    expect(explorePage).toContain('继续切换')
    // 各城市计划按分桶保留：切换城市是切桶而不是清空。
    expect(explorePage).toContain('todayPlan.setActiveCity(')
    expect(explorePage).not.toContain('todayJourney.reset()')
  })
})
