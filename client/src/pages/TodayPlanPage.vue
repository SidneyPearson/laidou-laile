<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import TodayPlanMap from '../components/today/TodayPlanMap.vue'
import TodaySpotCard from '../components/today/TodaySpotCard.vue'
import SpotDetailSheet from '../components/explore/SpotDetailSheet.vue'
import { PERSONAS } from '../data/mockExploreSpots'
import { useTodayPlan } from '../composables/useTodayPlan'
import { suggestTodayOrder, ApiRequestError } from '../services/api'
import { openAmapNavigation } from '../utils/amapNavigation'
import { haversineDist } from '../utils/geo'
import type { Persona } from '../types/explore'
import type { TodaySpot } from '../types/todayPlan'

const router = useRouter()
const plan = useTodayPlan()
const selectedSpot = ref<TodaySpot | null>(null)
const suggesting = ref(false)
const suggestionError = ref('')
const suggestionReason = ref('')
const suggestionReminders = ref<string[]>([])
const referenceActive = ref(false)
const originalOrder = ref<string[] | null>(null)
const pendingOrder = ref<string[] | null>(null)

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
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
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
    return `你选了 ${plan.count.value} 个地方，预计停留约 ${durationLabel.value}。地点跨度较大，建议删掉一个，玩得会更轻松。`
  }
  if (plan.totalStayMinutes.value >= 480 || plan.count.value >= 5) {
    return `你选了 ${plan.count.value} 个地方，预计停留约 ${durationLabel.value}。安排比较充实，记得给交通和休息留出时间。`
  }
  return `你选了 ${plan.count.value} 个地方，预计停留约 ${durationLabel.value}。顺序可以继续自由调整。`
})
const suggestedNames = computed(() => {
  if (!pendingOrder.value) return ''
  const byId = new Map(plan.spots.value.map(spot => [spot.id, spot.name]))
  return pendingOrder.value.map(id => byId.get(id)).filter(Boolean).join(' → ')
})

function clearSuggestionForSetChange() {
  referenceActive.value = false
  originalOrder.value = null
  pendingOrder.value = null
  suggestionReason.value = ''
  suggestionReminders.value = []
  suggestionError.value = ''
}

function removeSpot(id: string) {
  plan.removeSpot(id)
  if (selectedSpot.value?.id === id) selectedSpot.value = null
  clearSuggestionForSetChange()
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
    suggestionError.value = error instanceof ApiRequestError
      ? error.message
      : '暂时无法给出参考顺序，已保留原顺序。'
  } finally {
    suggesting.value = false
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
          <p class="text-[9px] text-stone-400">只包含你主动加入的地点</p>
        </div>
        <div class="h-10 w-10" />
      </div>
    </header>

    <div v-if="plan.count.value > 0" class="space-y-5 px-5 pt-5">
      <section class="rounded-[26px] bg-stone-900 p-5 text-white shadow-[0_14px_35px_rgba(44,44,44,0.12)]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-200">{{ cityLabel }}</p>
        <div class="mt-2 flex items-end justify-between">
          <div>
            <p class="text-2xl font-bold">{{ plan.count.value }} 个地点</p>
            <p class="mt-1 text-xs text-white/60">预计停留约 {{ durationLabel }}</p>
          </div>
          <span class="rounded-full bg-white/10 px-3 py-1.5 text-[9px] text-white/65">本机保存</span>
        </div>
        <p class="mt-4 rounded-2xl bg-white/10 px-3 py-2.5 text-[10px] leading-4 text-white/75">
          {{ pressureNote }}
        </p>
      </section>

      <TodayPlanMap :spots="plan.spots.value" :connected="referenceActive" />

      <section v-if="plan.count.value >= 2">
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
          @up="moveSpot(spot.id, -1)"
          @down="moveSpot(spot.id, 1)"
          @remove="removeSpot(spot.id)"
          @details="selectedSpot = spot"
          @navigate="navigate(spot)"
        />
      </section>
    </div>

    <div v-else class="flex min-h-[70dvh] items-center justify-center px-8 text-center">
      <div>
        <div class="text-4xl">🧺</div>
        <h1 class="mt-4 text-lg font-bold text-stone-900">今天还没有想去的地方</h1>
        <p class="mt-2 text-xs leading-5 text-stone-500">回到城市灵感页，自由挑选真正想去的地点。</p>
        <button class="btn-primary mt-5 px-6 py-3 text-sm font-bold" @click="router.push({ name: 'city' })">
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
  </main>
</template>
