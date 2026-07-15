<script setup lang="ts">
import { TIME_LABELS, type TimeOption } from '../types/route'

defineProps<{
  modelValue: TimeOption | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TimeOption]
}>()

const times: TimeOption[] = [60, 120, 240, 480]
</script>

<template>
  <div class="flex gap-2.5 justify-center">
    <button
      v-for="t in times"
      :key="t"
      :class="[
        'flex-1 py-2.5 rounded-full text-sm font-medium transition-all',
        modelValue === t
          ? 'bg-primary-500 text-white shadow-md shadow-primary-200'
          : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50',
      ]"
      @click="emit('update:modelValue', t)"
    >
      {{ TIME_LABELS[t] }}
    </button>
  </div>
</template>
