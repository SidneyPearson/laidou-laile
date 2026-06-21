<script setup lang="ts">
import { computed } from 'vue'
import type { Route } from '../types/route'

const props = defineProps<{
  routes: Route[]
}>()

const emit = defineEmits<{
  select: [route: Route]
}>()

interface RouteMeta {
  bestFor: string
  icon: string
  key: string
}

const metaMap = computed<RouteMeta[]>(() => {
  const routes = props.routes
  if (!Array.isArray(routes) || routes.length === 0) return []

  // Determine differentiation
  const diversities = routes.map((r) => {
    const stops = Array.isArray(r.stops) ? r.stops : [];
    const foodCount = stops.filter((s) => s.notes?.includes('吃') || s.name?.includes('餐') || s.name?.includes('店')).length
    const photoCount = stops.filter((s) => s.notes?.includes('拍') || s.photoTip).length
    const walkDist = r.walkingDistanceMeters ?? 0
    const stopCount = stops.length
    return { foodCount, photoCount, walkDist, stopCount }
  })

  const minWalk = Math.min(...diversities.map((d) => d.walkDist))
  const maxFood = Math.max(...diversities.map((d) => d.foodCount))
  const maxPhoto = Math.max(...diversities.map((d) => d.photoCount))
  const maxStops = Math.max(...diversities.map((d) => d.stopCount))

  return routes.map((_, i) => {
    const d = diversities[i]
    const candidates: { label: string; icon: string; key: string; score: number }[] = []

    if (d.walkDist === minWalk && minWalk < routes.reduce((a, b) => a + b.walkingDistanceMeters, 0) / routes.length * 0.9) {
      candidates.push({ label: '最短步行', icon: '🚶', key: 'walk', score: 1 })
    }
    if (d.foodCount === maxFood && maxFood > 0) {
      candidates.push({ label: '最多美食', icon: '🍜', key: 'food', score: 1 })
    }
    if (d.photoCount === maxPhoto && maxPhoto > 0) {
      candidates.push({ label: '最佳拍照', icon: '📷', key: 'photo', score: 1 })
    }
    if (d.stopCount === maxStops && maxStops > 1) {
      candidates.push({ label: '最多打卡', icon: '📍', key: 'stops', score: 0.5 })
    }

    // Fallback: use theme tagline
    if (candidates.length === 0) {
      const name = routes[i].name
      if (name.includes('吃') || name.includes('食')) candidates.push({ label: '美食之旅', icon: '🍜', key: 'theme', score: 0 })
      else if (name.includes('拍') || name.includes('景')) candidates.push({ label: '拍照之旅', icon: '📷', key: 'theme', score: 0 })
      else if (name.includes('逛') || name.includes('闲')) candidates.push({ label: '休闲漫步', icon: '🚶', key: 'theme', score: 0 })
      else candidates.push({ label: '综合推荐', icon: '✨', key: 'theme', score: 0 })
    }

    candidates.sort((a, b) => b.score - a.score)
    return { bestFor: candidates[0].label, icon: candidates[0].icon, key: candidates[0].key }
  })
})

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}

function handleSelect(route: Route) {
  emit('select', route)
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="(rt, i) in routes"
      :key="rt.id"
      class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <!-- Header -->
      <div class="px-4 pt-4 pb-3">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-lg font-bold text-gray-900">{{ rt.name }}</h3>
          <span class="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 font-medium">
            {{ metaMap[i]?.icon }} {{ metaMap[i]?.bestFor }}
          </span>
        </div>
        <p class="text-sm text-gray-400">{{ rt.tagline }}</p>
      </div>

      <!-- Metrics row -->
      <div class="flex gap-4 px-4 pb-3 text-xs text-gray-500">
        <span class="flex items-center gap-1">⏱ {{ rt.totalDurationMinutes }}分钟</span>
        <span class="flex items-center gap-1">🚶 {{ fmtDist(rt.walkingDistanceMeters) }}</span>
        <span class="flex items-center gap-1">📍 {{ rt.stops.length }}个地点</span>
      </div>

      <!-- Stops preview -->
      <div class="border-t border-gray-50 px-4 py-2">
        <div class="space-y-1">
          <div
            v-for="(stop, j) in rt.stops"
            :key="j"
            class="flex items-center gap-2 text-sm"
          >
            <span class="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
              {{ j + 1 }}
            </span>
            <span class="text-gray-700 truncate">{{ stop.name }}</span>
            <span class="text-xs text-gray-400 ml-auto">{{ stop.visitDurationMinutes }}min</span>
          </div>
        </div>
      </div>

      <!-- Tips -->
      <div class="px-4 pb-1">
        <p class="text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5">
          💡 {{ rt.tips }}
        </p>
      </div>

      <!-- Select button -->
      <div class="px-4 pb-4 pt-2">
        <button
          class="w-full py-2.5 rounded-xl bg-primary-500 text-white text-sm font-semibold active:bg-primary-600 transition-colors"
          @click="handleSelect(rt)"
        >
          选这条
        </button>
      </div>
    </div>
  </div>
</template>
