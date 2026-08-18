import { describe, expect, it } from 'vitest'
import homePage from './HomePage.vue?raw'
import homeHero from '../components/home/HomeHero.vue?raw'
import personaSelector from '../components/home/PersonaSelector.vue?raw'
import inspirationCarousel from '../components/home/InspirationCarousel.vue?raw'
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
    // Hero uses the registered cover asset, not a hard-coded /home-bg.jpg.
    expect(homeHero).toContain('homepageAssets.hero')
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
    // CTA uses existing city route.
    expect(homePage).toContain("name: 'explore'")
    // Browser geolocation keeps the user's actual position; manual city
    // selection falls back to the curated city's representative center.
    expect(homePage).toContain('const center = coords.value && !isMock.value')
    expect(homePage).toContain('lat: String(center.lat)')
    expect(homePage).toContain('lng: String(center.lng)')
  })

  it('keeps the mobile bottom nav with a highlighted plan FAB', () => {
    expect(homePage).toContain('<MobileBottomNav')
    expect(homePage).toContain('active="home"')
    expect(homePage).toContain("name: 'today-plan'")
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
    expect(homepageAssets).toContain('懒人躺平')
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
