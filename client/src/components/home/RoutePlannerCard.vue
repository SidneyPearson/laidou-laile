<script setup lang="ts">
defineProps<{
  count: number
}>()

const emit = defineEmits<{
  open: []
}>()
</script>

<template>
  <section class="px-3.5">
    <button
      class="route-card"
      @click="emit('open')"
    >
      <div class="route-bg" aria-hidden="true" />
      <span class="route-icon">
        <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 20l-5.5-3V6L9 9m0 11 6-3m-6 3V9m6 8 5.5 3V8L15 5m0 12V5m0 0L9 9" />
        </svg>
      </span>
      <span class="route-copy">
        <strong>今日安排</strong>
        <span class="route-sub">
          <template v-if="count > 0">已选 {{ count }} 个地点 · 查看路线与顺序</template>
          <template v-else>查看今天想去的地方与路线顺序</template>
        </span>
      </span>
      <span class="route-arrow" aria-hidden="true">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </button>
  </section>
</template>

<style scoped>
.route-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 64px;
  padding: 0 14px 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  background: rgba(11, 16, 24, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
  text-align: left;
  transition: transform 0.12s ease;
}

.route-card:active {
  transform: scale(0.99);
}

.route-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 90% 10%, rgba(199, 255, 31, 0.16), transparent 55%),
    linear-gradient(135deg, rgba(199, 255, 31, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.route-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--accent, #c7ff1f);
  color: #071008;
}

.route-copy {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.route-copy strong {
  font-size: 14.5px;
  font-weight: 700;
  color: #fff;
  line-height: 1.15;
}

.route-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.route-arrow {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--accent, #c7ff1f);
}
</style>
