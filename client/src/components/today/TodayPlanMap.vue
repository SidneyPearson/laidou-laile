<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useAmapMap } from '../../composables/useAmapMap'
import type { TodaySpot } from '../../types/todayPlan'

const props = defineProps<{
  spots: TodaySpot[]
  connected?: boolean
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
  const markers = props.spots.map((spot, index) => new AMap.Marker({
    position: [spot.lng, spot.lat],
    title: spot.name,
    anchor: 'center',
    content: `<div style="width:28px;height:28px;border-radius:999px;background:#315f45;border:2px solid white;color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,.22)">${index + 1}</div>`,
  }))
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
  else drawPlaces()
  loading.value = false
})

watch(
  () => `${props.connected ? '1' : '0'}:${props.spots.map(spot => `${spot.id}:${spot.lng},${spot.lat}`).join('|')}`,
  drawPlaces,
)

onUnmounted(() => {
  clearOverlays()
  destroyMap()
})
</script>

<template>
  <div class="relative h-[210px] overflow-hidden rounded-[22px] border border-stone-200 bg-stone-100">
    <div v-show="!failed" :id="containerId" class="absolute inset-0" />
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
      {{ connected ? '参考顺序 · 虚线仅供参考' : '只显示你加入的地点' }}
    </div>
  </div>
</template>

