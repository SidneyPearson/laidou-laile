<script setup lang="ts">
import { computed } from 'vue'
import type { Route } from '../types/route'
import StopCard from './StopCard.vue'
import NavButton from './NavButton.vue'
import { formatOriginDistance } from '../utils/distance'

const props = defineProps<{
  routes: Route[]
  selectedId?: string | null
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

  // Cuisine comparison mode: tagline is "评分最高 · 火锅+本地菜" etc.
  // Use the dimension label directly as badge, skip auto-detection.
  const DIM_LABELS = ['评分最高', '距离最近', '最多打卡']
  const isCuisineComparison = routes.every(r => {
    if (!r.tagline?.includes(' · ')) return false
    return DIM_LABELS.some(l => r.tagline.startsWith(l))
  })
  if (isCuisineComparison) {
    return routes.map(r => {
      const label = DIM_LABELS.find(l => r.tagline.startsWith(l)) || ''
      const icons: Record<string, string> = { '评分最高': '🏅', '距离最近': '📍', '最多打卡': '🔥' }
      return { bestFor: label, icon: icons[label] || '✨', key: 'cuisine' }
    })
  }

  // Determine differentiation
  const diversities = routes.map((r) => {
    const stops = Array.isArray(r.stops) ? r.stops : [];
    const foodKeywords = ['餐厅', '饭馆', '酒楼', '面馆', '火锅', '小吃', '美食', '食堂', '饭店', '拉面', '米线', '烧烤', '点心', '烘焙', '面包', '茶饮', '咖啡']
    const foodCount = stops.filter((s) => {
      const name = s.name || ''
      const notes = s.notes || ''
      return notes.includes('吃') || notes.includes('招牌菜') || notes.includes('推荐菜') ||
        foodKeywords.some(k => name.includes(k))
    }).length
    const walkDist = r.walkingDistanceMeters ?? 0
    const stopCount = stops.length
    return { foodCount, walkDist, stopCount }
  })

  const minWalk = Math.min(...diversities.map((d) => d.walkDist))
  const maxFood = Math.max(...diversities.map((d) => d.foodCount))
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
    if (d.stopCount === maxStops && maxStops > 1) {
      candidates.push({ label: '最多打卡', icon: '📍', key: 'stops', score: 0.5 })
    }

    // Fallback: use theme tagline
    if (candidates.length === 0) {
      const name = routes[i].name
      if (name.includes('吃') || name.includes('食')) candidates.push({ label: '美食之旅', icon: '🍜', key: 'theme', score: 0 })
      else if (name.includes('景') || name.includes('打卡')) candidates.push({ label: '景点打卡', icon: '🏯', key: 'theme', score: 0 })
      else if (name.includes('逛') || name.includes('闲')) candidates.push({ label: '休闲漫步', icon: '🚶', key: 'theme', score: 0 })
      else candidates.push({ label: '综合推荐', icon: '✨', key: 'theme', score: 0 })
    }

    candidates.sort((a, b) => b.score - a.score)
    return { bestFor: candidates[0].label, icon: candidates[0].icon, key: candidates[0].key }
  })
})


function handleSelect(route: Route) {
  emit('select', route)
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="(rt, i) in routes"
      :key="rt.id"
      :class="[
        'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
        props.selectedId === rt.id
          ? 'border-primary-300 ring-2 ring-primary-100 shadow-md'
          : 'border-gray-100',
      ]"
    >
      <!-- Header -->
      <div class="px-4 pt-4 pb-3">
        <div class="flex items-center justify-between mb-1 gap-2">
          <h3 class="text-lg font-bold text-gray-900">{{ rt.name }}</h3>
          <span class="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 font-medium">
            <template v-if="rt.direction">🧭 {{ rt.direction }}</template>
            <template v-else>{{ metaMap[i]?.icon }} {{ metaMap[i]?.bestFor }}</template>
          </span>
        </div>
        <p class="text-sm text-gray-400">{{ rt.tagline }}</p>
        <!-- Divergence rationale: why this option differs from the others -->
        <p v-if="rt.reason" class="mt-1 text-[11px] text-gray-400 leading-snug">
          <span class="text-gray-300">为何不同 ·</span> {{ rt.reason }}
        </p>
      </div>

      <!-- Metrics row -->
      <div class="flex gap-4 px-4 pb-3 text-xs text-gray-500">
        <span class="flex items-center gap-1">📍 {{ rt.stops.length }}个地点</span>
      </div>

      <!-- Stops: preview when collapsed, detail when selected -->
      <template v-if="props.selectedId === rt.id">
        <!-- Expanded stops -->
        <div class="border-t border-gray-50 px-4 pt-3 pb-1">
          <StopCard
            v-for="(stop, j) in rt.stops"
            :key="stop.name"
            :stop="stop"
            :index="j"
          />
        </div>

        <!-- Tips -->
        <div class="px-4 pt-2 pb-1">
          <p class="text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
            💡 {{ rt.tips }}
          </p>
        </div>

        <!-- Navigate -->
        <div v-if="rt.stops.length > 0" class="px-4 pt-2 pb-3">
          <NavButton
            :name="rt.stops[0].name"
            :lng="rt.stops[0].lng"
            :lat="rt.stops[0].lat"
            class="justify-center w-full py-2.5 bg-primary-500 text-white rounded-xl
                   font-medium text-sm active:bg-primary-600 transition-colors inline-flex"
          />
        </div>
      </template>
      <template v-else>
        <!-- Collapsed: simple stops preview -->
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
              <span class="text-xs text-gray-400 ml-auto flex-shrink-0">{{ formatOriginDistance(stop.distanceMeters) }}</span>
            </div>
          </div>
        </div>

        <!-- Tips (short, collapsed) -->
        <div class="px-4 pb-1">
          <p class="text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 line-clamp-1">
            💡 {{ rt.tips }}
          </p>
        </div>
      </template>

      <!-- Select button -->
      <div class="px-4 pb-4 pt-2">
        <button
          v-if="props.selectedId === rt.id"
          class="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                 bg-primary-500 text-white shadow-sm active:bg-primary-600"
          @click="handleSelect(rt)"
        >
          <span class="inline-flex items-center gap-1.5">
            重新选择
          </span>
        </button>
        <button
          v-else
          class="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                 bg-white text-primary-500 border-2 border-primary-200
                 hover:border-primary-400 active:bg-primary-50"
          @click="handleSelect(rt)"
        >
          选这条
        </button>
      </div>
    </div>
  </div>
</template>
