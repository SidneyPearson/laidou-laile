<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useAmapMap } from '../composables/useAmapMap'

const props = defineProps<{
  lng: number
  lat: number
  label?: string | null
}>()

const {
  waitForSDK,
  createMap,
  setMarker,
  destroyMap,
  getDiagInfo,
} = useAmapMap()

const containerId = 'amap-mini-' + Math.random().toString(36).slice(2, 8)
const mapReady = ref(false)
const mapFailed = ref(false)
const mapFailReason = ref('')
const diagInfo = ref<any>(null)
const loading = ref(true)

onMounted(async () => {
  const sdkReady = await waitForSDK()
  if (!sdkReady) {
    mapFailed.value = true
    diagInfo.value = getDiagInfo()
    mapFailReason.value = '地图 SDK 加载失败，请检查网络连接'
    loading.value = false
    return
  }

  // Yield a frame so the container has non-zero dimensions before init
  await new Promise(r => requestAnimationFrame(r))
  const map = await createMap(containerId, [props.lng, props.lat], 15)
  if (map) {
    mapReady.value = true
    setMarker(props.lng, props.lat)
  } else {
    mapFailed.value = true
    diagInfo.value = getDiagInfo()
    const amapErr = (window as any)._amap_error || ''
    mapFailReason.value = '地图初始化失败，请确认高德 Key 已授权当前域名' + (amapErr ? ' [' + amapErr + ']' : '')
  }
  loading.value = false
})

// Keep marker in sync when location changes (GPS update / city pick / map pick)
watch(
  () => [props.lng, props.lat],
  ([lng, lat]) => {
    if (mapReady.value) setMarker(lng, lat)
  },
)

onUnmounted(() => {
  destroyMap()
})
</script>

<template>
  <div class="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100" style="height: 180px;">
    <div v-show="!mapFailed" :id="containerId" style="position:absolute;top:0;left:0;right:0;bottom:0;" />

    <!-- Location label overlay -->
    <div
      v-if="mapReady && label"
      class="absolute left-2 right-2 bottom-2 px-3 py-2 bg-white/90 backdrop-blur rounded-lg shadow-sm
             flex items-center gap-1.5 pointer-events-none"
    >
      <svg class="w-4 h-4 text-primary-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
      <p class="text-xs text-gray-700 truncate">{{ label }}</p>
    </div>

    <!-- Error state -->
    <div
      v-if="mapFailed"
      class="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 overflow-auto p-3"
    >
      <svg class="w-8 h-8 text-gray-300 mb-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
      <p class="text-xs text-gray-400 text-center px-2 flex-shrink-0">{{ mapFailReason }}</p>
      <div v-if="diagInfo" class="mt-2 w-full text-[10px] text-gray-400 space-y-0.5 bg-gray-100 rounded-lg p-2 font-mono">
        <div>AMap: {{ diagInfo.hasAMap ? '✓ v' + diagInfo.amapVersion : '✗ 未加载' }}</div>
        <div>Script: {{ diagInfo.scriptFound ? '✓' : '✗' }} | onload: {{ diagInfo.scriptOnload ? '✓' : '✗' }}</div>
        <div>Key: {{ diagInfo.keyPreview }}</div>
        <div>Attempts: {{ diagInfo.attempts }}/100</div>
        <div v-if="diagInfo.error" class="text-red-400">Error: {{ diagInfo.error }}</div>
        <div v-if="diagInfo.scriptError" class="text-red-400">ScriptErr: {{ diagInfo.scriptError }}</div>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-else-if="loading"
      class="absolute inset-0 bg-gray-100 flex items-center justify-center"
    >
      <div class="w-6 h-6 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin"/>
    </div>
  </div>
</template>
