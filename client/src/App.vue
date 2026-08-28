<script setup lang="ts">
import { computed, onErrorCaptured, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileBottomNav, { type BottomTab } from './components/home/MobileBottomNav.vue'

const hasError = ref(false)
/** 路由懒加载 chunk 下载期间显示顶部细进度条，避免切换页面的"白屏/无反馈"。 */
const routeLoading = ref(false)
const router = useRouter()
const route = useRoute()
const isPublicRoute = computed(() => !route.path.startsWith('/admin'))
const isDarkPublicRoute = computed(() =>
  route.name === 'home'
  || route.name === 'explore'
  || route.name === 'city-explore'
  || route.name === 'favorites'
  || route.name === 'me',
)
const publicScrollContainer = ref<HTMLElement | null>(null)
const activeBottomTab = computed<BottomTab>(() => {
  if (route.name === 'today-plan') return 'plan'
  if (route.name === 'explore' || route.name === 'city-explore') return 'explore'
  if (route.name === 'favorites') return 'favorites'
  if (route.name === 'me') return 'me'
  return 'home'
})

// iOS 微信橡皮筋回弹会露出 body；让页面底色跟随持久化 App Shell，
// 深色公开页不闪暖白，今日计划和后台仍保持原来的浅色背景。
watchEffect((onCleanup) => {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('public-dark', isDarkPublicRoute.value)
  document.body.classList.toggle('public-shell-locked', isPublicRoute.value)
  onCleanup(() => {
    document.body.classList.remove('public-dark')
    document.body.classList.remove('public-shell-locked')
  })
})

function handleBottomNav(tab: BottomTab) {
  // 微信 WebView 在 hash history 出现可后退记录后会显示白色原生导航工具栏。
  // App Shell 的 Tab 属于同级页面切换，用 replace 保持单条历史记录。
  if (tab === 'home' && route.name !== 'home') router.replace({ name: 'home' })
  else if (tab === 'explore' && route.name !== 'explore') router.replace({ name: 'explore' })
  else if (tab === 'plan' && route.name !== 'today-plan') router.replace({ name: 'today-plan' })
  else if (tab === 'favorites' && route.name !== 'favorites') router.replace({ name: 'favorites' })
  else if (tab === 'me' && route.name !== 'me') router.replace({ name: 'me' })
}

router.beforeEach(() => {
  routeLoading.value = true
})
router.afterEach(() => {
  window.setTimeout(() => { routeLoading.value = false }, 240)
  window.requestAnimationFrame(() => {
    publicScrollContainer.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  })
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
    <div
      class="app-shell"
      :class="{
        'app-shell--public': isPublicRoute,
        'app-shell--dark': isDarkPublicRoute,
      }"
    >
      <div v-if="routeLoading" class="route-bar" aria-hidden="true" />
      <div ref="publicScrollContainer" :class="{ 'app-shell-content': isPublicRoute }">
        <router-view v-slot="{ Component }">
          <!-- 轻量 H5 采用即时换页，避免 out-in 先卸载旧页再挂载新页造成空白闪烁。 -->
          <component :is="Component" />
        </router-view>
      </div>
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
.app-shell--public {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  height: 100dvh;
  overflow: hidden;
}
.app-shell-content {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.app-shell-content::-webkit-scrollbar {
  display: none;
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
