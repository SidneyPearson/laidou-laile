<script setup lang="ts">
import type { Stop } from '../types/route'
import NavButton from './NavButton.vue'

defineProps<{
  stop: Stop
  index: number
}>()
</script>

<template>
  <div class="flex gap-3 py-3 border-b border-gray-50 last:border-b-0">
    <!-- Number badge -->
    <div class="flex-shrink-0 w-7 h-7 rounded-full bg-primary-100 text-primary-600
                flex items-center justify-center text-xs font-bold mt-0.5">
      {{ index + 1 }}
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <h4 class="font-semibold text-gray-800 text-sm">{{ stop.name }}</h4>
        <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
          {{ stop.visitDurationMinutes }}分钟
        </span>
      </div>
      <p class="text-xs text-gray-400 mb-2">{{ stop.address }}</p>
      <p class="text-xs text-gray-500 leading-relaxed mb-2">{{ stop.notes }}</p>
      <!-- Photo tip -->
      <div v-if="stop.photoTip" class="mb-2 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
        <span class="text-sm flex-shrink-0">📸</span>
        <p class="text-xs text-amber-700 leading-relaxed">{{ stop.photoTip }}</p>
      </div>
      <NavButton
        :name="stop.name"
        :lng="stop.lng"
        :lat="stop.lat"
        mini
      />
    </div>
  </div>
</template>
