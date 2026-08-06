<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadCityRecommendations, type RecommendationCity } from '../repositories/cityRecommendations'

const emit = defineEmits<{
  select: [city: RecommendationCity]
  cancel: []
}>()

const cities = ref<RecommendationCity[]>([])
const loading = ref(true)
const error = ref(false)

async function load() {
  loading.value = true
  error.value = false
  const result = await loadCityRecommendations()
  cities.value = result.cities
  loading.value = false
  error.value = result.cities.length === 0
}

onMounted(load)
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-3">
      <button
        class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition active:scale-95"
        aria-label="返回"
        @click="emit('cancel')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div>
        <p class="text-base font-bold text-stone-900">选择一座城市</p>
        <p class="text-xs text-stone-400">仅显示已开放的城市</p>
      </div>
    </div>

    <div v-if="loading" class="grid grid-cols-2 gap-2.5">
      <div
        v-for="n in 4"
        :key="n"
        class="h-[60px] animate-pulse rounded-2xl border border-stone-200 bg-stone-100"
      />
    </div>

    <div v-else-if="error" class="py-8 text-center">
      <p class="text-sm text-stone-500">暂无可选城市，请稍后再试</p>
      <button
        class="mt-3 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white active:scale-95"
        @click="load"
      >
        重新加载
      </button>
    </div>

    <div v-else class="grid grid-cols-2 gap-2.5">
      <button
        v-for="city in cities"
        :key="city.adcode"
        class="group flex items-center gap-2.5 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 p-1.5 pr-3 text-left transition active:scale-[0.98] active:border-primary-300 active:bg-primary-50"
        @click="emit('select', city)"
      >
        <span
          class="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-base font-bold text-stone-500 shadow-sm"
        >
          <img
            v-if="city.coverImageUrl"
            :src="city.coverImageUrl"
            :alt="city.name"
            class="h-full w-full object-cover"
            loading="lazy"
          >
          <template v-else>{{ city.name.slice(0, 1) }}</template>
        </span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-stone-800">{{ city.name }}</span>
          <span class="mt-0.5 block truncate text-[10px] text-stone-400">{{ city.province }} · 全城探索</span>
        </span>
      </button>
    </div>
  </div>
</template>
