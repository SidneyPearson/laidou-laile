<script setup lang="ts">
import { ref, computed } from 'vue'
import { POPULAR_CITIES, type City, type Attraction } from '../data/popularCities'

const emit = defineEmits<{
  select: [attraction: Attraction, city: City]
  cancel: []
}>()

const selectedCity = ref<City | null>(null)

const showCities = computed(() => !selectedCity.value)

function selectCity(city: City) {
  selectedCity.value = city
}

function selectAttraction(attraction: Attraction) {
  if (!selectedCity.value) return
  emit('select', attraction, selectedCity.value)
}

function goBack() {
  selectedCity.value = null
}
</script>

<template>
  <div class="space-y-3">
    <!-- City list -->
    <template v-if="showCities">
      <div class="flex items-center gap-3 mb-3">
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-white
                 border border-gray-100 text-gray-400 active:bg-gray-50 flex-shrink-0"
          @click="emit('cancel')"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <p class="text-sm font-semibold text-gray-800">选择热门旅游城市</p>
      </div>
      <div class="grid grid-cols-2 gap-2.5">
        <button
          v-for="city in POPULAR_CITIES"
          :key="city.name"
          class="flex items-center gap-2.5 py-3 px-4 bg-white rounded-xl border border-gray-100
                 shadow-sm text-left active:bg-gray-50 transition-colors"
          @click="selectCity(city)"
        >
          <span class="text-2xl">{{ city.emoji }}</span>
          <div>
            <p class="text-sm font-semibold text-gray-800">{{ city.name }}</p>
            <p class="text-xs text-gray-400">{{ city.province }}</p>
          </div>
        </button>
      </div>
    </template>

    <!-- Attraction list for selected city -->
    <template v-else-if="selectedCity">
      <div class="flex items-center gap-3 mb-3">
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-white
                 border border-gray-100 text-gray-400 active:bg-gray-50 flex-shrink-0"
          @click="goBack"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div>
          <p class="text-base font-semibold text-gray-800">
            {{ selectedCity.emoji }} {{ selectedCity.name }}
          </p>
          <p class="text-xs text-gray-400">选择一个热门景点作为探索中心</p>
        </div>
      </div>

      <div class="space-y-2">
        <button
          v-for="attr in selectedCity.attractions"
          :key="attr.name"
          class="w-full flex items-center gap-3 py-3 px-4 bg-white rounded-xl border border-gray-100
                 shadow-sm text-left active:bg-primary-50 active:border-primary-200 transition-colors"
          @click="selectAttraction(attr)"
        >
          <span class="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-sm flex-shrink-0">
            📍
          </span>
          <span class="text-sm font-medium text-gray-800">{{ attr.name }}</span>
          <svg class="w-4 h-4 text-gray-300 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    </template>
  </div>
</template>
