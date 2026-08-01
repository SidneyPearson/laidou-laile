<script setup lang="ts">
import { EXPLORE_CATEGORIES } from '../../data/mockExploreSpots'
import type { ExploreCategory } from '../../types/explore'

defineProps<{
  modelValue: ExploreCategory
}>()

const emit = defineEmits<{
  'update:modelValue': [category: ExploreCategory]
}>()
</script>

<template>
  <div class="scroll-smooth-ios flex gap-2 overflow-x-auto pb-1">
    <button
      v-for="category in EXPLORE_CATEGORIES"
      :key="category.id"
      class="flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition active:scale-95"
      :class="modelValue === category.id
        ? 'border-stone-800 bg-stone-800 text-white'
        : 'border-stone-200 bg-white text-stone-600'"
      :aria-pressed="modelValue === category.id"
      @click="emit('update:modelValue', category.id)"
    >
      <span>{{ category.emoji }}</span>
      {{ category.name }}
    </button>
  </div>
</template>
