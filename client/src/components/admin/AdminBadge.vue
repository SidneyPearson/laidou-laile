<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
}>(), {
  tone: 'neutral',
})
</script>

<template>
  <span class="admin-badge" :class="`admin-badge-${tone}`">
    <span class="admin-badge-dot" aria-hidden="true"></span>
    {{ label }}
  </span>
</template>

<style scoped>
.admin-badge { @apply inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium; }
.admin-badge-dot { @apply h-1.5 w-1.5 rounded-full bg-current; }
.admin-badge-neutral { background: var(--admin-surface-muted); border-color: var(--admin-line); color: var(--admin-muted); }
.admin-badge-accent { background: var(--admin-accent-soft); border-color: #f0c4b3; color: var(--admin-accent); }
.admin-badge-success { background: var(--admin-success-soft); border-color: #b9ddc8; color: var(--admin-success); }
.admin-badge-warning { background: var(--admin-warning-soft); border-color: #ead19d; color: var(--admin-warning); }
.admin-badge-danger { background: var(--admin-danger-soft); border-color: #e8b8b1; color: var(--admin-danger); }
.admin-badge-info { background: var(--admin-info-soft); border-color: #bad1df; color: var(--admin-info); }
</style>
