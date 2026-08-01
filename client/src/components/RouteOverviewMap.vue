<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useAmapMap } from '../composables/useAmapMap'
import type { Stop } from '../types/route'

const props = defineProps<{
  stops: Stop[]
}>()

const {
  createMap,
  destroyMap,
  waitForSDK,
  mapInstance,
} = useAmapMap()

const containerId = `route-overview-${Math.random().toString(36).slice(2, 9)}`
const loading = ref(true)
const failed = ref(false)
let overlays: any[] = []

function clearOverlays() {
  if (mapInstance.value && overlays.length) {
    mapInstance.value.remove(overlays)
  }
  overlays = []
}

function drawRoute() {
  const map = mapInstance.value
  if (!map || props.stops.length === 0) return

  clearOverlays()
  const AMap = (window as any).AMap
  const path = props.stops.map(stop => [stop.lng, stop.lat])
  const markers = props.stops.map((stop, index) => new AMap.Marker({
    position: [stop.lng, stop.lat],
    title: stop.name,
    anchor: 'center',
    content: `<div style="width:26px;height:26px;border-radius:999px;background:${index === 0 ? '#315f45' : '#e8956d'};border:2px solid white;color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,.2)">${index + 1}</div>`,
  }))

  const polyline = path.length >= 2
    ? new AMap.Polyline({
      path,
      strokeColor: '#315f45',
      strokeWeight: 4,
      strokeOpacity: 0.78,
      strokeStyle: 'dashed',
      lineJoin: 'round',
      lineCap: 'round',
    })
    : null

  overlays = polyline ? [...markers, polyline] : markers
  map.add(overlays)
  map.setFitView(overlays, false, [38, 28, 38, 28], 16)
}

onMounted(async () => {
  if (!props.stops[0] || !await waitForSDK()) {
    failed.value = true
    loading.value = false
    return
  }

  await new Promise(resolve => requestAnimationFrame(resolve))
  const first = props.stops[0]
  const map = await createMap(containerId, [first.lng, first.lat], 13)
  if (!map) {
    failed.value = true
  } else {
    drawRoute()
  }
  loading.value = false
})

watch(
  () => props.stops.map(stop => `${stop.amapPoiId || stop.name}:${stop.lng},${stop.lat}`).join('|'),
  () => drawRoute(),
)

onUnmounted(() => {
  clearOverlays()
  destroyMap()
})
</script>

<template>
  <div class="relative h-[190px] flex-shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
    <div v-show="!failed" :id="containerId" class="absolute inset-0" />

    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-stone-100"
    >
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-primary-600" />
    </div>

    <div
      v-else-if="failed"
      class="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
    >
      <span class="text-2xl">🗺️</span>
      <p class="mt-2 text-xs font-semibold text-stone-600">地图暂时不可用</p>
      <p class="mt-1 text-[10px] leading-4 text-stone-400">路线清单和高德导航仍可正常使用</p>
    </div>

    <div
      v-else
      class="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold text-stone-700 shadow-sm backdrop-blur"
    >
      地点分布预览 · 1 是路线锚点
    </div>
  </div>
</template>
