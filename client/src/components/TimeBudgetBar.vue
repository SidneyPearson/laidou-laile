<script setup lang="ts">
import { computed } from 'vue'
import type { Stop } from '../types/route'

const props = defineProps<{
  /** Total time the route consumes (visit + walking), in minutes */
  usedMinutes: number
  /** Time the user said they have available, in minutes */
  availableMinutes: number
  /**
   * Stops on the route. Reserved for the business-hours feature: once stops
   * carry openTime/closeTime/openNow, this bar can flag "X 已打烊".
   * Currently unused beyond the count.
   */
  stops?: Stop[]
}>()

const pct = computed(() => {
  if (props.availableMinutes <= 0) return 0
  return Math.min(100, Math.round((props.usedMinutes / props.availableMinutes) * 100))
})

const over = computed(() => props.usedMinutes > props.availableMinutes)
const diffMinutes = computed(() => Math.abs(props.availableMinutes - props.usedMinutes))

function fmtMin(m: number): string {
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const min = m % 60
    return min > 0 ? `${h}小时${min}分` : `${h}小时`
  }
  return `${m}分钟`
}

// ── Reserved: business-hours awareness (phase 2) ──
// const closedStops = computed(() =>
//   (props.stops ?? []).filter(s => s.openNow === false)
// )
</script>

<template>
  <div class="mb-4 p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-xs font-semibold text-gray-600">⏱ 时间预算</span>
      <span class="text-xs text-gray-400">
        {{ fmtMin(usedMinutes) }} / {{ fmtMin(availableMinutes) }}
      </span>
    </div>

    <!-- Progress bar -->
    <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="over ? 'bg-red-400' : 'bg-green-400'"
        :style="{ width: pct + '%' }"
      />
    </div>

    <!-- Hint -->
    <p
      class="mt-1.5 text-[11px]"
      :class="over ? 'text-red-500' : 'text-gray-400'"
    >
      <template v-if="over">
        超出约 {{ fmtMin(diffMinutes) }}，建议删 1 站或缩短停留
      </template>
      <template v-else-if="diffMinutes > 30">
        还有 {{ fmtMin(diffMinutes) }} 余量，可以再加一站
      </template>
      <template v-else>
        时间安排得刚刚好 👍
      </template>
    </p>
  </div>
</template>
