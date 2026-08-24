<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import { useRouter } from 'vue-router'

const hasError = ref(false)
/** 路由懒加载 chunk 下载期间显示顶部细进度条，避免切换页面的"白屏/无反馈"。 */
const routeLoading = ref(false)
const router = useRouter()

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
    <div v-if="routeLoading" class="route-bar" aria-hidden="true" />
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </template>
</template>

<style>
/* 页面切换过渡：淡入 + 轻微上移，out-in 避免滚动条跳变。 */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
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
