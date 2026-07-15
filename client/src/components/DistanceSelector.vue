<script setup lang="ts">
import { DISTANCE_LABELS, type DistanceOption } from '../types/route'

defineProps<{
  modelValue: DistanceOption | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DistanceOption]
}>()

const distances: DistanceOption[] = [0, 500, 1000, 3000, 5000]
</script>

<template>
  <div class="flex gap-2.5 justify-center">
    <button
      v-for="d in distances"
      :key="d"
      :class="[
        'py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap',
        d === 0 ? 'flex-[1.3]' : 'flex-1',
        modelValue === d
          ? 'bg-primary-500 text-white shadow-md shadow-primary-200'
          : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50',
      ]"
      @click="emit('update:modelValue', d)"
    >
      {{ DISTANCE_LABELS[d] }}
    </button>
  </div>
</template>
