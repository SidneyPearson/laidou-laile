<script setup lang="ts">
import type { Route } from '../types/route'

defineProps<{
  route: Route
}>()
</script>

<template>
  <div class="px-1">
    <!-- Route header -->
    <div class="mb-5 text-center">
      <h2 class="text-xl font-bold text-gray-800">{{ route.name }}</h2>
      <p class="mt-1 text-sm text-gray-500">{{ route.tagline }}</p>
      <div class="flex justify-center gap-4 mt-2">
        <span class="text-xs text-gray-400">{{ route.stops.length }} 个地点</span>
        <span v-if="route.walkingDistanceMeters > 0" class="text-xs text-gray-400">
          全程约 {{ (route.walkingDistanceMeters / 1000).toFixed(1) }}km
        </span>
      </div>
    </div>

    <!-- Tips -->
    <div
      v-if="route.tips"
      class="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-100"
    >
      <p class="text-xs text-amber-700 leading-relaxed">
        <span class="font-semibold">💡 </span>{{ route.tips }}
      </p>
    </div>

    <!-- Timeline -->
    <div class="relative">
      <!-- Vertical line -->
      <div class="absolute left-[19px] top-3 bottom-3 w-0.5 bg-primary-100" />

      <div
        v-for="(stop, i) in route.stops"
        :key="stop.name"
        class="relative flex gap-4 pb-5 last:pb-0"
      >
        <!-- Number circle -->
        <div class="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-white
                    border-2 border-primary-200 flex items-center justify-center
                    shadow-sm">
          <span class="text-sm font-bold text-primary-500">{{ i + 1 }}</span>
        </div>

        <!-- Stop card -->
        <div class="flex-1 min-w-0 bg-white rounded-2xl p-3.5
                    shadow-sm border border-gray-100 active:bg-gray-50
                    transition-colors">
          <!-- Name + distance -->
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-[15px] font-semibold text-gray-800 leading-snug">
              {{ stop.name }}
            </h3>
            <span
              v-if="stop.distanceMeters"
              class="flex-shrink-0 text-[11px] text-gray-400 mt-0.5"
            >
              {{ stop.distanceMeters >= 1000
                ? (stop.distanceMeters / 1000).toFixed(1) + 'km'
                : stop.distanceMeters + 'm' }}
            </span>
          </div>

          <!-- Address -->
          <p
            v-if="stop.address"
            class="mt-0.5 text-[11px] text-gray-400 truncate"
          >
            {{ stop.address }}
          </p>

          <!-- Notes -->
          <p
            v-if="stop.notes"
            class="mt-2 text-[13px] text-gray-600 leading-relaxed"
          >
            {{ stop.notes }}
          </p>

          <!-- Duration badge -->
          <span
            v-if="stop.visitDurationMinutes"
            class="inline-block mt-2 text-[11px] text-primary-500 bg-primary-50
                   px-2 py-0.5 rounded-full font-medium"
          >
            ⏱ {{ stop.visitDurationMinutes }}分钟
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
