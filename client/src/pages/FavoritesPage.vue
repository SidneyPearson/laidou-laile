<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import SpotCover from '../components/explore/SpotCover.vue'
import SpotDetailSheet from '../components/explore/SpotDetailSheet.vue'
import { useExploreCity } from '../composables/useExploreCity'
import { useFavorites } from '../composables/useFavorites'
import { usePersona } from '../composables/usePersona'
import { useTodayPlan } from '../composables/useTodayPlan'
import { PERSONAS } from '../data/mockExploreSpots'
import type { FavoriteSpot } from '../types/favorites'
import { isFullDaySuggestedDuration, TODAY_PLAN_LIMIT } from '../types/todayPlan'
import { openAmapNavigation } from '../utils/amapNavigation'
import { haptic } from '../utils/haptics'
import { celebratePlanAdded } from '../utils/delight'

const router = useRouter()
const favorites = useFavorites()
const todayPlan = useTodayPlan()
const { city: exploreCity, setExploreCity } = useExploreCity()
const { persona, hasChosenPersona } = usePersona()

const cityFilter = ref('all')
const selectedSpot = ref<FavoriteSpot | null>(null)
const pendingCrossCity = ref<FavoriteSpot | null>(null)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

const currentPersona = computed(() => hasChosenPersona.value
  ? PERSONAS.find(item => item.id === persona.value) ?? null
  : null)
const visibleSpots = computed(() => cityFilter.value === 'all'
  ? favorites.spots.value
  : favorites.spots.value.filter(spot => normalizeCity(spot.city) === cityFilter.value))
const cityOptions = computed(() => favorites.cities.value.map(name => normalizeCity(name)))

function normalizeCity(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/市$/, '')
}

function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 2200)
}

function toggleFavorite(spot: FavoriteSpot) {
  const result = favorites.toggle(spot, spot.cityDescriptor)
  if (result.status === 'unverified') return
  haptic(16)
  const suffix = favorites.storageAvailable.value ? '' : '，仅在本次打开期间保留'
  showToast(result.status === 'added' ? `已收藏“${spot.name}”${suffix}` : `已取消收藏“${spot.name}”`)
}

function navigate(spot: FavoriteSpot) {
  openAmapNavigation(spot.amapName || spot.name, spot.lng, spot.lat, spot.name)
}

function switchToSpotCity(spot: FavoriteSpot) {
  const descriptor = spot.cityDescriptor
  setExploreCity({
    adcode: descriptor.adcode,
    name: descriptor.name || spot.city,
    province: descriptor.province,
    coverImageUrl: descriptor.coverImageUrl,
    center: descriptor.center,
  })
  todayPlan.setActiveCity({ adcode: descriptor.adcode, cityName: descriptor.name || spot.city })
}

function addToToday(spot: FavoriteSpot) {
  const currentCity = normalizeCity(exploreCity.value?.name)
  const targetCity = normalizeCity(spot.city)
  if (currentCity && currentCity !== targetCity) {
    pendingCrossCity.value = spot
    return
  }
  if (!currentCity) switchToSpotCity(spot)
  finishAddToToday(spot)
}

function confirmCrossCityAdd() {
  const spot = pendingCrossCity.value
  pendingCrossCity.value = null
  if (!spot) return
  switchToSpotCity(spot)
  finishAddToToday(spot)
}

function finishAddToToday(spot: FavoriteSpot) {
  const result = todayPlan.addSpot(spot)
  if (result.status === 'limit') {
    showToast(`“${normalizeCity(spot.city)}”的今日计划已有 ${TODAY_PLAN_LIMIT} 个地点`)
    return
  }
  if (result.status === 'duplicate') {
    showToast('这个地点已经在对应城市的今日计划里')
    return
  }
  if (result.status !== 'added') {
    showToast('这个地点暂时不能加入今日计划')
    return
  }
  haptic(isFullDaySuggestedDuration(spot.suggestedDuration) ? [28, 50, 28] : 18)
  if (isFullDaySuggestedDuration(spot.suggestedDuration)) {
    showToast(`已加入${normalizeCity(spot.city)}计划；这个地点建议游玩一整天`)
  } else if (todayPlan.count.value >= TODAY_PLAN_LIMIT) {
    // 满员是情绪高点，保留庆祝（彩带 + 满员文案），其余情况维持城市名文案。
    showToast(celebratePlanAdded(todayPlan.count.value, TODAY_PLAN_LIMIT))
  } else {
    showToast(`已加入${normalizeCity(spot.city)}的今日计划`)
  }
}

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <main class="favorites-page">
    <header class="favorites-header">
      <div>
        <p>MY COLLECTION</p>
        <h1>收藏的城市灵感</h1>
      </div>
      <span>{{ favorites.count.value }}</span>
    </header>

    <section v-if="favorites.count.value > 0" class="favorites-summary">
      <div>
        <strong>{{ favorites.count.value }}</strong>
        <span>个真实地点</span>
      </div>
      <i />
      <div>
        <strong>{{ favorites.cities.value.length }}</strong>
        <span>座城市</span>
      </div>
      <button type="button" @click="router.replace({ name: 'explore' })">继续发现 →</button>
    </section>

    <p v-if="!favorites.storageAvailable.value" class="storage-note" role="status">
      当前浏览器无法持久保存，新增收藏只在本次打开期间保留。
    </p>

    <div v-if="favorites.count.value > 0" class="city-filters" aria-label="按城市筛选收藏">
      <button type="button" :class="{ active: cityFilter === 'all' }" @click="cityFilter = 'all'">全部</button>
      <button
        v-for="name in cityOptions"
        :key="name"
        type="button"
        :class="{ active: cityFilter === name }"
        @click="cityFilter = name"
      >
        {{ name }}
      </button>
    </div>

    <section v-if="visibleSpots.length > 0" class="favorite-list">
      <article v-for="spot in visibleSpots" :key="spot.id" class="favorite-card" @click="selectedSpot = spot">
        <div class="favorite-cover">
          <SpotCover :spot="spot" />
          <span>{{ normalizeCity(spot.city) }} · {{ spot.district }}</span>
        </div>
        <div class="favorite-copy">
          <div>
            <h2>{{ spot.name }}</h2>
            <button
              type="button"
              :aria-label="`取消收藏${spot.name}`"
              @click.stop="toggleFavorite(spot)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" /></svg>
            </button>
          </div>
          <p>{{ spot.reason }}</p>
          <footer>
            <span>{{ spot.suggestedDuration }}</span>
            <b>查看详情 →</b>
          </footer>
        </div>
      </article>
    </section>

    <section v-else-if="favorites.count.value > 0" class="favorites-empty compact">
      <div>⌁</div>
      <h2>这个城市还没有收藏</h2>
      <p>切回“全部”看看其他城市，或者继续去探索新的地点。</p>
      <button type="button" @click="cityFilter = 'all'">查看全部收藏</button>
    </section>

    <section v-else class="favorites-empty">
      <div>♡</div>
      <p class="empty-eyebrow">SAVE IT FOR LATER</p>
      <h2>先把心动地点放这里</h2>
      <p>在首页、探索卡片或地点详情点亮爱心，之后换城市也能随时找回来。</p>
      <button type="button" @click="router.replace({ name: 'explore' })">去探索城市灵感 →</button>
    </section>

    <Transition name="sheet">
      <SpotDetailSheet
        v-if="selectedSpot"
        :spot="selectedSpot"
        :persona="currentPersona"
        action-ready
        favorite-ready
        :in-today="todayPlan.hasSpot(selectedSpot.id)"
        :in-favorites="favorites.hasSpot(selectedSpot)"
        @close="selectedSpot = null"
        @navigate="navigate(selectedSpot)"
        @toggle-today="addToToday(selectedSpot)"
        @toggle-favorite="toggleFavorite(selectedSpot)"
      />
    </Transition>

    <Transition name="sheet">
      <div v-if="pendingCrossCity" class="confirm-mask" @click.self="pendingCrossCity = null">
        <section class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="cross-city-title">
          <p>切换计划城市</p>
          <h2 id="cross-city-title">加入{{ normalizeCity(pendingCrossCity.city) }}的今日计划？</h2>
          <span>当前城市的地点和打卡进度会暂时收起，切回来时一起恢复。</span>
          <div>
            <button type="button" @click="pendingCrossCity = null">取消</button>
            <button type="button" class="confirm-primary" @click="confirmCrossCityAdd">切换并加入</button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="toast"><div v-if="toast" class="favorites-toast" role="status">{{ toast }}</div></Transition>
  </main>
</template>

<style scoped>
.favorites-page { --accent:#c7ff1f; width:100%; max-width:480px; min-height:100dvh; margin:0 auto; padding-bottom:calc(112px + env(safe-area-inset-bottom)); overflow-x:hidden; background:radial-gradient(circle at 88% 4%,rgba(199,255,31,.1),transparent 24%),#02070e; color:#fff; }
.favorites-header { display:flex; align-items:flex-end; justify-content:space-between; padding:max(24px,env(safe-area-inset-top)) 18px 17px; border-bottom:1px solid rgba(255,255,255,.07); }.favorites-header p,.empty-eyebrow { color:var(--accent); font-size:9px; font-weight:850; letter-spacing:.18em; }.favorites-header h1 { margin-top:4px; font-size:25px; font-weight:950; letter-spacing:-.04em; }.favorites-header>span { display:grid; width:38px; height:38px; place-items:center; border:1px solid rgba(199,255,31,.28); border-radius:50%; color:var(--accent); font-size:13px; font-weight:900; }
.favorites-summary { display:grid; grid-template-columns:auto 1px auto 1fr; align-items:center; gap:15px; margin:16px; padding:15px 16px; border:1px solid rgba(255,255,255,.1); border-radius:22px; background:rgba(17,24,34,.82); }.favorites-summary div { display:flex; flex-direction:column; }.favorites-summary strong { color:var(--accent); font-size:22px; line-height:1; }.favorites-summary span { margin-top:4px; color:rgba(255,255,255,.42); font-size:9px; }.favorites-summary i { width:1px; height:28px; background:rgba(255,255,255,.1); }.favorites-summary button { justify-self:end; color:rgba(255,255,255,.78); font-size:10px; font-weight:800; }
.storage-note { margin:0 16px 12px; padding:10px 12px; border:1px solid rgba(251,191,36,.22); border-radius:14px; background:rgba(120,53,15,.18); color:#fcd34d; font-size:10px; line-height:1.5; }
.city-filters { display:flex; gap:8px; overflow-x:auto; padding:0 16px 13px; scrollbar-width:none; }.city-filters::-webkit-scrollbar { display:none; }.city-filters button { flex:none; padding:8px 13px; border:1px solid rgba(255,255,255,.11); border-radius:999px; color:rgba(255,255,255,.55); font-size:10px; font-weight:800; }.city-filters button.active { border-color:var(--accent); background:var(--accent); color:#071007; }
.favorite-list { display:grid; gap:11px; padding:0 16px 24px; }.favorite-card { display:flex; min-height:142px; overflow:hidden; border:1px solid rgba(255,255,255,.1); border-radius:23px; background:rgba(15,21,31,.94); box-shadow:0 13px 30px rgba(0,0,0,.2); }.favorite-cover { position:relative; width:126px; flex:none; overflow:hidden; }.favorite-cover::after { position:absolute; inset:0; content:""; background:linear-gradient(180deg,transparent 55%,rgba(2,7,14,.78)); }.favorite-cover>span { position:absolute; z-index:2; right:8px; bottom:8px; left:8px; overflow:hidden; color:rgba(255,255,255,.78); font-size:8px; text-overflow:ellipsis; white-space:nowrap; }.favorite-copy { display:flex; min-width:0; flex:1; flex-direction:column; padding:14px 13px 12px; }.favorite-copy>div { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }.favorite-copy h2 { overflow:hidden; font-size:16px; font-weight:900; text-overflow:ellipsis; white-space:nowrap; }.favorite-copy button { display:grid; width:30px; height:30px; flex:none; place-items:center; border:1px solid rgba(253,164,175,.28); border-radius:50%; color:#fda4af; }.favorite-copy button svg { width:15px; height:15px; }.favorite-copy>p { display:-webkit-box; margin-top:8px; overflow:hidden; color:rgba(255,255,255,.52); font-size:10px; line-height:1.55; -webkit-box-orient:vertical; -webkit-line-clamp:3; line-clamp:3; }.favorite-copy footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:auto; padding-top:8px; }.favorite-copy footer span { color:rgba(255,255,255,.36); font-size:9px; }.favorite-copy footer b { color:var(--accent); font-size:9px; }
.favorites-empty { display:flex; min-height:62dvh; flex-direction:column; align-items:center; justify-content:center; padding:38px 34px; text-align:center; }.favorites-empty.compact { min-height:40dvh; }.favorites-empty>div { display:grid; width:84px; height:84px; place-items:center; border:1px solid rgba(199,255,31,.24); border-radius:50%; background:radial-gradient(circle,rgba(199,255,31,.12),transparent 70%); color:var(--accent); font-size:36px; }.favorites-empty .empty-eyebrow { margin-top:22px; }.favorites-empty h2 { margin-top:10px; font-size:21px; font-weight:950; }.favorites-empty>p:not(.empty-eyebrow) { max-width:310px; margin-top:9px; color:rgba(255,255,255,.45); font-size:11px; line-height:1.8; }.favorites-empty>button { margin-top:22px; padding:12px 18px; border-radius:999px; background:var(--accent); color:#071007; font-size:11px; font-weight:900; }
.confirm-mask { position:fixed; z-index:100; inset:0; display:flex; align-items:flex-end; justify-content:center; padding:16px 16px max(18px,env(safe-area-inset-bottom)); background:rgba(0,0,0,.7); }.confirm-card { width:100%; max-width:420px; padding:22px 20px; border:1px solid rgba(255,255,255,.13); border-radius:25px; background:#151c26; }.confirm-card>p { color:var(--accent); font-size:9px; font-weight:850; letter-spacing:.14em; }.confirm-card h2 { margin-top:8px; font-size:20px; font-weight:950; }.confirm-card>span { display:block; margin-top:9px; color:rgba(255,255,255,.55); font-size:11px; line-height:1.7; }.confirm-card>div { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px; }.confirm-card button { padding:12px; border:1px solid rgba(255,255,255,.12); border-radius:14px; color:rgba(255,255,255,.75); font-size:11px; font-weight:850; }.confirm-card .confirm-primary { border-color:var(--accent); background:var(--accent); color:#071007; }
.favorites-toast { position:fixed; z-index:110; bottom:calc(104px + env(safe-area-inset-bottom)); left:50%; max-width:calc(100% - 40px); padding:10px 16px; transform:translateX(-50%); border:1px solid rgba(255,255,255,.12); border-radius:999px; background:rgba(18,24,33,.96); color:#fff; font-size:11px; font-weight:750; text-align:center; white-space:nowrap; box-shadow:0 12px 30px rgba(0,0,0,.4); }
.sheet-enter-active,.sheet-leave-active,.toast-enter-active,.toast-leave-active { transition:opacity .2s ease; }.sheet-enter-from,.sheet-leave-to,.toast-enter-from,.toast-leave-to { opacity:0; }
@media (max-width:360px) { .favorite-cover { width:108px; }.favorite-copy { padding-left:11px; padding-right:10px; }.favorites-summary { gap:10px; }.favorites-summary button { font-size:9px; } }
</style>
