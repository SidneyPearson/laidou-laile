<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGeolocation } from '../composables/useGeolocation'
import { useRouteRequest } from '../composables/useRouteRequest'
import { useHistory } from '../composables/useHistory'
import LocationGate from '../components/LocationGate.vue'
import TimeSelector from '../components/TimeSelector.vue'
import DistanceSelector from '../components/DistanceSelector.vue'
import PreferenceTags from '../components/PreferenceTags.vue'
import LoadingOverlay from '../components/LoadingOverlay.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import type { TimeOption, DistanceOption, PreferenceTag, MealType, CuisineType, PhotoType, ScenicType, WanderType, WalkLevel } from '../types/route'

const router = useRouter()
const { coords, loading: locLoading, error: locError, isMock, requestLocation } = useGeolocation()
const { routes, locationName, weather, weatherNote, loading: genLoading, loadingStage, error: genError, fetchRoutes, cancelRequest } = useRouteRequest()
const { addEntry } = useHistory()

// ── Selections (all start empty — user must choose) ──
const timeOption = ref<TimeOption | null>(null)
const distance = ref<DistanceOption | null>(null)
const preferences = ref<PreferenceTag[]>([])
const mealTypes = ref<MealType[]>([])
const cuisineTypes = ref<CuisineType[]>([])
const photoTypes = ref<PhotoType[]>([])
const scenicTypes = ref<ScenicType[]>([])
const wanderTypes = ref<WanderType[]>([])
const walkLevel = ref<WalkLevel | null>(null)

const hasRequestedLocation = ref(false)

// ── Computed ──────────────────────────────────────────

const canGenerate = computed(() => {
  return (
    coords.value &&
    timeOption.value !== null &&
    distance.value !== null &&
    preferences.value.length > 0
  )
})

const missingHint = computed(() => {
  if (!coords.value) return null
  const missing: string[] = []
  if (!timeOption.value) missing.push('可用时间')
  if (!distance.value) missing.push('探索距离')
  if (preferences.value.length === 0) missing.push('怎么玩')
  if (missing.length === 0) return null
  return `请选择：${missing.join('、')}`
})

// ── Methods ───────────────────────────────────────────

function handleRequestLocation(useMock: boolean) {
  hasRequestedLocation.value = true
  requestLocation(useMock)
}

async function handleGenerate() {
  if (!coords.value || !timeOption.value || !distance.value) return

  try {
    await fetchRoutes({
      lat: coords.value.lat,
      lng: coords.value.lng,
      timeOption: timeOption.value,
      distance: distance.value,
      preferences: preferences.value,
      mealTypes: preferences.value.includes('food') ? mealTypes.value : undefined,
      cuisineTypes: preferences.value.includes('food') ? cuisineTypes.value : undefined,
      photoTypes: preferences.value.includes('photo') ? photoTypes.value : undefined,
      scenicTypes: preferences.value.includes('scenic') ? scenicTypes.value : undefined,
      wanderTypes: preferences.value.includes('wander') ? wanderTypes.value : undefined,
      walkLevel: preferences.value.includes('less_walk') ? walkLevel.value ?? undefined : undefined,
    })

    // Defensive check: routes must be a non-empty array
    if (!Array.isArray(routes.value) || routes.value.length === 0) {
      return
    }

    // Save to history (wrapped to prevent blocking navigation)
    try {
      addEntry({
        locationName: locationName.value,
        request: {
          timeOption: timeOption.value!,
          distance: distance.value!,
          preferences: [...preferences.value],
          mealTypes: mealTypes.value.length > 0 ? [...mealTypes.value] : undefined,
          cuisineTypes: cuisineTypes.value.length > 0 ? [...cuisineTypes.value] : undefined,
          photoTypes: photoTypes.value.length > 0 ? [...photoTypes.value] : undefined,
          scenicTypes: scenicTypes.value.length > 0 ? [...scenicTypes.value] : undefined,
          wanderTypes: wanderTypes.value.length > 0 ? [...wanderTypes.value] : undefined,
          walkLevel: walkLevel.value ?? undefined,
        },
        routes: routes.value,
        weather: weather.value,
      })
    } catch (historyErr) {
      console.warn('Failed to save history entry:', historyErr)
      // Non-blocking — still navigate even if history save fails
    }

    router.push({
      name: 'routes',
      query: {
        locationName: locationName.value,
        weatherNote: weatherNote.value || '',
        isRainy: weather.value?.isRainy ? '1' : '0',
      },
    })
  } catch (unexpectedErr) {
    // Last-resort guard — prevent blank page
    console.error('Unexpected error in handleGenerate:', unexpectedErr)
  }
}
</script>

<template>
  <!-- Loading Overlay -->
  <LoadingOverlay v-if="genLoading" :stage="loadingStage" @cancel="cancelRequest()" />

  <div class="h-full flex flex-col max-w-md mx-auto">
    <!-- Header -->
    <header class="flex-shrink-0 pt-12 pb-6 px-5 text-center relative">
      <h1 class="text-3xl font-bold text-gray-900 mb-1">来都来了</h1>
      <p class="text-sm text-gray-400">不用做攻略，到了就会玩</p>
      <button
        class="absolute right-5 top-12 w-9 h-9 flex items-center justify-center rounded-full bg-white
               shadow-sm border border-gray-100 text-gray-400 active:bg-gray-50 transition-colors"
        aria-label="历史路线"
        @click="router.push({ name: 'history' })"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </button>
    </header>

    <!-- Main content -->
    <div class="flex-1 overflow-auto px-5">
      <ErrorBoundary>
      <!-- Location -->
      <section class="mb-6">
        <div v-if="!hasRequestedLocation && !coords" class="text-center py-6">
          <button
            class="btn-primary w-full py-3.5 text-base font-semibold"
            :disabled="locLoading"
            @click="handleRequestLocation(false)"
          >
            {{ locLoading ? '获取中...' : '📍 获取当前位置' }}
          </button>
          <button
            class="mt-3 text-gray-400 text-xs underline"
            @click="handleRequestLocation(true)"
          >
            使用模拟位置体验
          </button>
        </div>
        <LocationGate
          v-else
          :loading="locLoading"
          :error="locError"
          :is-mock="isMock"
          :has-coords="!!coords"
          @request="handleRequestLocation"
        />
      </section>

      <!-- Preferences (only show after location is set) -->
      <template v-if="coords">
        <!-- Guidance banner -->
        <div
          v-if="missingHint"
          class="mb-5 p-3 bg-primary-50 border border-primary-100 rounded-xl text-center"
        >
          <p class="text-sm text-primary-700 font-medium">{{ missingHint }}</p>
        </div>

        <section class="mb-6">
          <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            可用时间
            <span v-if="!timeOption" class="text-primary-400 animate-pulse ml-1">← 必选</span>
          </h2>
          <TimeSelector v-model="timeOption" />
        </section>

        <section class="mb-6">
          <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            探索距离
            <span v-if="!distance" class="text-primary-400 animate-pulse ml-1">← 必选</span>
          </h2>
          <DistanceSelector v-model="distance" />
        </section>

        <section class="mb-8">
          <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            想怎么玩
            <span v-if="preferences.length === 0" class="text-primary-400 animate-pulse ml-1">← 必选</span>
          </h2>
          <PreferenceTags
            v-model="preferences"
            v-model:meal-types="mealTypes"
            v-model:cuisine-types="cuisineTypes"
            v-model:photo-types="photoTypes"
            v-model:scenic-types="scenicTypes"
            v-model:wander-types="wanderTypes"
            v-model:walk-level="walkLevel"
          />
        </section>
      </template>
      </ErrorBoundary>
    </div>

    <!-- Bottom fixed CTA -->
    <div
      v-if="coords"
      class="flex-shrink-0 px-5 py-4 bg-white/80 backdrop-blur-lg border-t border-gray-100"
    >
      <!-- Generate + Cancel buttons -->
      <div v-if="genLoading" class="space-y-2">
        <button
          class="btn-primary w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2 opacity-70"
          disabled
        >
          <span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          生成中...
        </button>
        <button
          class="w-full py-2 text-sm text-gray-400 active:text-gray-600 transition-colors"
          @click="cancelRequest()"
        >
          取消
        </button>
      </div>
      <div v-else>
        <button
          class="btn-primary w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2"
          :class="!canGenerate ? 'opacity-50 cursor-not-allowed' : ''"
          :disabled="!canGenerate"
          @click="handleGenerate"
        >
          ✨ 生成路线
        </button>
      </div>

      <!-- Error display with retry hint -->
      <div v-if="genError" class="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-center">
        <p class="text-sm text-red-600 font-medium">{{ genError.message }}</p>
        <p v-if="genError.code === 'NETWORK_ERROR'" class="text-xs text-red-400 mt-1">
          服务器可能正在启动，请稍后重试
        </p>
        <button
          class="mt-2 text-sm text-red-500 underline font-medium"
          @click="handleGenerate"
        >
          重新生成
        </button>
      </div>
    </div>
  </div>
</template>
