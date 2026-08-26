<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileBottomNav, { type BottomTab } from './components/home/MobileBottomNav.vue'

const hasError = ref(false)
/** 路由懒加载 chunk 下载期间显示顶部细进度条，避免切换页面的"白屏/无反馈"。 */
const routeLoading = ref(false)
const router = useRouter()
const route = useRoute()
const navToast = ref('')
let navToastTimer: ReturnType<typeof setTimeout> | null = null

const isPublicRoute = computed(() => !route.path.startsWith('/admin'))
const isDarkPublicRoute = computed(() =>
  route.name === 'home' || route.name === 'explore' || route.name === 'city-explore',
)
const activeBottomTab = computed<BottomTab>(() => {
  if (route.name === 'today-plan') return 'plan'
  if (route.name === 'explore' || route.name === 'city-explore') return 'explore'
  return 'home'
})

function showNavToast(message: string) {
  navToast.value = message
  if (navToastTimer) clearTimeout(navToastTimer)
  navToastTimer = setTimeout(() => {
    navToast.value = ''
    navToastTimer = null
  }, 1800)
}

function handleBottomNav(tab: BottomTab) {
  if (tab === 'home' && route.name !== 'home') router.push({ name: 'home' })
  else if (tab === 'explore' && route.name !== 'explore') router.push({ name: 'explore' })
  else if (tab === 'plan' && route.name !== 'today-plan') router.push({ name: 'today-plan' })
  else if (tab === 'favorites') showNavToast('收藏功能建设中')
  else if (tab === 'me') showNavToast('个人中心建设中')
}

router.beforeEach(() => {
  routeLoading.value = true
})
router.afterEach(() => {
  window.setTimeout(() => { routeLoading.value = false }, 240)
})
router.onError(() => {
  routeLoading.value = false
})

function reloadPage() {
  location.reload()
}

onErrorCaptured((err) => {
  console.error('App error captured:', err)
  hasError.value = true
  return false // prevent propagation
})

onBeforeUnmount(() => {
  if (navToastTimer) clearTimeout(navToastTimer)
})
</script>

<template>
  <div v-if="hasError" class="h-full flex items-center justify-center px-6">
    <div class="text-center">
      <p class="text-4xl mb-3">😵</p>
      <p class="text-gray-500 text-sm mb-4">页面出了点问题</p>
      <button
        class="btn-primary px-6 py-2.5 text-sm"
        @click="hasError = false; reloadPage()"
      >
        刷新页面试试
      </button>
    </div>
  </div>
  <template v-else>
    <div class="app-shell" :class="{ 'app-shell--dark': isDarkPublicRoute }">
      <div v-if="routeLoading" class="route-bar" aria-hidden="true" />
      <router-view v-slot="{ Component }">
        <!-- 轻量 H5 采用即时换页，避免 out-in 先卸载旧页再挂载新页造成空白闪烁。 -->
        <component :is="Component" />
      </router-view>
      <Transition name="nav-toast">
        <div v-if="navToast" class="app-nav-toast" role="status">{{ navToast }}</div>
      </Transition>
      <MobileBottomNav
        v-if="isPublicRoute"
        :active="activeBottomTab"
        @navigate="handleBottomNav"
      />
    </div>
  </template>
</template>

<style>
.app-shell {
  min-height: 100%;
  min-height: 100dvh;
}
.app-shell--dark {
  background: #02070e;
}

/* 路由加载进度条：懒加载 chunk 下载期间顶部细条流动，给用户"正在加载"的反馈。 */
.route-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 20000;
  background: linear-gradient(90deg, #c7ff1f 0%, #7dd3fc 50%, #c7ff1f 100%);
  background-size: 200% 100%;
  animation: route-flow 0.9s linear infinite;
  pointer-events: none;
}

.app-nav-toast {
  position: fixed;
  z-index: 200;
  left: 50%;
  bottom: calc(108px + env(safe-area-inset-bottom));
  max-width: calc(100vw - 40px);
  padding: 10px 18px;
  transform: translateX(-50%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(13, 18, 24, 0.95);
  color: #fff;
  font-size: 13px;
  text-align: center;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
}
.nav-toast-enter-active,
.nav-toast-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.nav-toast-enter-from,
.nav-toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
@keyframes route-flow {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 数据区骨架 → 内容 的平滑淡入（v-if/v-else 双分支共用）。 */
.fade-up-enter-active,
.fade-up-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-up-leave-to {
  opacity: 0;
}
</style>
