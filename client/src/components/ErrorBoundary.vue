<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const hasError = ref(false)
const errorMessage = ref('')

onErrorCaptured((err: Error, _instance, info: string) => {
  console.error('ErrorBoundary caught:', err.message, info)
  errorMessage.value = err.message || '未知渲染错误'
  hasError.value = true
  return false // prevent propagation
})

function reset() {
  hasError.value = false
  errorMessage.value = ''
}
</script>

<template>
  <div v-if="hasError" class="flex flex-col items-center justify-center py-16 px-6 text-center">
    <p class="text-5xl mb-4">😵</p>
    <p class="text-base font-semibold text-gray-700 mb-2">页面渲染出错</p>
    <p class="text-sm text-gray-400 mb-6 max-w-xs">{{ errorMessage }}</p>
    <button
      class="btn-primary px-6 py-2.5 text-sm font-medium"
      @click="reset()"
    >
      重试
    </button>
  </div>
  <slot v-else />
</template>
