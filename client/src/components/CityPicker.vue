<script setup lang="ts">
import { POPULAR_CITIES, type City } from '../data/popularCities'

const emit = defineEmits<{
  select: [city: City]
  cancel: []
}>()
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
        <p class="text-xs text-stone-400">V0.3 将以整座城市作为探索范围</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2.5">
      <button
        v-for="city in POPULAR_CITIES"
        :key="city.name"
        class="group flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3 text-left transition active:scale-[0.98] active:border-primary-300 active:bg-primary-50"
        @click="emit('select', city)"
      >
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
          {{ city.emoji }}
        </span>
        <span>
          <span class="block text-sm font-semibold text-stone-800">{{ city.name }}</span>
          <span class="mt-0.5 block text-[10px] text-stone-400">全城探索</span>
        </span>
      </button>
    </div>
  </div>
</template>
