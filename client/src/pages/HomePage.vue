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
import { useTodayJourney } from '../composables/useTodayJourney'
import { matchRememberedCity, useExploreCity } from '../composables/useExploreCity'
import { useGeolocation } from '../composables/useGeolocation'
import { openAmapNavigation } from '../utils/amapNavigation'
import { floatEmojis, timeGreeting, pickCopy } from '../utils/delight'
import {
  defaultHomePersonaCards,
  fetchHomePersonas,
  type HomePersonaCard,
} from '../repositories/homePersonas'
import type { InspirationSpot, Persona } from '../types/explore'

const router = useRouter()
const { persona, hasChosenPersona, setPersona } = usePersona()
const todayPlan = useTodayPlan()
const todayJourney = useTodayJourney()
const { city: exploreCity, setExploreCity } = useExploreCity()
const { coords, isMock, error: locError, requestLocation, setManualLocation } = useGeolocation()

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
const confirmReset = ref(false)
/** 请求失败后的降级状态：'unsupported' = 城市未发布（筹备中），'error' = 加载失败。 */
const demoFallback = ref<'unsupported' | 'error' | null>(null)

let weatherController: AbortController | null = null
let spotsController: AbortController | null = null
let spotsRequestId = 0

/** Weather is keyed by coordinates: when the located city was just resolved
 *  via /api/city/context (which already returns weather), the follow-up
 *  loadWeatherAndSpots must not refetch the same endpoint for the same
 *  coords — that duplicated the request on every "use my location" tap. */
let weatherCoordsKey: string | null = null
const coordsKey = (c: { lat: number; lng: number }) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`

const currentPersonaOption = () =>
  PERSONAS.find(p => p.id === persona.value) ?? PERSONAS[0]

/** 画像面板标题：按时段换一句轻快问候，给每次回首页一点新鲜感。 */
const personaPanelTitle = computed(() => timeGreeting())

/** 加入今日的文案池：轮换使用，避免每次都是同一句干巴巴的通知。 */
const ADD_TO_TODAY_COPY = [
  '已加入「{name}」',
  '「{name}」已入袋，今天有盼头了',
  '好眼光！「{name}」收进今天了',
  '「{name}」进今天了，记得给它留点时间',
] as const
function addToTodayMessage(name: string): string {
  // 用地点名长度 + 计划数量做“盐”，同一地点重复加入也能换文案。
  const salt = todayPlan.count.value + name.length
  return pickCopy(ADD_TO_TODAY_COPY, salt).replace('{name}', name)
}

/** 页脚彩蛋：连点 5 下（2 秒内）触发 emoji 漂浮。 */
const FOOTER_TAP_COUNT = 5
let footerTapCount = 0
let footerTapTimer: ReturnType<typeof setTimeout> | null = null
function tapFooter() {
  footerTapCount += 1
  if (footerTapTimer) clearTimeout(footerTapTimer)
  footerTapTimer = setTimeout(() => { footerTapCount = 0 }, 2000)
  if (footerTapCount < FOOTER_TAP_COUNT) return
  footerTapCount = 0
  floatEmojis(document.querySelector<HTMLElement>('.home-footer'))
  showToast('彩蛋！来都来了，不能白来 ✨')
}

/** 深夜限定文案：23 点后到凌晨，页脚悄悄换一句。 */
const footerCopy = computed(() => {
  const hour = new Date().getHours()
  return hour >= 23 || hour < 5
    ? '夜深了，来都来了，明天再来'
    : '来都来了，不能白来 · v0.4'
})

function handlePersonaChange(next: Persona) {
  setPersona(next)
}

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
  const center = city.center

  weatherController?.abort()
  if (weatherCoordsKey !== coordsKey(center)) {
    weatherController = new AbortController()
    weatherLoading.value = true
    fetchCityContext(center.lat, center.lng, weatherController.signal)
      .then((ctx) => {
        if (selectedCity.value?.adcode === city.adcode) {
          weather.value = ctx.weather
          weatherCoordsKey = coordsKey(center)
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
  }

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
  demoFallback.value = null
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
      ...(hasChosenPersona.value ? { persona: persona.value } : {}),
      category: 'all',
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
    // 城市未发布(404)与网络/服务异常(5xx)区分对待，避免用户以为示例内容就是该城市的真实数据。
    demoFallback.value = reqErr?.code === 'CITY_NOT_SUPPORTED' ? 'unsupported' : 'error'
    spots.value = localFallback(city.name)
  } finally {
    if (requestId === spotsRequestId) spotsLoading.value = false
  }
}

/* -------------------- events -------------------- */

const FIRST_VISIT_KEY = 'laidou-home-loc-dismissed'

function resetJourneyForCityChange(next: RecommendationCity) {
  const previous = exploreCity.value ?? selectedCity.value
  const switchedCity = !!previous && previous.adcode !== next.adcode
  if (!switchedCity) return
  const clearedPlan = todayPlan.clear()
  todayJourney.reset()
  if (clearedPlan) showToast(`已切换到${next.name.replace(/市$/, '')}，今日计划已清空`)
}

function adoptCity(next: RecommendationCity) {
  resetJourneyForCityChange(next)
  selectedCity.value = next
  setExploreCity(next)
}

function openPicker() {
  showPicker.value = true
  showLocationSheet.value = false
}

// Tapping the location pill on the hero opens the same sheet as the
// first-visit popup, so the user picks "use my location" or "choose city
// manually" instead of being hit with a bare browser permission prompt.
function openLocationSheet() {
  showPicker.value = false
  showLocationSheet.value = true
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
    // Reverse geocoding returns the *district* adcode (e.g. 310105 长宁区),
    // while recommended cities carry the *city-level* adcode (310000). Match
    // by city name so a located district still resolves to its published
    // city (and gets its cover image).
    const locatedName = ctx.city.replace(/市$/, '')
    const matched = cities.value.find(c => c.adcode === ctx.adcode)
      ?? cities.value.find(c => c.name.replace(/市$/, '') === locatedName)
    const resolvedCity = matched ?? {
      adcode: ctx.adcode,
      name: ctx.city,
      province: '',
      coverImageUrl: null,
      center,
    }
    adoptCity(resolvedCity)
    weather.value = ctx.weather
    // Mark these coords as already weather-resolved so loadWeatherAndSpots
    // doesn't call /api/city/context a second time for the same location.
    weatherCoordsKey = coordsKey(center)
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

async function handleCitySelect(city: RecommendationCity) {
  if (!city.center) return
  setManualLocation(city.center.lat, city.center.lng, city.name)
  adoptCity(city)
  showPicker.value = false
  showLocationSheet.value = false
  weather.value = null
  weatherCoordsKey = null
  await loadWeatherAndSpots()
}

function handleStart() {
  const city = selectedCity.value
  if (!city?.center) {
    showPicker.value = true
    return
  }
  // After browser geolocation, keep the user's actual position when entering
  // the city page. `selectedCity.center` is only the curated city's
  // representative spot (often the first published attraction), not the
  // user's current location.
  const center = coords.value && !isMock.value
    ? coords.value
    : city.center
  router.push({
    name: 'city-explore',
    query: {
      city: city.name,
      lat: String(center.lat),
      lng: String(center.lng),
      source: coords.value && !isMock.value ? 'location' : 'manual',
      ...(city.adcode ? { adcode: city.adcode } : {}),
    },
  })
}

/** A hero unlock starts a new recommendation round. Other Explore entry
 *  points keep using handleStart() so they can resume the current plan. */
function handleFreshStart() {
  // 已有今日计划时先弹确认，避免滑动误触静默清空用户的选择。
  if (todayPlan.count.value > 0) {
    confirmReset.value = true
    return
  }
  proceedFreshStart()
}

function proceedFreshStart() {
  confirmReset.value = false
  todayPlan.clear()
  todayJourney.reset()
  handleStart()
}

function cancelFreshStart() {
  confirmReset.value = false
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
  showToast(addToTodayMessage(spot.name))
}

function handleBottomNav(tab: BottomTab) {
  switch (tab) {
    case 'home':
      window.scrollTo({ top: 0, behavior: 'smooth' })
      break
    case 'explore':
      router.push({ name: 'explore' })
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
    selectedCity.value = matchRememberedCity(exploreCity.value, result.cities) ?? result.cities[0]
    setExploreCity(selectedCity.value)
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
      @open-picker="openPicker"
      @use-location="openLocationSheet"
    />

    <!-- Floating persona + CTA panel overlaps the hero -->
    <section class="persona-panel-wrap" data-reveal>
      <div class="persona-panel">
        <h2 class="persona-panel-title">{{ personaPanelTitle }}</h2>
        <PersonaSelector
          :model-value="persona"
          :cards="personaCards"
          @update:model-value="handlePersonaChange"
        />
        <SlideToStart
          class="start-slider"
          hint="向右滑动为你推荐"
          ready-hint="正在为你推荐…"
          :disabled="!selectedCity?.center"
          @unlock="handleFreshStart"
        />
      </div>
    </section>

    <div class="home-content">
      <div v-if="demoFallback" class="demo-notice" data-reveal>
        <template v-if="demoFallback === 'unsupported'">
          <strong>{{ selectedCity?.name?.replace(/市$/, '') }}的内容还在筹备中</strong>
          <span>下面展示的是示例地点，标注「示例」的卡片暂不能加入今日计划。</span>
        </template>
        <template v-else>
          <strong>内容加载失败</strong>
          <span>暂时展示示例地点，请稍后重试。</span>
        </template>
      </div>
      <!-- 雨天人格化：不扫兴，把坏天气变成推荐理由 -->
      <div v-if="weather?.isRainy && spots.length > 0 && !demoFallback" class="rainy-note" data-reveal>
        ☔ 下雨天不扫兴，下面这些地方有屋檐
      </div>
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

      <p class="home-footer" @click="tapFooter">{{ footerCopy }}</p>
    </div>

    <Transition name="sheet">
      <div v-if="showPicker" class="sheet-mask" @click.self="showPicker = false">
        <div class="sheet-panel sheet-panel--dark">
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
        :persona="hasChosenPersona ? currentPersonaOption() : null"
        :action-ready="selectedActionReady(selectedSpot)"
        :in-today="todayPlan.hasSpot(selectedSpot.id)"
        @close="selectedSpot = null"
        @navigate="navigateToSpot"
        @toggle-today="toggleTodaySpot"
      />
    </Transition>

    <Transition name="sheet">
      <div v-if="confirmReset" class="sheet-mask" @click.self="cancelFreshStart">
        <div class="sheet-panel sheet-panel--dark confirm-sheet">
          <h3>重新开始一轮推荐？</h3>
          <p>你已选了 {{ todayPlan.count.value }} 个地点，开始新推荐会<strong>清空今天的安排</strong>。</p>
          <div class="confirm-actions">
            <button class="btn-ghost" type="button" @click="cancelFreshStart">取消</button>
            <button class="btn-danger" type="button" @click="proceedFreshStart">清空并开始</button>
          </div>
        </div>
      </div>
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
  --text-faint: rgba(255, 255, 255, 0.52);
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
  /* 大面积 backdrop-blur 是滚动掉帧主因：底色已近不透明，blur 从 18→10 视觉无差 */
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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

/* 降级为示例内容时的提示条 */
.demo-notice {
  margin: 0 14px 16px;
  padding: 12px 14px;
  border: 1px solid rgba(199, 255, 31, 0.28);
  border-radius: 16px;
  background: rgba(199, 255, 31, 0.07);
}

/* 雨天人格化提示条 */
.rainy-note {
  margin: 0 14px 16px;
  padding: 12px 14px;
  border: 1px solid rgba(125, 211, 252, 0.35);
  border-radius: 16px;
  background: rgba(56, 189, 248, 0.10);
  color: rgba(224, 242, 254, 0.92);
  font-size: 12px;
  font-weight: 700;
}

.demo-notice strong {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: #eaffb0;
}

.demo-notice span {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
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

/* CityPicker uses the same dark glass language as the hero. */
.sheet-panel--dark {
  background: linear-gradient(180deg, rgba(24, 29, 39, 0.98), rgba(10, 14, 22, 0.99));
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-bottom: 0;
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

/* 重新开始推荐前的确认弹层 */
.confirm-sheet {
  padding: 26px 20px calc(22px + env(safe-area-inset-bottom));
}

.confirm-sheet h3 {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}

.confirm-sheet p {
  margin: 0 0 22px;
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.62);
}

.confirm-sheet p strong {
  color: #fff;
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-actions button {
  flex: 1;
  height: 48px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 800;
}

.confirm-actions .btn-ghost {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.confirm-actions .btn-danger {
  border: 0;
  background: #ff5252;
  color: #fff;
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
