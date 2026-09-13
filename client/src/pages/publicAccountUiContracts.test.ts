import { describe, expect, it } from 'vitest'
import app from '../App.vue?raw'
import router from '../router/index.ts?raw'
import favoritesPage from './FavoritesPage.vue?raw'
import mePage from './MePage.vue?raw'
import detailSheet from '../components/explore/SpotDetailSheet.vue?raw'
import citySwipePage from './CityExplorePage.vue?raw'
import navigationSheet from '../components/AmapNavigationSheet.vue?raw'
import amapNavigation from '../utils/amapNavigation.ts?raw'

describe('收藏与我的页面 UI contracts', () => {
  it('uses real lazy routes and keeps navigation in the persistent app shell', () => {
    expect(router).toContain("path: '/favorites'")
    expect(router).toContain("path: '/me'")
    expect(router).toContain("path: '/visited'")
    expect(router).toContain("path: '/tickets'")
    expect(mePage).toContain("name: 'visited-cities'")
    expect(mePage).toContain("name: 'my-tickets'")
    expect(app).toContain("router.replace({ name: 'favorites' })")
    expect(app).toContain("router.replace({ name: 'me' })")
    expect(app).not.toContain('router.push(')
    expect(app).toContain('<MobileBottomNav')
    expect(app).toContain("'app-shell--public': isPublicRoute")
    expect(app).toContain("'app-shell-content': isPublicRoute")
    expect(app).toContain('position: fixed')
    expect(app).toContain('overflow-y: auto')
    expect(favoritesPage).not.toContain('<MobileBottomNav')
    expect(mePage).not.toContain('<MobileBottomNav')
    expect(app).not.toContain('收藏功能建设中')
  })

  it('coordinates cross-city favorites with the existing city plan and journey state', () => {
    expect(favoritesPage).toContain('pendingCrossCity')
    expect(favoritesPage).toContain('setExploreCity')
    expect(favoritesPage).toContain('todayPlan.setActiveCity')
    expect(favoritesPage).not.toContain('journey.reset()')
    expect(favoritesPage).toContain('TODAY_PLAN_LIMIT')
  })

  it('keeps favorite controls out of the swipe-only city deck', () => {
    expect(detailSheet).toContain("'toggle-favorite'")
    expect(detailSheet).toContain('aria-pressed="inFavorites"')
    expect(citySwipePage).not.toContain('useFavorites')
  })

  it('provides separate destructive confirmations in the local profile panel', () => {
    expect(mePage).toContain("type ClearTarget = 'favorites' | 'plan' | 'persona'")
    expect(mePage).toContain('其他城市已经保存的计划仍然保留')
    expect(mePage).toContain('resetPersona()')
    expect(mePage).toContain('role="alertdialog"')
  })

  it('presents persona as a compact identity with an accessible switcher', () => {
    expect(mePage).toContain('还没决定今天怎么玩')
    expect(mePage).toContain('class="persona-layout"')
    expect(mePage).toContain('fetchHomePersonas(controller.signal)')
    expect(mePage).toContain('currentPersonaCard.imageUrl')
    expect(mePage).toContain('v-for="item in personaCards"')
    expect(mePage).toContain('class="persona-portrait"')
    expect(mePage).toContain('grid-template-columns:132px minmax(0,1fr)')
    expect(mePage).toContain('grid-template-columns:repeat(2,minmax(0,1fr))')
    expect(mePage).toContain('object-fit:contain')
    expect(mePage).not.toContain('persona-visual-backdrop')
    expect(mePage).toContain('role="group"')
    expect(mePage).toContain('aria-pressed="hasChosenPersona && persona === item.id"')
    expect(mePage).toContain('min-height:44px')
    expect(mePage).toContain('@media (prefers-reduced-motion:reduce)')
    expect(mePage).not.toContain('currentPersona.emoji')
    expect(mePage).not.toContain('item.emoji')
    expect(mePage).not.toContain('persona-hero-emoji')
    expect(mePage).not.toContain('活跃中')
    expect(mePage).not.toContain('role="listbox"')
    expect(mePage).not.toContain('画像只影响探索页筛选')
    // 后台画像返回前只显示四格固定骨架，不把本地旧标签短暂画出来。
    expect(mePage).toContain('const personaCards = ref<HomePersonaCard[]>([])')
    expect(mePage).toContain('v-if="!personasLoaded"')
    expect(mePage).toContain('v-for="index in 4"')
    expect(mePage).toContain('aria-busy="true"')
    expect(mePage).not.toContain('defaultHomePersonaCards()')
  })

  it('keeps the profile city label free of decorative location icons', () => {
    expect(mePage).toContain('<CityLocationButton')
    expect(mePage).toContain(':city-name="profileCityLabel"')
    expect(mePage).toContain('@click="openLocationSheet"')
    expect(mePage).toContain('<LocationSheet')
    expect(mePage).toContain('<CityPicker')
    expect(mePage).toContain('requestLocation(false)')
    expect(mePage).toContain('plan.setActiveCity')
    expect(mePage).not.toContain("router.replace({ name: 'home' })")
    expect(mePage).not.toContain('⌖ {{ cityLabel }}')
    expect(mePage).toContain('grid-template-columns:auto minmax(0,1fr) auto')
    expect(mePage).not.toContain('.city-pill { position:absolute')
  })

  it('reserves safe space above the persistent bottom nav', () => {
    expect(favoritesPage).toContain('calc(112px + env(safe-area-inset-bottom))')
    expect(mePage).toContain('calc(112px + env(safe-area-inset-bottom))')
  })

  it('offers web-first navigation while preserving an explicit native AMap option', () => {
    expect(app).toContain('<AmapNavigationSheet')
    expect(navigationSheet).toContain('网页导航')
    expect(navigationSheet).toContain('打开高德 App')
    expect(navigationSheet).toContain('target="_blank"')
    expect(navigationSheet).toContain('env(safe-area-inset-bottom)')
    expect(navigationSheet).toContain('touch-action: manipulation')
    expect(amapNavigation).toContain('callnative: 0 | 1 = 0')
  })
})
