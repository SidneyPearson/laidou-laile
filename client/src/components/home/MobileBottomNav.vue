<script setup lang="ts">
export type BottomTab = 'home' | 'explore' | 'plan' | 'favorites' | 'me'

defineProps<{
  active: BottomTab
}>()

const emit = defineEmits<{
  navigate: [tab: BottomTab]
}>()

interface Item {
  id: BottomTab
  label: string
  path: string
}

const items: Item[] = [
  { id: 'home', label: '首页', path: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { id: 'explore', label: '探索', path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.5 6.5-2.5 6-6 2.5 2.5-6 6-2.5Z' },
  { id: 'plan', label: '今日计划', path: 'M12 2c.4 0 .8.3.9.7l1.6 4.8 4.8 1.6c.4.1.7.5.7.9s-.3.8-.7.9l-4.8 1.6-1.6 4.8c-.1.4-.5.7-.9.7s-.8-.3-.9-.7L8.6 12.5l-4.8-1.6c-.4-.1-.7-.5-.7-.9s.3-.8.7-.9l4.8-1.6L11 2.7c.2-.4.6-.7 1-.7Z' },
  { id: 'favorites', label: '收藏', path: 'M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z' },
  { id: 'me', label: '我的', path: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0' },
]
</script>

<template>
  <nav class="bottom-nav" role="navigation" aria-label="主导航">
    <button
      v-for="item in items"
      :key="item.id"
      class="nav-item"
      :class="[
        `nav-item--${item.id}`,
        { 'nav-item--active': active === item.id, 'nav-item--center': item.id === 'plan' },
      ]"
      :aria-label="item.label"
      :aria-current="active === item.id ? 'page' : undefined"
      @click="emit('navigate', item.id)"
    >
      <span v-if="item.id === 'plan'" class="nav-fab">
        <svg class="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
          <path :d="item.path" />
        </svg>
      </span>
      <template v-else>
        <svg class="h-[21px] w-[21px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path :d="item.path" />
        </svg>
        <span class="nav-label">{{ item.label }}</span>
      </template>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 50;
  left: 50%;
  bottom: 0;
  width: min(100%, 480px);
  padding: 10px 18px calc(10px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(8, 12, 18, 0.92);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: center;
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 2px 0;
  background: transparent;
  border: 0;
  color: rgba(255, 255, 255, 0.55);
  font-size: 10px;
  line-height: 1;
  transition: color 0.2s ease, transform 0.12s ease;
}

.nav-item:active {
  transform: scale(0.92);
}

.nav-item--active:not(.nav-item--center) {
  color: var(--accent, #c7ff1f);
}

.nav-label {
  font-weight: 500;
}

.nav-fab {
  margin-top: -26px;
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent, #c7ff1f) 0%, #a9ef16 100%);
  color: #071007;
  box-shadow:
    0 0 26px rgba(185, 255, 31, 0.42),
    0 6px 14px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.nav-item--center {
  margin-top: -2px;
}
</style>
