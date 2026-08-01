<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  description?: string
  to?: string | Record<string, unknown>
  tone?: 'accent' | 'warning' | 'danger' | 'info' | 'neutral'
}>()
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'article'"
    :to="to"
    class="metric-tile"
    :class="`metric-tile-${tone ?? 'neutral'}`"
  >
    <p class="text-xs font-semibold tracking-wide">{{ label }}</p>
    <p class="mt-2 text-3xl font-bold tracking-tight">{{ value }}</p>
    <p v-if="description" class="mt-2 text-xs leading-5 opacity-75">{{ description }}</p>
    <span v-if="to" class="mt-3 inline-block text-xs font-semibold">打开任务 →</span>
  </component>
</template>

<style scoped>
.metric-tile { @apply block min-h-36 rounded-xl border p-4 transition; }
.metric-tile:hover { transform: translateY(-1px); }
.metric-tile-neutral { background: var(--admin-surface); border-color: var(--admin-line); color: var(--admin-ink); }
.metric-tile-accent { background: var(--admin-accent-soft); border-color: #efbba7; color: #8f2c17; }
.metric-tile-warning { background: var(--admin-warning-soft); border-color: #ead19d; color: var(--admin-warning); }
.metric-tile-danger { background: var(--admin-danger-soft); border-color: #e8b8b1; color: var(--admin-danger); }
.metric-tile-info { background: var(--admin-info-soft); border-color: #bad1df; color: var(--admin-info); }
</style>
