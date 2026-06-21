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
// Smooth progress 0–100, driven by a timer
const smoothProgress = ref(0)

let tipTimer: ReturnType<typeof setInterval> | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let progressTimer: ReturnType<typeof setInterval> | null = null

// Each stage has a progress range, and we creep toward the ceiling of the current stage.
// When the real stage advances, the ceiling jumps up and we keep creeping.
const stageCeilings = [30, 70, 95]

onMounted(() => {
  tipTimer = setInterval(() => {
    currentTip.value = (currentTip.value + 1) % tips.length
  }, 3000)

  elapsedTimer = setInterval(() => {
    elapsedSeconds.value++
  }, 1000)

  // Smooth progress: creep ~2% per 500ms toward the current stage ceiling
  progressTimer = setInterval(() => {
    const target = stageCeilings[props.stage] ?? 95
    if (smoothProgress.value < target) {
      // Slow down as we approach the ceiling
      const remaining = target - smoothProgress.value
      const increment = Math.max(0.3, remaining * 0.06)
      smoothProgress.value = Math.min(target, smoothProgress.value + increment)
    }
  }, 500)
})

onUnmounted(() => {
  if (tipTimer) clearInterval(tipTimer)
  if (elapsedTimer) clearInterval(elapsedTimer)
  if (progressTimer) clearInterval(progressTimer)
})

// Show slow hint during stage 2 (AI thinking is the slow part)
const showSlowHint = computed(() => props.stage >= 1 && elapsedSeconds.value > 15)

const progressWidth = computed(() => `${Math.round(smoothProgress.value)}%`)
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm px-6">
    <!-- Stage animation -->
    <div class="flex flex-col items-center mb-10">
      <transition-group name="stage" mode="out-in">
        <div :key="stage" class="flex flex-col items-center">
          <span class="text-5xl mb-4" :class="stage === 0 ? 'animate-pulse' : 'animate-bounce'">{{ stages[stage]?.icon }}</span>
          <p class="text-lg font-semibold text-gray-800">{{ stages[stage]?.text }}</p>
        </div>
      </transition-group>
    </div>

    <!-- Progress bar with smooth width + percentage -->
    <div class="w-full max-w-xs mb-2">
      <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-500 ease-linear"
          :style="{ width: progressWidth }"
        />
      </div>
      <p class="text-xs text-gray-400 text-center mt-1.5">{{ progressWidth }}</p>
    </div>

    <!-- Slow hint — show during stage 2 when AI is thinking -->
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
