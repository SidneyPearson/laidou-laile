<script setup lang="ts">
import { computed } from 'vue'
import type { Route } from '../types/route'
import DayTripStop from './DayTripStop.vue'

const props = defineProps<{
  route: Route
  removable?: boolean
  removedIndices?: Set<number>
}>()

const visibleStops = computed(() =>
  props.route.stops.filter((_, i) => !props.removedIndices?.has(i))
)

/** Stops with sequential display indices (no gaps when stops are removed) */
const displayStops = computed(() => {
  const result: Array<{ stop: typeof props.route.stops[0]; originalIndex: number; displayIndex: number }> = []
  let idx = 0
  props.route.stops.forEach((stop, i) => {
    if (!props.removedIndices?.has(i)) {
      result.push({ stop, originalIndex: i, displayIndex: idx++ })
    }
  })
  return result
})

const emit = defineEmits<{
  'remove-stop': [index: number]
}>()

/** Open Amap with all stops as waypoints */
function navigateAll() {
  const stops = visibleStops.value
  if (stops.length === 0) return

  const origin = stops[0]
  const dest = stops[stops.length - 1]

  let url = `https://uri.amap.com/navigation?to=${dest.lng},${dest.lat},${encodeURIComponent(dest.name)}&mode=walk&callnative=1`

  if (stops.length > 2) {
    // Use direction API with waypoints for multi-stop routes
    const waypoints = stops.slice(1, -1)
      .map(s => `${s.lng},${s.lat},${encodeURIComponent(s.name)}`)
      .join(';')
    url = `https://uri.amap.com/direction?origin=${origin.lng},${origin.lat},${encodeURIComponent(origin.name)}&destination=${dest.lng},${dest.lat},${encodeURIComponent(dest.name)}&waypoints=${waypoints}&mode=walk`
  } else if (stops.length === 2) {
    url = `https://uri.amap.com/direction?origin=${origin.lng},${origin.lat},${encodeURIComponent(origin.name)}&destination=${dest.lng},${dest.lat},${encodeURIComponent(dest.name)}&mode=walk`
  }

  window.open(url, '_blank')
}
</script>

<template>
  <div class="px-1">
    <!-- Route header -->
    <div class="mb-5 text-center">
      <h2 class="text-xl font-bold text-gray-800">{{ route.name }}</h2>
      <p class="mt-1 text-sm text-gray-500">{{ route.tagline }}</p>
      <div class="flex justify-center gap-4 mt-2">
        <span class="text-xs text-gray-400">{{ visibleStops.length }} 个地点</span>
        <span v-if="removedIndices?.size" class="text-xs text-red-400">
          已移除 {{ removedIndices.size }} 个
        </span>
        <span v-if="route.walkingDistanceMeters > 0" class="text-xs text-gray-400">
          全程约 {{ (route.walkingDistanceMeters / 1000).toFixed(1) }}km
        </span>
      </div>

      <!-- Navigate all button -->
      <button
        v-if="visibleStops.length >= 2"
        class="mt-3 inline-flex items-center gap-1.5 text-xs text-primary-500
               bg-primary-50 px-3 py-1.5 rounded-full font-medium
               active:bg-primary-100 transition-colors"
        @click="navigateAll"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5"/>
        </svg>
        导航全部
      </button>
    </div>

    <!-- Tips -->
    <div
      v-if="route.tips"
      class="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-100"
    >
      <p class="text-xs text-amber-700 leading-relaxed">
        <span class="font-semibold">💡 </span>{{ route.tips }}
      </p>
    </div>

    <!-- Timeline -->
    <div class="relative">
      <!-- Vertical line -->
      <div class="absolute left-[19px] top-3 bottom-3 w-0.5 bg-primary-100" />

      <template v-for="item in displayStops" :key="item.stop.name">
        <DayTripStop
          :stop="item.stop"
          :index="item.displayIndex"
          :removable="removable"
          @remove="emit('remove-stop', item.originalIndex)"
        />
      </template>
    </div>
  </div>
</template>
