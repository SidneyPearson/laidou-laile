<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useExploreCity } from '../composables/useExploreCity'
import { useFavorites } from '../composables/useFavorites'
import { useGeolocation } from '../composables/useGeolocation'
import { usePersona } from '../composables/usePersona'
import { useTodayJourney } from '../composables/useTodayJourney'
import { useTodayPlan } from '../composables/useTodayPlan'
import CityLocationButton from '../components/home/CityLocationButton.vue'
import LocationSheet from '../components/home/LocationSheet.vue'
import CityPicker from '../components/CityPicker.vue'
import {
  defaultHomePersonaCards,
  fetchHomePersonas,
  type HomePersonaCard,
} from '../repositories/homePersonas'
import { loadCityRecommendations, type RecommendationCity } from '../repositories/cityRecommendations'
import { fetchCityContext } from '../services/exploreApi'
import type { Persona } from '../types/explore'
import { haptic } from '../utils/haptics'

type ClearTarget = 'favorites' | 'plan' | 'persona'

const router = useRouter()
const favorites = useFavorites()
const plan = useTodayPlan()
const journey = useTodayJourney()
const { city, setExploreCity } = useExploreCity()
const { coords, error: locationError, requestLocation } = useGeolocation()
const { persona, hasChosenPersona, setPersona, resetPersona } = usePersona()

const clearTarget = ref<ClearTarget | null>(null)
const showLocationSheet = ref(false)
const showCityPicker = ref(false)
const pendingCity = ref<RecommendationCity | null>(null)
const showCityConfirm = ref(false)
const toast = ref('')
const personaCards = ref<HomePersonaCard[]>(defaultHomePersonaCards())
const personasLoaded = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let personasController: AbortController | null = null

const currentPersonaCard = computed(() =>
  personaCards.value.find(item => item.id === persona.value) ?? null,
)
const hasVisiblePersona = computed(() => hasChosenPersona.value && currentPersonaCard.value !== null)
const emptyPersonaTitle = computed(() => {
  if (!hasChosenPersona.value) return '还没决定今天怎么玩'
  return personasLoaded.value ? '当前画像暂未开放' : '正在同步城市画像…'
})
const PERSONA_TOASTS = [
  '今天的腿，就交给这个身份了',
  '新身份已就位，走着',
  '换个打开城市的方式',
] as const
let personaToastIndex = 0
const cityLabel = computed(() => city.value?.name.replace(/市$/, '') || plan.cities.value[0]?.replace(/市$/, '') || '还没选城市')
const profileCityLabel = computed(() => cityLabel.value === '还没选城市' ? '未选城市' : cityLabel.value)
const journeyLabel = computed(() => {
  if (journey.status.value === 'complete') return `今日已完成 ${journey.completedIds.value.length} 站`
  if (journey.status.value === 'active') return `进行中 · 已完成 ${journey.completedIds.value.length} 站`
  return plan.count.value > 0 ? '计划已准备好' : '今天还没有计划'
})

const clearCopy = computed(() => {
  if (clearTarget.value === 'favorites') return {
    eyebrow: '清空收藏',
    title: `移除全部 ${favorites.count.value} 个收藏？`,
    body: '收藏地点会从当前微信浏览器中移除，今日计划不会受到影响。',
    action: '清空收藏',
  }
  if (clearTarget.value === 'plan') return {
    eyebrow: '清空当前城市',
    title: `清空${cityLabel.value}的今日计划？`,
    body: '当前城市的计划和行程进度会一起重置，其他城市已经保存的计划仍然保留。',
    action: '清空计划',
  }
  return {
    eyebrow: '重置画像',
    title: '恢复为尚未选择画像？',
    body: '首页灵感的编辑排序不会变化；下次进入探索时，在重新选择前不使用画像筛选。',
    action: '重置画像',
  }
})

function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 2000)
}

function choosePersona(next: Persona) {
  if (hasChosenPersona.value && persona.value === next) return
  setPersona(next)
  haptic(16)
  const name = personaCards.value.find(item => item.id === next)?.title || '新画像'
  const line = PERSONA_TOASTS[personaToastIndex % PERSONA_TOASTS.length]
  personaToastIndex += 1
  showToast(`已切到「${name}」· ${line}`)
}

function openLocationSheet() {
  showCityPicker.value = false
  showLocationSheet.value = true
}

function applyCitySwitch(next: RecommendationCity) {
  plan.setActiveCity({ adcode: next.adcode, cityName: next.name })
  journey.reset()
  setExploreCity(next)
  showToast(`已切换到${next.name.replace(/市$/, '')}`)
}

function requestCitySwitch(next: RecommendationCity) {
  const current = city.value
  if (current?.adcode === next.adcode || (plan.count.value === 0 && journey.status.value === 'idle')) {
    applyCitySwitch(next)
    return
  }
  pendingCity.value = next
  showCityConfirm.value = true
}

function confirmCitySwitch() {
  const next = pendingCity.value
  showCityConfirm.value = false
  pendingCity.value = null
  if (next) applyCitySwitch(next)
}

function cancelCitySwitch() {
  showCityConfirm.value = false
  pendingCity.value = null
}

function handleManualCity() {
  showLocationSheet.value = false
  showCityPicker.value = true
}

function handleCitySelect(next: RecommendationCity) {
  if (!next.center) return
  showCityPicker.value = false
  requestCitySwitch(next)
}

async function handleUseLocation() {
  showLocationSheet.value = false
  await requestLocation(false)
  if (locationError.value || !coords.value) {
    showToast(locationError.value?.message ?? '定位失败，请手动选择城市')
    return
  }
  try {
    const center = { lat: coords.value.lat, lng: coords.value.lng }
    const [context, recommendations] = await Promise.all([
      fetchCityContext(center.lat, center.lng),
      loadCityRecommendations(),
    ])
    const locatedName = context.city.replace(/市$/, '')
    const matched = recommendations.cities.find(item => item.adcode === context.adcode)
      ?? recommendations.cities.find(item => item.name.replace(/市$/, '') === locatedName)
    requestCitySwitch(matched ?? {
      adcode: context.adcode,
      name: context.city,
      province: '',
      coverImageUrl: null,
      center,
    })
  } catch {
    showToast('暂时无法识别所在城市，请手动选择')
  }
}

function onPersonaImageError(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (image) image.style.display = 'none'
}

function confirmClear() {
  const target = clearTarget.value
  clearTarget.value = null
  if (target === 'favorites') {
    if (favorites.clear()) showToast('收藏已清空')
    return
  }
  if (target === 'plan') {
    plan.clear()
    journey.reset()
    showToast(`${cityLabel.value}的今日计划和行程已清空`)
    return
  }
  if (target === 'persona') {
    resetPersona()
    showToast('画像偏好已重置')
  }
}

onMounted(async () => {
  const controller = new AbortController()
  personasController = controller
  const cards = await fetchHomePersonas(controller.signal)
  if (!controller.signal.aborted) {
    personaCards.value = cards
    personasLoaded.value = true
  }
})

onBeforeUnmount(() => {
  personasController?.abort()
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <main class="me-page">
    <header class="profile-hero">
      <div class="avatar" aria-hidden="true">来</div>
      <div class="identity">
        <p>LOCAL TRAVELER</p>
        <h1>城市漫游者</h1>
        <span>数据只保存在当前微信浏览器</span>
      </div>
      <CityLocationButton
        :city-name="profileCityLabel"
        aria-label="当前定位城市，点击更换"
        @click="openLocationSheet"
      />
    </header>

    <section class="stats-grid" aria-label="我的城市数据">
      <button type="button" @click="router.replace({ name: 'favorites' })">
        <strong>{{ favorites.count.value }}</strong><span>收藏地点</span><small>查看收藏 →</small>
      </button>
      <button type="button" @click="router.replace({ name: 'today-plan' })">
        <strong>{{ plan.count.value }}</strong><span>今日计划</span><small>{{ journeyLabel }}</small>
      </button>
    </section>

    <section class="panel persona-panel" aria-labelledby="persona-title">
      <div class="panel-head">
        <div><p>MY PERSONA</p><h2 id="persona-title">我的城市画像</h2></div>
      </div>

      <div class="persona-layout" :class="{ 'is-unselected': !hasVisiblePersona }" aria-live="polite">
        <div v-if="hasVisiblePersona && currentPersonaCard" class="persona-portrait" aria-hidden="true">
          <img :src="currentPersonaCard.imageUrl" alt="" decoding="async" @error="onPersonaImageError">
        </div>
        <div class="persona-visual-copy">
          <strong>{{ hasVisiblePersona ? currentPersonaCard?.title : emptyPersonaTitle }}</strong>
          <p>{{ hasVisiblePersona ? currentPersonaCard?.tagline : '选一个画像，探索更懂你' }}</p>

          <div class="persona-chip-row" role="group" aria-label="切换城市画像">
            <button
              v-for="item in personaCards"
              :key="item.id"
              type="button"
              :class="{ active: hasChosenPersona && persona === item.id }"
              :aria-pressed="hasChosenPersona && persona === item.id"
              @click="choosePersona(item.id)"
            >
              {{ item.title }}
            </button>
          </div>
        </div>
      </div>
      <p class="persona-hint">只给探索换个口味，首页灵感照旧</p>
    </section>

    <section class="panel shortcuts-panel">
      <div class="panel-head"><div><p>QUICK ACCESS</p><h2>继续逛城市</h2></div></div>
      <div class="shortcut-list">
        <button type="button" @click="router.replace({ name: 'explore' })"><i>⌁</i><span><b>探索城市灵感</b><small>继续看已验证的策展地点</small></span><em>→</em></button>
        <button type="button" @click="router.replace({ name: 'today-plan' })"><i>✦</i><span><b>打开今日计划</b><small>{{ journeyLabel }}</small></span><em>→</em></button>
        <button type="button" @click="router.replace({ name: 'favorites' })"><i>♡</i><span><b>查看我的收藏</b><small>{{ favorites.count.value }} 个地点，跨城市保留</small></span><em>→</em></button>
      </div>
    </section>

    <section class="panel data-panel">
      <div class="panel-head"><div><p>LOCAL DATA</p><h2>本地数据管理</h2></div></div>
      <p class="panel-note">每项独立处理，不会一次清空所有内容。</p>
      <div class="data-actions">
        <button type="button" :disabled="favorites.count.value === 0" @click="clearTarget = 'favorites'"><span>清空全部收藏<small>{{ favorites.count.value }} 个地点</small></span><b>清空</b></button>
        <button type="button" :disabled="plan.count.value === 0 && journey.status.value === 'idle'" @click="clearTarget = 'plan'"><span>清空当前城市计划<small>其他城市计划继续保留</small></span><b>清空</b></button>
        <button type="button" :disabled="!hasChosenPersona" @click="clearTarget = 'persona'"><span>重置画像偏好<small>恢复为尚未选择</small></span><b>重置</b></button>
      </div>
      <p v-if="!favorites.storageAvailable.value || !plan.storageAvailable.value" class="storage-warning">当前浏览器的持久存储不可用，部分更改只能保留到本次关闭前。</p>
    </section>

    <footer class="me-footer">来都来了 · 轻量城市灵感 H5</footer>

    <Transition name="city-sheet">
      <div v-if="showCityPicker" class="city-picker-mask" @click.self="showCityPicker = false">
        <div class="city-picker-panel">
          <CityPicker @select="handleCitySelect" @cancel="showCityPicker = false" />
        </div>
      </div>
    </Transition>

    <LocationSheet
      :visible="showLocationSheet"
      @use-location="handleUseLocation"
      @manual="handleManualCity"
      @dismiss="showLocationSheet = false"
    />

    <Transition name="sheet">
      <div v-if="showCityConfirm" class="confirm-mask" @click.self="cancelCitySwitch">
        <section class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="city-switch-title">
          <p>切换城市</p>
          <h2 id="city-switch-title">切换到{{ pendingCity?.name.replace(/市$/, '') }}？</h2>
          <span>当前「{{ cityLabel }}」的今日计划会暂时收起，切回该城市时自动恢复。</span>
          <div>
            <button type="button" @click="cancelCitySwitch">取消</button>
            <button type="button" class="danger" @click="confirmCitySwitch">切换城市</button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="sheet">
      <div v-if="clearTarget" class="confirm-mask" @click.self="clearTarget = null">
        <section class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="clear-title">
          <p>{{ clearCopy.eyebrow }}</p>
          <h2 id="clear-title">{{ clearCopy.title }}</h2>
          <span>{{ clearCopy.body }}</span>
          <div>
            <button type="button" @click="clearTarget = null">取消</button>
            <button type="button" class="danger" @click="confirmClear">{{ clearCopy.action }}</button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="toast"><div v-if="toast" class="me-toast" role="status">{{ toast }}</div></Transition>
  </main>
</template>

<style scoped>
.me-page { --accent:#c7ff1f; width:100%; max-width:480px; min-height:100dvh; margin:0 auto; padding:0 16px calc(112px + env(safe-area-inset-bottom)); overflow-x:hidden; background:radial-gradient(circle at 8% 0,rgba(56,189,248,.12),transparent 26%),radial-gradient(circle at 95% 14%,rgba(199,255,31,.09),transparent 24%),#02070e; color:#fff; }
.profile-hero { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; padding:max(27px,env(safe-area-inset-top)) 2px 22px; }.avatar { display:grid; width:62px; height:62px; place-items:center; border:1px solid rgba(199,255,31,.38); border-radius:21px; background:linear-gradient(145deg,rgba(199,255,31,.24),rgba(56,189,248,.16)); color:var(--accent); font-size:27px; font-weight:950; box-shadow:0 0 28px rgba(199,255,31,.1); }.identity { min-width:0; }.identity p,.panel-head p { color:var(--accent); font-size:8px; font-weight:850; letter-spacing:.17em; }.identity h1 { margin-top:3px; font-size:23px; font-weight:950; letter-spacing:-.04em; }.identity>span { display:block; margin-top:3px; overflow:hidden; color:rgba(255,255,255,.38); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
.stats-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }.stats-grid button { min-width:0; padding:16px; border:1px solid rgba(255,255,255,.1); border-radius:21px; background:rgba(15,22,32,.88); text-align:left; box-shadow:0 12px 28px rgba(0,0,0,.18); }.stats-grid strong { display:block; color:var(--accent); font-size:26px; line-height:1; }.stats-grid span { display:block; margin-top:5px; font-size:12px; font-weight:900; }.stats-grid small { display:block; margin-top:7px; overflow:hidden; color:rgba(255,255,255,.38); font-size:8px; text-overflow:ellipsis; white-space:nowrap; }
.panel { margin-top:12px; padding:17px; border:1px solid rgba(255,255,255,.09); border-radius:23px; background:rgba(14,20,30,.86); }.panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }.panel-head h2 { margin-top:3px; font-size:16px; font-weight:920; }.panel-note { margin-top:7px; color:rgba(255,255,255,.58); font-size:9px; line-height:1.55; }
.persona-panel { overflow:hidden; padding:15px; }
.persona-layout { display:grid; grid-template-columns:132px minmax(0,1fr); align-items:center; gap:14px; margin-top:12px; }.persona-portrait { aspect-ratio:1; overflow:hidden; border:1px solid rgba(255,255,255,.14); border-radius:18px; background:#151d27; }.persona-portrait img { width:100%; height:100%; object-fit:contain; }.persona-visual-copy { min-width:0; }.persona-visual-copy strong { display:block; overflow:hidden; color:#fff; font-size:20px; font-weight:950; letter-spacing:-.025em; text-overflow:ellipsis; white-space:nowrap; }.persona-visual-copy p { margin-top:4px; overflow:hidden; color:rgba(255,255,255,.56); font-size:10px; line-height:1.5; text-overflow:ellipsis; white-space:nowrap; }.persona-layout.is-unselected { grid-template-columns:1fr; padding:4px 0; }.persona-layout.is-unselected strong { color:rgba(255,255,255,.78); font-size:16px; letter-spacing:0; }.persona-layout.is-unselected p { color:rgba(255,255,255,.48); }
.persona-chip-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin-top:12px; }.persona-chip-row button { display:flex; min-width:0; min-height:40px; align-items:center; justify-content:center; padding:0 8px; overflow:hidden; border:1px solid rgba(255,255,255,.13); border-radius:999px; color:rgba(255,255,255,.68); font-size:10px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; transition:transform .16s ease-out,border-color .16s ease-out,background .16s ease-out,color .16s ease-out; }.persona-chip-row button:active { transform:scale(.96); }.persona-chip-row button.active { border-color:var(--accent); background:var(--accent); color:#101508; }
.persona-hint { margin-top:10px; color:rgba(255,255,255,.5); font-size:9px; line-height:1.5; }
.shortcut-list,.data-actions { display:grid; gap:1px; margin-top:13px; overflow:hidden; border-radius:16px; background:rgba(255,255,255,.07); }.shortcut-list button { display:grid; grid-template-columns:34px 1fr auto; align-items:center; gap:10px; padding:11px 12px; background:#101720; text-align:left; }.shortcut-list i { display:grid; width:32px; height:32px; place-items:center; border-radius:11px; background:rgba(199,255,31,.08); color:var(--accent); font-size:17px; font-style:normal; }.shortcut-list span { display:flex; min-width:0; flex-direction:column; }.shortcut-list b { font-size:10px; }.shortcut-list small { margin-top:3px; overflow:hidden; color:rgba(255,255,255,.36); font-size:8px; text-overflow:ellipsis; white-space:nowrap; }.shortcut-list em { color:rgba(255,255,255,.3); font-size:13px; font-style:normal; }
.data-actions button { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px; background:#101720; text-align:left; }.data-actions button:disabled { opacity:.35; }.data-actions span { display:flex; flex-direction:column; font-size:10px; font-weight:800; }.data-actions small { margin-top:3px; color:rgba(255,255,255,.35); font-size:8px; font-weight:500; }.data-actions b { color:#fca5a5; font-size:9px; }.storage-warning { margin-top:10px; color:#fcd34d; font-size:9px; line-height:1.5; }.me-footer { padding:21px 0 4px; color:rgba(255,255,255,.2); font-size:8px; text-align:center; letter-spacing:.1em; }
.city-picker-mask { position:fixed; z-index:90; inset:0; display:flex; align-items:flex-end; justify-content:center; background:rgba(0,0,0,.55); }.city-picker-panel { width:100%; max-width:480px; max-height:82vh; padding:20px; overflow-y:auto; border:1px solid rgba(255,255,255,.14); border-bottom:0; border-radius:28px 28px 0 0; background:linear-gradient(180deg,rgba(24,29,39,.98),rgba(10,14,22,.99)); box-shadow:0 -20px 50px rgba(0,0,0,.5); }.city-sheet-enter-active,.city-sheet-leave-active { transition:opacity .18s ease; }.city-sheet-enter-active .city-picker-panel,.city-sheet-leave-active .city-picker-panel { transition:transform .28s cubic-bezier(.2,.8,.2,1); }.city-sheet-enter-from,.city-sheet-leave-to { opacity:0; }.city-sheet-enter-from .city-picker-panel,.city-sheet-leave-to .city-picker-panel { transform:translateY(100%); }.city-sheet-leave-active { pointer-events:none; }
.confirm-mask { position:fixed; z-index:100; inset:0; display:flex; align-items:flex-end; justify-content:center; padding:16px 16px max(18px,env(safe-area-inset-bottom)); background:rgba(0,0,0,.72); backdrop-filter:blur(5px); }.confirm-card { width:100%; max-width:420px; padding:22px 20px; border:1px solid rgba(255,255,255,.13); border-radius:25px; background:#151c26; }.confirm-card>p { color:#fca5a5; font-size:9px; font-weight:850; letter-spacing:.14em; }.confirm-card h2 { margin-top:8px; font-size:20px; font-weight:950; }.confirm-card>span { display:block; margin-top:9px; color:rgba(255,255,255,.55); font-size:11px; line-height:1.7; }.confirm-card>div { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px; }.confirm-card button { padding:12px; border:1px solid rgba(255,255,255,.12); border-radius:14px; color:rgba(255,255,255,.75); font-size:11px; font-weight:850; }.confirm-card .danger { border-color:#ef4444; background:#ef4444; color:#fff; }
.me-toast { position:fixed; z-index:110; bottom:calc(104px + env(safe-area-inset-bottom)); left:50%; max-width:calc(100% - 40px); padding:10px 16px; transform:translateX(-50%); border:1px solid rgba(255,255,255,.12); border-radius:18px; background:rgba(18,24,33,.96); color:#fff; font-size:11px; font-weight:750; line-height:1.45; text-align:center; box-shadow:0 12px 30px rgba(0,0,0,.4); }
.sheet-enter-active,.sheet-leave-active,.toast-enter-active,.toast-leave-active { transition:opacity .2s ease; }.sheet-enter-from,.sheet-leave-to,.toast-enter-from,.toast-leave-to { opacity:0; }
@media (max-width:360px) { .me-page { padding-right:12px; padding-left:12px; }.panel { padding-right:13px; padding-left:13px; }.persona-panel { padding-right:13px; padding-left:13px; }.persona-layout { grid-template-columns:108px minmax(0,1fr); gap:12px; }.persona-layout.is-unselected { grid-template-columns:1fr; }.persona-visual-copy strong { font-size:17px; }.persona-chip-row { gap:5px; margin-top:9px; }.persona-chip-row button { padding:0 6px; font-size:9px; } }
@media (prefers-reduced-motion:reduce) { .persona-chip-row button,.persona-chip-row button:active { transition:none; transform:none; } }
</style>
