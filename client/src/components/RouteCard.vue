<script setup lang="ts">
import { ref } from 'vue'
import type { Route } from '../types/route'
import StopCard from './StopCard.vue'
import NavButton from './NavButton.vue'

defineProps<{
  route: Route
  index: number
  total: number
}>()

const expanded = ref(false)

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}
</script>

<template>
  <div class="card p-5 mx-1">
    <!-- Header -->
    <div class="mb-4">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-gray-400 font-medium">
          路线 {{ index + 1 }} / {{ total }}
        </span>
        <span class="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-medium">
          {{ formatDuration(route.totalDurationMinutes) }}
        </span>
      </div>
      <h2 class="text-xl font-bold text-gray-900 mb-1">{{ route.name }}</h2>
      <p class="text-sm text-gray-500">{{ route.tagline }}</p>
    </div>

    <!-- Meta -->
    <div class="flex gap-4 mb-4 text-xs text-gray-400">
      <span>🚶 {{ formatDistance(route.walkingDistanceMeters) }} 步行</span>
      <span>📍 {{ route.stops.length }} 个地点</span>
    </div>

    <!-- Stops -->
    <div v-show="expanded" class="mb-4">
      <StopCard
        v-for="(stop, i) in route.stops"
        :key="stop.name"
        :stop="stop"
        :index="i"
      />
    </div>

    <!-- Expand toggle -->
    <button
      class="w-full text-center text-sm text-primary-500 font-medium py-2
             active:text-primary-600 transition-colors"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收起详情 ▲' : '展开路线详情 ▼' }}
    </button>

    <!-- Tips -->
    <div v-show="expanded" class="mt-3 bg-amber-50 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
      💡 {{ route.tips }}
    </div>

    <!-- Navigate all -->
    <div v-if="route.stops.length > 0 && expanded" class="mt-4">
      <NavButton
        :name="route.stops[0].name"
        :lng="route.stops[0].lng"
        :lat="route.stops[0].lat"
        class="justify-center w-full py-2.5 bg-primary-500 text-white rounded-2xl
               font-medium text-sm active:bg-primary-600 transition-colors inline-flex"
      />
    </div>
  </div>
</template>
