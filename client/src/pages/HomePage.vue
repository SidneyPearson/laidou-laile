<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import HomeHero from '../components/home/HomeHero.vue'
import PersonaSelector from '../components/home/PersonaSelector.vue'
import SlideToStart from '../components/home/SlideToStart.vue'
import InspirationCarousel, {
  type InspirationCard,
} from '../components/home/InspirationCarousel.vue'
import RoutePlannerCard from '../components/home/RoutePlannerCard.vue'
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
import { PERSONAS, EXPLORE_CATEGORIES, getExploreSpots } from '../data/mockExploreSpots'
import { usePersona } from '../composables/usePersona'
import { useTodayPlan } from '../composables/useTodayPlan'
import { useTodayJourney } from '../composables/useTodayJourney'
import { matchRememberedCity, useExploreCity } from '../composables/useExploreCity'
import { useGeolocation } from '../composables/useGeolocation'
import { useFavorites } from '../composables/useFavorites'
import { openAmapNavigation } from '../utils/amapNavigation'
import { haversineDist } from '../utils/geo'
import { floatEmojis, timeGreeting, celebratePlanAdded } from '../utils/delight'
import { haptic } from '../utils/haptics'
import {
  defaultHomePersonaCards,
  fetchHomePersonas,
  type HomePersonaCard,
} from '../repositories/homePersonas'
import { cityHeroImage } from '../assets/homepage/cityHeroes'
import type { InspirationSpot, Persona } from '../types/explore'
import { isFullDaySuggestedDuration, TODAY_PLAN_LIMIT } from '../types/todayPlan'

const router = useRouter()
const { persona, hasChosenPersona, setPersona } = usePersona()
const todayPlan = useTodayPlan()
const todayJourney = useTodayJourney()
const favorites = useFavorites()
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
/** 首屏启动遮罩：数据（城市/推荐/画像/天气）与封面图就绪前整页不揭开，
 *  避免弱网下"先出背景图、画像模块几秒后才弹入"的割裂感。 */
const booting = ref(true)
const selectedSpot = ref<InspirationSpot | null>(null)
const confirmReset = ref(false)
/** 切换城市二次确认：当前城市有今日计划时，先确认再切换（各城市计划分别保留）。 */
const pendingCity = ref<RecommendationCity | null>(null)
const showCityConfirm = ref(false)
/** 滑动解锁滑块引用：取消"重新开始"时复位，避免卡在解锁终态。 */
const slideToStartRef = ref<InstanceType<typeof SlideToStart> | null>(null)
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

const favoriteIds = computed(() => favorites.spots.value.map(spot => spot.id))

function handleCardSelect(card: InspirationCard) {
  const spot = cardSpotByKey.value.get(card.key)
  if (spot && card.verified) {
    selectedSpot.value = spot
    return
  }
  // Demo / unverified card → jump into the city exploration page.
  handleStart()
}

function toggleFavorite(spot: InspirationSpot) {
  const result = favorites.toggle(spot, selectedCity.value)
  if (result.status === 'unverified') {
    showToast('演示地点暂时不能收藏')
    return
  }
  haptic(16)
  const suffix = favorites.storageAvailable.value ? '' : '，仅在本次打开期间保留'
  showToast(result.status === 'added' ? `已收藏“${spot.name}”${suffix}` : `已取消收藏“${spot.name}”`)
}

function toggleCardFavorite(card: InspirationCard) {
  const spot = cardSpotByKey.value.get(card.key)
  if (spot) toggleFavorite(spot)
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
  // 本地示例也保持策展时的固定顺序，不跟随画像重新排序。
  return getExploreSpots(normalized)
    .map(spot => ({ ...spot, verificationStatus: 'demo' as const, source: 'local_demo' as const }))
}

async function loadWeatherAndSpots(): Promise<unknown> {
  const city = selectedCity.value
  if (!city?.center) {
    spots.value = []
    spotsLoading.value = false
    return Promise.resolve()
  }
  const center = city.center

  let weatherTask: Promise<unknown> = Promise.resolve()
  weatherController?.abort()
  if (weatherCoordsKey !== coordsKey(center)) {
    weatherController = new AbortController()
    weatherLoading.value = true
    weatherTask = fetchCityContext(center.lat, center.lng, weatherController.signal)
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
  return weatherTask
}

/** 首页灵感采用编辑排序：先按后台推荐级别，再按同级 priority。
 *  不传画像、天气或坐标给推荐接口，避免实时条件改变策展顺序；
 *  用户已授权定位时，仅在客户端补算距离文案，不参与排序。 */
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
    const result = await fetchExploreRecommendations({
      city: city.name.replace(/市$/, ''),
      adcode: city.adcode,
      category: 'all',
      limit: 6,
      isRainy: false,
    }, spotsController.signal)
    if (requestId !== spotsRequestId) return
    const realLocation = coords.value && !isMock.value ? coords.value : null
    spots.value = realLocation
      ? result.spots.map((spot) => {
          if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return spot
          return {
            ...spot,
            distanceMeters: Math.round(haversineDist(
              realLocation.lat,
              realLocation.lng,
              spot.lat as number,
              spot.lng as number,
            )),
          }
        })
      : result.spots
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

/** 当前城市是否已有今日计划或进行中的行程（切换城市需要二次确认的判据）。 */
const currentCityLabel = computed(() =>
  (exploreCity.value ?? selectedCity.value)?.name.replace(/市$/, '') ?? '当前城市')

function isSameCity(a: RecommendationCity | null, b: RecommendationCity): boolean {
  return !!a && a.adcode === b.adcode
}

/** 真正执行切换：切到该城市的计划与行程桶、记住选择。
 *  各城市的今日计划分别保存，切回原城市会恢复，不再静默清空。 */
function applyCitySwitch(next: RecommendationCity) {
  todayPlan.setActiveCity({ adcode: next.adcode, cityName: next.name })
  selectedCity.value = next
  setExploreCity(next)
}

/** 切换城市入口：当前城市有计划/行程时先弹二次确认，避免误触丢失上下文；
 *  同城市或空计划直接切换。afterSwitch 在真正切换后执行（加载天气/地点等），
 *  onCancel 在用户取消时执行（用于还原定位流程里乐观设置的临时城市）。 */
const pendingAfterSwitch = ref<(() => void | Promise<void>) | null>(null)
const pendingCancel = ref<(() => void) | null>(null)
function requestCitySwitch(
  next: RecommendationCity,
  afterSwitch?: () => void | Promise<void>,
  onCancel?: () => void,
) {
  const previous = exploreCity.value ?? selectedCity.value
  if (previous && isSameCity(previous, next)) {
    applyCitySwitch(next)
    if (afterSwitch) void afterSwitch()
    return
  }
  const needConfirm = todayPlan.count.value > 0 || todayJourney.status.value !== 'idle'
  if (!needConfirm) {
    applyCitySwitch(next)
    if (afterSwitch) void afterSwitch()
    return
  }
  pendingCity.value = next
  pendingAfterSwitch.value = afterSwitch ?? null
  pendingCancel.value = onCancel ?? null
  showCityConfirm.value = true
}

function confirmCitySwitch() {
  const next = pendingCity.value
  showCityConfirm.value = false
  if (!next) return
  applyCitySwitch(next)
  const after = pendingAfterSwitch.value
  pendingCity.value = null
  pendingAfterSwitch.value = null
  pendingCancel.value = null
  if (after) void after()
}

function cancelCitySwitch() {
  showCityConfirm.value = false
  pendingCity.value = null
  pendingAfterSwitch.value = null
  const onCancel = pendingCancel.value
  pendingCancel.value = null
  if (onCancel) onCancel()
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
  // 记住切换前的城市，定位到新城市且用户取消切换时还原。
  const previousCity = selectedCity.value
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
  let resolvedCity: RecommendationCity | null = null
  let resolvedWeather: CityContextResponse['weather'] = null
  try {
    const ctx = await fetchCityContext(center.lat, center.lng)
    // Reverse geocoding returns the *district* adcode (e.g. 310105 长宁区),
    // while recommended cities carry the *city-level* adcode (310000). Match
    // by city name so a located district still resolves to its published
    // city (and gets its cover image).
    const locatedName = ctx.city.replace(/市$/, '')
    const matched = cities.value.find(c => c.adcode === ctx.adcode)
      ?? cities.value.find(c => c.name.replace(/市$/, '') === locatedName)
    resolvedCity = matched ?? {
      adcode: ctx.adcode,
      name: ctx.city,
      province: '',
      coverImageUrl: null,
      center,
    }
    resolvedWeather = ctx.weather
  } catch {
    /* keep transient city, spots will fall back to local demo */
  }
  // requestCitySwitch 在确认/直接切换时已经调用过 applyCitySwitch，
  // 这里只负责设置天气并加载内容，不要重复切换。
  const applyLocatedContent = () => {
    weather.value = resolvedWeather
    // Mark these coords as already weather-resolved so loadWeatherAndSpots
    // doesn't call /api/city/context a second time for the same location.
    weatherCoordsKey = coordsKey(center)
    void loadWeatherAndSpots()
  }
  if (resolvedCity) {
    requestCitySwitch(resolvedCity, applyLocatedContent, () => {
      // 用户取消切换：还原定位前的城市，不加载新城市内容。
      if (previousCity) selectedCity.value = previousCity
    })
  } else {
    void loadWeatherAndSpots()
  }
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
  showPicker.value = false
  showLocationSheet.value = false
  // 城市切换可能清空（实际上是切走）当前计划，先确认；确认后再设定手动定位并加载。
  const center = city.center
  requestCitySwitch(city, () => {
    setManualLocation(center.lat, center.lng, city.name)
    weather.value = null
    weatherCoordsKey = null
    void loadWeatherAndSpots()
  })
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
  router.replace({
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

/** 微信里弹层仍在位移动画时可能吞掉合成 click；touchend 直接执行并阻止
 *  随后的幽灵点击。鼠标和键盘仍走模板上的 click。 */
function proceedFreshStartOnTouch(event: TouchEvent) {
  event.preventDefault()
  event.stopPropagation()
  proceedFreshStart()
}

/** 取消"重新开始"：关闭确认层，并把滑动解锁滑块复位回锁定态，
 *  否则滑块会卡在"已解锁"终态无法再拖（表现为页面交互消失）。 */
function cancelFreshStart() {
  confirmReset.value = false
  slideToStartRef.value?.reset()
}

function cancelFreshStartOnTouch(event: TouchEvent) {
  event.preventDefault()
  event.stopPropagation()
  cancelFreshStart()
}

function handleSpotSelect(spot: InspirationSpot) {
  selectedSpot.value = selectedSpot.value?.id === spot.id ? null : spot
}

function navigateToSpot() {
  const spot = selectedSpot.value
  if (!spot || !selectedActionReady(spot)) return
  openAmapNavigation(spot.amapName || spot.name, spot.lng as number, spot.lat as number, spot.name)
}

function toggleTodaySpot() {
  const spot = selectedSpot.value
  if (!spot || !selectedActionReady(spot)) return
  if (todayPlan.hasSpot(spot.id)) {
    todayPlan.removeSpot(spot.id)
    showToast(`已将“${spot.name}”移出今日计划`)
    return
  }
  const result = todayPlan.addSpot(spot)
  if (result.status === 'limit') {
    showToast(`今日计划最多 ${TODAY_PLAN_LIMIT} 个地点，请先移除一个再加入`)
    return
  }
  if (result.status !== 'added') {
    showToast('这个地点暂时不能加入今日计划')
    return
  }
  selectedSpot.value = null
  if (isFullDaySuggestedDuration(spot.suggestedDuration)) {
    haptic([28, 50, 28])
    showToast('已加入；这个地点建议游玩一整天')
  } else {
    showToast(celebratePlanAdded(todayPlan.count.value, TODAY_PLAN_LIMIT))
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
  // 画像卡后台可配置；失败时内置兜底卡已经是初始值。
  const personaTask = fetchHomePersonas()
    .then((cards) => { personaCards.value = cards })
    .catch(() => {})

  const result = await loadCityRecommendations()
  cities.value = result.cities
  let weatherTask: Promise<unknown> = Promise.resolve()
  if (result.cities.length > 0) {
    selectedCity.value = matchRememberedCity(exploreCity.value, result.cities) ?? result.cities[0]
    setExploreCity(selectedCity.value)
    weatherTask = loadWeatherAndSpots()
  } else {
    spotsLoading.value = false
  }

  const heroUrl = cityHeroImage(selectedCity.value?.name)
  const heroTask = heroUrl ? new Promise<void>(resolve => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = heroUrl
  }) : Promise.resolve()

  // 整页一次性揭开：等首屏数据 + 封面图都就绪；弱网最多等 3.2s 兜底，
  // 超时后骨架屏/兜底文案接管，绝不把用户卡在加载屏上。
  await Promise.race([
    Promise.allSettled([personaTask, weatherTask, heroTask]),
    new Promise<void>((resolve) => setTimeout(resolve, 3200)),
  ])
  booting.value = false

  // First-visit location sheet (only when the user has never dismissed it and
  // no city has been resolved yet).
  try {
    if (!localStorage.getItem(FIRST_VISIT_KEY)) {
      showLocationSheet.value = true
    }
  } catch {
    showLocationSheet.value = true
  }

  // 内容在揭开遮罩后才挂载，滚动揭示观察器要在此时挂。
  await nextTick()
  setupScrollReveal()
})

onBeforeUnmount(() => {
  revealObserver?.disconnect()
  revealObserver = null
})

</script>

<template>
  <main class="home-page">
    <!-- 首屏启动遮罩：数据就绪前不渲染页面内容，揭开即完整页面 -->
    <Transition name="boot-fade">
      <div v-if="booting" class="home-boot" aria-busy="true" aria-label="正在加载">
        <div class="home-boot-brand">
          <strong>来都来了</strong>
          <em>City Inspiration</em>
        </div>
        <span class="home-boot-spinner" aria-hidden="true" />
      </div>
    </Transition>

    <template v-if="!booting">
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
          ref="slideToStartRef"
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
      <!-- 天气提示独立于编辑排序，不暗示下方地点经过雨天重排。 -->
      <div v-if="weather?.isRainy && spots.length > 0 && !demoFallback" class="rainy-note" data-reveal>
        ☔ 今天可能有雨，出门记得带伞
      </div>
      <div data-reveal>
        <InspirationCarousel
          :cards="inspirationCards"
          :loading="spotsLoading"
          :favorite-ids="favoriteIds"
          @select="handleCardSelect"
          @toggle-favorite="toggleCardFavorite"
        />
      </div>

      <div class="mt-5" data-reveal>
        <RoutePlannerCard
          :count="todayPlan.count.value"
          @open="router.replace({ name: 'today-plan' })"
        />
      </div>

      <p class="home-footer" @click="tapFooter">{{ footerCopy }}</p>
    </div>

    </template>

    <!-- 固定弹层传送到 body，避免 iOS 独立滚动层形成层叠上下文后被 App Shell 底栏盖住。 -->
    <Teleport to="body">
      <Transition name="sheet" :duration="220">
        <div v-if="showPicker" class="sheet-mask" @click.self="showPicker = false">
          <div class="sheet-panel sheet-panel--dark">
            <CityPicker
              @select="handleCitySelect"
              @cancel="showPicker = false"
            />
          </div>
        </div>
      </Transition>

      <Transition name="sheet" :duration="220">
        <SpotDetailSheet
          v-if="selectedSpot"
          :spot="selectedSpot"
          :persona="hasChosenPersona ? currentPersonaOption() : null"
          :action-ready="selectedActionReady(selectedSpot)"
          :in-today="todayPlan.hasSpot(selectedSpot.id)"
          :favorite-ready="selectedActionReady(selectedSpot)"
          :in-favorites="favorites.hasSpot(selectedSpot)"
          @close="selectedSpot = null"
          @navigate="navigateToSpot"
          @toggle-today="toggleTodaySpot"
          @toggle-favorite="toggleFavorite(selectedSpot)"
        />
      </Transition>

      <Transition name="sheet" :duration="220">
        <div v-if="confirmReset" class="sheet-mask" @click.self="cancelFreshStart">
          <div class="sheet-panel sheet-panel--dark confirm-sheet">
            <h3>重新开始一轮推荐？</h3>
            <p>你已选了 {{ todayPlan.count.value }} 个地点，开始新推荐会<strong>清空今天的安排</strong>。</p>
            <div class="confirm-actions">
              <button class="btn-ghost" type="button" @touchend="cancelFreshStartOnTouch" @click="cancelFreshStart">取消</button>
              <button class="btn-danger" type="button" @touchend="proceedFreshStartOnTouch" @click="proceedFreshStart">清空并开始</button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="sheet" :duration="220">
        <div v-if="showCityConfirm" class="sheet-mask" @click.self="cancelCitySwitch">
          <div class="sheet-panel sheet-panel--dark confirm-sheet">
            <h3>切换到{{ pendingCity?.name.replace(/市$/, '') }}？</h3>
            <p>切换后，当前「<strong>{{ currentCityLabel }}</strong>」的地点和打卡进度会暂时收起，切回该城市时一起恢复。</p>
            <div class="confirm-actions">
              <button class="btn-ghost" type="button" @click="cancelCitySwitch">取消</button>
              <button class="btn-danger" type="button" @click="confirmCitySwitch">切换城市</button>
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
    </Teleport>

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

/* ===== 首屏启动遮罩：数据齐了整页再揭开 ===== */
.home-boot {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  background:
    radial-gradient(circle at 50% 38%, rgba(199, 255, 31, 0.08), transparent 55%),
    #02070e;
}
.home-boot-brand {
  text-align: center;
}
.home-boot-brand strong {
  display: block;
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Palatino', Georgia, 'Songti SC', 'STSong', serif;
  font-size: 34px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #f7f9fb;
}
.home-boot-brand em {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.32em;
  text-indent: 0.32em;
  color: rgba(255, 255, 255, 0.42);
}
.home-boot-spinner {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2.5px solid rgba(199, 255, 31, 0.16);
  border-top-color: var(--accent);
  animation: boot-spin 0.8s linear infinite;
}
@keyframes boot-spin {
  to { transform: rotate(360deg); }
}
.boot-fade-leave-active {
  visibility: visible;
  pointer-events: none;
  transition: opacity 0.35s ease;
}
.boot-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .home-boot-spinner { animation-duration: 1.6s; }
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
  /* 底色已完全不透明，backdrop-blur 无视觉效果却让滚动时持续重采样，移除 */
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
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
/* iOS Safari + backdrop-filter 经典 bug：退出动画结束后不触发 transitionend，
   mask 残留挡住全屏点击。已去掉 backdrop-filter（视觉无差）。 */
.sheet-leave-active {
  pointer-events: none;
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
  /* 缩短到 0.18s，减少 mask 残留窗口；同时去掉 backdrop-filter 后 iOS 退出动画正常 */
  transition: opacity 0.18s ease;
}

.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  /* 必须短于 Transition 的 220ms 显式时长；旧版 280ms 会在 Vue
     提前移除过渡 class 时产生一次位置跳变，微信可能因此取消 click。 */
  transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
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
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
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
