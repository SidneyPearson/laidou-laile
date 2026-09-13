<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CityPicker from '../components/CityPicker.vue'
import ExploreSpotMap from '../components/explore/ExploreSpotMap.vue'
import SpotCover from '../components/explore/SpotCover.vue'
import SpotDetailSheet from '../components/explore/SpotDetailSheet.vue'
import { useExploreCity } from '../composables/useExploreCity'
import { usePersona } from '../composables/usePersona'
import { useTodayPlan } from '../composables/useTodayPlan'
import { useTodayJourney } from '../composables/useTodayJourney'
import { useFavorites } from '../composables/useFavorites'
import { EXPLORE_CATEGORIES, PERSONAS } from '../data/mockExploreSpots'
import {
  loadCityRecommendations,
  type RecommendationCity,
} from '../repositories/cityRecommendations'
import { fetchCityContext, fetchExploreRecommendations } from '../services/exploreApi'
import { openAmapNavigation } from '../utils/amapNavigation'
import { haptic } from '../utils/haptics'
import { celebratePlanAdded } from '../utils/delight'
import type { ExploreCategory, InspirationSpot } from '../types/explore'
import { isFullDaySuggestedDuration, TODAY_PLAN_LIMIT } from '../types/todayPlan'

const route = useRoute()
const router = useRouter()
const todayPlan = useTodayPlan()
const todayJourney = useTodayJourney()
const favorites = useFavorites()
const { city, setExploreCity } = useExploreCity()
const { persona, hasChosenPersona } = usePersona()

const spots = ref<InspirationSpot[]>([])
const selectedSpot = ref<InspirationSpot | null>(null)
const category = ref<ExploreCategory>('all')
const query = ref('')
const viewMode = ref<'list' | 'map'>('list')
const loading = ref(false)
const error = ref('')
const showPicker = ref(false)
const pendingCity = ref<RecommendationCity | null>(null)
/** 分类横滑条：右侧渐变提示只在还有更多分类可滑时显示，滚到末尾隐藏。 */
const categoryRail = ref<HTMLElement | null>(null)
const categoryAtEnd = ref(false)
function updateCategoryFade() {
  const el = categoryRail.value
  if (!el) return
  categoryAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
}
function onCategoryScroll() {
  updateCategoryFade()
}
const toast = ref('')
const isRainy = ref(false)
let loadController: AbortController | null = null
let loadRequestId = 0
let toastTimer: ReturnType<typeof setTimeout> | null = null
let weatherLoaded = false

/** 首页 handleStart 只有在用户授权过真实定位时才传 source=location；
 * 手动选城市的坐标（source=manual）会误导距离排序，这里同样只认真实定位。 */
const userLocation = computed<{ lat: number; lng: number } | null>(() => {
  if (route.query.source !== 'location') return null
  const lat = Number(route.query.lat)
  const lng = Number(route.query.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
})

/** 有真实定位时顺带取一次天气，让列表也参与雨天排序（博物馆/商场优先）。 */
async function loadWeatherOnce() {
  if (weatherLoaded || !userLocation.value) return
  weatherLoaded = true
  try {
    const ctx = await fetchCityContext(userLocation.value.lat, userLocation.value.lng)
    isRainy.value = ctx.weather?.isRainy ?? false
  } catch {
    /* 天气获取失败不阻塞浏览 */
  }
}

const categoryName = (id: ExploreCategory) =>
  EXPLORE_CATEGORIES.find(item => item.id === id)?.name ?? '全部'

const currentPersona = computed(() =>
  hasChosenPersona.value
    ? PERSONAS.find(item => item.id === persona.value) ?? null
    : null,
)
const normalizedQuery = computed(() => query.value.trim().toLowerCase())
const visibleSpots = computed(() => {
  if (!normalizedQuery.value) return spots.value
  return spots.value.filter(spot => [
    spot.name,
    spot.district,
    spot.reason,
    ...spot.tags,
  ].join(' ').toLowerCase().includes(normalizedQuery.value))
})
const featuredSpot = computed(() => visibleSpots.value[0] ?? null)
const moreSpots = computed(() => visibleSpots.value.slice(1))
const selectedIds = computed(() => todayPlan.spots.value.map(spot => spot.id))

// 空态文案区分「搜索无结果」/「分类无内容」/「整城暂无内容」，
// 避免把内容筹备中的分类渲染成可重试的故障态。
const emptyTitle = computed(() => {
  if (normalizedQuery.value) return '没有找到合适的地点'
  if (category.value !== 'all') return `「${categoryName(category.value)}」的内容还在筹备中`
  return '这座城市暂时还没有可看的地点'
})
const emptyHint = computed(() => {
  if (normalizedQuery.value) return '换个关键词或分类继续看看。'
  if (category.value !== 'all') return '先看看其他分类，或者过阵子再来。'
  return '编辑部正在加紧上内容，敬请期待。'
})

function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 1800)
}

/** 加载陪伴：骨架屏下方轮换一句小话，等待也有温度。 */
const LOADING_COPY = [
  '正在翻城市的小纸条…',
  '帮你在路上踩好点了…',
  '把值得去的地方挑出来…',
  '在问本地人哪儿好玩…',
] as const
const loadingCopy = ref<string>(LOADING_COPY[0])
let loadingCopyIndex = 0
let loadingCopyTimer: ReturnType<typeof setInterval> | null = null
function startLoadingCopy() {
  if (loadingCopyTimer) return
  loadingCopyTimer = setInterval(() => {
    loadingCopyIndex += 1
    loadingCopy.value = LOADING_COPY[loadingCopyIndex % LOADING_COPY.length]
  }, 1600)
}

function formatDistance(meters?: number): string {
  if (!Number.isFinite(meters)) return ''
  return (meters as number) < 1000
    ? `${Math.round(meters as number)}m`
    : `${((meters as number) / 1000).toFixed(1)}km`
}

function spotMeta(spot: InspirationSpot): string {
  return [
    spot.district,
    categoryName(spot.category),
    spot.suggestedDuration.replace(/^建议\s*/, ''),
    formatDistance(spot.distanceMeters),
  ].filter(Boolean).join(' · ')
}

function actionReady(spot: InspirationSpot | null): boolean {
  return !!spot
    && spot.verificationStatus === 'verified'
    && spot.source === 'amap_verified'
    && spot.mock === false
    && !!spot.amapPoiId
    && Number.isFinite(spot.lng)
    && Number.isFinite(spot.lat)
}

async function loadAllSpots() {
  if (!city.value) return
  const requestId = ++loadRequestId
  loadController?.abort()
  loadController = new AbortController()
  loading.value = true
  error.value = ''
  spots.value = []

  try {
    const all: InspirationSpot[] = []
    let cursor: number | null = 0
    let pages = 0
    while (cursor !== null && pages < 10) {
      const result = await fetchExploreRecommendations({
        city: city.value.name.replace(/市$/, ''),
        adcode: city.value.adcode || undefined,
        ...(hasChosenPersona.value ? { persona: persona.value } : {}),
        category: category.value,
        cursor,
        // 服务端上限 60：一次大页拉全，替代串行小页（保留循环兜底 >60 的城市）。
        limit: 60,
        isRainy: isRainy.value,
        ...(userLocation.value ? { lat: userLocation.value.lat, lng: userLocation.value.lng } : {}),
      }, loadController.signal)
      if (requestId !== loadRequestId) return
      all.push(...result.spots)
      cursor = result.nextCursor
      pages += 1
    }
    spots.value = [...new Map(all.map(spot => [spot.id, spot])).values()]
  } catch (loadError) {
    if (requestId !== loadRequestId) return
    if ((loadError as { code?: string })?.code === 'ERR_CANCELED') return
    error.value = '地点暂时加载失败，请稍后重试'
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

async function applyCity(next: RecommendationCity) {
  const switchedCity = city.value?.adcode !== next.adcode
  if (switchedCity) {
    // 按城市分别保存今日计划：切到目标城市的计划桶（没有则从空开始），
    // 原城市的计划保留在本地，切回时恢复。行程进度也随城市恢复。
    todayPlan.setActiveCity({ adcode: next.adcode, cityName: next.name })
  }
  setExploreCity(next)
  showPicker.value = false
  category.value = 'all'
  query.value = ''
  await loadAllSpots()
}

function selectCity(next: RecommendationCity) {
  const switchedCity = city.value?.adcode !== next.adcode
  // 当前城市有计划或进行中的行程时，先弹二次确认（取消则保留原城市与计划）。
  if (switchedCity && (todayPlan.spots.value.length > 0 || todayJourney.status.value !== 'idle')) {
    pendingCity.value = next
    showPicker.value = false
    return
  }
  void applyCity(next)
}

function confirmCitySwitch() {
  const next = pendingCity.value
  pendingCity.value = null
  if (next) void applyCity(next)
}

function cancelCitySwitch() {
  pendingCity.value = null
}

function toggleToday(spot: InspirationSpot) {
  if (!actionReady(spot)) {
    showToast('这个地点暂时不能加入今日计划')
    return
  }
  if (todayPlan.hasSpot(spot.id)) {
    todayPlan.removeSpot(spot.id)
    showToast(`已将“${spot.name}”移出今日计划`)
    return
  }
  const result = todayPlan.addSpot(spot)
  if (result.status === 'limit') showToast(`今日计划最多 ${TODAY_PLAN_LIMIT} 个地点，请先移除一个再加入`)
  else if (result.status === 'added') {
    if (isFullDaySuggestedDuration(spot.suggestedDuration)) {
      haptic([28, 50, 28])
      showToast('已加入；这个地点建议游玩一整天')
    } else showToast(celebratePlanAdded(todayPlan.count.value, TODAY_PLAN_LIMIT))
  }
  else if (result.status === 'duplicate') showToast('这个地点已经在今日计划里')
  else showToast('这个地点暂时不能加入今日计划')
}

function toggleFavorite(spot: InspirationSpot) {
  if (!actionReady(spot)) {
    showToast('演示地点暂时不能收藏')
    return
  }
  const result = favorites.toggle(spot, city.value)
  if (result.status === 'unverified') {
    showToast('这个地点暂时不能收藏')
    return
  }
  haptic(16)
  const suffix = favorites.storageAvailable.value ? '' : '，仅在本次打开期间保留'
  showToast(result.status === 'added' ? `已收藏“${spot.name}”${suffix}` : `已取消收藏“${spot.name}”`)
}

function toggleSelectedSpot() {
  if (!selectedSpot.value) return
  toggleToday(selectedSpot.value)
}

function navigateToSelected() {
  const spot = selectedSpot.value
  if (!spot || !actionReady(spot)) return
  openAmapNavigation(spot.amapName || spot.name, spot.lng as number, spot.lat as number, spot.name)
}

async function restoreLegacyRecentCity() {
  if (city.value) return
  try {
    const recent = JSON.parse(localStorage.getItem('laidou-recent-cities') || '[]')
    if (!Array.isArray(recent) || typeof recent[0] !== 'string') return
    const result = await loadCityRecommendations()
    const matched = result.cities.find(item => item.adcode === recent[0])
    if (matched) setExploreCity(matched)
  } catch {
    /* A city-less first visit intentionally stays on the selection state. */
  }
}

watch(category, () => void loadAllSpots())
watch(persona, () => {
  if (hasChosenPersona.value) void loadAllSpots()
})

onMounted(async () => {
  startLoadingCopy()
  await restoreLegacyRecentCity()
  if (city.value) {
    // 直接进入探索页（如刷新 #/explore）时，按记住的城市激活对应计划桶，
    // 让今日计划与当前城市一致。
    todayPlan.setActiveCity({ adcode: city.value.adcode, cityName: city.value.name })
    // 天气先于列表加载，保证雨天排序在首帧就生效。
    await loadWeatherOnce()
    await loadAllSpots()
  }
  // 等分类按钮渲染完成后判断是否需要右侧渐变提示。
  void nextTick(updateCategoryFade)
})

onBeforeUnmount(() => {
  loadController?.abort()
  if (toastTimer) clearTimeout(toastTimer)
  if (loadingCopyTimer) clearInterval(loadingCopyTimer)
})
</script>

<template>
  <main class="explore-page">
    <header class="explore-header">
      <div>
        <p class="explore-eyebrow">CITY DISCOVERY</p>
        <h1>探索{{ city ? city.name.replace(/市$/, '') : '一座城市' }}</h1>
      </div>
      <button class="city-switch" type="button" @click="showPicker = true">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s6-4.4 6-11a6 6 0 1 0-12 0c0 6.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>
        {{ city ? '切换城市' : '选择城市' }}
      </button>
    </header>

    <template v-if="city">
      <section class="explore-tools">
        <label class="search-box">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
          <input v-model="query" type="search" aria-label="搜索地点、街区或体验" placeholder="搜索地点、街区或体验">
          <button v-if="query" type="button" aria-label="清空搜索" @click="query = ''">×</button>
        </label>

        <div class="category-rail-wrap" :class="{ 'at-end': categoryAtEnd }">
          <div ref="categoryRail" class="category-rail" aria-label="地点分类，可横向滑动" @scroll="onCategoryScroll">
            <button
              v-for="item in EXPLORE_CATEGORIES"
              :key="item.id"
              type="button"
              :class="{ active: category === item.id }"
              @click="category = item.id"
            >
              {{ item.name }}
            </button>
          </div>
        </div>
      </section>

      <section class="view-heading">
        <div>
          <p>{{ query ? '搜索结果' : category === 'all' ? '这座城市值得去' : categoryName(category) }}</p>
          <span v-if="!loading">{{ visibleSpots.length }} 个已验证地点</span>
        </div>
        <div class="view-switch" aria-label="切换浏览方式">
          <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">列表</button>
          <button :class="{ active: viewMode === 'map' }" @click="viewMode = 'map'">地图</button>
        </div>
      </section>

      <Transition name="fade-up">
        <div v-if="loading" key="loading" class="space-y-3 px-4 pb-32">
          <div class="h-64 animate-pulse rounded-[26px] bg-white/[0.06]" />
          <div v-for="n in 3" :key="n" class="h-32 animate-pulse rounded-[22px] bg-white/[0.06]" />
          <p class="pt-1 text-center text-[10px] text-white/35">{{ loadingCopy }}</p>
        </div>

        <div v-else-if="error" key="error" class="explore-empty">
          <span>↻</span>
          <h2>地点没有加载出来</h2>
          <p>{{ error }}</p>
          <button @click="loadAllSpots">重新加载</button>
        </div>

        <div v-else-if="visibleSpots.length === 0" key="empty" class="explore-empty">
          <span>⌕</span>
          <h2>{{ emptyTitle }}</h2>
          <p>{{ emptyHint }}</p>
          <button v-if="category !== 'all' || query" @click="query = ''; category = 'all'">查看全部地点</button>
        </div>

        <section v-else-if="viewMode === 'map'" key="map" class="px-4 pb-32">
          <ExploreSpotMap
            :key="`${city.adcode}-${category}`"
            :spots="visibleSpots"
            :selected-ids="selectedIds"
            @select="selectedSpot = $event"
          />
        </section>

        <section v-else key="list" class="spot-feed">
        <article v-if="featuredSpot" class="featured-card" @click="selectedSpot = featuredSpot">
          <SpotCover :spot="featuredSpot" eager />
          <div class="featured-shade" />
          <button
            type="button"
            class="featured-favorite"
            :class="{ active: favorites.hasSpot(featuredSpot) }"
            :aria-label="favorites.hasSpot(featuredSpot) ? `取消收藏${featuredSpot.name}` : `收藏${featuredSpot.name}`"
            :aria-pressed="favorites.hasSpot(featuredSpot)"
            @click.stop="toggleFavorite(featuredSpot)"
          >
            <svg viewBox="0 0 24 24" :fill="favorites.hasSpot(featuredSpot) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" /></svg>
          </button>
          <div class="featured-content">
            <div class="flex items-center gap-2">
              <span class="feature-badge">本周值得去</span>
              <span v-if="todayPlan.hasSpot(featuredSpot.id)" class="selected-badge">✓ 已加入今日计划</span>
            </div>
            <h2>{{ featuredSpot.name }}</h2>
            <p>{{ spotMeta(featuredSpot) }}</p>
            <div class="mt-3 flex items-center justify-between gap-3">
              <div class="flex min-w-0 gap-1.5 overflow-hidden">
                <span v-for="tag in featuredSpot.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
              </div>
              <button type="button" class="featured-add" :class="{ added: todayPlan.hasSpot(featuredSpot.id) }" @click.stop="toggleToday(featuredSpot)">
                {{ todayPlan.hasSpot(featuredSpot.id) ? '已加入今日计划' : '加入今日计划' }}
              </button>
            </div>
          </div>
        </article>

        <div v-if="moreSpots.length" class="more-title">更多灵感</div>
        <article v-for="spot in moreSpots" :key="spot.id" class="spot-row" @click="selectedSpot = spot">
          <div class="spot-row-cover"><SpotCover :spot="spot" /></div>
          <div class="spot-row-copy">
            <div class="flex items-start justify-between gap-2">
              <h2>{{ spot.name }}</h2>
              <div class="spot-row-actions">
                <button
                  type="button"
                  class="spot-favorite"
                  :class="{ active: favorites.hasSpot(spot) }"
                  :aria-label="favorites.hasSpot(spot) ? '取消收藏' : '收藏地点'"
                  :aria-pressed="favorites.hasSpot(spot)"
                  @click.stop="toggleFavorite(spot)"
                >
                  <svg viewBox="0 0 24 24" :fill="favorites.hasSpot(spot) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" /></svg>
                </button>
                <button
                  type="button"
                  :class="{ selected: todayPlan.hasSpot(spot.id) }"
                  :aria-label="todayPlan.hasSpot(spot.id) ? '移出今日计划' : '加入今日计划'"
                  @click.stop="toggleToday(spot)"
                >
                  {{ todayPlan.hasSpot(spot.id) ? '✓' : '+' }}
                </button>
              </div>
            </div>
            <p class="spot-row-meta">{{ spotMeta(spot) }}</p>
            <p class="spot-row-reason">{{ spot.reason }}</p>
            <div class="spot-row-tags"><span v-for="tag in spot.tags.slice(0, 2)" :key="tag">{{ tag }}</span></div>
          </div>
        </article>
      </section>
      </Transition>
    </template>

    <section v-else class="city-empty">
      <div class="city-orbit"><span>⌖</span></div>
      <p class="explore-eyebrow">CHOOSE A CITY</p>
      <h2>先选择想探索的城市</h2>
      <p>定位不是必需的。选择城市后，会为你展示当地已经验证并发布的地点。</p>
      <button @click="showPicker = true">选择热门城市 →</button>
    </section>

    <Transition name="sheet">
      <div v-if="showPicker" class="sheet-mask" @click.self="showPicker = false">
        <div class="sheet-panel">
          <CityPicker @select="selectCity" @cancel="showPicker = false" />
        </div>
      </div>
    </Transition>

    <Transition name="sheet">
      <div v-if="pendingCity" class="sheet-mask city-confirm-mask" @click.self="cancelCitySwitch">
        <section class="city-confirm" role="alertdialog" aria-modal="true" aria-labelledby="city-confirm-title">
          <p class="city-confirm-eyebrow">切换城市</p>
          <h2 id="city-confirm-title">要切换到{{ pendingCity.name.replace(/市$/, '') }}吗？</h2>
          <p>切换后，当前「{{ city?.name.replace(/市$/, '') }}」的地点和打卡进度会暂时收起，切回该城市时一起恢复。</p>
          <div class="city-confirm-actions">
            <button type="button" class="city-confirm-cancel" @click="cancelCitySwitch">取消</button>
            <button type="button" class="city-confirm-submit" @click="confirmCitySwitch">继续切换</button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="sheet">
      <SpotDetailSheet
        v-if="selectedSpot"
        :spot="selectedSpot"
        :persona="currentPersona"
        :action-ready="actionReady(selectedSpot)"
        :in-today="todayPlan.hasSpot(selectedSpot.id)"
        :favorite-ready="actionReady(selectedSpot)"
        :in-favorites="favorites.hasSpot(selectedSpot)"
        @close="selectedSpot = null"
        @navigate="navigateToSelected"
        @toggle-today="toggleSelectedSpot"
        @toggle-favorite="toggleFavorite(selectedSpot)"
      />
    </Transition>

    <Transition name="toast"><div v-if="toast" class="explore-toast">{{ toast }}</div></Transition>
  </main>
</template>

<style scoped>
.explore-page { --accent:#c7ff1f; width:100%; max-width:480px; min-height:100dvh; margin:0 auto; padding-bottom:110px; overflow-x:hidden; background:#02070e; color:#fff; }
.explore-header { position:sticky; z-index:30; top:0; display:flex; align-items:center; justify-content:space-between; padding:max(18px,env(safe-area-inset-top)) 18px 14px; border-bottom:1px solid rgba(255,255,255,.07); /* 吸顶栏不用毛玻璃：列表滚动时 blur 每帧重算导致掉帧，纯色视觉无差 */ background:rgba(2,7,14,.97); }
.explore-eyebrow { color:#c7ff1f; font-size:9px; font-weight:800; letter-spacing:.18em; }
.explore-header h1 { margin-top:3px; font-size:24px; font-weight:900; letter-spacing:-.03em; }
.city-switch { display:flex; height:36px; align-items:center; gap:6px; padding:0 12px; border:1px solid rgba(255,255,255,.13); border-radius:999px; background:rgba(255,255,255,.05); color:rgba(255,255,255,.74); font-size:11px; font-weight:700; }
.explore-tools { position:sticky; z-index:20; top:76px; padding:12px 0 9px; background:linear-gradient(180deg,#02070e 78%,rgba(2,7,14,.86)); }
.search-box { display:flex; height:48px; align-items:center; gap:10px; margin:0 16px; padding:0 14px; border:1px solid rgba(255,255,255,.12); border-radius:16px; background:#101620; color:rgba(255,255,255,.48); }
.search-box:focus-within { border-color:rgba(199,255,31,.5); box-shadow:0 0 0 3px rgba(199,255,31,.06); }
/* 与城市搜索保持一致，避免 iPhone 微信聚焦小字号输入框时自动放大视口。 */
.search-box input { min-width:0; flex:1; border:0; outline:0; background:transparent; color:#fff; font-size:16px; }
.search-box input::-webkit-search-cancel-button { display:none; }
.search-box input::placeholder { color:rgba(255,255,255,.36); }
.search-box button { color:rgba(255,255,255,.5); font-size:20px; }
.category-rail-wrap { position:relative; overflow:hidden; }
.category-rail-wrap::after { position:absolute; top:0; right:0; bottom:0; width:32px; pointer-events:none; content:""; background:linear-gradient(90deg,rgba(2,7,14,0),#02070e 86%); opacity:1; transition:opacity .18s ease; }
/* 已滑到末尾时隐藏渐变提示，避免误导用户以为右侧还有分类。 */
.category-rail-wrap.at-end::after { opacity:0; }
.category-rail { display:flex; gap:8px; overflow-x:auto; padding:11px 40px 2px 16px; scrollbar-width:none; scroll-padding-right:40px; -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain; }
.category-rail::-webkit-scrollbar { display:none; }
.category-rail button { flex:none; padding:8px 13px; border:1px solid rgba(255,255,255,.11); border-radius:999px; background:rgba(255,255,255,.04); color:rgba(255,255,255,.58); font-size:11px; font-weight:700; white-space:nowrap; }
.category-rail button.active { border-color:#c7ff1f; background:#c7ff1f; color:#071007; }
.view-heading { display:flex; align-items:end; justify-content:space-between; padding:13px 16px 12px; }
.view-heading p { font-size:17px; font-weight:850; }
.view-heading span { display:block; margin-top:3px; color:rgba(255,255,255,.38); font-size:10px; }
.view-switch { display:flex; padding:3px; border-radius:11px; background:rgba(255,255,255,.07); }
.view-switch button { padding:6px 10px; border-radius:8px; color:rgba(255,255,255,.45); font-size:10px; font-weight:700; }
.view-switch button.active { background:rgba(255,255,255,.12); color:#c7ff1f; }
.spot-feed { padding:0 16px 32px; }
.featured-card { position:relative; height:290px; overflow:hidden; border:1px solid rgba(255,255,255,.13); border-radius:26px; background:#101720; box-shadow:0 18px 40px rgba(0,0,0,.32); }
.featured-favorite { position:absolute; z-index:4; top:14px; right:14px; display:grid; width:38px; height:38px; place-items:center; border:1px solid rgba(255,255,255,.24); border-radius:50%; background:rgba(2,7,14,.72); color:#fff; }.featured-favorite svg { width:18px; height:18px; }.featured-favorite.active { color:#fda4af; background:rgba(40,12,20,.72); }
.featured-shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.04) 28%,rgba(2,7,14,.3) 50%,rgba(2,7,14,.98) 100%); }
.featured-content { position:absolute; right:18px; bottom:17px; left:18px; }
.feature-badge,.selected-badge { display:inline-flex; padding:5px 9px; border-radius:999px; font-size:9px; font-weight:800; }
.feature-badge { background:#c7ff1f; color:#071007; }.selected-badge { background:rgba(255,255,255,.14); color:#fff; }
.featured-content h2 { margin-top:10px; font-size:25px; font-weight:900; }.featured-content>p { margin-top:3px; color:rgba(255,255,255,.58); font-size:10px; }
.featured-content div div span,.spot-row-tags span { flex:none; padding:5px 8px; border-radius:999px; background:rgba(255,255,255,.1); color:rgba(255,255,255,.75); font-size:9px; }
.featured-content div>button { flex:none; padding:9px 12px; border-radius:12px; background:#c7ff1f; color:#071007; font-size:10px; font-weight:900; }
.more-title { padding:22px 2px 10px; color:rgba(255,255,255,.45); font-size:10px; font-weight:800; letter-spacing:.12em; }
.spot-row { display:flex; min-height:132px; gap:13px; margin-bottom:11px; padding:10px; border:1px solid rgba(255,255,255,.1); border-radius:22px; background:rgba(15,21,31,.92); }
.spot-row-cover { width:112px; min-height:112px; flex:none; overflow:hidden; border-radius:16px; }.spot-row-copy { min-width:0; flex:1; padding:4px 2px 2px 0; }
.spot-row-copy h2 { overflow:hidden; color:#fff; font-size:15px; font-weight:850; text-overflow:ellipsis; white-space:nowrap; }
.spot-row-copy button { display:grid; width:28px; height:28px; flex:none; place-items:center; border:1px solid rgba(199,255,31,.34); border-radius:999px; color:#c7ff1f; font-size:18px; }.spot-row-copy button.selected { background:#c7ff1f; color:#071007; }
.spot-row-actions { display:flex; flex:none; gap:6px; }.spot-row-copy .spot-favorite { border-color:rgba(255,255,255,.2); color:rgba(255,255,255,.68); }.spot-row-copy .spot-favorite svg { width:14px; height:14px; }.spot-row-copy .spot-favorite.active { border-color:rgba(253,164,175,.4); background:rgba(253,164,175,.12); color:#fda4af; }
.spot-row-meta { margin-top:2px; overflow:hidden; color:rgba(255,255,255,.4); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }.spot-row-reason { display:-webkit-box; margin-top:8px; overflow:hidden; color:rgba(255,255,255,.65); font-size:10px; line-height:1.5; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2; }
.spot-row-tags { display:flex; gap:5px; margin-top:8px; overflow:hidden; }
.explore-empty,.city-empty { display:flex; min-height:54dvh; flex-direction:column; align-items:center; justify-content:center; padding:36px; text-align:center; }.explore-empty>span { color:#c7ff1f; font-size:34px; }.explore-empty h2,.city-empty h2 { margin-top:12px; font-size:20px; font-weight:900; }.explore-empty p,.city-empty>p:not(.explore-eyebrow) { margin-top:8px; color:rgba(255,255,255,.46); font-size:12px; line-height:1.8; }.explore-empty button,.city-empty button { margin-top:20px; padding:11px 18px; border-radius:999px; background:#c7ff1f; color:#071007; font-size:12px; font-weight:900; }
.city-orbit { display:grid; width:84px; height:84px; margin-bottom:22px; place-items:center; border:1px solid rgba(199,255,31,.28); border-radius:999px; background:radial-gradient(circle,rgba(199,255,31,.16),transparent 68%); box-shadow:0 0 36px rgba(199,255,31,.1); }.city-orbit span { color:#c7ff1f; font-size:34px; }
.sheet-mask { position:fixed; z-index:70; inset:0; display:flex; align-items:flex-end; justify-content:center; /* mask 本身 62% 黑，毛玻璃视觉无收益还拖慢弹层动画 */ background:rgba(0,0,0,.62); }.sheet-panel { width:100%; max-width:480px; max-height:84dvh; overflow-y:auto; padding:20px; border:1px solid rgba(255,255,255,.13); border-bottom:0; border-radius:28px 28px 0 0; background:linear-gradient(180deg,#181e28,#090e16); }
.explore-toast { position:fixed; z-index:90; bottom:104px; left:50%; max-width:calc(100% - 40px); padding:10px 16px; transform:translateX(-50%); border:1px solid rgba(255,255,255,.12); border-radius:999px; background:rgba(18,24,33,.95); color:#fff; font-size:11px; font-weight:700; box-shadow:0 12px 30px rgba(0,0,0,.35); }
.city-confirm-mask { z-index:100; }
.city-confirm { width:calc(100% - 32px); max-width:420px; padding:22px 20px 20px; border:1px solid rgba(255,255,255,.12); border-radius:24px; background:#151c26; box-shadow:0 20px 60px rgba(0,0,0,.42); color:#fff; }
.city-confirm-eyebrow { color:#c7ff1f; font-size:10px; font-weight:800; letter-spacing:.14em; }
.city-confirm h2 { margin-top:8px; font-size:20px; font-weight:900; }
.city-confirm>p:not(.city-confirm-eyebrow) { margin-top:8px; color:rgba(255,255,255,.62); font-size:12px; line-height:1.7; }
.city-confirm-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px; }
.city-confirm-actions button { padding:12px 10px; border-radius:14px; font-size:12px; font-weight:800; }
.city-confirm-cancel { border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.05); color:rgba(255,255,255,.8); }
.city-confirm-submit { background:#c7ff1f; color:#071007; }
.sheet-enter-active,.sheet-leave-active,.toast-enter-active,.toast-leave-active { transition:opacity .2s ease; }.sheet-enter-from,.sheet-leave-to,.toast-enter-from,.toast-leave-to { opacity:0; }
</style>
