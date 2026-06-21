<script setup lang="ts">
import type { ApiRequestError } from '../services/api'

defineProps<{
  error: ApiRequestError
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-14 px-6 text-center">
    <div class="w-20 h-20 rounded-full bg-orange-50 flex items-center justify-center mb-4">
      <span class="text-4xl">😵</span>
    </div>
    <h3 class="text-lg font-semibold text-gray-800 mb-2">生成路线失败</h3>
    <p class="text-gray-500 text-sm mb-6">{{ error.message }}</p>
    <button
      class="btn-primary px-10 py-2.5 text-sm"
      @click="emit('retry')"
    >
      重试
    </button>
  </div>
</template>
