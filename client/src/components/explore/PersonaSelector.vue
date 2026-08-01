<script setup lang="ts">
import { PERSONAS } from '../../data/mockExploreSpots'
import type { Persona } from '../../types/explore'

defineProps<{
  modelValue: Persona
}>()

const emit = defineEmits<{
  'update:modelValue': [persona: Persona]
}>()
</script>

<template>
  <div class="scroll-smooth-ios flex gap-2.5 overflow-x-auto pb-1">
    <button
      v-for="persona in PERSONAS"
      :key="persona.id"
      class="min-w-[132px] flex-shrink-0 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.98]"
      :class="modelValue === persona.id
        ? 'border-primary-500 bg-primary-500 text-white shadow-[0_8px_20px_rgba(91,140,94,0.22)]'
        : 'border-stone-200 bg-white text-stone-700'"
      :aria-pressed="modelValue === persona.id"
      @click="emit('update:modelValue', persona.id)"
    >
      <div class="flex items-center gap-2">
        <span class="text-xl">{{ persona.emoji }}</span>
        <span class="text-sm font-bold">{{ persona.name }}</span>
      </div>
      <p
        class="mt-1.5 text-[10px] leading-4"
        :class="modelValue === persona.id ? 'text-white/70' : 'text-stone-400'"
      >
        {{ persona.tagline }}
      </p>
    </button>
  </div>
</template>
