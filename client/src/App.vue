<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

const hasError = ref(false)

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
  <router-view v-else v-slot="{ Component }">
    <transition name="fade">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
