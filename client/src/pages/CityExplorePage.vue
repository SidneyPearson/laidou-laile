<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PersonaSelector from '../components/explore/PersonaSelector.vue'
import CategoryTabs from '../components/explore/CategoryTabs.vue'
import InspirationFeed from '../components/explore/InspirationFeed.vue'
import SpotDetailSheet from '../components/explore/SpotDetailSheet.vue'
import TodayPlanFloatingBar from '../components/explore/TodayPlanFloatingBar.vue'
import {
  PERSONAS,
  filterAndRankSpots,
  getExploreSpots,
} from '../data/mockExploreSpots'
import {
  fetchCityContext,
  fetchExploreRecommendations,
  type CityContextResponse,
} from '../services/exploreApi'
import { ApiRequestError } from '../services/api'
import { useTodayPlan } from '../composables/useTodayPlan'
import { openAmapNavigation } from '../utils/amapNavigation'
import type {
  ExploreCategory,
  InspirationSpot,
  Persona,
} from '../types/explore'

const route = useRoute()
const router = useRouter()
const todayPlan = useTodayPlan()

function loadPersona(): Persona {
  if (typeof localStorage === 'undefined') return 'couple'
  const saved = localStorage.getItem('laidou-v03-persona')
  return PERSONAS.some(item => item.id === saved) ? saved as Persona : 'couple'
}

function normalizeCityName(value: string): string {
  return value.trim().replace(/市$/, '')
}

function queryNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const initialCity = String(route.query.city || '当前城市')
const cityName = ref(initialCity)
const district = ref('')
const adcode = ref<string | undefined>(
  typeof route.query.adcode === 'string' && route.query.adcode
    ? route.query.adcode
    : undefined,
)
const weather = ref<CityContextResponse['weather']>(null)
const contextLoading = ref(false)
const contextError = ref('')

const source = computed(() => String(route.query.source || 'manual'))
const persona = ref<Persona>(loadPersona())
const initialCategory = String(route.query.category || 'all')
const category = ref<ExploreCategory>(
  ['all', 'landmark', 'district', 'theme_park', 'nature', 'street', 'mall', 'food', 'museum'].includes(initialCategory)
    ? initialCategory as ExploreCategory
    : 'all',
)
const selectedSpot = ref<InspirationSpot | null>(null)
const spots = ref<InspirationSpot[]>([])
const feedLoading = ref(false)
const feedError = ref('')
const usingFallback = ref(false)
const actionNotice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | null = null

let contextController: AbortController | null = null
let feedController: AbortController | null = null
let feedRequestId = 0

const currentPersona = computed(() =>
  PERSONAS.find(item => item.id === persona.value) ?? PERSONAS[0],
)
const cityReady = computed(() =>
  !['当前城市', '定位演示城市'].includes(cityName.value),
)
const weatherSummary = computed(() => {
  if (contextLoading.value) return '正在获取城市与天气'
  if (!weather.value) return '天气暂不可用'
  return `${weather.value.weather} · ${weather.value.temperature}℃`
})
const selectedActionReady = computed(() =>
  selectedSpot.value?.verificationStatus === 'verified'
  && selectedSpot.value?.source === 'amap_verified'
  && selectedSpot.value?.mock === false
  && !!selectedSpot.value.amapPoiId
  && Number.isFinite(selectedSpot.value.lat)
  && Number.isFinite(selectedSpot.value.lng),
)

function localFallback(): InspirationSpot[] {
  const city = normalizeCityName(cityName.value)
  return filterAndRankSpots(
    getExploreSpots(city),
    persona.value,
    category.value,
  ).map(spot => ({
    ...spot,
    verificationStatus: 'demo',
    source: 'local_demo',
  }))
}

async function loadRecommendations() {
  const requestId = ++feedRequestId
  feedController?.abort()
  feedController = new AbortController()
  feedLoading.value = true
  feedError.value = ''
  selectedSpot.value = null

  try {
    const result = await fetchExploreRecommendations({
      city: normalizeCityName(cityName.value),
      adcode: adcode.value,
      persona: persona.value,
      category: category.value,
      limit: 6,
      isRainy: weather.value?.isRainy ?? false,
    }, feedController.signal)

    if (requestId !== feedRequestId) return
    spots.value = result.spots
    usingFallback.value = false
  } catch (error) {
    if (requestId !== feedRequestId) return
    const requestError = error instanceof ApiRequestError ? error : null
    if (requestError?.code === 'CANCELLED') return

    spots.value = localFallback()
    usingFallback.value = true
    feedError.value = requestError?.message || '实时城市内容暂时不可用'
  } finally {
    if (requestId === feedRequestId) feedLoading.value = false
  }
}

async function loadContext() {
  const lat = queryNumber(route.query.lat)
  const lng = queryNumber(route.query.lng)
  if (lat === null || lng === null) {
    contextError.value = '缺少有效定位，请重新选择城市'
    await loadRecommendations()
    return
  }

  contextController?.abort()
  contextController = new AbortController()
  contextLoading.value = true
  contextError.value = ''

  try {
    const context = await fetchCityContext(lat, lng, contextController.signal)
    cityName.value = context.city
    district.value = context.district
    adcode.value = context.adcode
    weather.value = context.weather
  } catch (error) {
    const requestError = error instanceof ApiRequestError ? error : null
    if (requestError?.code !== 'CANCELLED') {
      contextError.value = requestError?.message || '城市与天气识别暂时不可用'
    }
  } finally {
    contextLoading.value = false
  }

  await loadRecommendations()
}

watch([persona, category], () => {
  localStorage.setItem('laidou-v03-persona', persona.value)
  void loadRecommendations()
})

function chooseSpot(spot: InspirationSpot) {
  selectedSpot.value = selectedSpot.value?.id === spot.id ? null : spot
}

function showNotice(message: string) {
  actionNotice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    actionNotice.value = ''
    noticeTimer = null
  }, 2600)
}

function navigateToSpot() {
  const spot = selectedSpot.value
  if (!spot || !selectedActionReady.value) return
  openAmapNavigation(spot.amapName || spot.name, spot.lng as number, spot.lat as number)
}

function toggleTodaySpot() {
  const spot = selectedSpot.value
  if (!spot || !selectedActionReady.value) return

  if (todayPlan.hasSpot(spot.id)) {
    todayPlan.removeSpot(spot.id)
    showNotice(`已将“${spot.name}”移出今天`)
    return
  }

  const result = todayPlan.addSpot(spot)
  if (result.status === 'limit') {
    showNotice('今天先选 6 个，避免行程过满')
    return
  }
  if (result.status !== 'added') {
    showNotice('这个地点暂时不能加入真实安排')
    return
  }

  selectedSpot.value = null
  showNotice(
    todayPlan.storageAvailable.value
      ? `已加入“${spot.name}”`
      : `已加入“${spot.name}”，但浏览器未允许本地保存`,
  )
}

onMounted(() => {
  void loadContext()
})

onBeforeUnmount(() => {
  contextController?.abort()
  feedController?.abort()
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <main class="min-h-full bg-[#f7f6f2] pb-28">
    <header class="sticky top-0 z-30 border-b border-white/60 bg-[#f7f6f2]/90 px-5 pb-3 pt-[max(18px,env(safe-area-inset-top))] backdrop-blur-xl">
      <div class="flex items-center justify-between gap-3">
        <button
          class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-stone-600 shadow-sm transition active:scale-95"
          aria-label="返回"
          @click="router.push({ name: 'home' })"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <button
          class="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-4 py-2 text-left shadow-sm"
          @click="router.push({ name: 'home' })"
        >
          <p class="truncate text-xs font-bold text-stone-800">
            {{ cityReady ? `你现在位于${cityName}` : '正在识别当前城市' }}
          </p>
          <p class="mt-0.5 truncate text-[9px] text-stone-400">
            {{ district || (source === 'gps' ? '来自当前定位' : '手动选择') }} · {{ weatherSummary }}
          </p>
        </button>
      </div>
    </header>

    <div class="px-5 pt-5">
      <section class="overflow-hidden rounded-[28px] bg-stone-900 px-5 py-5 text-white shadow-[0_14px_35px_rgba(44,44,44,0.12)]">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-200">
              {{ cityName }} · 全城探索
            </p>
            <h1 class="mt-2 text-[25px] font-bold leading-tight">
              {{ currentPersona.emoji }} {{ currentPersona.name }}今天想去哪？
            </h1>
            <p class="mt-2 text-xs leading-5 text-white/60">
              AI 负责提供灵感，去哪、去几个、按什么顺序都由你决定。
            </p>
          </div>
          <span class="rounded-full bg-white/10 px-2.5 py-1 text-[9px] text-white/60">
            V0.3
          </span>
        </div>
        <div
          v-if="weather?.note"
          class="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-[10px] leading-4 text-white/75"
        >
          {{ weather.note }}
        </div>
      </section>

      <div
        v-if="contextError"
        class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"
      >
        {{ contextError }}。当前会使用你选择的城市继续尝试。
      </div>

      <section class="mt-6">
        <div class="mb-3 flex items-end justify-between">
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">你的出游画像</p>
            <h2 class="mt-1 text-lg font-bold text-stone-900">今天更像哪一种你？</h2>
          </div>
          <span class="text-[10px] text-stone-400">只影响本次排序</span>
        </div>
        <PersonaSelector v-model="persona" />
      </section>

      <section class="mt-6">
        <div class="mb-3">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">选择一个方向</p>
          <h2 class="mt-1 text-lg font-bold text-stone-900">这座城市，什么值得去？</h2>
        </div>
        <CategoryTabs v-model="category" />
      </section>

      <section class="mt-5">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-xs text-stone-500">
            为“{{ currentPersona.name }}”优先排列
          </p>
          <p class="text-[10px] text-stone-400">
            {{ usingFallback ? `${spots.length} 个演示地点` : `${spots.length} 个推荐地点` }}
          </p>
        </div>

        <div
          v-if="usingFallback"
          class="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"
        >
          {{ feedError }}。当前展示明确标注的本地演示卡片，不会冒充实时推荐。
        </div>

        <div v-if="feedLoading" class="grid grid-cols-2 gap-3">
          <div v-for="index in 6" :key="index" class="overflow-hidden rounded-[20px] bg-white">
            <div class="skeleton h-[150px]" />
            <div class="space-y-2 p-3">
              <div class="skeleton h-3 rounded-full" />
              <div class="skeleton h-3 w-3/4 rounded-full" />
              <div class="skeleton h-7 rounded-xl" />
            </div>
          </div>
        </div>

        <InspirationFeed
          v-else
          :spots="spots"
          :selected-id="selectedSpot?.id"
          @select="chooseSpot"
        />
      </section>
    </div>

    <Transition name="slide-up">
      <SpotDetailSheet
        v-if="selectedSpot"
        :spot="selectedSpot"
        :persona="currentPersona"
        :action-ready="selectedActionReady"
        :in-today="todayPlan.hasSpot(selectedSpot.id)"
        @close="selectedSpot = null"
        @navigate="navigateToSpot"
        @toggle-today="toggleTodaySpot"
      />
    </Transition>

    <Transition name="slide-up">
      <TodayPlanFloatingBar
        v-if="todayPlan.count.value > 0 && !selectedSpot"
        :count="todayPlan.count.value"
        @open="router.push({ name: 'today-plan' })"
      />
    </Transition>

    <Transition name="slide-up">
      <div
        v-if="actionNotice"
        class="fixed bottom-[max(92px,calc(env(safe-area-inset-bottom)+92px))] left-1/2 z-[60] -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-xs text-white shadow-lg"
      >
        {{ actionNotice }}
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
