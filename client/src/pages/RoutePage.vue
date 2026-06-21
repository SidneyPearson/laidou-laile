<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useRouteRequest } from '../composables/useRouteRequest'
import { useSwipe } from '../composables/useSwipe'
import RouteCard from '../components/RouteCard.vue'
import RouteSkeleton from '../components/RouteSkeleton.vue'
import RouteError from '../components/RouteError.vue'
import EmptyState from '../components/EmptyState.vue'

const router = useRouter()
const route = useRoute()
const { routes, locationName, weatherNote, loading, error, retry } = useRouteRequest()

const displayLocation = computed(() => route.query.locationName as string || locationName.value || '')
const displayWeather = computed(() => route.query.weatherNote as string || weatherNote.value || '')

function onSwipeChange(_index: number) {
  // handled by state
}

const { state: swipeState, onTouchStart, onTouchMove, onTouchEnd, goTo } = useSwipe(
  computed(() => routes.value.length).value,
  onSwipeChange,
)

function goBack() {
  router.push({ name: 'home' })
}

const transitionStyle = computed(() => {
  if (!swipeState.value.isDragging) return {}
  return {
    transform: `translateX(${swipeState.value.offsetX}px)`,
    transition: 'none',
  }
})
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
      <EmptyState v-else-if="routes.length === 0" />

      <!-- Routes - swipeable cards -->
      <div
        v-else
        class="relative"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      >
        <div
          v-for="(rt, i) in routes"
          :key="rt.id"
          v-show="i === swipeState.currentIndex"
          :style="i === swipeState.currentIndex ? transitionStyle : {}"
        >
          <RouteCard
            :route="rt"
            :index="i"
            :total="routes.length"
          />
        </div>
      </div>
    </div>

    <!-- Dot indicators -->
    <div
      v-if="routes.length > 1 && !loading && !error"
      class="flex-shrink-0 flex justify-center gap-2 py-3"
    >
      <button
        v-for="(_, i) in routes"
        :key="i"
        :class="[
          'w-2 h-2 rounded-full transition-all',
          i === swipeState.currentIndex
            ? 'bg-primary-500 w-5'
            : 'bg-gray-300',
        ]"
        @click="goTo(i)"
      />
    </div>

    <!-- Bottom nav all -->
    <div
      v-if="routes.length > 0 && !loading && !error"
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
