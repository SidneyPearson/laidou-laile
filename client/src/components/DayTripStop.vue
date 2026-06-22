<script setup lang="ts">
import { ref } from 'vue'
import type { Stop } from '../types/route'
import NavButton from './NavButton.vue'

const props = defineProps<{
  stop: Stop
  index: number
  removable?: boolean
}>()

const emit = defineEmits<{
  remove: [index: number]
}>()

const expanded = ref(false)

function toggle() {
  expanded.value = !expanded.value
}

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}
</script>

<template>
  <div class="relative flex gap-4 pb-5 last:pb-0">
    <!-- Number circle -->
    <div
      class="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-white
             border-2 border-primary-200 flex items-center justify-center
             shadow-sm cursor-pointer active:scale-95 transition-transform"
      @click="toggle"
    >
      <span class="text-sm font-bold text-primary-500">{{ index + 1 }}</span>
    </div>

    <!-- Stop card -->
    <div
      class="flex-1 min-w-0 bg-white rounded-2xl p-3.5
             shadow-sm border border-gray-100 active:bg-gray-50
             transition-colors cursor-pointer relative"
      @click="toggle"
    >
      <!-- Remove button (refinement mode) — positioned top-left to avoid covering distance -->
      <button
        v-if="removable"
        class="absolute top-2 left-2 w-6 h-6 flex items-center justify-center
               rounded-full bg-red-50 text-red-400 active:bg-red-100 active:text-red-500
               transition-colors z-10"
        @click.stop="emit('remove', index)"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      <!-- Name + distance -->
      <div class="flex items-start justify-between gap-2">
        <h3
          class="text-[15px] font-semibold text-gray-800 leading-snug"
          :class="{ 'pl-5': removable }"
        >
          {{ stop.name }}
        </h3>
        <span
          v-if="stop.distanceMeters"
          class="flex-shrink-0 text-[11px] text-gray-400 mt-0.5"
        >
          {{ fmtDist(stop.distanceMeters) }}
        </span>
      </div>

      <!-- Address (always visible, truncated when collapsed) -->
      <p
        v-if="stop.address"
        :class="[
          'mt-0.5 text-[11px] text-gray-400',
          expanded ? '' : 'truncate',
        ]"
      >
        {{ stop.address }}
      </p>

      <!-- Notes (always visible) -->
      <p
        v-if="stop.notes"
        class="mt-2 text-[13px] text-gray-600 leading-relaxed"
      >
        {{ stop.notes }}
      </p>

      <!-- Duration badge (always visible) -->
      <span
        v-if="stop.visitDurationMinutes"
        class="inline-block mt-2 text-[11px] text-primary-500 bg-primary-50
               px-2 py-0.5 rounded-full font-medium"
      >
        ⏱ {{ stop.visitDurationMinutes }}分钟
      </span>

      <!-- Expand indicator -->
      <div class="flex items-center justify-center mt-2">
        <svg
          :class="[
            'w-4 h-4 text-gray-300 transition-transform duration-200',
            expanded ? 'rotate-180' : '',
          ]"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>

      <!-- Expanded detail -->
      <Transition name="expand">
        <div v-if="expanded" class="mt-3 pt-3 border-t border-gray-100 space-y-3">
          <!-- Photo tip -->
          <div
            v-if="stop.photoTip"
            class="p-2.5 rounded-lg bg-amber-50 border border-amber-100"
          >
            <p class="text-xs text-amber-700 leading-relaxed">
              <span class="font-semibold">📸 拍照建议 </span>{{ stop.photoTip }}
            </p>
          </div>

          <!-- Navigate button -->
          <NavButton
            :name="stop.name"
            :lng="stop.lng"
            :lat="stop.lat"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
