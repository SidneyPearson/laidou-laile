import { describe, expect, it } from 'vitest'
import homePage from './HomePage.vue?raw'
import app from '../App.vue?raw'
import homeHero from '../components/home/HomeHero.vue?raw'
import cityLocationButton from '../components/home/CityLocationButton.vue?raw'
import personaSelector from '../components/home/PersonaSelector.vue?raw'
import slideToStart from '../components/home/SlideToStart.vue?raw'
import inspirationCarousel from '../components/home/InspirationCarousel.vue?raw'
import mobileBottomNav from '../components/home/MobileBottomNav.vue?raw'
import homepageAssets from '../assets/homepage/index.ts?raw'

describe('HomePage immersive redesign contracts', () => {
  it('renders the immersive hero with big title and city accent', () => {
    expect(homePage).toContain('<HomeHero')
    expect(homeHero).toContain('去哪儿探索')
    expect(homeHero).toContain('cityName')
    // City picker is still reachable via a city-switch affordance.
    expect(homePage).toContain('showPicker')
    // Hero uses a fixed min-height (not 100vh) so it doesn't dominate small screens.
    expect(homeHero).toContain('min-height: 480px')
    expect(homeHero).toContain('min-height: 390px')
    // Hero uses the registered cover asset, not a hard-coded /home-bg.jpg.
    expect(homeHero).toContain('cityHeroImage(props.city?.name)')
    // Keep the cover at its natural cover scale; only a very subtle zoom is
    // allowed so narrow WeChat viewports retain more of the skyline.
    expect(homeHero).toContain('from { transform: scale(1); }')
    expect(homeHero).toContain('to { transform: scale(1.025); }')
  })

  it('keeps the three top controls dimensionally stable while async weather loads', () => {
    expect(homeHero).toContain('grid-template-columns: 78px 96px')
    expect(homeHero).toContain('width: 180px')
    expect(homeHero).toContain('<CityLocationButton')
    expect(cityLocationButton).toContain('text-overflow:ellipsis')
    expect(cityLocationButton).toContain('box-sizing:border-box')
  })

  it('keeps three- and four-character city names readable without resizing the top bar', () => {
    expect(cityLocationButton).toContain('max-width:4em')
    expect(cityLocationButton).toContain('font-size:11px')
    expect(homeHero).toContain('grid-template-columns: 72px 90px')
  })

  it('keeps a symmetric end gap after the last persona card', () => {
    expect(personaSelector).toContain('scroll-padding-inline: 14px')
    expect(personaSelector).toContain('.persona-track::after')
    expect(personaSelector).toContain('flex: 0 0 14px')
  })

  it('automatically reveals the selected persona without changing editorial order', () => {
    expect(personaSelector).toContain('ref="scrollViewport"')
    expect(personaSelector).toContain('alignSelectedCard')
    expect(personaSelector).toContain('viewport.scrollTo')
    expect(personaSelector).toContain("hasAlignedSelection ? 'smooth' : 'auto'")
  })

  it('wires persona selection through the shared composable', () => {
    expect(homePage).toContain('usePersona')
    expect(homePage).toContain('<PersonaSelector')
    expect(homePage).toContain('setPersona')
  })

  it('renders inspiration rail and route planner entry', () => {
    expect(homePage).toContain('<InspirationCarousel')
    expect(homePage).toContain('<RoutePlannerCard')
    expect(homePage).toContain('fetchExploreRecommendations')
    // Inspiration rail uses the new cards prop (not raw spots).
    expect(homePage).toContain(':cards="inspirationCards"')
    // Cards come straight from the admin spot library (spot.name / spot.reason /
    // coverImageUrl / distanceMeters), not from hard-coded seed cards.
    expect(homePage).toContain('spot.coverImageUrl')
    expect(homePage).toContain('distanceMeters')
    // The persistent app shell owns the public bottom navigation routes.
    expect(app).toContain("router.replace({ name: 'explore' })")
    // Browser geolocation keeps the user's actual position; manual city
    // selection falls back to the curated city's representative center.
    expect(homePage).toContain('const center = coords.value && !isMock.value')
    expect(homePage).toContain('lat: String(center.lat)')
    expect(homePage).toContain('lng: String(center.lng)')
  })

  it('keeps homepage inspiration in editorial priority order instead of persona order', () => {
    expect(homePage).not.toContain('filterAndRankSpots')
    expect(homePage).not.toContain("{ persona: persona.value }")
    expect(homePage).not.toContain('watch(persona')
    expect(homePage).toContain('isRainy: false')
    expect(homePage).toContain('haversineDist')
  })

  it('keeps the mobile bottom nav with a highlighted plan FAB', () => {
    expect(homePage).not.toContain('<MobileBottomNav')
    expect(app).toContain('<MobileBottomNav')
    expect(app).toContain("router.replace({ name: 'today-plan' })")
  })

  it('portals fixed overlays above the persistent App Shell navigation', () => {
    expect(homePage).toContain('<Teleport to="body">')
    expect(homePage).toContain('v-if="confirmReset"')
    expect(homePage).toContain('v-if="showCityConfirm"')
    expect(homePage).toContain('<LocationSheet')
  })

  it('allows one deliberate WeChat swipe to trigger a fresh recommendation', () => {
    expect(slideToStart).toContain('const TRIGGER_RATIO = 0.64')
    expect(slideToStart).toContain('dragging.value && pastThreshold()')
    expect(slideToStart).toContain('@lostpointercapture="onLostPointerCapture"')
  })

  it('does not lose the first touch on fresh-start confirmation actions', () => {
    expect(homePage).toContain('@touchend="cancelFreshStartOnTouch"')
    expect(homePage).toContain('@touchend="proceedFreshStartOnTouch"')
    expect(homePage).toContain('event.preventDefault()')
    expect(homePage).toContain('transition: transform 0.18s')
    expect(homePage).toContain('touch-action: manipulation')
  })

  it('prevents the persistent nav from exposing a bottom gap during WeChat overscroll', () => {
    expect(mobileBottomNav).toContain('.bottom-nav::after')
    expect(mobileBottomNav).toContain('height: max(120px, env(safe-area-inset-bottom))')
  })

  it('uses the dark immersive palette scoped to the page (no global dark mode)', () => {
    // Tokens match the high-fidelity prototype (docs/design/index.html).
    expect(homePage).toContain('--page-bg: #02070e')
    expect(homePage).toContain('--accent: #c7ff1f')
    expect(homePage).toContain('max-width: 480px')
  })

  it('wires real persona images and the requested copy overrides', () => {
    // Persona cards render the configured image (repository resolves null to
    // bundled artwork via personaImage); per-persona gradient is only a
    // fallback when the image fails to load.
    expect(personaSelector).toContain('card.imageUrl')
    expect(personaSelector).toContain('object-fit: cover')
    expect(personaSelector).toContain('PERSONA_FALLBACK')
    // Copy overrides for the four image-backed personas live in the asset
    // registry (the repository consumes them via personaCardCopy).
    expect(homepageAssets).toContain('情侣约会')
    expect(homepageAssets).toContain('浪漫 · 夜景 · 出片')
    expect(homepageAssets).toContain('亲子玩乐')
    expect(homepageAssets).toContain('特种兵式')
    expect(homepageAssets).toContain("title: '自由'")
    // Persona/hero artwork is bundled locally (no external image CDN).
    expect(homepageAssets).not.toContain('images.unsplash.com')
  })

  it('renders recommendation cards with images and graceful fallback', () => {
    expect(inspirationCarousel).toContain('object-fit: cover')
    expect(inspirationCarousel).toContain('loading="lazy"')
    // Every card is backed by an image (no grey placeholder block).
    expect(inspirationCarousel).toContain('card.image')
  })

  it('exposes the first-visit location bottom sheet', () => {
    expect(homePage).toContain('<LocationSheet')
    expect(homePage).toContain('showLocationSheet')
  })
})
