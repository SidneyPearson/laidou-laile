<script setup lang="ts">
withDefaults(defineProps<{
  cityName: string
  ariaLabel?: string
}>(), {
  ariaLabel: '当前城市，点击更换',
})

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button type="button" class="city-location-button" :aria-label="ariaLabel" @click="emit('click')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 21s6-4.4 6-11a6 6 0 1 0-12 0c0 6.6 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
    <span>{{ cityName }}</span>
  </button>
</template>

<style scoped>
.city-location-button { box-sizing:border-box; display:inline-flex; width:78px; height:38px; min-width:0; align-items:center; justify-content:center; gap:4px; padding:0 5px; overflow:hidden; border:1px solid rgba(255,255,255,.18); border-radius:999px; background:rgba(18,24,34,.78); color:#fff; font-size:12px; font-weight:600; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); transition:transform .15s ease,background .2s ease; }
.city-location-button:active { background:rgba(18,24,34,.92); transform:scale(.96); }
.city-location-button svg { width:15px; height:15px; flex:none; color:#c7ff1f; }
.city-location-button span { max-width:4em; overflow:hidden; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
@media (max-width:370px) { .city-location-button { width:72px; padding:0 4px; }.city-location-button span { font-size:10px; } }
@media (prefers-reduced-motion:reduce) { .city-location-button,.city-location-button:active { transition:none; transform:none; } }
</style>
