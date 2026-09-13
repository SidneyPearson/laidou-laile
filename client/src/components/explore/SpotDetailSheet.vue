<script setup lang="ts">
import { computed } from 'vue'
import { useTodayPlan } from '../../composables/useTodayPlan'
import { planStayPreview } from '../../utils/planStayPreview'
import type { InspirationSpot, PersonaOption } from '../../types/explore'
import { departureReminders, whySpotFitsPersona } from '../../utils/exploreDetails'
import SpotCover from './SpotCover.vue'

const props = withDefaults(defineProps<{
  spot: InspirationSpot
  persona: PersonaOption | null
  actionReady: boolean
  planHint?: string
  inToday: boolean
  favoriteReady?: boolean
  inFavorites?: boolean
}>(), {
  favoriteReady: false,
  inFavorites: false,
})

const plan = useTodayPlan()
const effectivePlanHint = computed(() => props.actionReady
  ? props.planHint ?? planStayPreview(plan.spotsForCity(props.spot.city), props.spot, props.persona?.id ?? 'couple')
  : '')

const emit = defineEmits<{
  close: []
  navigate: []
  'toggle-today': []
  'toggle-favorite': []
}>()

const whyForYou = computed(() => props.persona
  ? whySpotFitsPersona(props.spot, props.persona.id)
  : '从已验证的城市地点中精选，适合加入今日计划的探索清单。')
// 出发前提醒：做空值过滤与语义去重，避免后台重复录入时渲染两条几乎一样的提醒。
const reminders = computed(() => departureReminders(props.spot))
</script>

<template>
  <div class="fixed inset-0 z-[80] flex items-end justify-center bg-black/70" @click.self="emit('close')">
    <section class="flex h-[min(94dvh,760px)] max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[30px] bg-[#f7f6f2] shadow-2xl">
      <div class="relative h-56 flex-none overflow-hidden rounded-t-[30px]">
        <SpotCover
          :spot="spot"
          eager
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
        <!-- 收藏与关闭按钮：44×44 触控热区 + 12px 间距，避免拇指点关闭时误触收藏。 -->
        <button
          v-if="favoriteReady"
          class="absolute right-[72px] top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur transition active:scale-90"
          :class="inFavorites ? 'text-rose-300' : 'text-white'"
          :aria-label="inFavorites ? '取消收藏' : '收藏地点'"
          :aria-pressed="inFavorites"
          @click="emit('toggle-favorite')"
        >
          <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" :fill="inFavorites ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" />
          </svg>
        </button>
        <button
          class="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur"
          aria-label="关闭地点详情"
          @click="emit('close')"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div class="absolute bottom-4 left-5 right-5 text-white">
          <div class="mb-2 flex flex-wrap gap-1.5">
            <span
              v-for="tag in spot.tags.slice(0, 3)"
              :key="tag"
              class="rounded-full bg-white/15 px-2 py-1 text-[10px] backdrop-blur"
            >
              {{ tag }}
            </span>
          </div>
          <p class="text-[10px] text-white/70">{{ [spot.city, spot.district].filter(Boolean).join(' · ') }}</p>
          <h2 class="mt-1 text-2xl font-bold">{{ spot.name }}</h2>
        </div>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-5 pt-5">
        <section class="rounded-2xl bg-emerald-50 p-4">
          <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            {{ persona ? `为什么适合${persona.name}` : '为什么推荐它' }}
          </p>
          <p class="mt-1.5 text-sm leading-6 text-emerald-950">{{ whyForYou }}</p>
        </section>

        <section class="rounded-2xl bg-white p-4 shadow-sm">
          <h3 class="text-sm font-bold text-stone-900">为什么值得去</h3>
          <p class="mt-2 text-xs leading-5 text-stone-600">{{ spot.reason }}</p>
          <dl class="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4">
            <div>
              <dt class="text-[10px] text-stone-400">建议停留</dt>
              <dd class="mt-1 text-xs font-semibold text-stone-700">{{ spot.suggestedDuration || '待补充' }}</dd>
            </div>
            <div>
              <dt class="text-[10px] text-stone-400">推荐时段</dt>
              <dd class="mt-1 text-xs font-semibold text-stone-700">{{ spot.bestTime || '待补充' }}</dd>
            </div>
          </dl>
          <p v-if="spot.address" class="mt-3 text-[10px] leading-4 text-stone-400">
            📍 {{ spot.address }}
          </p>
        </section>

        <section v-if="actionReady" class="rounded-2xl bg-white p-4 shadow-sm">
          <h3 class="text-xs font-bold text-stone-900">导航目的地</h3>
          <p class="mt-2 text-xs leading-5 text-stone-700">{{ spot.amapName || spot.name }}</p>
          <p v-if="spot.amapName && spot.amapName !== spot.name" class="mt-1 text-[11px] leading-5 text-stone-500">
            这是“{{ spot.name }}”对应的具体地图位置；景区范围较大时，请确认是否从这里开始游览。
          </p>
        </section>

        <section class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 class="text-xs font-bold text-amber-900">出发前提醒</h3>
          <ul class="mt-1.5 space-y-1">
            <li
              v-for="(text, index) in reminders"
              :key="index"
              class="flex gap-1.5 text-[11px] leading-5 text-amber-800"
            >
              <span class="mt-1.5 h-1 w-1 flex-none rounded-full bg-amber-500" />
              <span>{{ text }}</span>
            </li>
          </ul>
        </section>

        <p v-if="!actionReady" class="text-center text-[10px] leading-4 text-amber-700">
          这是演示地点，缺少可重新校验的真实 POI 或坐标，暂不能导航或加入今日计划。
        </p>
      </div>

      <div class="flex-none border-t border-stone-200 bg-[#f7f6f2]/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <p v-if="effectivePlanHint" class="mb-3 text-xs leading-5 text-amber-800" role="status">{{ effectivePlanHint }}</p>
        <div class="grid grid-cols-2 gap-3">
          <button
            class="rounded-2xl border border-primary-200 bg-white py-3.5 text-sm font-bold text-primary-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!actionReady"
            @click="emit('navigate')"
          >
            就去这里
          </button>
          <button
            class="rounded-2xl py-3.5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            :class="inToday ? 'bg-stone-200 text-stone-700' : 'bg-primary-600 text-white'"
            :disabled="!actionReady || inToday"
            @click="emit('toggle-today')"
          >
            {{ inToday ? '已加入今日计划' : '加入今日计划' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
