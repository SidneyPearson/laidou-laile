<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGeolocation } from '../composables/useGeolocation'
import { useRouteRequest } from '../composables/useRouteRequest'
import LocationGate from '../components/LocationGate.vue'
import TimeSelector from '../components/TimeSelector.vue'
import PreferenceTags from '../components/PreferenceTags.vue'
import LoadingOverlay from '../components/LoadingOverlay.vue'
import type { TimeOption, PreferenceTag, MealType, CuisineType } from '../types/route'

const router = useRouter()
const { coords, loading: locLoading, error: locError, isMock, requestLocation } = useGeolocation()
const { routes, locationName, weather, weatherNote, loading: genLoading, loadingStage, error: genError, fetchRoutes } = useRouteRequest()

const timeOption = ref<TimeOption>(60)
const preferences = ref<PreferenceTag[]>(['food'])
const mealTypes = ref<MealType[]>([])
const cuisineTypes = ref<CuisineType[]>([])

const hasRequestedLocation = ref(false)

function handleRequestLocation(useMock: boolean) {
  hasRequestedLocation.value = true
  requestLocation(useMock)
}

async function handleGenerate() {
  if (!coords.value) return
  await fetchRoutes({
    lat: coords.value.lat,
    lng: coords.value.lng,
    timeOption: timeOption.value,
    preferences: preferences.value,
    mealTypes: preferences.value.includes('food') ? mealTypes.value : undefined,
    cuisineTypes: preferences.value.includes('food') ? cuisineTypes.value : undefined,
  })
  if (routes.value.length > 0) {
    router.push({
      name: 'routes',
      query: {
        locationName: locationName.value,
        weatherNote: weatherNote.value || '',
        isRainy: weather.value?.isRainy ? '1' : '0',
      },
    })
  }
}
</script>

<template>
  <!-- Loading Overlay -->
  <LoadingOverlay v-if="genLoading" :stage="loadingStage" />

  <div class="h-full flex flex-col max-w-md mx-auto">
    <!-- Header -->
    <header class="flex-shrink-0 pt-12 pb-6 px-5 text-center">
      <h1 class="text-3xl font-bold text-gray-900 mb-1">来都来了</h1>
      <p class="text-sm text-gray-400">不用做攻略，到了就会玩</p>
    </header>

    <!-- Main content -->
    <div class="flex-1 overflow-auto px-5">
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
        <section class="mb-6">
          <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            可用时间
          </h2>
          <TimeSelector v-model="timeOption" />
        </section>

        <section class="mb-8">
          <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            想怎么玩
          </h2>
          <PreferenceTags v-model="preferences" v-model:meal-types="mealTypes" v-model:cuisine-types="cuisineTypes" />
        </section>
      </template>
    </div>

    <!-- Bottom fixed CTA -->
    <div
      v-if="coords"
      class="flex-shrink-0 px-5 py-4 bg-white/80 backdrop-blur-lg border-t border-gray-100"
    >
      <button
        class="btn-primary w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2"
        :disabled="genLoading || preferences.length === 0"
        @click="handleGenerate"
      >
        {{ genLoading ? '生成中...' : '✨ 生成路线' }}
      </button>
      <p v-if="genError" class="text-red-500 text-xs text-center mt-2">
        {{ genError.message }}
      </p>
    </div>
  </div>
</template>
