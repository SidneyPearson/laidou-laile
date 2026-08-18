<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useAmapMap } from '../../composables/useAmapMap'
import type { TodaySpot } from '../../types/todayPlan'

const props = defineProps<{
  spots: TodaySpot[]
  connected?: boolean
  currentId?: string | null
  completedIds?: string[]
}>()

const { createMap, destroyMap, waitForSDK, mapInstance } = useAmapMap()
const containerId = `today-map-${Math.random().toString(36).slice(2, 9)}`
const loading = ref(true)
const failed = ref(false)
let overlays: any[] = []

function clearOverlays() {
  if (mapInstance.value && overlays.length) mapInstance.value.remove(overlays)
  overlays = []
}

function drawPlaces() {
  const map = mapInstance.value
  if (!map || props.spots.length === 0) return

  clearOverlays()
  const AMap = (window as any).AMap
  const completed = new Set(props.completedIds || [])
  const markers = props.spots.map((spot, index) => {
    const isCurrent = props.currentId === spot.id
    const isCompleted = completed.has(spot.id)
    const background = isCurrent ? '#b8f500' : isCompleted ? '#315f45' : '#78716c'
    const color = isCurrent ? '#17210a' : '#fff'
    const size = isCurrent ? 34 : 28
    const content = isCompleted ? '✓' : String(index + 1)
    return new AMap.Marker({
      position: [spot.lng, spot.lat],
      title: spot.name,
      anchor: 'center',
      content: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${background};border:2px solid white;color:${color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;box-shadow:0 3px 14px rgba(0,0,0,.28)${isCurrent ? ';animation:today-map-pulse 1.5s ease-in-out infinite' : ''}">${content}</div>`,
    })
  })
  const polyline = props.connected && props.spots.length >= 2
    ? new AMap.Polyline({
      path: props.spots.map(spot => [spot.lng, spot.lat]),
      strokeColor: '#315f45',
      strokeWeight: 4,
      strokeOpacity: 0.7,
      strokeStyle: 'dashed',
      lineJoin: 'round',
      lineCap: 'round',
    })
    : null

  overlays = polyline ? [...markers, polyline] : markers
  map.add(overlays)
  map.setFitView(overlays, false, [42, 30, 42, 30], 16)
}

onMounted(async () => {
  if (!props.spots[0] || !await waitForSDK()) {
    failed.value = true
    loading.value = false
    return
  }
  await new Promise(resolve => requestAnimationFrame(resolve))
  const first = props.spots[0]
  const map = await createMap(containerId, [first.lng, first.lat], 13)
  if (!map) failed.value = true
  else {
    map.setStatus?.({
      dragEnable: false,
      zoomEnable: false,
      doubleClickZoom: false,
      scrollWheel: false,
      touchZoom: false,
      keyboardEnable: false,
      rotateEnable: false,
      pitchEnable: false,
    })
    drawPlaces()
  }
  loading.value = false
})

watch(
  () => `${props.connected ? '1' : '0'}:${props.currentId || ''}:${(props.completedIds || []).join(',')}:${props.spots.map(spot => `${spot.id}:${spot.lng},${spot.lat}`).join('|')}`,
  drawPlaces,
)

onUnmounted(() => {
  clearOverlays()
  destroyMap()
})
</script>

<template>
  <div class="relative h-[210px] overflow-hidden rounded-[22px] border border-stone-200 bg-stone-100">
    <div v-show="!failed" :id="containerId" class="pointer-events-none absolute inset-0 touch-pan-y" />
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-stone-100">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-primary-600" />
    </div>
    <div v-else-if="failed" class="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <span class="text-2xl">🗺️</span>
      <p class="mt-2 text-xs font-semibold text-stone-600">地图暂时不可用</p>
      <p class="mt-1 text-[10px] leading-4 text-stone-400">地点清单和高德导航仍可正常使用</p>
    </div>
    <div
      v-else
      class="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold text-stone-700 shadow-sm backdrop-blur"
    >
      {{ currentId
        ? '荧光点是下一站 · ✓ 表示已到过'
        : completedIds?.length === spots.length && spots.length > 0
          ? '今日地点已全部到达 ✓'
          : connected ? '参考顺序 · 地图仅展示' : '只显示你加入的地点 · 地图仅展示' }}
    </div>
  </div>
</template>

<style>
@keyframes today-map-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 3px 14px rgba(0,0,0,.28); }
  50% { transform: scale(1.12); box-shadow: 0 0 0 8px rgba(184,245,0,.22); }
}
</style>
