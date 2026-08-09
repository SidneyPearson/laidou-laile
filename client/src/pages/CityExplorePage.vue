<script setup lang="ts">
/**
 * 来都来了 · 城市探索（特种兵 swipe 确认流）
 *
 * 按 docs/design/laidou_special_forces_swipe_prototype.html 重做：
 * 深色荧光绿主题，卡片堆叠左右滑动——右滑「加入今天」、左滑「先跳过」。
 * 全部看完后：选中 ≥1 展示智能路线规划（生成今天路线），一个没选展示空态。
 *
 * 数据全部来自真实链路：城市/天气上下文 + explore 推荐接口（仅返回
 * verified+published 地点，都可加入今天计划），身份与首页共享 usePersona()。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EXPLORE_CATEGORIES, PERSONAS, getExploreSpots, filterAndRankSpots } from '../data/mockExploreSpots'
import {
  fetchCityContext,
  fetchExploreRecommendations,
  type CityContextResponse,
} from '../services/exploreApi'
import { ApiRequestError } from '../services/api'
import { useTodayPlan } from '../composables/useTodayPlan'
import { usePersona } from '../composables/usePersona'
import { fetchHomePersonas } from '../repositories/homePersonas'
import { hapticSelect, hapticSuccess } from '../utils/haptics'
import type {
  ExploreCategory,
  InspirationSpot,
  Persona,
} from '../types/explore'
import { TODAY_PLAN_LIMIT } from '../types/todayPlan'

const route = useRoute()
const router = useRouter()
const todayPlan = useTodayPlan()
const { persona, setPersona } = usePersona()

/* -------------------- state -------------------- */

const cityName = ref(String(route.query.city || '当前城市'))
const district = ref('')
const adcode = ref<string | undefined>(
  typeof route.query.adcode === 'string' && route.query.adcode
    ? route.query.adcode
    : undefined,
)
const weather = ref<CityContextResponse['weather']>(null)
const contextLoading = ref(false)
const contextError = ref('')

const spots = ref<InspirationSpot[]>([])
const feedLoading = ref(false)
const usingFallback = ref(false)
const feedError = ref('')
const personaDisplayNames = ref(new Map<string, string>())

/** Cards accepted so far (all actually added to todayPlan). */
const selected = ref<InspirationSpot[]>([])
const cardIndex = ref(0)
const finished = ref(false)
const toast = ref('')
const addError = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

/** Drag state for the front card (px / active flag). */
const dragX = ref(0)
const dragActive = ref(false)
const flying = ref(false)

let contextController: AbortController | null = null
let feedController: AbortController | null = null
let feedRequestId = 0
let flyTimer: ReturnType<typeof setTimeout> | null = null

/* -------------------- computed -------------------- */

const currentPersona = computed(() => {
  const base = PERSONAS.find(item => item.id === persona.value) ?? PERSONAS[0]
  const configuredName = personaDisplayNames.value.get(base.id)
  return configuredName ? { ...base, name: configuredName } : base
})
const cityReady = computed(() => !['当前城市', '定位演示城市'].includes(cityName.value))
const weatherSummary = computed(() => {
  if (contextLoading.value) return '正在获取城市与天气'
  if (!weather.value) return '天气暂不可用'
  return `${weather.value.weather} · ${weather.value.temperature}℃`
})
const totalCount = computed(() => spots.value.length)
const progressText = computed(() =>
  cardIndex.value >= totalCount.value && totalCount.value > 0
    ? `${selected.value.length}`
    : `${selected.value.length} / ${totalCount.value}`,
)
const categoryLabel = (category: Exclude<ExploreCategory, 'all'>): string =>
  EXPLORE_CATEGORIES.find(item => item.id === category)?.name ?? '灵感推荐'

/** 卡片无封面时的渐变占位（按主题派生）。 */
const THEME_GRADIENT: Record<string, string> = {
  river: 'linear-gradient(145deg,#123048 0%,#0a1a2c 55%,#060d16 100%)',
  lane: 'linear-gradient(145deg,#2c2412 0%,#171206 55%,#0b0803 100%)',
  museum: 'linear-gradient(145deg,#1d2330 0%,#0d1119 55%,#06080d 100%)',
  wonderland: 'linear-gradient(145deg,#3a1d4d 0%,#1c0e29 55%,#0b0512 100%)',
  garden: 'linear-gradient(145deg,#143a22 0%,#0a2013 55%,#050d08 100%)',
  market: 'linear-gradient(145deg,#4d2a10 0%,#241205 55%,#100803 100%)',
  city: 'linear-gradient(145deg,#1b2335 0%,#0c1019 55%,#06080d 100%)',
  night: 'linear-gradient(145deg,#22203a 0%,#100f1e 55%,#07060e 100%)',
}
const gradientOf = (spot: InspirationSpot): string =>
  THEME_GRADIENT[spot.theme] ?? THEME_GRADIENT.city

const cardBackground = (spot: InspirationSpot): string =>
  spot.coverImageUrl ? `url('${spot.coverImageUrl}')` : gradientOf(spot)

/** 卡片展示用的元信息。 */
function spotMeta(spot: InspirationSpot): string {
  const parts = [categoryLabel(spot.category)]
  if (spot.district) parts.push(spot.district)
  if (spot.suggestedDuration) parts.push(spot.suggestedDuration.replace(/^建议\s*/, ''))
  return parts.join(' · ')
}

/** 「为什么适合当前身份」的 ✓ 理由列表。 */
function spotReasons(spot: InspirationSpot): string[] {
  const reasons: string[] = []
  if (spot.reason) reasons.push(spot.reason)
  if (spot.suggestedDuration) reasons.push(`建议停留 ${spot.suggestedDuration.replace(/^建议\s*/, '')}`)
  if (spot.bestTime) reasons.push(`${spot.bestTime} 时段更合适`)
  return reasons.length > 0 ? reasons : ['从已验证地点库中为今日路线精选']
}

/** 当前展示的卡片（最多三张，含层叠关系）。 */
interface DeckItem {
  spot: InspirationSpot
  index: number
  layer: 'front' | 'back-1' | 'back-2'
}
const deck = computed<DeckItem[]>(() =>
  spots.value.slice(cardIndex.value, cardIndex.value + 3).map((spot, offset) => ({
    spot,
    index: cardIndex.value + offset,
    layer: (offset === 0 ? 'front' : offset === 1 ? 'back-1' : 'back-2') as DeckItem['layer'],
  })),
)
const frontStyle = computed(() => {
  if (flying.value || dragActive.value || Math.abs(dragX.value) > 0) {
    return { transform: `translateX(${dragX.value}px) rotate(${dragX.value / 18}deg)` }
  }
  return {}
})
const frontLabelRight = computed(() =>
  dragX.value > 0 ? Math.min(dragX.value / 110, 1) : 0,
)
const frontLabelLeft = computed(() =>
  dragX.value < 0 ? Math.min(-dragX.value / 110, 1) : 0,
)

/* -------------------- data loading -------------------- */

function normalizeCityName(value: string): string {
  return value.trim().replace(/市$/, '')
}

function queryNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function localFallback(): InspirationSpot[] {
  const city = normalizeCityName(cityName.value)
  return filterAndRankSpots(
    getExploreSpots(city),
    persona.value,
    'all',
  ).map(spot => ({
    ...spot,
    verificationStatus: 'demo',
    source: 'local_demo',
  }))
}

function resetSwipe() {
  cardIndex.value = 0
  finished.value = false
  // Keep the confirmation count aligned with the persisted Today Plan. The
  // previous empty reset made the header show a per-session count (for
  // example 1/6) while the dock showed the real accumulated plan (6/6).
  selected.value = [...todayPlan.spots.value]
  dragX.value = 0
  dragActive.value = false
  flying.value = false
  if (flyTimer) clearTimeout(flyTimer)
}

async function loadRecommendations() {
  const requestId = ++feedRequestId
  feedController?.abort()
  feedController = new AbortController()
  feedLoading.value = true
  feedError.value = ''

  try {
    const result = await fetchExploreRecommendations({
      city: normalizeCityName(cityName.value),
      adcode: adcode.value,
      persona: persona.value,
      category: 'all',
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
    if (requestId === feedRequestId) {
      feedLoading.value = false
      resetSwipe()
    }
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

/* -------------------- swipe interactions -------------------- */

interface DragSession {
  startX: number
  pointerId: number | null
}

let session: DragSession | null = null

function onCardDown(event: PointerEvent, item: DeckItem) {
  if (item.layer !== 'front' || finished.value) return
  dragActive.value = true
  dragX.value = 0
  session = { startX: event.clientX, pointerId: event.pointerId }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onCardMove(event: PointerEvent, item: DeckItem) {
  if (!dragActive.value || !session || event.pointerId !== session.pointerId) return
  if (item.layer !== 'front') return
  dragX.value = event.clientX - session.startX
}

function onCardUp(event: PointerEvent, item: DeckItem) {
  if (!dragActive.value || !session || event.pointerId !== session.pointerId) return
  const distance = dragX.value
  dragActive.value = false
  session = null
  if (Math.abs(distance) > 92) {
    swipe(distance > 0 ? 'add' : 'skip')
  } else {
    dragX.value = 0
  }
}

function onCardCancel(event: PointerEvent) {
  if (!dragActive.value || !session || event.pointerId !== session.pointerId) return
  dragActive.value = false
  session = null
  dragX.value = 0
}

function swipe(type: 'add' | 'skip') {
  const spot = spots.value[cardIndex.value]
  if (!spot || finished.value || flying.value) return

  if (type === 'add') {
    const result = todayPlan.addSpot(spot)
    if (result.status === 'added') {
      addError.value = ''
      if (!selected.value.some(item => item.id === spot.id)) {
        selected.value = [...selected.value, spot]
      }
      showToast(`✓ 已加入“${spot.name}”`)
    } else if (result.status === 'limit') {
      addError.value = `今日计划当前已有 ${todayPlan.count.value} 个地点，最多加入 6 个。`
      showToast('今天先选 6 个，避免行程过满')
    } else if (result.status === 'duplicate') {
      addError.value = ''
      if (!selected.value.some(item => item.id === spot.id)) {
        selected.value = [...selected.value, spot]
      }
      showToast(`✓ “${spot.name}”已在今天`)
    } else {
      const missing = [
        !spot.amapPoiId ? '高德 POI' : '',
        typeof spot.address !== 'string' || !spot.address ? '地址' : '',
        !Number.isFinite(spot.lng) ? '经度' : '',
        !Number.isFinite(spot.lat) ? '纬度' : '',
        spot.verificationStatus !== 'verified' ? '验证状态' : '',
        spot.source !== 'amap_verified' ? '数据来源' : '',
        spot.mock !== false ? '正式地点标记' : '',
      ].filter(Boolean)
      addError.value = `“${spot.name}”无法加入：${missing.length ? `缺少${missing.join('、')}` : '今日计划校验未通过'}。`
      showToast(addError.value)
      // Do not discard a card that failed to join. The previous behavior
      // advanced the deck anyway, making the failed confirmation look like a
      // successful swipe and hiding the reason from the user.
      return
    }
  } else {
    showToast(`已跳过“${spot.name}”`)
  }

  // Fly the front card away; advance the deck after the animation ends.
  flying.value = true
  dragX.value = type === 'add' ? 520 : -520
  hapticSelect()

  if (flyTimer) clearTimeout(flyTimer)
  flyTimer = setTimeout(() => {
    flying.value = false
    dragX.value = 0
    cardIndex.value += 1
  }, 280)
}

/* -------------------- actions -------------------- */

function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 1400)
}

function finishNow() {
  if (selected.value.length < 1) {
    showToast('先至少确认 1 个地点')
    return
  }
  hapticSuccess()
  finished.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function reloadBatch() {
  showToast('正在为你换一批…')
  void loadRecommendations()
}

function switchPersona() {
  const ids = PERSONAS.map(item => item.id)
  const nextIndex = (ids.indexOf(persona.value) + 1) % ids.length
  setPersona(ids[nextIndex] as Persona)
}

/* -------------------- lifecycle -------------------- */

watch(persona, () => {
  void loadRecommendations()
})

onMounted(() => {
  fetchHomePersonas().then((cards) => {
    personaDisplayNames.value = new Map(cards.map(card => [card.id, card.title]))
  }).catch(() => {})
  void loadContext()
})

onBeforeUnmount(() => {
  contextController?.abort()
  feedController?.abort()
  if (toastTimer) clearTimeout(toastTimer)
  if (flyTimer) clearTimeout(flyTimer)
})

/* -------------------- template helpers -------------------- */

const dockNames = computed(() =>
  todayPlan.spots.value.length > 0
    ? todayPlan.spots.value.map(spot => spot.name).join(' · ')
    : '还没有加入地点',
)
const remainingPlanSlots = computed(() => Math.max(0, TODAY_PLAN_LIMIT - todayPlan.count.value))
const finishEnabled = computed(() => selected.value.length >= 1)
const routeList = computed(() =>
  selected.value.map((spot, index) => ({
    index: index + 1,
    name: spot.name,
    stay: spot.suggestedDuration ? spot.suggestedDuration.replace(/^建议\s*/, '') : '约 90 分钟',
  })),
)
</script>

<template>
  <main class="swipe-app">
    <div class="hero-bg" />

    <div class="content">
      <div class="top-row">
        <button class="back" aria-label="返回" @click="router.push({ name: 'home' })">‹</button>
        <div class="location">
          <div class="pin" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" stroke="currentColor" stroke-width="1.8" />
              <circle cx="12" cy="9" r="2.3" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </div>
          <div class="location-copy">
            <strong>{{ cityReady ? `${cityName}${district ? ' · ' + district : ''}` : '正在识别当前城市' }}</strong>
            <span>{{ weatherSummary }}</span>
          </div>
        </div>
      </div>

      <section class="mode">
        <div class="mode-top">
          <div class="mode-kicker">⚡ {{ currentPersona.name }}模式已开启</div>
        </div>
        <p>
          已从{{ cityReady ? cityName : '当前城市' }}地点库中为你筛出
          <b class="mode-count">{{ totalCount }}</b> 个符合「{{ currentPersona.name }}」标签的地点，快速确认后即可生成今日路线。
        </p>
        <div v-if="usingFallback" class="mode-note">
          {{ feedError || '实时推荐暂不可用' }}，当前展示本地演示地点。
        </div>
      </section>

      <div class="confirm-head">
        <div>
          <h2>先确认今天想去的地方</h2>
          <p>左右滑动卡片，喜欢就加入今天</p>
        </div>
        <div class="progress">已确认 <b>{{ progressText }}</b></div>
      </div>

      <div v-if="feedLoading" class="stack-wrap">
        <div class="card skeleton-card">
          <div class="skeleton-shine" />
          <div class="skeleton-body">
            <div class="sk-line sk-title" />
            <div class="sk-line sk-short" />
            <div class="sk-lines"><div class="sk-line" /><div class="sk-line" /><div class="sk-line sk-short" /></div>
          </div>
        </div>
      </div>

      <template v-else>
        <div v-if="spots.length === 0" class="empty show">
          <h3>还没有可推荐的地点</h3>
          <p>这个城市的地点库还是空的，换个城市试试。</p>
          <button type="button" @click="router.push({ name: 'home' })">返回首页</button>
        </div>

        <div v-else-if="!finished" class="stack-wrap swipe-deck">
          <article
            v-for="item in deck"
            :key="item.spot.id"
            class="card"
            :class="[item.layer, { dragging: dragActive && item.layer === 'front', flying: flying && item.layer === 'front' }]"
            :style="item.layer === 'front' ? frontStyle : undefined"
            @pointerdown="onCardDown($event, item)"
            @pointermove="onCardMove($event, item)"
            @pointerup="onCardUp($event, item)"
            @pointercancel="onCardCancel($event)"
          >
            <div class="card-image" :style="{ backgroundImage: cardBackground(item.spot) }" />
            <div class="card-shade" />
            <div class="badge">⚡ {{ currentPersona.name }}推荐</div>
            <div class="swipe-label right" :style="item.layer === 'front' ? { opacity: String(frontLabelRight) } : undefined">加入今天</div>
            <div class="swipe-label left" :style="item.layer === 'front' ? { opacity: String(frontLabelLeft) } : undefined">先跳过</div>
            <div class="card-body">
              <h3>{{ item.spot.name }}</h3>
              <div class="meta">{{ spotMeta(item.spot) }}</div>
              <div class="tags">
                <span v-for="tag in item.spot.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
              </div>
              <div class="reason-box">
                <div class="reason-title">⚡ 为什么适合{{ currentPersona.name }}？</div>
                <ul>
                  <li v-for="(reason, reasonIndex) in spotReasons(item.spot).slice(0, 3)" :key="reasonIndex">{{ reason }}</li>
                </ul>
              </div>
            </div>
          </article>
        </div>

        <section v-else-if="selected.length > 0" class="route-panel show">
          <h3>✦ 智能路线规划</h3>
          <p>今天想去的地方已经确认好了。我会根据地点顺序、距离和你的「{{ currentPersona.name }}」身份，生成更紧凑的游玩安排。</p>
          <div class="route-list">
            <div v-for="item in routeList" :key="item.index" class="route-item">
              <b>{{ item.index }}</b>
              <span>{{ item.name }} · 建议停留 {{ item.stay }}</span>
            </div>
          </div>
          <button class="route-cta" type="button" @click="router.push({ name: 'today-plan' })">生成今天路线 →</button>
        </section>

        <section v-else class="empty show">
          <h3>这批都不太对？</h3>
          <p>你可以再换一批符合{{ currentPersona.name }}标签的地点，或者换个身份重新推荐。</p>
          <div class="empty-actions">
            <button type="button" @click="reloadBatch">换一批</button>
            <button class="empty-ghost" type="button" @click="switchPersona">换个身份</button>
          </div>
        </section>

        <div v-if="!finished && spots.length > 0" class="actions">
          <button class="action-round" type="button" aria-label="跳过" @click="swipe('skip')">×</button>
          <div class="action-center"><b>左右滑动选择</b><div class="chev">›››</div></div>
          <button class="action-round add" type="button" aria-label="加入今天" @click="swipe('add')">✓</button>
        </div>
        <p v-if="addError && !finished" class="add-error" role="alert">{{ addError }}</p>
      </template>
    </div>

    <div class="toast" :class="{ show: !!toast }">{{ toast }}</div>

    <div v-if="!finished && spots.length > 0" class="dock">
      <div class="thumbs">
        <div
          v-for="(spot, index) in selected.slice(-2)"
          :key="`${spot.id}-${index}`"
          class="thumb"
          :style="{ backgroundImage: cardBackground(spot) }"
        />
      </div>
      <div class="dock-copy">
        <strong>今日计划 <span class="dock-count">{{ todayPlan.count.value }}</span> / {{ TODAY_PLAN_LIMIT }}</strong>
        <span>{{ remainingPlanSlots > 0 ? `还可加入 ${remainingPlanSlots} 个 · ` : '已满 · ' }}{{ dockNames }}</span>
      </div>
      <button class="finish" :class="{ enabled: finishEnabled }" type="button" @click="finishNow">差不多了 →</button>
    </div>
  </main>
</template>

<style scoped>
.swipe-app {
  --bg: #05080d;
  --bg-2: #080d14;
  --panel: rgba(15, 20, 29, 0.74);
  --panel-strong: rgba(10, 14, 21, 0.92);
  --line: rgba(255, 255, 255, 0.12);
  --line-strong: rgba(196, 255, 27, 0.46);
  --text: #f5f7fa;
  --muted: rgba(255, 255, 255, 0.62);
  --faint: rgba(255, 255, 255, 0.36);
  --lime: #c9ff1f;
  --lime-2: #aaf600;
  --shadow: 0 24px 60px rgba(0, 0, 0, 0.44);
  --r-sm: 14px;
  --r-md: 22px;
  --r-lg: 30px;

  position: relative;
  min-height: 100%;
  max-width: 480px;
  margin: 0 auto;
  overflow-x: hidden;
  background: linear-gradient(to bottom, rgba(3, 7, 12, 0.08), #05080d 32%), #05080d;
  color: var(--text);
  padding-bottom: calc(120px + env(safe-area-inset-bottom));
}

.hero-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 300px;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba(2, 6, 12, 0.18), rgba(2, 6, 12, 0.42) 42%, #05080d 96%);
}

.content {
  position: relative;
  z-index: 2;
  padding: calc(22px + env(safe-area-inset-top)) 18px 40px;
}

/* ---------- top row ---------- */
.top-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.back {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(8, 13, 20, 0.58);
  color: #fff;
  font-size: 26px;
  display: grid;
  place-items: center;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.location {
  flex: 1;
  height: 48px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(18, 25, 35, 0.72);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  min-width: 0;
}
.pin {
  color: var(--lime);
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
.pin svg {
  display: block;
  width: 100%;
  height: 100%;
}
.location-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.location-copy strong {
  min-width: 0;
  font-size: 14px;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.location-copy span {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
}

/* ---------- mode card ---------- */
.mode {
  margin-top: 26px;
  padding: 18px 18px 20px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(5, 10, 17, 0.78), rgba(12, 18, 28, 0.70));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--shadow);
  position: relative;
  overflow: hidden;
}
.mode-top {
  position: relative;
  z-index: 2;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.mode-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid rgba(201, 255, 31, 0.38);
  border-radius: 999px;
  background: rgba(201, 255, 31, 0.06);
  color: var(--lime);
  font-size: 12px;
  font-weight: 800;
}
.mode-switch {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  padding: 7px 12px;
  border-radius: 999px;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.mode-switch:active {
  color: var(--lime);
  border-color: rgba(201, 255, 31, 0.4);
}
.mode h1 {
  position: relative;
  z-index: 2;
  margin: 14px 0 8px;
  font-size: 31px;
  letter-spacing: -1px;
  line-height: 1.1;
  color: var(--text);
}
.mode p {
  position: relative;
  z-index: 2;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  max-width: 300px;
}
.mode-count {
  color: var(--lime);
}
.mode-note {
  position: relative;
  z-index: 2;
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 196, 31, 0.25);
  background: rgba(255, 196, 31, 0.07);
  color: rgba(255, 220, 130, 0.85);
  font-size: 10px;
  line-height: 1.5;
}

/* ---------- confirm head ---------- */
.confirm-head {
  margin-top: 28px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
}
.confirm-head h2 {
  margin: 0;
  font-size: 22px;
  color: var(--text);
}
.confirm-head p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 11px;
}
.progress {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.progress b {
  color: var(--lime);
  font-size: 18px;
}

/* ---------- swipe deck ---------- */
.stack-wrap {
  position: relative;
  height: 442px;
  margin-top: 14px;
  perspective: 1200px;
}
.card {
  position: absolute;
  left: 0;
  right: 0;
  margin: auto;
  width: 100%;
  height: 422px;
  border-radius: 28px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: #0a1018;
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.48);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.26s ease, opacity 0.26s ease, filter 0.26s ease;
}
.card.back-1 {
  transform: translateY(12px) scale(0.965) rotate(2.2deg);
  filter: brightness(0.62);
  z-index: 1;
}
.card.back-2 {
  transform: translateY(24px) scale(0.92) rotate(4.2deg);
  filter: brightness(0.40);
  z-index: 0;
}
.card.front {
  z-index: 3;
  cursor: grab;
}
.card.dragging {
  transition: none;
  cursor: grabbing;
}
.card.flying {
  opacity: 0;
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.card-image {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
}
.card-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 36%, rgba(4, 8, 13, 0.35) 54%, rgba(3, 7, 11, 0.96) 76%, #05080d 100%);
}
.badge {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 4;
  padding: 7px 10px;
  border-radius: 12px;
  background: rgba(6, 11, 17, 0.76);
  border: 1px solid rgba(201, 255, 31, 0.22);
  color: var(--lime);
  font-size: 11px;
  font-weight: 800;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.swipe-label {
  position: absolute;
  top: 50%;
  transform: translateY(-50%) rotate(-9deg);
  z-index: 6;
  border: 2px solid var(--lime);
  color: var(--lime);
  padding: 10px 13px;
  border-radius: 14px;
  font-size: 19px;
  font-weight: 900;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.swipe-label.right {
  left: 22px;
}
.swipe-label.left {
  right: 22px;
  transform: translateY(-50%) rotate(9deg);
  border-color: #e5e8ee;
  color: #e5e8ee;
}
.card-body {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  z-index: 4;
}
.card-body h3 {
  margin: 0;
  font-size: 30px;
  line-height: 1;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-body .meta {
  margin: 8px 0 10px;
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.tag {
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 10px;
  color: #e9edf2;
}
.reason-box {
  margin-top: 13px;
  padding: 11px 12px;
  border-radius: 16px;
  border: 1px solid rgba(201, 255, 31, 0.18);
  background: rgba(201, 255, 31, 0.045);
}
.reason-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--lime);
  font-size: 11px;
  font-weight: 800;
  margin-bottom: 6px;
}
.reason-box ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.reason-box li {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.6;
}
.reason-box li::before {
  content: "✓";
  color: var(--lime);
  margin-right: 7px;
}

/* ---------- swipe labels opacity driven by drag ---------- */
.swipe-deck .card:not(.front) .swipe-label {
  opacity: 0;
}

/* ---------- actions ---------- */
.actions {
  display: grid;
  grid-template-columns: 72px 1fr 72px;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
}
.action-round {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.13);
  background: rgba(10, 15, 23, 0.86);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 27px;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.32);
}
.action-round.add {
  justify-self: end;
  background: var(--lime);
  color: #081005;
  border: 0;
  box-shadow: 0 0 30px rgba(201, 255, 31, 0.38);
}
.action-center {
  text-align: center;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}
.action-center b {
  display: block;
  color: #fff;
  font-size: 11px;
  margin-bottom: 4px;
}
.action-center .chev {
  color: var(--lime);
  letter-spacing: 4px;
  font-size: 19px;
}

/* ---------- toast ---------- */
.toast {
  position: fixed;
  left: 50%;
  bottom: 126px;
  transform: translateX(-50%) translateY(20px);
  opacity: 0;
  z-index: 20;
  padding: 9px 14px;
  border-radius: 999px;
  background: rgba(8, 13, 19, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 11px;
  transition: 0.2s ease;
  white-space: nowrap;
  max-width: 82vw;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.add-error {
  margin: -4px auto 0;
  max-width: min(100%, 360px);
  color: #ffb4a8;
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

/* ---------- dock ---------- */
.dock {
  position: fixed;
  z-index: 12;
  left: 50%;
  bottom: calc(14px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(calc(100% - 28px), 362px);
  min-height: 86px;
  padding: 12px 12px 12px 14px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(14, 19, 27, 0.86);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.5);
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
}
.thumbs {
  display: flex;
  min-width: 64px;
}
.thumb {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid #dbe0e6;
  background-size: cover;
  background-position: center;
  margin-right: -13px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
.dock-copy {
  min-width: 0;
}
.dock-copy strong {
  display: block;
  font-size: 13px;
  color: var(--text);
}
.dock-count {
  color: var(--lime);
}
.dock-copy span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.finish {
  height: 52px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #d6ff2c, #b7ff13);
  color: #111;
  font-weight: 900;
  font-size: 15px;
  box-shadow: 0 0 30px rgba(201, 255, 31, 0.28);
  opacity: 0.55;
}
.finish.enabled {
  opacity: 1;
}

/* ---------- route panel ---------- */
.route-panel {
  margin-top: 22px;
  padding: 18px;
  border: 1px solid rgba(201, 255, 31, 0.30);
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(18, 26, 21, 0.82), rgba(8, 13, 18, 0.92));
}
.route-panel h3 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--text);
}
.route-panel p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}
.route-list {
  margin: 14px 0;
  display: grid;
  gap: 9px;
}
.route-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.05);
}
.route-item b {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--lime);
  color: #071007;
  font-size: 11px;
  flex-shrink: 0;
}
.route-item span {
  font-size: 12px;
  color: #e9edf2;
}
.route-cta {
  width: 100%;
  height: 50px;
  border: 0;
  border-radius: 999px;
  background: var(--lime);
  font-weight: 900;
  font-size: 15px;
  color: #071007;
}

/* ---------- empty ---------- */
.empty {
  margin: 28px 0 0;
  padding: 30px 18px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.03);
}
.empty h3 {
  margin: 0 0 8px;
  font-size: 17px;
  color: var(--text);
}
.empty p {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  margin: 0 0 14px;
}
.empty .empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.empty .empty-actions button {
  margin-top: 0;
  height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: var(--lime);
  font-weight: 800;
  color: #071007;
}
.empty button.empty-ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--muted);
}

/* ---------- skeleton ---------- */
.skeleton-card {
  cursor: default;
}
.skeleton-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0) 70%);
  background-size: 200% 100%;
  animation: shine 1.4s ease infinite;
}
@keyframes shine {
  0% { background-position: 130% 0; }
  100% { background-position: -30% 0; }
}
.skeleton-body {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  z-index: 4;
}
.sk-line {
  height: 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.10);
  margin-bottom: 10px;
}
.sk-title {
  width: 55%;
  height: 30px;
  margin-bottom: 14px;
}
.sk-short {
  width: 40%;
}
.sk-lines {
  margin-top: 18px;
}

@media (max-width: 360px) {
  .content {
    padding-left: 14px;
    padding-right: 14px;
  }
  .mode h1 {
    font-size: 28px;
  }
  .stack-wrap {
    height: 430px;
  }
  .card {
    height: 410px;
  }
}
</style>
