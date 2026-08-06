<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import HomeHero from '../components/home/HomeHero.vue'
import PersonaSelector from '../components/home/PersonaSelector.vue'
import SlideToStart from '../components/home/SlideToStart.vue'
import InspirationCarousel, {
  type InspirationCard,
} from '../components/home/InspirationCarousel.vue'
import RoutePlannerCard from '../components/home/RoutePlannerCard.vue'
import MobileBottomNav, { type BottomTab } from '../components/home/MobileBottomNav.vue'
import LocationSheet from '../components/home/LocationSheet.vue'
import CityPicker from '../components/CityPicker.vue'
import SpotDetailSheet from '../components/explore/SpotDetailSheet.vue'
import {
  loadCityRecommendations,
  type RecommendationCity,
} from '../repositories/cityRecommendations'
import {
  fetchCityContext,
  fetchExploreRecommendations,
  type CityContextResponse,
} from '../services/exploreApi'
import { ApiRequestError } from '../services/api'
import { PERSONAS, EXPLORE_CATEGORIES, getExploreSpots, filterAndRankSpots } from '../data/mockExploreSpots'
import { usePersona } from '../composables/usePersona'
import { useTodayPlan } from '../composables/useTodayPlan'
import { useGeolocation } from '../composables/useGeolocation'
import { openAmapNavigation } from '../utils/amapNavigation'
import {
  defaultHomePersonaCards,
  fetchHomePersonas,
  type HomePersonaCard,
} from '../repositories/homePersonas'
import type { InspirationSpot, Persona } from '../types/explore'

const router = useRouter()
const { persona, setPersona } = usePersona()
const todayPlan = useTodayPlan()
const { coords, isMock, loading: locating, error: locError, requestLocation, setManualLocation } = useGeolocation()

const cities = ref<RecommendationCity[]>([])
const selectedCity = ref<RecommendationCity | null>(null)
const personaCards = ref<HomePersonaCard[]>(defaultHomePersonaCards())
const showPicker = ref(false)
const showLocationSheet = ref(false)
const weather = ref<CityContextResponse['weather']>(null)
const weatherLoading = ref(false)

const spots = ref<InspirationSpot[]>([])
const spotsLoading = ref(true)
const selectedSpot = ref<InspirationSpot | null>(null)

let weatherController: AbortController | null = null
let spotsController: AbortController | null = null
let spotsRequestId = 0

const currentPersonaOption = () =>
  PERSONAS.find(p => p.id === persona.value) ?? PERSONAS[0]

/* -------------------- inspiration cards -------------------- */

/** Category pill label + accent colour for each H5 category. Content comes
 *  straight from the admin spot library; the pill just reuses the explore
 *  category names so it stays consistent with the city page. */
const CATEGORY_META: Partial<Record<Exclude<InspirationSpot['category'], 'all'>, { tone: 'lime' | 'violet' | 'orange' | 'sky' }>> = {
  landmark: { tone: 'lime' },
  district: { tone: 'violet' },
  street: { tone: 'orange' },
  nature: { tone: 'lime' },
  museum: { tone: 'sky' },
  mall: { tone: 'sky' },
  food: { tone: 'orange' },
  theme_park: { tone: 'violet' },
}

const categoryLabel = (category: InspirationSpot['category']): string =>
  EXPLORE_CATEGORIES.find(c => c.id === category)?.name ?? '灵感推荐'

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`
  return `${Math.round(meters)}m`
}

/** Cards are built directly from the admin spot library: each card shows the
 *  spot's own cover, category, `reason` copy and district. Distance is shown
 *  only when the server returned it (i.e. the user authorized real
 *  geolocation); otherwise the card just shows the district. */
const inspirationCards = computed<InspirationCard[]>(() =>
  spots.value.slice(0, 6).map((spot) => {
    const hasDistance = Number.isFinite(spot.distanceMeters)
    return {
      key: spot.id,
      title: spot.name,
      tag: categoryLabel(spot.category),
      tagline: spot.reason,
      district: spot.district,
      distanceLabel: hasDistance ? formatDistance(spot.distanceMeters as number) : '',
      image: spot.coverImageUrl ?? '',
      theme: spot.theme,
      tone: CATEGORY_META[spot.category]?.tone ?? 'lime',
      verified: spot.verificationStatus === 'verified' && spot.source === 'amap_verified' && !spot.mock,
    }
  }),
)

/** When a card is clicked, open the existing SpotDetailSheet if the card
 *  maps to a verified server spot; otherwise route into the city page. */
const cardSpotByKey = computed(() => {
  const map = new Map<string, InspirationSpot>()
  for (const spot of spots.value) map.set(spot.id, spot)
  return map
})

function handleCardSelect(card: InspirationCard) {
  const spot = cardSpotByKey.value.get(card.key)
  if (spot && card.verified) {
    selectedSpot.value = spot
    return
  }
  // Demo / unverified card → jump into the city exploration page.
  handleStart()
}

const selectedActionReady = (spot: InspirationSpot | null) =>
  !!spot
  && spot.verificationStatus === 'verified'
  && spot.source === 'amap_verified'
  && spot.mock === false
  && !!spot.amapPoiId
  && Number.isFinite(spot.lat)
  && Number.isFinite(spot.lng)

const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 2200)
}

/* -------------------- data loading -------------------- */

function localFallback(cityName: string): InspirationSpot[] {
  const normalized = cityName.trim().replace(/市$/, '')
  return filterAndRankSpots(
    getExploreSpots(normalized),
    persona.value,
    'all',
  ).map(spot => ({ ...spot, verificationStatus: 'demo', source: 'local_demo' }))
}

async function loadWeatherAndSpots() {
  const city = selectedCity.value
  if (!city?.center) {
    spots.value = []
    spotsLoading.value = false
    return
  }

  weatherController?.abort()
  weatherController = new AbortController()
  weatherLoading.value = true
  fetchCityContext(city.center.lat, city.center.lng, weatherController.signal)
    .then((ctx) => {
      if (selectedCity.value?.adcode === city.adcode) {
        weather.value = ctx.weather
      }
    })
    .catch((err) => {
      if (!(err instanceof ApiRequestError) || err.code !== 'CANCELLED') {
        weather.value = null
      }
    })
    .finally(() => {
      weatherLoading.value = false
    })

  await loadSpots()
}

/** Fetch recommendations for the current city + persona. Weather is independent
 *  of persona, so switching persona only calls this — it must not touch the
 *  weather pill (which would flash "加载中" and shift the top bar). */
async function loadSpots() {
  const city = selectedCity.value
  if (!city?.center) {
    spots.value = []
    spotsLoading.value = false
    return
  }

  const requestId = ++spotsRequestId
  spotsController?.abort()
  spotsController = new AbortController()
  spotsLoading.value = true
  try {
    // Send the user's real coordinates only after they authorized geolocation.
    // Mock/manually-picked coords are omitted: they'd just measure distance
    // from the city center, which adds nothing and skews ranking.
    const realLocation = coords.value && !isMock.value
      ? { lat: coords.value.lat, lng: coords.value.lng }
      : {}
    const result = await fetchExploreRecommendations({
      city: city.name.replace(/市$/, ''),
      adcode: city.adcode,
      persona: persona.value,
      category: 'all',
      // Server caps the page size at 6 (see exploreRoutes.schemas).
      limit: 6,
      isRainy: weather.value?.isRainy ?? false,
      ...realLocation,
    }, spotsController.signal)
    if (requestId !== spotsRequestId) return
    spots.value = result.spots
  } catch (err) {
    if (requestId !== spotsRequestId) return
    const reqErr = err instanceof ApiRequestError ? err : null
    if (reqErr?.code === 'CANCELLED') return
    spots.value = localFallback(city.name)
  } finally {
    if (requestId === spotsRequestId) spotsLoading.value = false
  }
}

/* -------------------- events -------------------- */

const FIRST_VISIT_KEY = 'laidou-home-loc-dismissed'

function openPicker() {
  showPicker.value = true
  showLocationSheet.value = false
}

async function handleUseLocation() {
  showLocationSheet.value = false
  await requestLocation(false)
  if (locError.value || !coords.value) {
    showToast(locError.value?.message ?? '定位失败，请手动选择城市')
    return
  }
  const center = { lat: coords.value.lat, lng: coords.value.lng }
  // Optimistically set a transient city; real name/adcode/cover resolved below.
  selectedCity.value = {
    adcode: '',
    name: '当前城市',
    province: '',
    coverImageUrl: null,
    center,
  }
  // Resolve actual city name + weather. If it matches a known recommended
  // city, upgrade to it so we get a cover image; otherwise keep the resolved
  // name and continue with recommendation API.
  try {
    const ctx = await fetchCityContext(center.lat, center.lng)
    const matched = cities.value.find(c => c.adcode === ctx.adcode)
    selectedCity.value = matched ?? {
      adcode: ctx.adcode,
      name: ctx.city,
      province: '',
      coverImageUrl: null,
      center,
    }
    weather.value = ctx.weather
  } catch {
    /* keep transient city, spots will fall back to local demo */
  }
  await loadWeatherAndSpots()
}

function handleManualCity() {
  showLocationSheet.value = false
  showPicker.value = true
}

function dismissLocationSheet() {
  showLocationSheet.value = false
  try {
    localStorage.setItem(FIRST_VISIT_KEY, '1')
  } catch {
    /* ignore */
  }
}

function handleCitySelect(city: RecommendationCity) {
  if (!city.center) return
  setManualLocation(city.center.lat, city.center.lng, city.name)
  selectedCity.value = city
  showPicker.value = false
  showLocationSheet.value = false
}

function handleStart() {
  const city = selectedCity.value
  if (!city?.center) {
    showPicker.value = true
    return
  }
  router.push({
    name: 'city',
    query: {
      city: city.name,
      lat: String(city.center.lat),
      lng: String(city.center.lng),
      source: 'manual',
      ...(city.adcode ? { adcode: city.adcode } : {}),
    },
  })
}

function handleSpotSelect(spot: InspirationSpot) {
  selectedSpot.value = selectedSpot.value?.id === spot.id ? null : spot
}

function navigateToSpot() {
  const spot = selectedSpot.value
  if (!spot || !selectedActionReady(spot)) return
  openAmapNavigation(spot.amapName || spot.name, spot.lng as number, spot.lat as number)
}

function toggleTodaySpot() {
  const spot = selectedSpot.value
  if (!spot || !selectedActionReady(spot)) return
  if (todayPlan.hasSpot(spot.id)) {
    todayPlan.removeSpot(spot.id)
    showToast(`已将“${spot.name}”移出今天`)
    return
  }
  const result = todayPlan.addSpot(spot)
  if (result.status === 'limit') {
    showToast('今天先选 6 个，避免行程过满')
    return
  }
  if (result.status !== 'added') {
    showToast('这个地点暂时不能加入真实安排')
    return
  }
  selectedSpot.value = null
  showToast(`已加入“${spot.name}”`)
}

function handleBottomNav(tab: BottomTab) {
  switch (tab) {
    case 'home':
      window.scrollTo({ top: 0, behavior: 'smooth' })
      break
    case 'explore':
      handleStart()
      break
    case 'plan':
      router.push({ name: 'today-plan' })
      break
    case 'favorites':
      showToast('收藏功能建设中')
      break
    case 'me':
      showToast('个人中心建设中')
      break
  }
}

/* -------------------- scroll reveal -------------------- */

let revealObserver: IntersectionObserver | null = null

function setupScrollReveal() {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return
  revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed')
        revealObserver?.unobserve(entry.target)
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })

  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    revealObserver?.observe(el)
  })
}

/* -------------------- lifecycle -------------------- */

onMounted(async () => {
  // Homepage persona cards are editor-configurable; fall back to built-in
  // defaults while loading so the first paint already shows all four cards.
  fetchHomePersonas().then((cards) => { personaCards.value = cards }).catch(() => {})

  const result = await loadCityRecommendations()
  cities.value = result.cities
  if (result.cities.length > 0) {
    selectedCity.value = result.cities[0]
    await loadWeatherAndSpots()
  } else {
    spotsLoading.value = false
  }

  // First-visit location sheet (only when the user has never dismissed it and
  // no city has been resolved yet).
  try {
    if (!localStorage.getItem(FIRST_VISIT_KEY)) {
      showLocationSheet.value = true
    }
  } catch {
    showLocationSheet.value = true
  }

  await nextTick()
  setupScrollReveal()
})

onBeforeUnmount(() => {
  revealObserver?.disconnect()
  revealObserver = null
})

// Switching persona refreshes recommendations only — weather depends on the
// city, not the persona, so it must not reload (that flashed "加载中" and
// shifted the weather pill on the top bar).
watch(persona, () => {
  void loadSpots()
})
</script>

<template>
  <main class="home-page">
    <HomeHero
      :city="selectedCity"
      :weather="weather"
      :weather-loading="weatherLoading"
      :locating="locating"
      @open-picker="openPicker"
      @use-location="handleUseLocation"
    />

    <!-- Floating persona + CTA panel overlaps the hero -->
    <section class="persona-panel-wrap" data-reveal>
      <div class="persona-panel">
        <h2 class="persona-panel-title">选择适合你今天的身份</h2>
        <PersonaSelector
          :model-value="persona"
          :cards="personaCards"
          @update:model-value="setPersona"
        />
        <SlideToStart
          class="start-slider"
          hint="向右滑动为你推荐"
          ready-hint="正在为你推荐…"
          :disabled="!selectedCity?.center"
          @unlock="handleStart"
        />
      </div>
    </section>

    <div class="home-content">
      <div data-reveal>
        <InspirationCarousel
          :cards="inspirationCards"
          :loading="spotsLoading"
          @select="handleCardSelect"
        />
      </div>

      <div class="mt-5" data-reveal>
        <RoutePlannerCard
          :count="todayPlan.count.value"
          @open="router.push({ name: 'today-plan' })"
        />
      </div>

      <p class="home-footer">来都来了，不能白来 · v0.4</p>
    </div>

    <Transition name="sheet">
      <div v-if="showPicker" class="sheet-mask" @click.self="showPicker = false">
        <div class="sheet-panel sheet-panel--light">
          <CityPicker
            @select="handleCitySelect"
            @cancel="showPicker = false"
          />
        </div>
      </div>
    </Transition>

    <Transition name="sheet">
      <SpotDetailSheet
        v-if="selectedSpot"
        :spot="selectedSpot"
        :persona="currentPersonaOption()"
        :action-ready="selectedActionReady(selectedSpot)"
        :in-today="todayPlan.hasSpot(selectedSpot.id)"
        @close="selectedSpot = null"
        @navigate="navigateToSpot"
        @toggle-today="toggleTodaySpot"
      />
    </Transition>

    <Transition name="toast">
      <div v-if="toast" class="home-toast">{{ toast }}</div>
    </Transition>

    <LocationSheet
      :visible="showLocationSheet"
      @use-location="handleUseLocation"
      @manual="handleManualCity"
      @dismiss="dismissLocationSheet"
    />

    <MobileBottomNav
      active="home"
      @navigate="handleBottomNav"
    />
  </main>
</template>

<style scoped>
.home-page {
  /* Design tokens from the high-fidelity prototype (docs/design/index.html). */
  --page-bg: #02070e;
  --panel-bg: rgba(11, 16, 24, 0.88);
  --panel-bg-strong: rgba(9, 13, 20, 0.96);
  --panel-border: rgba(255, 255, 255, 0.14);
  --text-main: #f7f9fb;
  --text-muted: rgba(255, 255, 255, 0.68);
  --text-faint: rgba(255, 255, 255, 0.42);
  --accent: #c7ff1f;
  --accent-2: #a9ef16;
  --accent-shadow: rgba(185, 255, 27, 0.35);
  --radius-lg: 26px;
  --radius-xl: 34px;

  position: relative;
  min-height: 100%;
  background: var(--page-bg);
  color: var(--text-main);
  /* Clear the fixed bottom nav (76px bar + FAB overhang) plus safe area. */
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
  max-width: 480px;
  margin: 0 auto;
  overflow-x: hidden;
}

/* ===== Scroll reveal ===== */
[data-reveal] {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.6s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}
[data-reveal].is-revealed {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  [data-reveal] { opacity: 1; transform: none; transition: none; }
}

/* ===== Persona + CTA panel ===== */
.persona-panel-wrap {
  position: relative;
  z-index: 10;
  margin-top: -72px;
  padding: 0 14px;
}

.persona-panel {
  padding: 18px 14px 16px;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-xl);
  background:
    linear-gradient(180deg, rgba(14, 20, 30, 0.92), rgba(5, 10, 16, 0.96)),
    rgba(7, 12, 18, 0.92);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.44), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.persona-panel-title {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #fff;
}

.start-slider {
  display: block;
  margin-top: 16px;
}

/* ===== Below-the-fold content ===== */
.home-content {
  position: relative;
  z-index: 5;
  padding-top: 28px;
  background: var(--page-bg);
}

.home-footer {
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.32);
  padding: 24px 0 4px;
  letter-spacing: 0.08em;
}

/* Bottom sheet for city picker */
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet-panel {
  width: 100%;
  max-width: 480px;
  max-height: 82vh;
  overflow-y: auto;
  border-radius: 28px 28px 0 0;
  padding: 20px;
  box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.5);
}

/* CityPicker is a light-themed component, so its sheet must be light. */
.sheet-panel--light {
  background: #f7f6f2;
  color: #1c1917;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s ease;
}

.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .sheet-panel,
.sheet-leave-to .sheet-panel {
  transform: translateY(100%);
}

.home-toast {
  position: fixed;
  left: 50%;
  bottom: calc(108px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 80;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(13, 18, 24, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  max-width: 80vw;
  text-align: center;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
