<script setup lang="ts">
import { computed } from 'vue'
import type { CityContextResponse } from '../../services/exploreApi'
import type { RecommendationCity } from '../../repositories/cityRecommendations'
import { homepageAssets } from '../../assets/homepage'

const props = defineProps<{
  city: RecommendationCity | null
  weather: CityContextResponse['weather']
  weatherLoading: boolean
}>()

const emit = defineEmits<{
  'open-picker': []
  'use-location': []
}>()

const cityName = computed(() => {
  const name = props.city?.name
  if (!name || name === '当前城市' || name === '你的城市') return '上海'
  return name.replace(/市$/, '')
})

const heroUrl = computed(() => homepageAssets.hero)

// True once we have any coordinates to work with — either a resolved city or
// a transient "use my location" result. Basing this on coordinates (instead
// of the resolved name) means the weather pill keeps working even when reverse
// geocoding the city name fails on slow/mobile networks.
const citySelected = computed(() => !!props.city?.center)

// The hero is a bundled CDN asset; if it fails to decode for any reason, hide
// it and let the CSS gradient backdrop keep the layout readable.
function onCoverError(e: Event) {
  const img = e.target as HTMLImageElement | null
  if (img) img.style.visibility = 'hidden'
}

const weatherTemp = computed(() => (props.weather?.temperature ? `${props.weather.temperature}°` : '--'))
const weatherDesc = computed(() => {
  if (props.weatherLoading) return '加载中'
  if (!props.weather) return '定位后显示'
  return props.weather.weather || '天气'
})
</script>

<template>
  <section class="home-hero">
    <img
      :src="heroUrl"
      :alt="`${cityName}封面`"
      class="hero-cover-img"
      fetchpriority="high"
      @error="onCoverError"
    >
    <div class="hero-overlay" aria-hidden="true" />
    <div class="hero-vignette" aria-hidden="true" />

    <div class="hero-content">
      <!-- Top bar: brand | search | city + weather pills (all on one row) -->
      <header class="topbar">
        <div class="brand">
          <strong>来都来了</strong>
          <em>City Inspiration</em>
        </div>

        <button class="hot-city" aria-label="选择热门城市" @click="emit('open-picker')">
          <svg class="hot-city-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2c1.5 3 4 4.5 4 8a4 4 0 1 1-8 0c0-1.2.4-2.2 1-3-.2 1.4.6 2.4 1.6 2.4C11.8 9.4 12 6 12 2Z" />
            <path d="M7.5 15.5C8.5 18 10 20 12 20s3.5-2 4.5-4.5" />
          </svg>
          <span class="hot-city-text">热门城市</span>
        </button>

        <div class="topbar-pills">
          <!-- Location pill is the button: tapping it opens the same location
               sheet as the first-visit popup (use my location / pick city). -->
          <button class="top-pill top-pill--loc" aria-label="当前定位城市，点击更换" @click="emit('use-location')">
            <svg class="top-pill-ico top-pill-ico--accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s6-4.4 6-11a6 6 0 1 0-12 0c0 6.6 6 11 6 11Z" />
              <circle cx="12" cy="10" r="2" />
            </svg>
            <span class="top-pill-cityname">{{ cityName }}</span>
          </button>

          <!-- Weather pill is a static display, not a button. -->
          <div class="top-pill top-pill--weather">
            <svg class="top-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 15.5" />
            </svg>
            <span class="top-pill-temp">{{ citySelected ? weatherTemp : '--' }}</span>
            <small v-if="citySelected" class="top-pill-desc">{{ weatherDesc }}</small>
          </div>
        </div>
      </header>

    </div>

    <!-- Core hero copy — direct child of .home-hero so `bottom` resolves
         against the full hero height (not the topbar-only .hero-content). -->
    <div class="hero-copy">
      <p class="eyebrow">今天</p>
      <h1>去哪儿探索</h1>
      <p>为你推荐最适合此刻的城市体验</p>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  --accent: #c7ff1f;
  position: relative;
  /* Shortened from the prototype's 640px so the persona panel below sits
     roughly 1/4 page higher on first scroll. */
  min-height: 480px;
  padding: 18px 12px 0;
  /* Matches the prototype: top-down darkening + cover photo, focal point on
     the Lujiazui cluster. */
  background:
    linear-gradient(to bottom, rgba(2,7,14,.58) 0%, rgba(2,7,14,.12) 30%, rgba(2,7,14,.30) 62%, #02070e 100%);
  isolation: isolate;
  overflow: hidden;
}

.hero-cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Raised: a larger vertical % crops more sky off the top and lifts the
     Lujiazui skyline closer to the top bar. */
  object-position: 59% 53%;
  z-index: -2;
  transform: scale(1.04);
  animation: hero-zoom 18s ease-out forwards;
}

@keyframes hero-zoom {
  from { transform: scale(1.04); }
  to { transform: scale(1.10); }
}

@media (prefers-reduced-motion: reduce) {
  .hero-cover-img { animation: none; }
}

.hero-overlay {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(to bottom, rgba(2,7,14,.58) 0%, rgba(2,7,14,.12) 30%, rgba(2,7,14,.30) 62%, #02070e 100%);
}

.hero-vignette {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(circle at 50% 18%, transparent 0 26%, rgba(1,5,10,.12) 60%, rgba(1,5,10,.44) 100%);
  pointer-events: none;
}

.hero-content {
  position: relative;
  padding-top: max(2px, env(safe-area-inset-top));
}

/* ===== Top bar ===== */
.topbar {
  position: relative;
  z-index: 5;
  display: grid;
  /* brand | search | compact city + weather pills */
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.brand strong {
  display: block;
  font-size: 19px;
  line-height: 1;
  letter-spacing: -0.5px;
  color: #fff;
}

.brand em {
  display: block;
  margin-top: 4px;
  color: var(--accent);
  font-size: 12px;
  font-style: italic;
  font-weight: 600;
  letter-spacing: 0.3px;
  /* System serif stack for an elegant, editorial look — zero network cost. */
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Palatino', Georgia, 'Songti SC', 'STSong', serif;
}

/* The middle control is now a "hot city" pill: tapping it jumps straight into
   the city explore page (replacing the old placeholder search bar). */
.hot-city {
  height: 38px;
  min-width: 0;
  max-width: 100%;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(26, 34, 47, 0.78);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px 0 13px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.2s ease, transform 0.15s ease;
}

.hot-city:active {
  background: rgba(26, 34, 47, 0.92);
  transform: scale(0.97);
}

.hot-city-ico {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: var(--accent);
}

.hot-city-text {
  white-space: nowrap;
}

.hot-city-chev {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  opacity: 0.75;
}

/* Two compact pills to the right of the search bar, vertically centered with
   it (city switcher + weather/location), replacing the old side column. */
.topbar-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.top-pill {
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(18, 24, 34, 0.78);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  transition: transform 0.15s ease, background 0.2s ease;
}

.top-pill:active {
  transform: scale(0.96);
  background: rgba(18, 24, 34, 0.92);
}

.top-pill--weather {
  padding: 0 10px;
  /* Fixed min width so the pill doesn't shift when the text changes between
     "定位" / "加载中" / "33° 大雨". */
  min-width: 86px;
  justify-content: center;
}

/* The weather pill is a static display (not a button) — no press feedback,
   default cursor. The tappable location control is the city pill. */
.top-pill--weather {
  cursor: default;
}
.top-pill--weather:active {
  transform: none;
  background: rgba(18, 24, 34, 0.78);
}

.top-pill-ico {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.92);
}

.top-pill-ico--accent {
  color: var(--accent);
}

.top-pill-cityname {
  max-width: 3.2em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-pill-chev {
  width: 10px;
  height: 10px;
  opacity: 0.7;
}

.top-pill-temp {
  line-height: 1;
}

.top-pill-desc {
  margin-left: 2px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 10px;
  font-weight: 500;
}

/* ===== Hero copy ===== */
.hero-copy {
  position: absolute;
  z-index: 3;
  left: 16px;
  right: 16px;
  /* Raised so the title sits in the mid-hero (clears the persona panel whose
     top overlaps 72px above the hero bottom). */
  bottom: 284px;
  animation: hero-rise 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes hero-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

.eyebrow {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.86);
}

.hero-copy h1 {
  margin: 5px 0 0;
  font-size: 38px;
  line-height: 1.05;
  letter-spacing: -1.5px;
  color: #fff;
  font-weight: 800;
}

.hero-copy p {
  max-width: 280px;
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  line-height: 1.6;
}

/* ===== Narrow screens (≤370) ===== */
@media (max-width: 370px) {
  .hero-copy h1 {
    font-size: 34px;
  }
  .brand strong {
    font-size: 17px;
  }
  .hot-city {
    padding: 0 8px 0 9px;
  }
  .hot-city-label strong {
    font-size: 12px;
  }
  .top-pill {
    padding: 0 7px;
  }
}
</style>
