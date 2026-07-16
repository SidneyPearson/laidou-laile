<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useRouteRequest } from '../composables/useRouteRequest'
import { refineRoute, replaceStop } from '../services/api'
import { ApiRequestError } from '../services/api'
import { walkingDistanceOf } from '../utils/geo'
import RouteCompare from '../components/RouteCompare.vue'
import DayTripView from '../components/DayTripView.vue'
import TimeBudgetBar from '../components/TimeBudgetBar.vue'
import RouteSkeleton from '../components/RouteSkeleton.vue'
import RouteError from '../components/RouteError.vue'
import EmptyState from '../components/EmptyState.vue'
import type { Route, Stop } from '../types/route'

const router = useRouter()
const route = useRoute()
const { routes, locationName, weatherNote, weather, loading, error, retry, lastRequest } = useRouteRequest()

const selectedId = ref<string | null>(null)

// ── Refinement state ────────────────────────────────────
const removedIndices = ref<Set<number>>(new Set())
const refineInput = ref('')
const refining = ref(false)
const refineError = ref('')
const hasRemoved = computed(() => removedIndices.value.size > 0)
const hasRefineInput = computed(() => refineInput.value.trim().length > 0)

// Day-trip mode: 半天/一天 → single curated route, timeline UI
const isDayTrip = computed(() => {
  const timeOption = Number(route.query.timeOption)
  return timeOption >= 240
    && Array.isArray(routes.value)
    && routes.value.length === 1
})

function handleRouteSelect(rt: Route) {
  selectedId.value = selectedId.value === rt.id ? null : rt.id
}

function handleRemoveStop(index: number) {
  const next = new Set(removedIndices.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  removedIndices.value = next
}

async function handleRefine() {
  const currentRoute = routes.value?.[0]
  if (!currentRoute) return

  const indices = [...removedIndices.value].sort((a, b) => b - a) // descending for splice
  const requirements = refineInput.value.trim()

  // Frontend-only: just remove stops, no extra requirements
  if (!requirements && indices.length > 0) {
    const newStops = currentRoute.stops.filter((_, i) => !removedIndices.value.has(i))
    const newRoute = {
      ...currentRoute,
      id: crypto.randomUUID(),
      stops: newStops,
      totalDurationMinutes: newStops.reduce((s, st) => s + st.visitDurationMinutes, 0) + 10,
      walkingDistanceMeters: Math.max(0, currentRoute.walkingDistanceMeters - 200),
    }
    routes.value = [newRoute]
    removedIndices.value = new Set()
    refineInput.value = ''
    refineError.value = ''
    return
  }

  // Need API: has extra requirements
  refining.value = true
  refineError.value = ''
  try {
    const res = await refineRoute({
      route: currentRoute,
      removeStopIndices: indices,
      extraRequirements: requirements || undefined,
      city: locationName.value,
      weather: weatherNote.value || '晴',
      timeMinutes: Number(route.query.timeOption) || 240,
      distance: Number(route.query.distance) || 1000,
      preferences: preferences.value,
      origin: lastRequest.value ? { lat: lastRequest.value.lat, lng: lastRequest.value.lng } : undefined,
    })
    routes.value = res.routes
    removedIndices.value = new Set()
    refineInput.value = ''
  } catch (err: any) {
    refineError.value = err instanceof ApiRequestError ? err.message : '优化失败，请重试'
  } finally {
    refining.value = false
  }
}

// ── Replace single stop ─────────────────────────────────
const replacingIndex = ref<number | null>(null)

const preferences = computed(() =>
  String(route.query.preferences || '')
    .split(',')
    .filter(Boolean) as import('../types/route').PreferenceTag[]
)

async function handleReplaceStop(index: number) {
  const currentRoute = routes.value?.[0]
  if (!currentRoute || replacingIndex.value !== null) return

  replacingIndex.value = index
  refineError.value = ''
  try {
    const res = await replaceStop({
      route: currentRoute,
      stopIndex: index,
      preferences: preferences.value.length ? preferences.value : ['food'],
      distance: Number(route.query.distance) || 0,
      timeMinutes: Number(route.query.timeOption) || undefined,
      origin: lastRequest.value ? { lat: lastRequest.value.lat, lng: lastRequest.value.lng } : undefined,
    })
    routes.value = [res.route]
    removedIndices.value = new Set() // indices shifted after re-sort
  } catch (err: any) {
    refineError.value = err instanceof ApiRequestError ? err.message : '换一家失败，请重试'
  } finally {
    replacingIndex.value = null
  }
}

// ── Reorder stops (drag) ────────────────────────────────
function handleReorder(newStops: Stop[]) {
  const currentRoute = routes.value?.[0]
  if (!currentRoute) return
  const walk = walkingDistanceOf(newStops)
  const visitSum = newStops.reduce((s, st) => s + st.visitDurationMinutes, 0)
  routes.value = [{
    ...currentRoute,
    stops: newStops,
    walkingDistanceMeters: walk,
    totalDurationMinutes: visitSum + Math.ceil(walk / 100 * 1.5),
  }]
  removedIndices.value = new Set() // indices no longer valid after reorder
}

// Time budget: route's total time vs the user's available time
const availableMinutes = computed(() => Number(route.query.timeOption) || 0)
const usedMinutes = computed(() => routes.value?.[0]?.totalDurationMinutes || 0)

const displayLocation = computed(() => route.query.locationName as string || locationName.value || '')
const displayWeather = computed(() => route.query.weatherNote as string || weatherNote.value || '')
const isRainy = computed(() => route.query.isRainy === '1' || weather.value?.isRainy || false)

// Safety net: if we land here with no routes and no loading, redirect home.
// Never redirect while a refine is in progress.
watch(
  () => ({ len: Array.isArray(routes.value) ? routes.value.length : 0, loading: loading.value }),
  (state) => {
    if (!state.loading && !refining.value && state.len === 0) {
      router.replace({ name: 'home' })
    }
  },
  { immediate: true },
)

const routeCount = computed(() => Array.isArray(routes.value) ? routes.value.length : 0)

function goBack() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="h-full flex flex-col max-w-md mx-auto">
    <!-- Top bar -->
    <header class="flex-shrink-0 flex items-center justify-between px-5 pt-12 pb-4">
      <button
        class="w-9 h-9 flex items-center justify-center rounded-full bg-white
               shadow-sm border border-gray-100 text-gray-500 active:bg-gray-50"
        @click="goBack"
        aria-label="返回"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div class="text-center">
        <p class="text-sm font-semibold text-gray-800">{{ displayLocation }}</p>
        <p v-if="displayWeather" class="text-xs text-gray-400">{{ displayWeather }}</p>
        <p v-if="isRainy" class="text-xs text-blue-500 mt-0.5">🌂 出门记得带伞哦</p>
      </div>
      <div class="w-9 h-9"></div> <!-- spacer -->
    </header>

    <!-- Content -->
    <div class="flex-1 min-h-0 flex flex-col px-4 pb-4">
      <!-- Loading -->
      <div v-if="loading" class="flex-1 min-h-0 overflow-y-auto scroll-smooth-ios">
        <RouteSkeleton v-for="i in 3" :key="i" class="mb-4" />
      </div>

      <!-- Error -->
      <RouteError
        v-else-if="error"
        :error="error"
        @retry="retry()"
      />

      <!-- Empty -->
      <EmptyState v-else-if="routeCount === 0" />

      <!-- DayTrip Timeline -->
      <div v-else-if="isDayTrip && routes[0]" class="relative flex-1 min-h-0 flex flex-col">
        <TimeBudgetBar
          v-if="availableMinutes > 0"
          class="flex-shrink-0"
          :used-minutes="usedMinutes"
          :available-minutes="availableMinutes"
          :stops="routes[0].stops"
        />
        <DayTripView
          class="flex-1 min-h-0"
          :route="routes[0]"
          :removable="true"
          :removed-indices="removedIndices"
          :replacing-index="replacingIndex"
          @remove-stop="handleRemoveStop"
          @replace-stop="handleReplaceStop"
          @reorder="handleReorder"
        />
        <!-- Refine loading overlay -->
        <Transition name="fade">
          <div
            v-if="refining"
            class="absolute inset-0 bg-white/80 backdrop-blur-sm
                   rounded-2xl flex flex-col items-center justify-center z-20
                   min-h-[300px]"
          >
            <div class="w-8 h-8 border-[3px] border-primary-200 border-t-primary-500
                        rounded-full animate-spin mb-3" />
            <p class="text-sm text-gray-500 font-medium">AI 正在优化路线...</p>
            <p class="text-xs text-gray-400 mt-1">加入新需求，重新规划中</p>
          </div>
        </Transition>
      </div>

      <!-- Routes compare (normal mode) -->
      <div v-else class="flex-1 min-h-0 overflow-y-auto scroll-smooth-ios">
        <RouteCompare
          :routes="routes"
          :selected-id="selectedId"
          @select="handleRouteSelect"
        />
      </div>
    </div>

    <!-- AI disclaimer -->
    <p
      v-if="routeCount > 0 && !loading && !error"
      class="flex-shrink-0 text-[11px] text-gray-400 text-center px-5 pb-1"
    >
      ⚠️ AI 生成结果仅供参考，请以实际情况为准
    </p>

    <!-- Bottom bar -->
    <div
      v-if="routeCount > 0 && !loading && !error"
      class="flex-shrink-0 px-5 py-3 bg-white/80 backdrop-blur-lg border-t border-gray-100 space-y-2"
    >
      <!-- Refine bar (day-trip mode) -->
      <div v-if="isDayTrip" class="space-y-2">
        <!-- Refine input -->
        <div class="flex gap-2">
          <input
            v-model="refineInput"
            type="text"
            class="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200
                   focus:outline-none focus:border-primary-300 bg-gray-50
                   placeholder-gray-400"
            placeholder="补充需求，如：加一个咖啡馆"
            :disabled="refining"
          />
          <button
            class="flex-shrink-0 text-xs font-medium px-3 py-2 rounded-lg
                   bg-primary-50 text-primary-600 active:bg-primary-100
                   transition-colors disabled:opacity-40"
            :disabled="(!hasRemoved && !hasRefineInput) || refining"
            @click="handleRefine"
          >
            {{ refining ? '优化中...' : '✨ 重新规划' }}
          </button>
        </div>
        <!-- Refine error -->
        <p v-if="refineError" class="text-[11px] text-red-400 text-center">
          {{ refineError }}
        </p>
      </div>

      <!-- Default: re-plan button -->
      <button
        v-if="!isDayTrip"
        class="btn-primary w-full py-3.5 text-sm font-semibold"
        @click="goBack"
      >
        重新规划路线
      </button>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
