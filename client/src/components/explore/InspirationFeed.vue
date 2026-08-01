<script setup lang="ts">
import { computed } from 'vue'
import InspirationCard from './InspirationCard.vue'
import type { InspirationSpot } from '../../types/explore'

const props = defineProps<{
  spots: InspirationSpot[]
  selectedId?: string | null
}>()

const emit = defineEmits<{
  select: [spot: InspirationSpot]
}>()

const leftColumn = computed(() => props.spots.filter((_, index) => index % 2 === 0))
const rightColumn = computed(() => props.spots.filter((_, index) => index % 2 === 1))
</script>

<template>
  <div v-if="spots.length" class="grid grid-cols-2 items-start gap-3">
    <div class="flex flex-col gap-3">
      <InspirationCard
        v-for="spot in leftColumn"
        :key="spot.id"
        :spot="spot"
        :selected="selectedId === spot.id"
        @select="emit('select', $event)"
      />
    </div>
    <div class="flex flex-col gap-3 pt-5">
      <InspirationCard
        v-for="spot in rightColumn"
        :key="spot.id"
        :spot="spot"
        :selected="selectedId === spot.id"
        @select="emit('select', $event)"
      />
    </div>
  </div>

  <div v-else class="rounded-[24px] border border-dashed border-stone-300 bg-white/70 px-6 py-12 text-center">
    <div class="text-3xl">🧭</div>
    <p class="mt-3 text-sm font-bold text-stone-700">这个分类的数据还没接入</p>
    <p class="mt-1 text-xs leading-5 text-stone-400">
      先切换“都看看”体验页面；下一阶段会接入高德校验后的城市内容。
    </p>
  </div>
</template>
