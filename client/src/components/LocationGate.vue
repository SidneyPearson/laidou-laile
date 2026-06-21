<script setup lang="ts">
import type { LocationError } from '../services/location'

defineProps<{
  loading: boolean
  error: LocationError | null
  isMock: boolean
  hasCoords: boolean
  manualLocationName?: string | null
}>()

const emit = defineEmits<{
  request: [useMock: boolean]
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-10 px-6">
    <!-- Loading -->
    <div v-if="loading" class="text-center">
      <div class="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
        <span class="text-3xl">📍</span>
      </div>
      <p class="text-gray-500 text-sm">正在获取位置...</p>
    </div>

    <!-- Permission denied without fallback (shouldn't happen now, but keep as safety) -->
    <div v-else-if="error?.type === 'PERMISSION_DENIED' && !hasCoords" class="text-center">
      <div class="w-20 h-20 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-4">
        <span class="text-4xl">📍</span>
      </div>
      <h3 class="text-lg font-semibold text-gray-800 mb-2">需要您的位置权限</h3>
      <p class="text-gray-500 text-sm mb-6 leading-relaxed">
        我们需要获取您的位置信息，<br/>才能为您推荐附近的好去处
      </p>
      <button
        class="btn-primary w-full py-3 text-base mb-3"
        @click="emit('request', false)"
      >
        允许获取位置
      </button>
      <button
        class="text-gray-400 text-sm underline"
        @click="emit('request', true)"
      >
        使用模拟位置体验
      </button>
    </div>

    <!-- Got location (real or mock) -->
    <div v-else-if="hasCoords" class="text-center">
      <div class="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
        <span class="text-2xl">✅</span>
      </div>
      <p class="text-gray-500 text-sm">
        <template v-if="manualLocationName">
          {{ manualLocationName }}
        </template>
        <template v-else>
          {{ isMock ? '已使用模拟位置（北京鼓楼）' : '已获取您的位置' }}
        </template>
      </p>
      <p v-if="isMock && error" class="text-gray-400 text-xs mt-1">
        {{ error.message }}
      </p>
    </div>

    <!-- Other error without fallback -->
    <div v-else-if="error" class="text-center">
      <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <span class="text-4xl">📡</span>
      </div>
      <p class="text-gray-500 mb-4">{{ error.message }}</p>
      <button
        class="btn-primary px-8 py-2.5 text-sm"
        @click="emit('request', true)"
      >
        使用模拟位置
      </button>
    </div>
  </div>
</template>
