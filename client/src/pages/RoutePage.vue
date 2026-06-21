<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useRouteRequest } from '../composables/useRouteRequest'
import RouteCompare from '../components/RouteCompare.vue'
import DayTripView from '../components/DayTripView.vue'
import RouteSkeleton from '../components/RouteSkeleton.vue'
import RouteError from '../components/RouteError.vue'
import EmptyState from '../components/EmptyState.vue'

const router = useRouter()
const route = useRoute()
const { routes, locationName, weatherNote, weather, loading, error, retry } = useRouteRequest()

const selectedId = ref<string | null>(null)

// Day-trip mode: 半天/一天 → single curated route, timeline UI
const isDayTrip = computed(() => {
  const timeOption = Number(route.query.timeOption)
  return timeOption >= 240
    && Array.isArray(routes.value)
    && routes.value.length === 1
})

function handleRouteSelect(rt: import('../types/route').Route) {
  selectedId.value = selectedId.value === rt.id ? null : rt.id
}

const displayLocation = computed(() => route.query.locationName as string || locationName.value || '')
const displayWeather = computed(() => route.query.weatherNote as string || weatherNote.value || '')
const isRainy = computed(() => route.query.isRainy === '1' || weather.value?.isRainy || false)

// Safety net: if we land here with no routes and no loading, redirect home
watch(
  () => ({ len: Array.isArray(routes.value) ? routes.value.length : 0, loading: loading.value }),
  (state) => {
    if (!state.loading && state.len === 0) {
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
    <div class="flex-1 overflow-auto px-4 pb-4">
      <!-- Loading -->
      <div v-if="loading">
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

      <!-- DayTrip Timeline (半天/一天 + scenic) -->
      <DayTripView
        v-else-if="isDayTrip && routes[0]"
        :route="routes[0]"
      />

      <!-- Routes compare (normal mode) -->
      <RouteCompare
        v-else
        :routes="routes"
        :selected-id="selectedId"
        @select="handleRouteSelect"
      />
    </div>

    <!-- Bottom bar -->
    <div
      v-if="routeCount > 0 && !loading && !error"
      class="flex-shrink-0 px-5 py-4 bg-white/80 backdrop-blur-lg border-t border-gray-100"
    >
      <button
        class="btn-primary w-full py-3.5 text-sm font-semibold"
        @click="goBack"
      >
        重新规划路线
      </button>
    </div>
  </div>
</template>
