<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useAmapMap } from '../composables/useAmapMap'

const emit = defineEmits<{
  confirm: [payload: { lat: number; lng: number; name: string; address: string }]
  cancel: []
}>()

const {
  waitForSDK,
  createMap,
  setMarker,
  onClickMap,
  reverseGeocode,
  searchAddress,
  getUserLocation,
  destroyMap,
  getDiagInfo,
} = useAmapMap()

const containerId = 'amap-container-' + Math.random().toString(36).slice(2, 8)
const mapReady = ref(false)
const mapFailed = ref(false)
const mapFailReason = ref('')
const diagInfo = ref<any>(null)
const selectedLng = ref(121.505863)
const selectedLat = ref(31.20256)
const selectedAddress = ref('')
const searchText = ref('')
const suggestions = ref<Array<{ name: string; address: string; lng: number; lat: number }>>([])
const showSuggestions = ref(false)
const searching = ref(false)
const loading = ref(true)

let searchTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null

function onBlur() {
  // Delay hiding so click on suggestion can fire first
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => { showSuggestions.value = false }, 200)
}

onMounted(async () => {
  // Try GPS first
  const gps = await getUserLocation()
  if (gps) {
    selectedLng.value = gps.lng
    selectedLat.value = gps.lat
  }

  // Check if SDK is available at all
  const sdkReady = await waitForSDK()
  if (!sdkReady) {
    mapFailed.value = true
    diagInfo.value = getDiagInfo()
    mapFailReason.value = '地图 SDK 加载失败，请检查网络连接'
    loading.value = false
    return
  }

  // Create map
  const map = await createMap(containerId, [selectedLng.value, selectedLat.value], 15)
  if (map) {
    mapReady.value = true
    setMarker(selectedLng.value, selectedLat.value)
    onClickMap(async (lng, lat) => {
      selectedLng.value = lng
      selectedLat.value = lat
      setMarker(lng, lat)
      const addr = await reverseGeocode(lng, lat)
      if (addr) selectedAddress.value = addr
    })
    // Get initial address
    const addr = await reverseGeocode(selectedLng.value, selectedLat.value)
    if (addr) selectedAddress.value = addr
  } else {
    mapFailed.value = true
    diagInfo.value = getDiagInfo()
    const amapErr = (window as any)._amap_error || ''
    mapFailReason.value = '地图初始化失败，请确认高德 Key 已授权当前域名' + (amapErr ? ' [' + amapErr + ']' : '')
  }
  loading.value = false
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  if (blurTimer) clearTimeout(blurTimer)
  destroyMap()
})

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  const val = searchText.value.trim()
  if (!val) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      const res = await searchAddress(val)
      suggestions.value = res
      showSuggestions.value = res.length > 0
    } finally {
      searching.value = false
    }
  }, 400)
}

function selectSuggestion(item: { name: string; address: string; lng: number; lat: number }) {
  console.log('selectSuggestion called:', item)
  if (blurTimer) { clearTimeout(blurTimer); blurTimer = null }
  selectedLng.value = item.lng
  selectedLat.value = item.lat
  selectedAddress.value = item.address || item.name
  searchText.value = ''
  showSuggestions.value = false
  suggestions.value = []
  // Use nextTick to ensure DOM updates before map interaction
  setMarker(item.lng, item.lat)
}

async function handleGetGPS() {
  const gps = await getUserLocation()
  if (!gps) {
    alert('无法获取位置，请检查定位权限')
    return
  }
  selectedLng.value = gps.lng
  selectedLat.value = gps.lat
  setMarker(gps.lng, gps.lat)
  const addr = await reverseGeocode(gps.lng, gps.lat)
  if (addr) selectedAddress.value = addr
}

function handleConfirm() {
  const addr = selectedAddress.value || `${selectedLng.value.toFixed(6)}, ${selectedLat.value.toFixed(6)}`
  emit('confirm', {
    lat: selectedLat.value,
    lng: selectedLng.value,
    name: addr,
    address: addr,
  })
}
</script>

<template>
  <div class="space-y-3">
    <!-- Header with cancel -->
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold text-gray-700">在地图上选择位置</p>
      <button
        class="text-xs text-gray-400 active:text-gray-600 transition-colors"
        @click="emit('cancel')"
      >
        取消
      </button>
    </div>

    <!-- Address search -->
    <div class="relative">
      <div class="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
        <svg class="w-4 h-4 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          v-model="searchText"
          type="text"
          class="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
          placeholder="搜索地址或地标..."
          @input="onSearchInput"
          @focus="searchText && suggestions.length && (showSuggestions = true)"
          @blur="onBlur"
        />
        <div v-if="searching" class="w-4 h-4 border-2 border-gray-300 border-t-primary-400 rounded-full animate-spin"/>
      </div>

      <!-- Suggestions dropdown -->
      <div
        v-if="showSuggestions && suggestions.length"
        class="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-30 max-h-48 overflow-auto"
      >
        <button
          v-for="(item, i) in suggestions"
          :key="i"
          class="w-full text-left px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-50 last:border-0"
          @mousedown.prevent="selectSuggestion(item)"
        >
          <p class="text-sm text-gray-800 truncate">{{ item.name }}</p>
          <p class="text-xs text-gray-400 truncate mt-0.5">{{ item.address }}</p>
        </button>
      </div>
    </div>

    <!-- Map -->
    <div class="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100" style="height: 240px;">
      <div v-show="!mapFailed" :id="containerId" class="w-full h-full" />
      <!-- Map error state -->
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
          <div class="truncate">URL: {{ diagInfo.location }}</div>
          <div v-if="diagInfo.error" class="text-red-400">Error: {{ diagInfo.error }}</div>
          <div v-if="diagInfo.scriptError" class="text-red-400">ScriptErr: {{ diagInfo.scriptError }}</div>
        </div>
      </div>
      <!-- Loading overlay -->
      <div
        v-else-if="loading"
        class="absolute inset-0 bg-gray-100 flex items-center justify-center"
      >
        <div class="w-6 h-6 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin"/>
      </div>
    </div>

    <!-- Selected location -->
    <div class="flex items-start gap-2 p-3 bg-primary-50 rounded-xl border border-primary-100">
      <svg class="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
      <div class="min-w-0 flex-1">
        <p class="text-sm text-gray-700 truncate">{{ selectedAddress || '点击地图选择位置或搜索地址' }}</p>
        <p class="text-xs text-gray-400 mt-0.5">
          {{ selectedLng.toFixed(6) }}, {{ selectedLat.toFixed(6) }}
        </p>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-2">
      <button
        class="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600
               active:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
        @click="handleGetGPS"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="6"/>
          <line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="6" y2="12"/>
          <line x1="18" y1="12" x2="22" y2="12"/>
        </svg>
        获取当前位置
      </button>
      <button
        class="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-primary-500 text-white
               active:bg-primary-600 transition-colors"
        @click="handleConfirm"
      >
        确认位置
      </button>
    </div>
  </div>
</template>
