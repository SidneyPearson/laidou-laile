import { describe, expect, it } from 'vitest'
import cityExplorePage from '../../pages/CityExplorePage.vue?raw'
import inspirationCard from './InspirationCard.vue?raw'
import spotCover from './SpotCover.vue?raw'
import spotDetailSheet from './SpotDetailSheet.vue?raw'
import homePage from '../../pages/HomePage.vue?raw'

describe('V0.3 city exploration UI contracts', () => {
  it('resolves city context and recommendations through the new APIs', () => {
    expect(cityExplorePage).toContain('fetchCityContext')
    expect(cityExplorePage).toContain('fetchExploreRecommendations')
    expect(cityExplorePage).toContain('isRainy: weather.value?.isRainy')
  })

  it('keeps fallback content transparent instead of presenting it as verified', () => {
    expect(cityExplorePage).toContain('不会冒充实时推荐')
    expect(inspirationCard).not.toContain('高德已校验')
    expect(inspirationCard).toContain('演示数据')
    expect(cityExplorePage).not.toContain('个高德已校验地点')
    expect(cityExplorePage).toContain('个推荐地点')
  })

  it('passes coordinates to the city page without persisting them', () => {
    // The home page routes to the city page with the selected city's coordinates.
    expect(homePage).toContain("lat: String(city.center.lat)")
    expect(homePage).toContain("lng: String(city.center.lng)")
    expect(homePage).toContain("name: 'city'")
  })

  it('lets users navigate or curate verified places without generating an anchored route', () => {
    expect(cityExplorePage).toContain('selectedActionReady')
    expect(cityExplorePage).toContain('todayPlan.addSpot')
    expect(cityExplorePage).toContain('openAmapNavigation')
    expect(cityExplorePage).toContain('<SpotDetailSheet')
    expect(cityExplorePage).not.toContain('planAroundSpot')
    expect(cityExplorePage).not.toContain('useRouteRequest')
    expect(spotDetailSheet).toContain('暂不能导航或加入今天')
  })

  it('shows safe POI imagery with a gradient fallback and useful place details', () => {
    expect(inspirationCard).toContain('<SpotCover')
    expect(inspirationCard).toContain('class="relative h-[150px] overflow-hidden"')
    expect(inspirationCard).not.toContain('class="relative min-h-[150px] overflow-hidden"')
    expect(spotCover).toContain('props.spot.coverImageFallbackUrl')
    expect(spotCover).toContain("@error=\"handleError\"")
    expect(inspirationCard).not.toContain('官方来源')
    expect(inspirationCard).not.toContain('高德地点图')
    expect(spotDetailSheet).not.toContain('图片来源：')
    expect(spotDetailSheet).not.toContain('地点图片来自高德 POI 数据')
    expect(spotDetailSheet).toContain('为什么适合')
    expect(spotDetailSheet).toContain('预约、票务与营业信息以当天官方公告为准')
  })

  it('shows a private floating entry after the user adds a place', () => {
    expect(cityExplorePage).toContain('<TodayPlanFloatingBar')
    expect(cityExplorePage).toContain("name: 'today-plan'")
    expect(cityExplorePage).toContain('todayPlan.count.value > 0')
  })
})
