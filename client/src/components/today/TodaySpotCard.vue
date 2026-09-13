<script setup lang="ts">
import type { TodaySpot } from '../../types/todayPlan'
import SpotCover from '../explore/SpotCover.vue'

const props = defineProps<{
  spot: TodaySpot
  index: number
  total: number
  journeyState?: 'current' | 'completed' | 'upcoming'
  journeyActive?: boolean
}>()

const spotMeta = () => [props.spot.district, props.spot.suggestedDuration].filter(Boolean).join(' · ') || '停留信息待补充'

const emit = defineEmits<{
  up: []
  down: []
  remove: []
  details: []
  navigate: []
  complete: []
  undo: []
}>()
</script>

<template>
  <article
    class="overflow-hidden rounded-[22px] bg-white shadow-[0_6px_22px_rgba(44,44,44,0.06)] transition"
    :class="{
      'ring-2 ring-lime-400': journeyState === 'current',
      // 完成态不整体变暗：印章盖好就是盖好了，卡片保持鲜亮。
      'ring-1 ring-emerald-300/80': journeyState === 'completed',
    }"
  >    
    <div class="flex">
      <button
        class="relative h-32 w-[36%] flex-shrink-0 overflow-hidden text-left"
        :aria-label="`查看${spot.name}详情`"
        @click="emit('details')"
      >
        <SpotCover :spot="spot" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <span class="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white shadow">
          {{ journeyState === 'completed' ? '✓' : index + 1 }}
        </span>
      </button>

      <div class="min-w-0 flex-1 p-3">
        <button class="block w-full text-left" @click="emit('details')">
          <p class="truncate text-sm font-bold text-stone-900">{{ spot.name }}</p>
          <p v-if="journeyState" class="mt-1 text-[10px] font-bold" :class="journeyState === 'current' ? 'text-lime-700' : journeyState === 'completed' ? 'text-emerald-700' : 'text-stone-400'">
            {{ journeyState === 'current' ? '● 当前下一站' : journeyState === 'completed' ? '✓ 已经到过' : '稍后出发' }}
          </p>
          <p class="mt-1 truncate text-[10px] text-stone-400">{{ spotMeta() }}</p>
          <p class="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">{{ spot.address }}</p>
        </button>

        <div v-if="!journeyActive" class="mt-3 flex items-center gap-1.5">
          <button
            class="rounded-xl bg-stone-100 px-2.5 py-1.5 text-[10px] font-semibold text-stone-600 disabled:opacity-30"
            :disabled="index === 0"
            aria-label="上移"
            @click="emit('up')"
          >
            ↑ 上移
          </button>
          <button
            class="rounded-xl bg-stone-100 px-2.5 py-1.5 text-[10px] font-semibold text-stone-600 disabled:opacity-30"
            :disabled="index === total - 1"
            aria-label="下移"
            @click="emit('down')"
          >
            ↓ 下移
          </button>
          <button
            class="ml-auto px-1 py-1.5 text-[10px] font-semibold text-red-400"
            @click="emit('remove')"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <div class="grid border-t border-stone-100" :class="journeyState === 'current' || journeyState === 'completed' ? 'grid-cols-3' : 'grid-cols-2'">
      <button class="py-2.5 text-[10px] font-semibold text-stone-500" @click="emit('details')">
        查看详情
      </button>
      <button class="border-l border-stone-100 py-2.5 text-[10px] font-semibold text-primary-700" @click="emit('navigate')">
        打开高德导航
      </button>
      <button
        v-if="journeyState === 'current'"
        class="border-l border-stone-100 bg-lime-300 py-2.5 text-[10px] font-bold text-stone-900"
        @click="emit('complete')"
      >
        ✓ 到过了
      </button>
      <button v-if="journeyState === 'completed'" class="border-l border-stone-100 py-3 text-[10px] font-semibold text-stone-600"
        @click="emit('undo')">改为未到</button>
    </div>
  </article>
</template>

