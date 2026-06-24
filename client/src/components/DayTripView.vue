<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import type { Route, Stop } from '../types/route'
import DayTripStop from './DayTripStop.vue'

const props = defineProps<{
  route: Route
  removable?: boolean
  removedIndices?: Set<number>
  /** Original index of the stop currently being replaced (shows spinner) */
  replacingIndex?: number | null
}>()

const emit = defineEmits<{
  'remove-stop': [index: number]
  'replace-stop': [index: number]
  /** New order of visible stops (removed stops are dropped on commit) */
  'reorder': [stops: Stop[]]
}>()

const visibleStops = computed(() =>
  props.route.stops.filter((_, i) => !props.removedIndices?.has(i))
)

/** Stops with sequential display indices (no gaps when stops are removed) */
const baseDisplayStops = computed(() => {
  const result: Array<{ stop: Stop; originalIndex: number; displayIndex: number }> = []
  let idx = 0
  props.route.stops.forEach((stop, i) => {
    if (!props.removedIndices?.has(i)) {
      result.push({ stop, originalIndex: i, displayIndex: idx++ })
    }
  })
  return result
})

// ── Drag-to-reorder state ───────────────────────────────
const listEl = ref<HTMLElement | null>(null)
const dragging = ref(false)
const draggedOrig = ref<number | null>(null)
// Working order of original indices during a drag gesture
const order = ref<number[]>([])

/** What we actually render: a live-reordered list while dragging, else the base */
const displayStops = computed(() => {
  if (dragging.value && order.value.length) {
    return order.value.map((orig, pos) => ({
      stop: props.route.stops[orig],
      originalIndex: orig,
      displayIndex: pos,
    }))
  }
  return baseDisplayStops.value
})

function onHandleDown(payload: { index: number; event: PointerEvent }) {
  if (!props.removable) return
  const { index, event } = payload
  order.value = baseDisplayStops.value.map(d => d.originalIndex)
  draggedOrig.value = baseDisplayStops.value[index]?.originalIndex ?? null
  if (draggedOrig.value == null) return
  dragging.value = true
  event.preventDefault()
  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

function onMove(e: PointerEvent) {
  if (!dragging.value || draggedOrig.value == null) return
  e.preventDefault()
  const rows = Array.from(listEl.value?.querySelectorAll('[data-pos]') ?? []) as HTMLElement[]
  const y = e.clientY
  let target = order.value.length - 1
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k].getBoundingClientRect()
    if (y < r.top + r.height / 2) { target = k; break }
  }
  const curPos = order.value.indexOf(draggedOrig.value)
  if (target !== curPos && target >= 0) {
    const next = [...order.value]
    next.splice(curPos, 1)
    next.splice(target, 0, draggedOrig.value)
    order.value = next
  }
}

function onUp() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
  if (!dragging.value) return

  const finalOrder = [...order.value]
  const baseOrder = baseDisplayStops.value.map(d => d.originalIndex)
  dragging.value = false
  draggedOrig.value = null
  order.value = []

  // Only commit if the order actually changed
  const changed = finalOrder.some((o, i) => o !== baseOrder[i])
  if (changed) {
    emit('reorder', finalOrder.map(orig => props.route.stops[orig]))
  }
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
})

/** Open Amap with all stops as waypoints */
function navigateAll() {
  const stops = visibleStops.value
  if (stops.length === 0) return

  const origin = stops[0]
  const dest = stops[stops.length - 1]

  let url = `https://uri.amap.com/navigation?to=${dest.lng},${dest.lat},${encodeURIComponent(dest.name)}&mode=walk&callnative=1`

  if (stops.length > 2) {
    // Use direction API with waypoints for multi-stop routes
    const waypoints = stops.slice(1, -1)
      .map(s => `${s.lng},${s.lat},${encodeURIComponent(s.name)}`)
      .join(';')
    url = `https://uri.amap.com/direction?origin=${origin.lng},${origin.lat},${encodeURIComponent(origin.name)}&destination=${dest.lng},${dest.lat},${encodeURIComponent(dest.name)}&waypoints=${waypoints}&mode=walk`
  } else if (stops.length === 2) {
    url = `https://uri.amap.com/direction?origin=${origin.lng},${origin.lat},${encodeURIComponent(origin.name)}&destination=${dest.lng},${dest.lat},${encodeURIComponent(dest.name)}&mode=walk`
  }

  window.open(url, '_blank')
}
</script>

<template>
  <div ref="listEl" class="h-full min-h-0 overflow-y-auto scroll-smooth-ios px-1">
    <!-- Route header -->
    <div class="mb-5 text-center">
      <h2 class="text-xl font-bold text-gray-800">{{ route.name }}</h2>
      <p class="mt-1 text-sm text-gray-500">{{ route.tagline }}</p>
      <div class="flex justify-center gap-4 mt-2">
        <span class="text-xs text-gray-400">{{ visibleStops.length }} 个地点</span>
        <span v-if="removedIndices?.size" class="text-xs text-red-400">
          已移除 {{ removedIndices.size }} 个
        </span>
        <span v-if="route.walkingDistanceMeters > 0" class="text-xs text-gray-400">
          全程约 {{ (route.walkingDistanceMeters / 1000).toFixed(1) }}km
        </span>
      </div>

      <!-- Navigate all button -->
      <button
        v-if="visibleStops.length >= 2"
        class="mt-3 inline-flex items-center gap-1.5 text-xs text-primary-500
               bg-primary-50 px-3 py-1.5 rounded-full font-medium
               active:bg-primary-100 transition-colors"
        @click="navigateAll"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5"/>
        </svg>
        导航全部
      </button>

      <!-- Drag hint (edit mode) -->
      <p v-if="removable && visibleStops.length >= 2" class="mt-2 text-[11px] text-gray-400">
        按住序号圈可拖动调整顺序
      </p>
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
    <div class="relative pt-1">
      <!-- Vertical line (hidden while dragging to avoid visual lag) -->
      <div v-if="!dragging" class="absolute left-[19px] top-3 bottom-3 w-0.5 bg-primary-100" />

      <TransitionGroup name="flip" tag="div">
        <div
          v-for="item in displayStops"
          :key="item.stop.amapPoiId || item.stop.name"
          :data-pos="item.displayIndex"
          :class="{ 'relative z-30': dragging && item.originalIndex === draggedOrig }"
        >
          <div
            :class="dragging && item.originalIndex === draggedOrig
              ? 'ring-2 ring-primary-300 rounded-2xl shadow-lg scale-[1.02] transition-transform'
              : ''"
          >
            <DayTripStop
              :stop="item.stop"
              :index="item.displayIndex"
              :removable="removable"
              :replacing="replacingIndex === item.originalIndex"
              @remove="emit('remove-stop', item.originalIndex)"
              @replace="emit('replace-stop', item.originalIndex)"
              @handle-pointerdown="onHandleDown"
            />
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.flip-move {
  transition: transform 0.25s ease;
}
</style>
