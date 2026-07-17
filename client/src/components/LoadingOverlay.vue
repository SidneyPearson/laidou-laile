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
const continuing = ref(false)

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

// Show slow hint during stage 2 (AI thinking is the slow part)
const showSlowHint = computed(() => elapsedSeconds.value >= 15 && !continuing.value)
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

    <!-- Indeterminate progress: the backend does not expose a real percentage. -->
    <div class="w-full max-w-xs mb-2">
      <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div class="progress-indeterminate h-full w-1/3 bg-gradient-to-r from-primary-400 to-primary-600 rounded-full" />
      </div>
      <p class="text-xs text-gray-400 text-center mt-1.5">按阶段处理，完成后会自动进入路线页</p>
    </div>

    <!-- Slow hint — show during stage 2 when AI is thinking -->
    <div v-if="showSlowHint" class="mb-6 text-center">
      <p class="text-sm text-amber-500 font-medium">AI仍在规划</p>
      <p class="text-xs text-gray-400 mt-1">已等待 {{ elapsedSeconds }} 秒</p>
      <div class="mt-3 flex items-center justify-center gap-4">
        <button class="text-xs text-primary-500 font-medium" @click="continuing = true">继续等待</button>
        <button class="text-xs text-gray-500 underline" @click="emit('cancel')">取消生成</button>
      </div>
    </div>

    <!-- Tips rotation -->
    <div class="h-16 flex items-center justify-center">
      <transition name="tip" mode="out-in">
        <p :key="currentTip" class="text-sm text-gray-400 text-center max-w-xs leading-relaxed">
          💡 {{ tips[currentTip] }}
        </p>
      </transition>
    </div>

    <button
      v-if="!showSlowHint"
      class="mt-4 px-4 py-2 text-sm text-gray-500 underline active:text-gray-700"
      @click="emit('cancel')"
    >
      取消生成
    </button>
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

.progress-indeterminate {
  animation: progress-slide 1.4s ease-in-out infinite;
}

@keyframes progress-slide {
  from { transform: translateX(-120%); }
  to { transform: translateX(320%); }
}
</style>
