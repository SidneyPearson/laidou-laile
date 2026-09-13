<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFootprints, type FootprintCity } from '../composables/useFootprints'
import { useAmapMap } from '../composables/useAmapMap'

const router = useRouter()
const { visitedCount, visitedCities, storageAvailable } = useFootprints()
const { createMap, destroyMap, waitForSDK } = useAmapMap()
const MAP_ID = 'visited-amap'
const mapState = ref<'loading' | 'ready' | 'failed'>('loading')
const selectedKey = ref('')
const selectedCity = computed(() => visitedCities.value.find(c => c.key === selectedKey.value))
let map: any = null
let disposed = false
let mapTimer: ReturnType<typeof setTimeout> | undefined
const boundaryOverlays = new Map<string, any[]>()

function cityCenter(city: FootprintCity): [number, number] | null {
  const spots = city.spots.filter(s => Number.isFinite(s.lng) && Number.isFinite(s.lat)
    && Math.abs(s.lng) <= 180 && Math.abs(s.lat) <= 90)
  if (!spots.length) return null
  return [spots.reduce((sum, s) => sum + s.lng, 0) / spots.length,
    spots.reduce((sum, s) => sum + s.lat, 0) / spots.length]
}

function showOverview() {
  selectedKey.value = ''
  // 全国视角不根据已到访城市缩放，单城也保留地理参照。
  map?.setZoomAndCenter(3, [104.2, 35.6])
}

function selectCity(city: FootprintCity) {
  selectedKey.value = city.key
  if (!map) return
  const overlays = boundaryOverlays.get(city.key)
  if (overlays?.length) map.setFitView(overlays, false, [48, 40, 48, 40], 8)
  else {
    const center = cityCenter(city)
    if (center) map.setZoomAndCenter(7, center)
  }
}

function drawCities(AMap: any) {
  for (const city of visitedCities.value) {
    const center = cityCenter(city)
    if (!center) continue
    const marker = new AMap.CircleMarker({
      center, radius: 5, strokeColor: '#eaffb0', strokeWeight: 2,
      fillColor: '#c7ff1f', fillOpacity: 1, zIndex: 45,
    })
    const label = new AMap.Text({
      text: city.cityName, position: center, offset: new AMap.Pixel(0, -12), anchor: 'bottom-center',
      style: { 'background-color': '#101923', border: '1px solid #788a56',
        'border-radius': '8px', color: '#eaf7d0', 'font-size': '12px', padding: '3px 7px' }, zIndex: 46,
    })
    marker.on('click', () => selectCity(city))
    label.on('click', () => selectCity(city))
    map.add([marker, label])
  }
  // 边界是补充信息：查询失败时底图、标记和城市详情仍然可用。
  AMap.plugin('AMap.DistrictSearch', () => {
    if (disposed) return
    for (const city of visitedCities.value) {
      try {
        const search = new AMap.DistrictSearch({ level: 'city', subdistrict: 0, extensions: 'all' })
        search.search(city.cityAdcode || city.cityName, (status: string, result: any) => {
          if (disposed || status !== 'complete') return
          const overlays = (result?.districtList?.[0]?.boundaries ?? []).map((path: any) => {
            const polygon = new AMap.Polygon({ path, strokeColor: '#c7ff1f', strokeWeight: 1.2,
              strokeOpacity: 0.7, fillColor: '#c7ff1f', fillOpacity: 0.18, zIndex: 40 })
            polygon.on('click', () => selectCity(city))
            return polygon
          })
          boundaryOverlays.set(city.key, overlays)
          map.add(overlays)
          // 异步结果只补绘边界，不改变用户当前视角。
        })
      } catch { /* 单城边界失败不影响整张地图。 */ }
    }
  })
}

onMounted(async () => {
  const ready = await waitForSDK()
  if (disposed) return
  if (!ready) { mapState.value = 'failed'; return }
  try {
    map = await createMap(MAP_ID, [104.2, 35.6], 3)
    if (disposed) { destroyMap(); return }
    if (!map) { mapState.value = 'failed'; return }
    map.setMapStyle?.('amap://styles/dark')
    mapTimer = setTimeout(() => { mapState.value = 'failed' }, 10000)
    map.on('complete', () => {
      if (disposed) return
      clearTimeout(mapTimer)
      mapState.value = 'ready'
    })
    drawCities((window as any).AMap)
    if (selectedCity.value) selectCity(selectedCity.value)
  } catch { if (!disposed) mapState.value = 'failed' }
})

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(mapTimer)
  destroyMap()
  map = null
})

function goBack() { router.back() }
</script>

<template>
  <main class="visited-page">
    <header class="visited-header">
      <button type="button" class="back-btn" aria-label="返回" @click="goBack">‹</button>
      <div class="visited-title">
        <p>FOOTPRINT MAP</p>
        <h1>足迹点亮地图</h1>
      </div>
      <span class="count-pill">已点亮 {{ visitedCount }} 城</span>
    </header>

    <section class="map-card">
      <div :id="MAP_ID" class="map-canvas" aria-label="中国足迹地图" />
      <div v-if="mapState === 'loading'" class="map-overlay" aria-live="polite">
        <span class="map-spinner" aria-hidden="true" />
        正在铺开地图…
      </div>
      <div v-else-if="mapState === 'failed'" class="map-overlay map-overlay--failed">
        <span aria-hidden="true">🗺️</span>
        <p>地图暂时没加载出来</p>
      </div>
      <button v-if="mapState === 'ready'" type="button" class="overview-btn" @click="showOverview">全国总览</button>
      <div v-if="visitedCount === 0" class="map-empty">
        <strong>还没有点亮的城市</strong>
        <span>完成今日行程后，<br>对应的城市就会在这里亮起来。</span>
        <button type="button" @click="router.replace({ name: 'today-plan' })">去今日计划看看</button>
      </div>
    </section>

    <section class="panel visited-panel">
      <div class="panel-head">
        <div><p>LIT CITIES</p><h2>已点亮的城市</h2></div>
      </div>
      <div v-if="visitedCities.length" class="city-chips">
        <button v-for="city in visitedCities" :key="city.key" type="button" class="city-chip"
          :aria-pressed="selectedKey === city.key" @click="selectCity(city)">
          <i aria-hidden="true">📍</i>{{ city.cityName }}
        </button>
      </div>
      <p v-else class="visited-empty-tip">去完成今天的行程，留下第一份足迹吧。</p>
      <div v-if="selectedCity" class="city-detail" aria-live="polite">
        <h3>{{ selectedCity.cityName }} · 到过 {{ selectedCity.spots.length }} 个地点</h3>
        <p>足迹日期：{{ selectedCity.dates.join('、') }}</p>
        <ul><li v-for="spot in selectedCity.spots" :key="spot.id">{{ spot.name }}</li></ul>
      </div>
      <p v-else-if="visitedCount" class="visited-empty-tip">点选城市，看看走过的地方。</p>
      <p class="storage-tip">足迹与票根保存在当前浏览器。</p>
      <p v-if="!storageAvailable" role="alert" class="storage-tip">浏览器暂时无法保存足迹，关闭后可能丢失。</p>
      <button type="button" class="tickets-link" @click="router.replace({ name: 'my-tickets' })">
        查看我的城市票根 <em>→</em>
      </button>
    </section>
  </main>
</template>

<style scoped>
.visited-page {
  --accent: #c7ff1f;
  width: 100%;
  max-width: 480px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: 0 16px calc(112px + env(safe-area-inset-bottom));
  background: radial-gradient(circle at 8% 0, rgba(56, 189, 248, 0.12), transparent 26%),
    radial-gradient(circle at 95% 14%, rgba(199, 255, 31, 0.09), transparent 24%),
    #02070e;
  color: #fff;
}

.visited-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: max(16px, env(safe-area-inset-top)) 2px 14px;
}
.back-btn {
  flex: none;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  background: rgba(8, 13, 20, 0.85);
  color: #fff;
  font-size: 24px;
  line-height: 1;
}
.back-btn:active { transform: scale(0.94); }
.visited-title { min-width: 0; flex: 1; }
.visited-title p {
  color: var(--accent);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.17em;
}
.visited-title h1 {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 920;
}
.count-pill {
  flex: none;
  padding: 7px 12px;
  border: 1px solid rgba(199, 255, 31, 0.35);
  border-radius: 999px;
  background: rgba(199, 255, 31, 0.1);
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
}

.map-card {
  position: relative;
  height: 46vh;
  min-height: 320px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  background: #070d16;
}
.map-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.map-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(2, 7, 14, 0.55);
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
  font-weight: 700;
}
.map-overlay--failed span { font-size: 36px; }
.map-overlay--failed p { margin: 0; }
.map-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2.5px solid rgba(199, 255, 31, 0.16);
  border-top-color: var(--accent);
  animation: visited-spin 0.8s linear infinite;
}
@keyframes visited-spin {
  to { transform: rotate(360deg); }
}
.map-empty {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(8, 13, 20, 0.92);
  text-align: center;
}
.map-empty strong { font-size: 15px; font-weight: 900; }
.map-empty span { color: rgba(255, 255, 255, 0.6); font-size: 12px; line-height: 1.6; }
.map-empty button {
  align-self: center;
  margin-top: 6px;
  padding: 10px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #101508;
  font-size: 13px;
  font-weight: 850;
}

.panel {
  margin-top: 14px;
  padding: 17px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 23px;
  background: rgba(14, 20, 30, 0.86);
}
.panel-head p {
  color: var(--accent);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.17em;
}
.panel-head h2 { margin-top: 4px; font-size: 18px; font-weight: 920; }

.city-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.city-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 14px;
  border: 1px solid rgba(199, 255, 31, 0.28);
  border-radius: 999px;
  background: rgba(199, 255, 31, 0.08);
  color: #eaf7d0;
  font-size: 13px;
  font-weight: 750;
}
.city-chip[aria-pressed="true"] { background: var(--accent); color: #101508; }
.city-chip { min-height: 44px; }
.city-chip:focus-visible, .overview-btn:focus-visible { outline: 2px solid white; outline-offset: 3px; }
.overview-btn { position: absolute; top: 12px; right: 12px; padding: 11px 14px; border-radius: 14px;
  border: 1px solid rgba(255,255,255,.25); background: #101923; color: #eaf7d0; font-size: 12px; }
.city-detail { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.12); }
.city-detail h3 { font-size: 15px; font-weight: 800; }
.city-detail p { margin-top: 8px; color: #b7c1cd; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.city-detail ul { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.city-detail li { padding: 6px 10px; background: #1b2633; border-radius: 9px; font-size: 12px; }
.storage-tip { margin-top: 14px; font-size: 11px; color: #93a1b2; }
.city-chip i { font-style: normal; }
.visited-empty-tip {
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  line-height: 1.6;
}
.tickets-link {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  padding: 13px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13.5px;
  font-weight: 800;
}
.tickets-link em { font-style: normal; color: var(--accent); }
.tickets-link:active { transform: scale(0.98); }

@media (prefers-reduced-motion: reduce) {
  .map-spinner { animation-duration: 1.6s; }
}
</style>
