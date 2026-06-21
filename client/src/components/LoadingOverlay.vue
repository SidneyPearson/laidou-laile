<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  stage: number // 0, 1, 2
}>()

const emit = defineEmits<{
  cancel: []
}>()

const stages = [
  { icon: '📍', text: '正在搜索附近地点...' },
  { icon: '🤖', text: 'AI 正在为你规划路线...' },
  { icon: '✨', text: '路线即将出炉...' },
]

const tips = [
  'AI 正在根据你的偏好精挑细选',
  '本地人才知道的宝藏店铺往往藏在巷子里',
  '好的光线是拍照成功的一半，下午4-5点是黄金时间',
  '空腹逛美食街是对美食最大的尊重',
  '雨天也有雨天的玩法，茶馆听雨别有风味',
  '有时候最好的路线就是没有路线，随心而行',
  '胡同深处往往藏着最地道的味道',
  '拍照打卡不只是按快门，是用心感受当下的美好',
]

const currentTip = ref(0)
const elapsedSeconds = ref(0)
let tipTimer: ReturnType<typeof setInterval> | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  tipTimer = setInterval(() => {
    currentTip.value = (currentTip.value + 1) % tips.length
  }, 3000)
  elapsedTimer = setInterval(() => {
    elapsedSeconds.value++
  }, 1000)
})

onUnmounted(() => {
  if (tipTimer) clearInterval(tipTimer)
  if (elapsedTimer) clearInterval(elapsedTimer)
})

const showSlowHint = computed(() => elapsedSeconds.value > 30)

const progressWidth = computed(() => {
  const base = (props.stage / 2) * 100
  return `${Math.min(base + 10, 100)}%`
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm px-6">
    <!-- Stage animation -->
    <div class="flex flex-col items-center mb-10">
      <transition-group name="stage" mode="out-in">
        <div :key="stage" class="flex flex-col items-center">
          <span class="text-5xl mb-4 animate-bounce">{{ stages[stage]?.icon }}</span>
          <p class="text-lg font-semibold text-gray-800">{{ stages[stage]?.text }}</p>
        </div>
      </transition-group>
    </div>

    <!-- Progress bar -->
    <div class="w-full max-w-xs h-1.5 bg-gray-100 rounded-full overflow-hidden mb-8">
      <div
        class="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-700 ease-out"
        :style="{ width: progressWidth }"
      />
    </div>

    <!-- Slow hint -->
    <div v-if="showSlowHint" class="mb-6 text-center">
      <p class="text-sm text-amber-500 font-medium">AI 正在仔细规划，请耐心等待...</p>
      <p class="text-xs text-gray-400 mt-1">已等待 {{ elapsedSeconds }} 秒</p>
      <button
        class="mt-3 text-xs text-gray-400 underline active:text-gray-600"
        @click="emit('cancel')"
      >
        取消等待
      </button>
    </div>

    <!-- Tips rotation -->
    <div class="h-16 flex items-center justify-center">
      <transition name="tip" mode="out-in">
        <p :key="currentTip" class="text-sm text-gray-400 text-center max-w-xs leading-relaxed">
          💡 {{ tips[currentTip] }}
        </p>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.stage-enter-active,
.stage-leave-active {
  transition: all 0.4s ease;
}
.stage-enter-from,
.stage-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.tip-enter-active,
.tip-leave-active {
  transition: all 0.5s ease;
}
.tip-enter-from,
.tip-leave-to {
  opacity: 0;
}
</style>
