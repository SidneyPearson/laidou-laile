<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminAuth } from '../admin/auth'
import AdminCitySwitcher from '../components/admin/AdminCitySwitcher.vue'

const route = useRoute()
const router = useRouter()
const auth = useAdminAuth()

const navItems = [
  { label: '今日编务', to: '/admin', family: 'dashboard' },
  { label: '城市档案', to: '/admin/cities', family: 'cities' },
  { label: '地点库', to: '/admin/spots', family: 'spots' },
]

function isActive(family: string) {
  if (family === 'dashboard') return route.path === '/admin'
  if (family === 'cities') return route.path.startsWith('/admin/cities') || route.path.startsWith('/admin/refresh-runs')
  return route.path.startsWith('/admin/spots')
}

const currentSection = computed(() => navItems.find(item => isActive(item.family))?.label ?? '编辑部')

async function logout() {
  await auth.logout()
  await router.replace('/admin/login')
}
</script>

<template>
  <div class="admin-shell min-h-full lg:flex">
    <header class="sticky top-0 z-30 border-b border-[var(--admin-line)] bg-[var(--admin-surface)]/95 px-4 py-3 backdrop-blur lg:hidden">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="admin-eyebrow">来都来了</p>
          <p class="font-bold">城市内容编辑部 <span class="font-normal text-[var(--admin-muted)]">/ {{ currentSection }}</span></p>
        </div>
        <button type="button" class="admin-button-secondary min-h-9 px-3 py-1.5" @click="logout">退出</button>
      </div>
      <nav aria-label="后台主导航" class="scroll-smooth-ios -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="admin-nav-mobile"
          :class="{ 'admin-nav-mobile-active': isActive(item.family) }"
        >{{ item.label }}</RouterLink>
      </nav>
    </header>

    <aside class="hidden w-60 flex-none border-r border-[var(--admin-line)] bg-[var(--admin-surface)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div class="border-b border-[var(--admin-line)] px-6 py-7">
        <p class="admin-eyebrow">来都来了</p>
        <h1 class="mt-2 text-xl font-bold tracking-tight">城市内容编辑部</h1>
        <p class="mt-1 text-xs text-[var(--admin-muted)]">地图工作台 · Editorial Desk</p>
      </div>
      <nav aria-label="后台主导航" class="space-y-1 p-4">
        <RouterLink
          v-for="(item, index) in navItems"
          :key="item.to"
          :to="item.to"
          class="admin-nav-desktop"
          :class="{ 'admin-nav-desktop-active': isActive(item.family) }"
        >
          <span class="font-mono text-[10px] opacity-60">0{{ index + 1 }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="border-y border-[var(--admin-line)] p-4">
        <AdminCitySwitcher id="admin-city-switcher-desktop" />
      </div>
      <div class="mt-auto p-4">
        <p class="mb-3 text-xs leading-5 text-[var(--admin-muted)]">编辑内容经验证和人工发布后同步至 H5。</p>
        <button type="button" class="admin-button-secondary w-full" @click="logout">退出编辑部</button>
      </div>
    </aside>

    <main class="min-w-0 flex-1 px-4 py-5 md:px-7 md:py-8 xl:px-10">
      <div class="mx-auto max-w-[1440px]">
        <div class="mb-5 lg:hidden"><AdminCitySwitcher id="admin-city-switcher-mobile" /></div>
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-nav-desktop { @apply flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--admin-muted)] transition; }
.admin-nav-desktop:hover { background: var(--admin-surface-muted); color: var(--admin-ink); }
.admin-nav-desktop-active { background: var(--admin-accent-soft); color: var(--admin-accent); }
.admin-nav-mobile { @apply flex-none rounded-full border border-[var(--admin-line)] bg-[var(--admin-surface)] px-4 py-2 text-sm text-[var(--admin-muted)]; }
.admin-nav-mobile-active { border-color: #efbba7; background: var(--admin-accent-soft); color: var(--admin-accent); }
</style>
