<script setup lang="ts">
import type { InspirationSpot } from '../../types/explore'
import SpotCover from './SpotCover.vue'

defineProps<{
  spot: InspirationSpot
  selected?: boolean
}>()

const emit = defineEmits<{
  select: [spot: InspirationSpot]
}>()
</script>

<template>
  <button
    class="inspiration-card w-full overflow-hidden rounded-[20px] bg-white text-left shadow-[0_6px_22px_rgba(44,44,44,0.07)] transition active:scale-[0.985]"
    :class="selected ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-[#f7f6f2]' : ''"
    :aria-label="`查看${spot.name}`"
    @click="emit('select', spot)"
  >
    <div class="relative h-[150px] overflow-hidden">
      <SpotCover
        :spot="spot"
        class="absolute inset-0"
      />
      <div class="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/10" />
      <span
        v-if="spot.verificationStatus !== 'verified'"
        class="absolute left-2.5 top-2.5 rounded-full bg-black/25 px-2 py-1 text-[10px] font-medium text-white backdrop-blur"
      >
        演示数据
      </span>
      <div class="absolute bottom-2.5 left-2.5 right-2.5">
        <p class="text-[10px] text-white/75">{{ spot.district }}</p>
        <h3 class="mt-0.5 text-[15px] font-bold leading-tight text-white">{{ spot.name }}</h3>
      </div>
    </div>

    <div class="p-3">
      <p class="line-clamp-3 text-[11px] leading-[1.55] text-stone-600">
        {{ spot.reason }}
      </p>
      <div class="mt-2.5 flex flex-wrap gap-1">
        <span
          v-for="tag in spot.tags.slice(0, 2)"
          :key="tag"
          class="rounded-full bg-primary-50 px-2 py-1 text-[10px] font-medium text-primary-700"
        >
          {{ tag }}
        </span>
      </div>
      <div class="mt-3 border-t border-stone-100 pt-2.5">
        <p class="text-[10px] font-medium text-stone-500">{{ spot.suggestedDuration }}</p>
        <p class="mt-0.5 text-[10px] text-stone-400">{{ spot.bestTime }}</p>
        <p
          v-if="spot.verificationStatus === 'verified'"
          class="mt-1 truncate text-[10px] text-primary-600"
          :title="spot.address"
        >
          📍 {{ spot.address || spot.district }}
        </p>
      </div>
    </div>
  </button>
</template>
