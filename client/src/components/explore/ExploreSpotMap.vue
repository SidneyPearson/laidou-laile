<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useAmapMap } from '../../composables/useAmapMap'
import type { InspirationSpot } from '../../types/explore'

const props = defineProps<{
  spots: InspirationSpot[]
  selectedIds: string[]
}>()

const emit = defineEmits<{
  select: [spot: InspirationSpot]
}>()

const { createMap, destroyMap, waitForSDK, mapInstance } = useAmapMap()
const containerId = `explore-map-${Math.random().toString(36).slice(2, 9)}`
const loading = ref(true)
const failed = ref(false)
let markers: any[] = []

function clearMarkers() {
  if (mapInstance.value && markers.length) mapInstance.value.remove(markers)
  markers = []
}

function drawMarkers() {
  const map = mapInstance.value
  const visible = props.spots.filter(
    spot => Number.isFinite(spot.lng) && Number.isFinite(spot.lat),
  )
  if (!map || visible.length === 0) return

  clearMarkers()
  const AMap = (window as any).AMap
  const selected = new Set(props.selectedIds)
  markers = visible.map((spot, index) => {
    const inToday = selected.has(spot.id)
    const marker = new AMap.Marker({
      position: [spot.lng, spot.lat],
      title: spot.name,
      anchor: 'center',
      content: `<div style="min-width:30px;height:30px;padding:0 8px;border-radius:999px;background:${inToday ? '#c7ff1f' : '#121923'};border:2px solid ${inToday ? '#efffb2' : '#fff'};color:${inToday ? '#071007' : '#fff'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;box-shadow:0 4px 14px rgba(0,0,0,.35)">${inToday ? '✓' : index + 1}</div>`,
    })
    marker.on('click', () => emit('select', spot))
    return marker
  })
  map.add(markers)
  map.setFitView(markers, false, [46, 32, 46, 32], 15)
}

onMounted(async () => {
  const first = props.spots.find(spot => Number.isFinite(spot.lng) && Number.isFinite(spot.lat))
  if (!first || !await waitForSDK()) {
    failed.value = true
    loading.value = false
    return
  }
  await new Promise(resolve => requestAnimationFrame(resolve))
  const map = await createMap(containerId, [first.lng as number, first.lat as number], 12)
  if (!map) failed.value = true
  else drawMarkers()
  loading.value = false
})

watch(
  () => `${props.selectedIds.join(',')}:${props.spots.map(spot => `${spot.id}:${spot.lng},${spot.lat}`).join('|')}`,
  drawMarkers,
)

onUnmounted(() => {
  clearMarkers()
  destroyMap()
})
</script>

<template>
  <div class="relative h-[58dvh] min-h-[410px] overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.04]">
    <div v-show="!failed" :id="containerId" class="absolute inset-0" />
    <div v-if="loading" class="absolute inset-0 grid place-items-center bg-[#111821]">
      <div class="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-[#c7ff1f]" />
    </div>
    <div v-else-if="failed" class="absolute inset-0 grid place-items-center px-8 text-center">
      <div>
        <p class="text-3xl">🗺️</p>
        <p class="mt-3 text-sm font-bold text-white">地图暂时不可用</p>
        <p class="mt-1 text-xs leading-5 text-white/45">地点列表仍可正常浏览和加入今天</p>
      </div>
    </div>
    <div v-else class="pointer-events-none absolute left-3 top-3 rounded-full bg-[#0b1119]/85 px-3 py-2 text-[10px] font-semibold text-white/75 shadow-lg backdrop-blur">
      点击地图标记查看地点 · 荧光点已加入今天
    </div>
  </div>
</template>
