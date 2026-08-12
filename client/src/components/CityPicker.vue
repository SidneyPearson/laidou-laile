<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { loadCityRecommendations, type RecommendationCity } from '../repositories/cityRecommendations'

const RECENT_CITIES_KEY = 'laidou-recent-cities'

const emit = defineEmits<{
  select: [city: RecommendationCity]
  cancel: []
}>()

const cities = ref<RecommendationCity[]>([])
const query = ref('')
const loading = ref(true)
const error = ref(false)
const recentAdcodes = ref<string[]>([])
const searchInput = ref<HTMLInputElement | null>(null)

const pinyinAliases: Record<string, string> = {
  北京: 'beijing bj', 成都: 'chengdu cd', 重庆: 'chongqing cq', 杭州: 'hangzhou hz',
  广州: 'guangzhou gz', 深圳: 'shenzhen sz', 西安: 'xian xi an xa', 长沙: 'changsha cs',
  南京: 'nanjing nj', 武汉: 'wuhan wh', 青岛: 'qingdao qd', 厦门: 'xiamen xm', 上海: 'shanghai sh',
}

const normalizedQuery = computed(() => query.value.trim().toLowerCase())

function searchableText(city: RecommendationCity): string {
  const name = city.name.replace(/市$/, '')
  return `${name} ${city.province} ${city.adcode} ${pinyinAliases[name] ?? ''}`.toLowerCase()
}

const filteredCities = computed(() => {
  if (!normalizedQuery.value) return cities.value
  return cities.value.filter(city => searchableText(city).includes(normalizedQuery.value))
})

const recentCities = computed(() => recentAdcodes.value
  .map(adcode => cities.value.find(city => city.adcode === adcode))
  .filter((city): city is RecommendationCity => Boolean(city)))

const hotCities = computed(() => {
  // 热门城市是完整的城市入口，不因为最近选择过而被隐藏。
  // 最近选择作为快捷入口单独展示，两者允许出现重复城市。
  return cities.value.slice(0, 10)
})

function loadRecentCities() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_CITIES_KEY) ?? '[]')
    if (Array.isArray(stored)) recentAdcodes.value = stored.filter(item => typeof item === 'string').slice(0, 4)
  } catch {
    recentAdcodes.value = []
  }
}

function rememberCity(city: RecommendationCity) {
  recentAdcodes.value = [city.adcode, ...recentAdcodes.value.filter(adcode => adcode !== city.adcode)].slice(0, 4)
  try {
    localStorage.setItem(RECENT_CITIES_KEY, JSON.stringify(recentAdcodes.value))
  } catch {
    /* ignore storage restrictions */
  }
}

function selectCity(city: RecommendationCity) {
  rememberCity(city)
  emit('select', city)
}

async function load() {
  loading.value = true
  error.value = false
  const result = await loadCityRecommendations()
  cities.value = result.cities
  loading.value = false
  error.value = result.cities.length === 0
}

onMounted(async () => {
  loadRecentCities()
  await load()
  await nextTick()
  searchInput.value?.focus()
})
</script>

<template>
  <div class="city-picker" role="dialog" aria-label="搜索城市">
    <div class="city-picker-grabber" />

    <div class="mb-5 flex items-center gap-3">
      <button class="city-picker-back" aria-label="返回" @click="emit('cancel')">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <div>
        <p class="text-lg font-bold text-white">搜索城市</p>
        <p class="mt-0.5 text-xs text-white/45">选择一座城市，开始今天的探索</p>
      </div>
    </div>

    <label class="city-picker-search">
      <svg class="h-4 w-4 flex-shrink-0 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input ref="searchInput" v-model="query" type="search" autocomplete="off" placeholder="搜索城市名称，如：成都" aria-label="搜索城市名称">
      <button v-if="query" class="city-picker-clear" aria-label="清空搜索" @click="query = ''">×</button>
    </label>

    <div v-if="loading" class="grid grid-cols-2 gap-2.5 pt-5">
      <div v-for="n in 4" :key="n" class="h-[62px] animate-pulse rounded-2xl bg-white/[0.06]" />
    </div>

    <div v-else-if="error" class="py-10 text-center">
      <p class="text-sm text-white/55">暂无可选城市，请稍后再试</p>
      <button class="mt-4 rounded-full bg-primary-300 px-4 py-2 text-xs font-bold text-stone-950" @click="load">重新加载</button>
    </div>

    <template v-else>
      <section v-if="!normalizedQuery && recentCities.length" class="city-picker-section">
        <div class="city-picker-section-title">最近选择</div>
        <div class="city-picker-chips">
          <button v-for="city in recentCities" :key="city.adcode" class="city-picker-chip" @click="selectCity(city)">{{ city.name.replace(/市$/, '') }}</button>
        </div>
      </section>

      <section v-if="!normalizedQuery && hotCities.length" class="city-picker-section">
        <div class="city-picker-section-title">热门城市</div>
        <div class="grid grid-cols-2 gap-2.5">
          <button v-for="city in hotCities" :key="city.adcode" class="city-picker-city city-picker-city--poster" @click="selectCity(city)">
            <img v-if="city.coverImageUrl" class="city-picker-poster-image" :src="city.coverImageUrl" :alt="`${city.name}封面`" loading="lazy">
            <span v-else class="city-picker-poster-fallback">{{ city.name.slice(0, 1) }}</span>
            <span class="city-picker-poster-shade" />
            <span class="city-picker-poster-content">
              <span class="block truncate text-base font-bold text-white">{{ city.name }}</span>
            </span>
          </button>
        </div>
      </section>

      <section v-if="normalizedQuery" class="city-picker-section">
        <div class="city-picker-section-title">搜索结果 · {{ filteredCities.length }}</div>
        <div v-if="filteredCities.length" class="grid gap-2.5">
          <button v-for="city in filteredCities" :key="city.adcode" class="city-picker-city city-picker-city--result" @click="selectCity(city)">
            <span class="city-picker-city-mark">
              <img v-if="city.coverImageUrl" :src="city.coverImageUrl" :alt="`${city.name}封面`" loading="lazy">
              <span v-else>{{ city.name.slice(0, 1) }}</span>
            </span>
            <span class="min-w-0 flex-1 text-left">
              <span class="block truncate text-base font-semibold text-white">{{ city.name }}</span>
              <span class="mt-1 block text-xs text-white/40">进入城市探索</span>
            </span>
            <span class="city-picker-result-arrow" aria-hidden="true">→</span>
          </button>
        </div>
        <div v-else class="py-8 text-center text-sm text-white/50">没有找到这座城市，换个关键词试试</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.city-picker { color: #fff; }
.city-picker-grabber { width: 48px; height: 4px; margin: 0 auto 16px; border-radius: 999px; background: rgba(255, 255, 255, 0.2); }
.city-picker-back { display: flex; width: 36px; height: 36px; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 999px; color: rgba(255, 255, 255, 0.65); transition: transform 0.2s ease, background 0.2s ease; }
.city-picker-back:hover { background: rgba(255, 255, 255, 0.08); }
.city-picker-search { display: flex; height: 50px; align-items: center; gap: 10px; padding: 0 14px; border: 1px solid rgba(199, 255, 31, 0.34); border-radius: 16px; background: rgba(255, 255, 255, 0.07); box-shadow: 0 0 0 3px rgba(199, 255, 31, 0.04); }
.city-picker-search input { min-width: 0; flex: 1; outline: none; border: 0; background: transparent; color: #fff; font-size: 14px; }
.city-picker-search input::placeholder { color: rgba(255, 255, 255, 0.38); }
.city-picker-search input::-webkit-search-cancel-button { display: none; }
.city-picker-clear { color: rgba(255, 255, 255, 0.55); font-size: 22px; line-height: 1; }
.city-picker-section { margin-top: 24px; }
.city-picker-section-title { margin-bottom: 10px; color: rgba(255, 255, 255, 0.48); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; }
.city-picker-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.city-picker-chip { padding: 8px 14px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 999px; background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.82); font-size: 13px; }
.city-picker-city { display: flex; min-width: 0; align-items: center; gap: 10px; padding: 9px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px; background: rgba(255, 255, 255, 0.055); text-align: left; transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease; }
.city-picker-city:hover { border-color: rgba(199, 255, 31, 0.42); background: rgba(199, 255, 31, 0.08); }
.city-picker-city-mark { position: relative; display: flex; width: 56px; height: 56px; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; border-radius: 14px; background: rgba(199, 255, 31, 0.14); color: #c7ff1f; font-size: 20px; font-weight: 800; }
.city-picker-city-mark img { width: 100%; height: 100%; object-fit: cover; }
.city-picker-city--result { width: 100%; min-height: 116px; padding: 10px 12px; border-radius: 18px; }
.city-picker-city--result .city-picker-city-mark { width: 76px; height: 96px; border-radius: 15px; background: #10151e; }
.city-picker-city--result .city-picker-city-mark img { object-fit: contain; }
.city-picker-result-arrow { display: flex; width: 28px; height: 28px; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(199, 255, 31, 0.22); border-radius: 999px; color: #c7ff1f; font-size: 17px; line-height: 1; }
.city-picker-city--poster { position: relative; display: block; aspect-ratio: 4 / 5; min-height: 0; overflow: hidden; padding: 0; border-radius: 18px; background: #1c222d; }
.city-picker-city--poster:hover { transform: translateY(-2px); background: #1c222d; }
.city-picker-poster-image, .city-picker-poster-fallback, .city-picker-poster-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
.city-picker-poster-image { object-fit: contain; object-position: center; background: #10151e; transition: transform 0.35s ease; }
.city-picker-city--poster:hover .city-picker-poster-image { transform: scale(1.05); }
.city-picker-poster-fallback { display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(199, 255, 31, 0.28), rgba(25, 32, 44, 0.96)); color: #c7ff1f; font-size: 42px; font-weight: 800; }
.city-picker-poster-shade { background: linear-gradient(180deg, rgba(7, 11, 18, 0.02) 42%, rgba(7, 11, 18, 0.72) 100%); }
.city-picker-poster-content { position: absolute; right: 12px; bottom: 11px; left: 12px; text-align: left; }
.city-picker-back:active, .city-picker-clear:active, .city-picker-chip:active, .city-picker-city:active { transform: scale(0.97); }
</style>
