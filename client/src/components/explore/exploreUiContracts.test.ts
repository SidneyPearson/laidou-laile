import { describe, expect, it } from 'vitest'
import cityExplorePage from '../../pages/CityExplorePage.vue?raw'
import inspirationCard from './InspirationCard.vue?raw'
import spotCover from './SpotCover.vue?raw'
import spotDetailSheet from './SpotDetailSheet.vue?raw'
import homePage from '../../pages/HomePage.vue?raw'

describe('V0.4 city swipe-confirmation UI contracts', () => {
  it('resolves city context and recommendations through the real APIs', () => {
    expect(cityExplorePage).toContain('fetchCityContext')
    expect(cityExplorePage).toContain('fetchExploreRecommendations')
    expect(cityExplorePage).toContain('isRainy: weather.value?.isRainy')
  })

  it('keeps fallback content transparent instead of presenting it as verified', () => {
    expect(cityExplorePage).toContain('当前展示本地演示地点')
    expect(cityExplorePage).not.toContain('个高德已校验地点')
    expect(inspirationCard).toContain('演示数据')
  })

  it('passes coordinates to the city page without persisting them', () => {
    // The home page routes with the user's coordinates after geolocation and
    // uses the selected city's center for manual selection.
    expect(homePage).toContain('const center = coords.value && !isMock.value')
    expect(homePage).toContain("lat: String(center.lat)")
    expect(homePage).toContain("lng: String(center.lng)")
    expect(homePage).toContain("name: 'city'")
  })

  it('lets users accept or skip places via the swipe deck, adding accepted ones to today plan', () => {
    expect(cityExplorePage).toContain('todayPlan.addSpot')
    expect(cityExplorePage).toContain("swipe('add')")
    expect(cityExplorePage).toContain("swipe('skip')")
    expect(cityExplorePage).toContain('先确认今天想去的地方')
    expect(cityExplorePage).toContain('左右滑动卡片')
    // No anchored-route generation; no legacy detail-sheet flow on this page.
    expect(cityExplorePage).not.toContain('planAroundSpot')
    expect(cityExplorePage).not.toContain('useRouteRequest')
    expect(cityExplorePage).not.toContain('<SpotDetailSheet')
  })

  it('shows card imagery with a gradient fallback and persona-matched reasons', () => {
    expect(cityExplorePage).toContain('gradientOf')
    expect(cityExplorePage).toContain('为什么适合')
    expect(cityExplorePage).toContain('reason-box')
    expect(cityExplorePage).toContain('cardBackground')
    expect(spotCover).toContain('props.spot.coverImageFallbackUrl')
    expect(spotCover).toContain("@error=\"handleError\"")
  })

  it('finishes into a smart route panel and links to the today plan', () => {
    expect(cityExplorePage).toContain('智能路线规划')
    expect(cityExplorePage).toContain("name: 'today-plan'")
    expect(cityExplorePage).toContain('差不多了')
    expect(cityExplorePage).toContain('finishNow')
    // Unverified places cannot be accepted into the real plan.
    expect(spotDetailSheet).toContain('暂不能导航或加入今天')
  })
})
