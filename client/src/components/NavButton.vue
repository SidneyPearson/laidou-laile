<script setup lang="ts">
import { openAmapNavigation } from '../utils/amapNavigation'

defineProps<{
  name: string
  lng: number
  lat: number
  mini?: boolean
}>()
</script>

<template>
  <button
    :class="[
      'inline-flex items-center gap-1 text-primary-500 font-medium',
      'active:text-primary-600 transition-colors',
      mini ? 'text-xs' : 'text-sm',
    ]"
    @click="openAmapNavigation(name, lng, lat)"
  >
    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </svg>
    <span>{{ mini ? '导航' : '打开高德地图导航' }}</span>
  </button>
</template>
