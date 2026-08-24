<script setup lang="ts">
defineProps<{
  count: number
}>()

const emit = defineEmits<{
  open: []
}>()
</script>

<template>
  <div
    class="fixed bottom-[max(18px,env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2"
  >
    <button
      class="flex w-full items-center justify-between rounded-2xl bg-stone-900 px-5 py-3.5 text-left text-white shadow-[0_12px_32px_rgba(28,25,23,0.28)] transition active:scale-[0.985]"
      @click="emit('open')"
    >
      <span>
        <span class="block text-xs font-bold">今天想去 {{ count }} 个地方</span>
        <span class="mt-0.5 block text-[10px] text-white/65">选择只保存在这台设备</span>
      </span>
      <span class="text-xs font-semibold text-primary-200">查看今天安排 →</span>
    </button>
  </div>
</template>

