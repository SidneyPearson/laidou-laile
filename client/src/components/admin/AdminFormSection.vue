<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <section class="admin-panel p-4 md:p-5">
    <div class="mb-4 border-b border-[var(--admin-line)] pb-3">
      <h2 class="font-bold text-[var(--admin-ink)]">{{ title }}</h2>
      <p v-if="description" class="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{{ description }}</p>
    </div>
    <slot />
  </section>
</template>
