<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import TodayPlanMap from '../components/today/TodayPlanMap.vue'
import TodaySpotCard from '../components/today/TodaySpotCard.vue'
import SpotDetailSheet from '../components/explore/SpotDetailSheet.vue'
import CityTicketSheet from '../components/today/CityTicketSheet.vue'
import { PERSONAS } from '../data/mockExploreSpots'
import { useTodayPlan } from '../composables/useTodayPlan'
import { useTodayJourney } from '../composables/useTodayJourney'
import { suggestTodayOrder, ApiRequestError } from '../services/api'
import { fetchExploreRecommendations } from '../services/exploreApi'
import { openAmapNavigation } from '../utils/amapNavigation'
import { haversineDist } from '../utils/geo'
import { hapticSelect, hapticSuccess } from '../utils/haptics'
import { burstConfetti } from '../utils/delight'
import type { Persona, InspirationSpot } from '../types/explore'
import type { TodaySpot } from '../types/todayPlan'

const router = useRouter()
const plan = useTodayPlan()
const journey = useTodayJourney()
const selectedSpot = ref<TodaySpot | null>(null)
const suggesting = ref(false)
const suggestionError = ref('')
const suggestionReason = ref('')
const suggestionReminders = ref<string[]>([])
const referenceActive = ref(false)
const originalOrder = ref<string[] | null>(null)
const pendingOrder = ref<string[] | null>(null)
const picking = ref(false)
const pickedName = ref('')
const showTicket = ref(false)
const clearNotice = ref('')
const showClearConfirm = ref(false)
const needsSpotRefresh = ref(false)
const refreshingSpots = ref(false)
let pickTimer: ReturnType<typeof setInterval> | null = null
let clearNoticeTimer: ReturnType<typeof setTimeout> | null = null

function savedPersona(): Persona {
  if (typeof localStorage === 'undefined') return 'couple'
  const value = localStorage.getItem('laidou-v03-persona')
  return PERSONAS.some(persona => persona.id === value) ? value as Persona : 'couple'
}

const currentPersona = computed(() =>
  PERSONAS.find(persona => persona.id === savedPersona()) ?? PERSONAS[0],
)
const cityLabel = computed(() => plan.cities.value.join('、'))
const sameCity = computed(() => plan.cities.value.length === 1)
const durationLabel = computed(() => {
  const minutes = plan.totalStayMinutes.value
  if (minutes === 0) return '待补充'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
})
const durationSummary = computed(() => {
  if (plan.totalStayMinutes.value === 0) return '停留时长待补充'
  const missing = plan.spots.value.filter(spot => !spot.suggestedDuration.trim()).length
  return `预计停留约 ${durationLabel.value}${missing ? `，另有 ${missing} 个地点待补充时长` : ''}`
})
const maxSpanMeters = computed(() => {
  let max = 0
  for (let i = 0; i < plan.spots.value.length; i++) {
    for (let j = i + 1; j < plan.spots.value.length; j++) {
      const a = plan.spots.value[i]
      const b = plan.spots.value[j]
      max = Math.max(max, haversineDist(a.lat, a.lng, b.lat, b.lng))
    }
  }
  return max
})
const pressureNote = computed(() => {
  if (plan.count.value === 0) return ''
  if (!sameCity.value) return `你选了 ${plan.count.value} 个地方，涉及 ${cityLabel.value}。跨城安排不适合放在同一天，建议分开游玩。`
  if (maxSpanMeters.value >= 15_000) {
    return `你选了 ${plan.count.value} 个地方，${durationSummary.value}。地点跨度较大，建议删掉一个，玩得会更轻松。`
  }
  if (plan.totalStayMinutes.value >= 480 || plan.count.value >= 5) {
    return `你选了 ${plan.count.value} 个地方，${durationSummary.value}。安排比较充实，记得给交通和休息留出时间。`
  }
  return `你选了 ${plan.count.value} 个地方，${durationSummary.value}。顺序可以继续自由调整。`
})
const planIds = computed(() => plan.spots.value.map(spot => spot.id))
const completedSet = computed(() => new Set(journey.completedIds.value))
const currentSpot = computed(() =>
  plan.spots.value.find(spot => spot.id === journey.currentId.value) || null,
)
const completedSpots = computed(() =>
  plan.spots.value.filter(spot => completedSet.value.has(spot.id)),
)
const remainingSpots = computed(() =>
  plan.spots.value.filter(spot => !completedSet.value.has(spot.id)),
)
const journeyProgress = computed(() =>
  plan.count.value > 0 ? Math.round(completedSpots.value.length / plan.count.value * 100) : 0,
)
const rhythm = computed(() => {
  let score = 1
  if (plan.count.value >= 3 || plan.totalStayMinutes.value >= 240) score += 1
  if (plan.count.value >= 5 || plan.totalStayMinutes.value >= 420 || maxSpanMeters.value >= 10_000) score += 1
  if (plan.count.value >= 6 || plan.totalStayMinutes.value >= 540 || maxSpanMeters.value >= 18_000) score += 1
  return [
    { label: '松弛散步局', note: '慢慢走，给偶遇留点空间。' },
    { label: '刚刚好的一天', note: '有安排，也有喘息的余地。' },
    { label: '城市特种兵', note: '节奏偏满，交通衔接很重要。' },
    { label: '这不是计划，是拉练', note: '建议删掉一站，快乐会更多。' },
  ][score - 1]
})
const suggestedNames = computed(() => {
  if (!pendingOrder.value) return ''
  const byId = new Map(plan.spots.value.map(spot => [spot.id, spot.name]))
  return pendingOrder.value.map(id => byId.get(id)).filter(Boolean).join(' → ')
})

function spotMeta(spot: TodaySpot): string {
  return [spot.district, spot.suggestedDuration].filter(Boolean).join(' · ') || '停留信息待补充'
}

function clearSuggestionForSetChange() {
  referenceActive.value = false
  originalOrder.value = null
  pendingOrder.value = null
  suggestionReason.value = ''
  suggestionReminders.value = []
  suggestionError.value = ''
  needsSpotRefresh.value = false
}

function removeSpot(id: string) {
  plan.removeSpot(id)
  if (selectedSpot.value?.id === id) selectedSpot.value = null
  clearSuggestionForSetChange()
}

function startJourney() {
  if (!journey.start(planIds.value)) return
  hapticSuccess()
}

function resetJourney() {
  journey.reset()
  pickedName.value = ''
  showTicket.value = false
}

function clearTodayPlan() {
  if (plan.count.value === 0) return
  // 用自定义确认弹层替代原生 confirm，与整体视觉一致。
  showClearConfirm.value = true
}

function confirmClearTodayPlan() {
  showClearConfirm.value = false
  plan.clear()
  resetJourney()
  selectedSpot.value = null
  clearSuggestionForSetChange()
  clearNotice.value = '今日计划已清空'
  if (clearNoticeTimer) clearTimeout(clearNoticeTimer)
  clearNoticeTimer = setTimeout(() => {
    clearNotice.value = ''
    clearNoticeTimer = null
  }, 1800)
}

/** 票根保存成功后：关掉弹层回到页面主体，并用顶部横幅确认「已存入相册」。 */
function onTicketSaved() {
  showTicket.value = false
  clearNotice.value = '票根已存入系统相册，今天没有白来'
  if (clearNoticeTimer) clearTimeout(clearNoticeTimer)
  clearNoticeTimer = setTimeout(() => {
    clearNotice.value = ''
    clearNoticeTimer = null
  }, 2600)
}

function completeCurrent() {
  const spot = currentSpot.value
  if (!spot || !journey.completeSpot(spot.id, planIds.value)) return
  hapticSuccess()
  pickedName.value = ''
  celebrateArrival(journey.status.value === 'complete')
}

function completeSpot(id: string) {
  if (!journey.completeSpot(id, planIds.value)) return
  hapticSuccess()
  celebrateArrival(journey.status.value === 'complete')
}

/** 打卡成功的欢愉瞬间：单站小爆彩，全部到达来一场大的。 */
function celebrateArrival(allDone: boolean) {
  const anchor = document.querySelector<HTMLElement>('main')
  if (allDone) burstConfetti(anchor, { count: 44, size: [6, 14], duration: 1500 })
  else burstConfetti(anchor, { count: 18, size: [5, 10], duration: 950 })
}

function pickNext() {
  if (picking.value || remainingSpots.value.length < 2) return
  picking.value = true
  let ticks = 0
  // 开始抽签的轻震动必须发生在用户手势内（定时器回调会被 Chrome 拦截 vibrate）。
  hapticSelect()
  pickTimer = setInterval(() => {
    const candidates = remainingSpots.value
    pickedName.value = candidates[ticks % candidates.length]?.name || ''
    ticks += 1
    if (ticks < 14) return
    if (pickTimer) clearInterval(pickTimer)
    pickTimer = null
    const chosen = candidates[Math.floor(Math.random() * candidates.length)]
    if (chosen) {
      journey.chooseNext(chosen.id, planIds.value)
      pickedName.value = chosen.name
      // 揭晓瞬间：爆一簇彩带，把「随机决定」变成「命运揭晓」。
      // 注意：此处是定时器回调（非用户手势窗口），Chrome 会拦截 vibrate，故不再震动。
      burstConfetti(document.querySelector<HTMLElement>('main'), {
        count: 26,
        size: [5, 11],
        duration: 1100,
      })
    }
    picking.value = false
  }, 85)
}

function journeyStateOf(id: string): 'current' | 'completed' | 'upcoming' | undefined {
  if (journey.status.value === 'idle') return undefined
  if (completedSet.value.has(id)) return 'completed'
  if (journey.currentId.value === id) return 'current'
  return 'upcoming'
}

function moveSpot(id: string, direction: -1 | 1) {
  plan.moveSpot(id, direction)
}

function navigate(spot: TodaySpot) {
  openAmapNavigation(spot.amapName || spot.name, spot.lng, spot.lat)
}

function validSuggestedOrder(
  order: Array<{ hotspotId: string; amapPoiId: string }>,
): boolean {
  if (order.length !== plan.spots.value.length) return false
  const current = new Map(plan.spots.value.map(spot => [spot.id, spot.amapPoiId]))
  return new Set(order.map(item => item.hotspotId)).size === order.length
    && order.every(item => current.get(item.hotspotId) === item.amapPoiId)
}

async function askForOrder() {
  if (plan.count.value < 2 || !sameCity.value || suggesting.value) return
  suggesting.value = true
  suggestionError.value = ''
  const before = plan.spots.value.map(spot => spot.id)

  try {
    const result = await suggestTodayOrder({
      city: plan.cities.value[0],
      places: plan.spots.value.map(spot => ({
        hotspotId: spot.id,
        amapPoiId: spot.amapPoiId,
      })),
    })
    if (!validSuggestedOrder(result.order)) {
      suggestionError.value = '返回的地点集合与已选清单不一致，已保留原顺序。'
      return
    }
    originalOrder.value = before
    pendingOrder.value = result.order.map(item => item.hotspotId)
    suggestionReason.value = result.reason
    suggestionReminders.value = result.reminders
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'POI_MISMATCH') {
      needsSpotRefresh.value = true
      suggestionError.value = '部分地点的信息已经更新，一键刷新后可重新排序。'
    } else {
      suggestionError.value = error instanceof ApiRequestError
        ? error.message
        : '暂时无法给出参考顺序，已保留原顺序。'
    }
  } finally {
    suggesting.value = false
  }
}

/** POI 变更后的一键修复：按城市重拉策展库最新地点，用 hotspotId 匹配并替换
 *  本地旧快照（保持顺序与 addedAt），随后重新尝试排序。 */
async function refreshSpotData() {
  const cityName = plan.cities.value[0]
  if (!cityName || refreshingSpots.value) return
  refreshingSpots.value = true
  suggestionError.value = ''

  try {
    const all: InspirationSpot[] = []
    let cursor: number | null = 0
    let pages = 0
    while (cursor !== null && pages < 10) {
      const result = await fetchExploreRecommendations({
        city: cityName.replace(/市$/, ''),
        category: 'all',
        cursor,
        limit: 60,
      })
      all.push(...result.spots)
      cursor = result.nextCursor
      pages += 1
    }
    const freshById = new Map(all.map(spot => [spot.id, spot]))
    const missing: string[] = []
    let updated = 0
    for (const spot of plan.spots.value) {
      const fresh = freshById.get(spot.id)
      if (!fresh || !fresh.amapPoiId) {
        missing.push(spot.name)
        continue
      }
      if (plan.updateSpot(spot.id, {
        name: fresh.name,
        amapName: fresh.amapName,
        district: fresh.district,
        category: fresh.category,
        reason: fresh.reason,
        tags: fresh.tags,
        suitablePersonas: fresh.suitablePersonas,
        suggestedDuration: fresh.suggestedDuration,
        bestTime: fresh.bestTime,
        theme: fresh.theme,
        amapPoiId: fresh.amapPoiId,
        address: fresh.address ?? '',
        lat: fresh.lat as number,
        lng: fresh.lng as number,
        verifiedAt: fresh.verifiedAt,
        coverImageUrl: fresh.coverImageUrl,
        reservationNote: fresh.reservationNote,
      })) updated += 1
    }

    if (missing.length > 0) {
      needsSpotRefresh.value = false
      suggestionError.value = `「${missing.join('、')}」已不在精选库里，移出后再排序吧。`
      return
    }
    if (updated === 0) {
      suggestionError.value = '地点信息已是最新，仍无法排序，请稍后重试。'
      return
    }
    needsSpotRefresh.value = false
    await askForOrder()
  } catch {
    suggestionError.value = '刷新地点信息失败，请稍后重试。'
  } finally {
    refreshingSpots.value = false
  }
}

function applySuggestedOrder() {
  if (!pendingOrder.value || !plan.replaceOrder(pendingOrder.value)) return
  pendingOrder.value = null
  referenceActive.value = true
}

function dismissSuggestion() {
  referenceActive.value = false
  originalOrder.value = null
  pendingOrder.value = null
  suggestionReason.value = ''
  suggestionReminders.value = []
}

function restoreOriginalOrder() {
  if (!originalOrder.value || !plan.replaceOrder(originalOrder.value)) return
  referenceActive.value = false
  originalOrder.value = null
  pendingOrder.value = null
  suggestionReason.value = ''
  suggestionReminders.value = []
}

watch(planIds, ids => journey.syncWithSpots(ids), { immediate: true })

onBeforeUnmount(() => {
  if (pickTimer) clearInterval(pickTimer)
  if (clearNoticeTimer) clearTimeout(clearNoticeTimer)
})
</script>

<template>
  <main class="mx-auto min-h-full max-w-md bg-[#f7f6f2] pb-12">
    <header class="sticky top-0 z-30 border-b border-white/60 bg-[#f7f6f2]/90 px-5 pb-3 pt-[max(18px,env(safe-area-inset-top))] backdrop-blur-xl">
      <div class="flex items-center justify-between">
        <button
          class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-stone-600 shadow-sm"
          aria-label="返回"
          @click="router.back()"
        >
          ←
        </button>
        <div class="text-center">
          <p class="text-sm font-bold text-stone-900">今天安排</p>
          <p class="text-[10px] text-stone-400">只包含你主动加入的地点</p>
        </div>
        <div class="h-10 w-10" />
      </div>
    </header>

    <p v-if="clearNotice" class="mx-5 mt-4 rounded-2xl bg-emerald-100 px-4 py-3 text-center text-xs font-bold text-emerald-800" role="status">
      ✓ {{ clearNotice }}
    </p>

    <div v-if="plan.count.value > 0" class="space-y-5 px-5 pt-5">
      <section class="rounded-[26px] bg-stone-900 p-5 text-white shadow-[0_14px_35px_rgba(44,44,44,0.12)]">
        <div class="flex items-center justify-between gap-3">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-200">{{ cityLabel }}</p>
          <button
            type="button"
            class="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-bold text-white/60 transition hover:border-lime-300/50 hover:text-lime-300"
            @click="clearTodayPlan"
          >
            清空计划
          </button>
        </div>
        <div class="mt-2 flex items-end justify-between">
          <div>
            <p class="text-2xl font-bold">{{ plan.count.value }} 个地点</p>
            <p class="mt-1 text-xs text-white/60">{{ durationSummary }}</p>
          </div>
          <span class="rounded-full bg-white/10 px-3 py-1.5 text-[10px] text-white/65">本机保存</span>
        </div>
        <p class="mt-4 rounded-2xl bg-white/10 px-3 py-2.5 text-[10px] leading-4 text-white/75">
          {{ pressureNote }}
        </p>
        <div class="mt-4">
          <div class="flex items-center justify-between text-[10px]">
            <span class="font-bold text-lime-300">{{ rhythm.label }}</span>
            <span class="text-white/40">松弛 ··· 特种兵</span>
          </div>
          <div class="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              class="h-full rounded-full bg-gradient-to-r from-emerald-300 to-lime-300 transition-all duration-500"
              :style="{ width: `${Math.max(16, Math.min(100, (plan.count.value / 6) * 100))}%` }"
            />
          </div>
          <p class="mt-2 text-[10px] text-white/60">{{ rhythm.note }}</p>
        </div>
      </section>

      <section
        v-if="journey.status.value === 'idle'"
        class="overflow-hidden rounded-[24px] border border-lime-200 bg-gradient-to-br from-lime-100 to-white p-5"
      >
        <p class="text-[10px] font-bold tracking-[0.12em] text-lime-800">READY TO GO</p>
        <h2 class="mt-1 text-xl font-black text-stone-900">准备好，就开始今天</h2>
        <p class="mt-2 text-[11px] leading-5 text-stone-500">开始后会记录到过的地点，并始终把下一站放在最醒目的位置。</p>
        <button class="mt-4 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-bold text-lime-300 active:scale-[0.99]" @click="startJourney">
          开始今天 →
        </button>
      </section>

      <section
        v-else-if="journey.status.value === 'active' && currentSpot"
        class="overflow-hidden rounded-[26px] bg-stone-900 p-5 text-white shadow-[0_16px_38px_rgba(20,25,18,.2)]"
      >
        <div class="flex items-center justify-between text-[10px]">
          <span class="font-bold text-lime-300">正在进行 · {{ completedSpots.length }}/{{ plan.count.value }}</span>
          <span class="text-white/60">{{ journeyProgress }}%</span>
        </div>
        <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-lime-300 transition-all duration-500" :style="{ width: `${journeyProgress}%` }" />
        </div>
        <p class="mt-5 text-[10px] text-white/60">下一站</p>
        <h2 class="mt-1 text-2xl font-black">{{ pickedName || currentSpot.name }}</h2>
        <p class="mt-1 text-[10px] text-white/60">{{ spotMeta(currentSpot) }}</p>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button class="rounded-2xl bg-white/10 py-3 text-xs font-bold" @click="navigate(currentSpot)">导航过去</button>
          <button class="rounded-2xl bg-lime-300 py-3 text-xs font-black text-stone-900" @click="completeCurrent">✓ 到过了</button>
        </div>
        <button
          v-if="remainingSpots.length >= 2"
          class="mt-2 w-full rounded-2xl border border-white/10 py-3 text-[11px] font-bold text-white/65 disabled:opacity-50"
          :disabled="picking"
          @click="pickNext"
        >
          <span aria-hidden="true">🎲</span>
          {{ picking ? `正在抽：${pickedName}` : '纠结救星：帮我抽下一站' }}
        </button>
      </section>

      <section v-else class="rounded-[26px] bg-lime-300 p-5 text-stone-900 shadow-[0_14px_34px_rgba(180,240,20,.2)]">
        <p class="text-[10px] font-black tracking-[0.14em]">TODAY COMPLETED</p>
        <h2 class="mt-2 text-2xl font-black">今天没有白来。</h2>
        <p class="mt-2 text-[11px] leading-5 text-stone-700">{{ plan.count.value }} 个地点全部到达，给今天留一张城市票根吧。</p>
        <button class="mt-4 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-bold text-lime-300" @click="showTicket = true">
          生成今日城市票根 →
        </button>
        <button class="mt-2 w-full py-2 text-[10px] font-bold text-stone-700 underline decoration-stone-500/40 underline-offset-4" @click="resetJourney">
          重新开始这趟行程
        </button>
      </section>

      <TodayPlanMap
        :spots="plan.spots.value"
        :connected="referenceActive || journey.status.value !== 'idle'"
        :current-id="journey.currentId.value"
        :completed-ids="journey.completedIds.value"
      />

      <section v-if="plan.count.value >= 2 && journey.status.value === 'idle'">
        <button
          class="btn-primary flex w-full items-center justify-center py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="suggesting || !sameCity"
          @click="askForOrder"
        >
          <span v-if="suggesting" class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          {{ suggesting ? '正在整理参考顺序…' : '帮我顺一下' }}
        </button>
        <p v-if="!sameCity" class="mt-2 text-center text-[10px] leading-4 text-amber-700">
          当前清单涉及多个城市，请先保留同一城市的地点再获取参考顺序。
        </p>
        <p v-if="suggestionError" class="mt-2 text-center text-[10px] leading-4 text-red-500">
          {{ suggestionError }}
        </p>
        <button
          v-if="needsSpotRefresh"
          class="mx-auto mt-2 block rounded-full border border-red-300 bg-white px-4 py-2 text-[11px] font-bold text-red-600 disabled:opacity-50"
          :disabled="refreshingSpots"
          @click="refreshSpotData"
        >
          {{ refreshingSpots ? '正在刷新地点信息…' : '刷新地点信息' }}
        </button>
      </section>

      <section v-if="suggestionReason" class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs font-bold text-emerald-900">参考安排</p>
          <button
            v-if="referenceActive"
            class="text-[10px] font-semibold text-emerald-700 underline"
            @click="restoreOriginalOrder"
          >
            恢复原顺序
          </button>
        </div>
        <p class="mt-2 text-[11px] leading-5 text-emerald-800">{{ suggestionReason }}</p>
        <p v-if="pendingOrder" class="mt-2 rounded-xl bg-white/65 px-3 py-2 text-[10px] leading-4 text-emerald-900">
          {{ suggestedNames }}
        </p>
        <p
          v-for="reminder in suggestionReminders"
          :key="reminder"
          class="mt-1 text-[10px] leading-4 text-emerald-700"
        >
          {{ reminder }}
        </p>
        <div v-if="pendingOrder" class="mt-3 grid grid-cols-2 gap-2">
          <button
            class="rounded-xl bg-emerald-700 py-2.5 text-[11px] font-bold text-white"
            @click="applySuggestedOrder"
          >
            采用建议
          </button>
          <button
            class="rounded-xl bg-white py-2.5 text-[11px] font-semibold text-stone-500"
            @click="dismissSuggestion"
          >
            保留当前顺序
          </button>
        </div>
      </section>

      <section class="space-y-3">
        <TodaySpotCard
          v-for="(spot, index) in plan.spots.value"
          :key="spot.id"
          :spot="spot"
          :index="index"
          :total="plan.count.value"
          :journey-active="journey.status.value !== 'idle'"
          :journey-state="journeyStateOf(spot.id)"
          @up="moveSpot(spot.id, -1)"
          @down="moveSpot(spot.id, 1)"
          @remove="removeSpot(spot.id)"
          @details="selectedSpot = spot"
          @navigate="navigate(spot)"
          @complete="completeSpot(spot.id)"
        />
      </section>
    </div>

    <div v-else class="flex min-h-[70dvh] items-center justify-center px-8 text-center">
      <div>
        <div class="text-4xl">🧺</div>
        <h1 class="mt-4 text-lg font-bold text-stone-900">今天还没有想去的地方</h1>
        <p class="mt-2 text-xs leading-5 text-stone-500">回到城市灵感页，自由挑选真正想去的地点。</p>
        <button class="btn-primary mt-5 px-6 py-3 text-sm font-bold" @click="router.push({ name: 'explore' })">
          去看看城市灵感
        </button>
      </div>
    </div>

    <Transition name="slide-up">
      <SpotDetailSheet
        v-if="selectedSpot"
        :spot="selectedSpot"
        :persona="currentPersona"
        action-ready
        :in-today="plan.hasSpot(selectedSpot.id)"
        @close="selectedSpot = null"
        @navigate="navigate(selectedSpot)"
        @toggle-today="removeSpot(selectedSpot.id)"
      />
    </Transition>

    <Transition name="slide-up">
      <CityTicketSheet
        v-if="showTicket"
        :city="cityLabel"
        :persona="currentPersona.name"
        :spots="completedSpots"
        :duration="durationLabel"
        @close="showTicket = false"
        @saved="onTicketSaved"
      />
    </Transition>

    <Transition name="slide-up">
      <div v-if="showClearConfirm" class="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 backdrop-blur-sm" @click.self="showClearConfirm = false">
        <div class="w-full max-w-md rounded-t-[28px] bg-white p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(0,0,0,0.18)]">
          <h3 class="text-lg font-black text-stone-900">清空今天的计划？</h3>
          <p class="mt-2 text-xs leading-5 text-stone-500">路线进度和城市票根也会一起重置，清空后无法恢复。</p>
          <div class="mt-6 grid grid-cols-2 gap-3">
            <button
              class="rounded-2xl bg-stone-100 py-3 text-sm font-bold text-stone-600 active:scale-[0.99]"
              @click="showClearConfirm = false"
            >
              取消
            </button>
            <button
              class="rounded-2xl bg-red-500 py-3 text-sm font-black text-white active:scale-[0.99]"
              @click="confirmClearTodayPlan"
            >
              清空计划
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </main>
</template>
