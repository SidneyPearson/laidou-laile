<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGeolocation } from '../composables/useGeolocation'
import CityPicker from '../components/CityPicker.vue'
import type { City } from '../data/popularCities'

const router = useRouter()
const {
  coords,
  loading,
  error,
  isMock,
  requestLocation,
  setManualLocation,
} = useGeolocation()

const showCityPicker = ref(false)

function openCity(city: string, lat: number, lng: number, source: 'gps' | 'manual') {
  router.push({
    name: 'city',
    query: {
      city,
      lat: String(lat),
      lng: String(lng),
      source,
    },
  })
}

async function handleCurrentLocation() {
  await requestLocation(false)
  if (!coords.value || error.value) return

  openCity(
    isMock.value ? '定位演示城市' : '当前城市',
    coords.value.lat,
    coords.value.lng,
    'gps',
  )
}

function handleCitySelect(city: City) {
  const center = city.attractions[0]
  if (!center) return

  setManualLocation(center.lat, center.lng, city.name)
  showCityPicker.value = false
  openCity(city.name, center.lat, center.lng, 'manual')
}
</script>

<template>
  <main class="home-shell min-h-full">
    <section class="home-hero relative overflow-hidden px-6 pb-10 pt-16 text-white">
      <div class="city-orbit city-orbit-one" />
      <div class="city-orbit city-orbit-two" />
      <div class="city-skyline" aria-hidden="true">
        <span class="building building-one" />
        <span class="building building-two" />
        <span class="building building-three" />
        <span class="building building-four" />
        <span class="building building-five" />
      </div>

      <div class="relative z-10">
        <div class="mb-8 flex items-center justify-between">
          <span class="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-medium tracking-[0.16em] backdrop-blur">
            CITY INSPIRATION
          </span>
          <button
            class="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur transition active:scale-95"
            aria-label="历史路线"
            @click="router.push({ name: 'history' })"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </button>
        </div>

        <p class="mb-2 text-sm text-white/70">今天，不做攻略</p>
        <h1 class="text-[38px] font-bold leading-[1.12] tracking-tight">
          来都来了，<br>
          就好好玩一次。
        </h1>
        <p class="mt-4 max-w-[280px] text-sm leading-6 text-white/70">
          先找到这座城市真正值得去的地方，再生成今天就能出发的玩法。
        </p>
      </div>
    </section>

    <section class="relative z-20 -mt-5 px-5 pb-10">
      <div class="rounded-[28px] bg-white p-5 shadow-[0_18px_50px_rgba(44,44,44,0.10)]">
        <template v-if="!showCityPicker">
          <div class="mb-5">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">
              从哪里开始
            </p>
            <h2 class="mt-1.5 text-xl font-bold text-stone-900">先告诉我你在哪座城市</h2>
            <p class="mt-1.5 text-sm leading-5 text-stone-500">
              定位只用于本次推荐，不会建立账号或上传个人轨迹。
            </p>
          </div>

          <button
            class="btn-primary flex w-full items-center justify-center gap-2 py-4 text-[15px]"
            :disabled="loading"
            @click="handleCurrentLocation"
          >
            <svg v-if="!loading" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 21s6-4.4 6-11a6 6 0 1 0-12 0c0 6.6 6 11 6 11Z" />
              <circle cx="12" cy="10" r="2" />
            </svg>
            <span v-else class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {{ loading ? '正在获取位置…' : '使用当前位置' }}
          </button>

          <button
            class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 py-3.5 text-sm font-semibold text-stone-700 transition active:scale-[0.99] active:bg-stone-100"
            @click="showCityPicker = true"
          >
            <span aria-hidden="true">🏙️</span>
            手动选择城市
          </button>

          <div v-if="error" class="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800">
            {{ error.message }}。你也可以直接选择城市继续体验。
          </div>
        </template>

        <CityPicker
          v-else
          @select="handleCitySelect"
          @cancel="showCityPicker = false"
        />
      </div>

      <div class="mt-6 grid grid-cols-3 gap-2">
        <div
          v-for="item in [
            { icon: '✨', title: '先找灵感', desc: '不先填长表单' },
            { icon: '🧭', title: '全城范围', desc: '不困在附近' },
            { icon: '🗺️', title: '选中再规划', desc: '路线更有目的' },
          ]"
          :key="item.title"
          class="rounded-2xl border border-stone-200/70 bg-white/70 px-2 py-3 text-center"
        >
          <div class="text-lg">{{ item.icon }}</div>
          <div class="mt-1 text-xs font-semibold text-stone-700">{{ item.title }}</div>
          <div class="mt-0.5 text-[10px] text-stone-400">{{ item.desc }}</div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-shell {
  background: #f7f6f2;
}

.home-hero {
  min-height: 390px;
  background:
    radial-gradient(circle at 82% 20%, rgba(232, 149, 109, 0.38), transparent 30%),
    linear-gradient(145deg, #315f45 0%, #5b8c5e 56%, #7aad7d 100%);
}

.city-orbit {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 999px;
}

.city-orbit-one {
  right: -80px;
  top: 78px;
  width: 250px;
  height: 250px;
}

.city-orbit-two {
  right: -28px;
  top: 132px;
  width: 144px;
  height: 144px;
}

.city-skyline {
  position: absolute;
  right: 18px;
  bottom: 22px;
  display: flex;
  height: 118px;
  align-items: flex-end;
  gap: 7px;
  opacity: 0.18;
}

.building {
  display: block;
  width: 24px;
  border-radius: 7px 7px 0 0;
  background: white;
}

.building-one { height: 48px; }
.building-two { height: 88px; }
.building-three { height: 66px; }
.building-four { height: 112px; }
.building-five { height: 76px; }
</style>
