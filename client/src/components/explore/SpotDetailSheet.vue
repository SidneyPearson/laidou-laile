<script setup lang="ts">
import { computed } from 'vue'
import type { InspirationSpot, PersonaOption } from '../../types/explore'
import { departureReminder, whySpotFitsPersona } from '../../utils/exploreDetails'
import SpotCover from './SpotCover.vue'

const props = defineProps<{
  spot: InspirationSpot
  persona: PersonaOption | null
  actionReady: boolean
  inToday: boolean
}>()

const emit = defineEmits<{
  close: []
  navigate: []
  'toggle-today': []
}>()

const whyForYou = computed(() => props.persona
  ? whySpotFitsPersona(props.spot, props.persona.id)
  : '从已验证的城市地点中精选，适合加入今天的探索清单。')
const reminder = computed(() => departureReminder(props.spot))
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
        <button
          class="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur"
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
              class="rounded-full bg-white/15 px-2 py-1 text-[9px] backdrop-blur"
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
              <dt class="text-[9px] text-stone-400">建议停留</dt>
              <dd class="mt-1 text-xs font-semibold text-stone-700">{{ spot.suggestedDuration || '待补充' }}</dd>
            </div>
            <div>
              <dt class="text-[9px] text-stone-400">推荐时段</dt>
              <dd class="mt-1 text-xs font-semibold text-stone-700">{{ spot.bestTime || '待补充' }}</dd>
            </div>
          </dl>
          <p v-if="spot.address" class="mt-3 text-[10px] leading-4 text-stone-400">
            📍 {{ spot.address }}
          </p>
        </section>

        <section class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 class="text-xs font-bold text-amber-900">出发前提醒</h3>
          <p class="mt-1.5 text-[11px] leading-5 text-amber-800">{{ reminder }}</p>
          <p class="mt-1 text-[9px] text-amber-600">预约、票务与营业信息以当天官方公告为准。</p>
        </section>

        <p v-if="!actionReady" class="text-center text-[10px] leading-4 text-amber-700">
          这是演示地点，缺少可重新校验的真实 POI 或坐标，暂不能导航或加入今天。
        </p>
      </div>

      <div class="flex-none border-t border-stone-200 bg-[#f7f6f2]/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
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
            {{ inToday ? '已加入今天' : '加入今天' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
