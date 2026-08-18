<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Persona } from '../../types/explore'
import type { HomePersonaCard } from '../../repositories/homePersonas'
import { hapticLight } from '../../utils/haptics'

const props = defineProps<{
  modelValue: Persona
  cards: HomePersonaCard[]
}>()

const emit = defineEmits<{
  'update:modelValue': [persona: Persona]
}>()

const track = ref<HTMLElement | null>(null)

// 每个画像一张专属渐变，图片缺失/加载失败时兜底，避免串图（原先统一回退到
// 「情侣」图，亲子/懒人卡片会显示错配封面）。
const PERSONA_FALLBACK: Record<Persona, string> = {
  fast: 'linear-gradient(145deg, #9e614f, #d4a36e)',
  couple: 'linear-gradient(145deg, #e69a88, #7f77a8)',
  family: 'linear-gradient(145deg, #b8c99f, #648976)',
  lazy: 'linear-gradient(145deg, #748890, #b0a18f)',
  urban: 'linear-gradient(145deg, #353f54, #815d67)',
}

// The scroll row is full-viewport width (the panel's negative side margins
// cancel its parent padding), with 14px padding each side and 8px gaps.
// Cards are sized so three fit across with a sliver of the fourth peeking on
// the right, signalling horizontal scroll (instead of wrapping to a row).
const CARD_GAP = 8 // matches .persona-track gap
const SIDE_PAD = 14 // matches .persona-scroll padding
const PEEK = 22 // px of the next card visible as a scroll hint
const cardStyle = computed<Record<string, string>>(() => {
  // Visible width = vw - 2*side. 3 full cards + 2 gaps between them, leaving a
  // PEEK-width sliver of the fourth card as the horizontal-scroll hint.
  const width = `calc((100vw - ${2 * SIDE_PAD + 2 * CARD_GAP + PEEK}px) / 3)`
  return { width, flex: '0 0 auto' }
})

function onImgError(e: Event) {
  const img = e.target as HTMLImageElement | null
  if (!img) return
  // 隐藏图片露出下方画像渐变，不再回退到别的画像的图。
  img.style.display = 'none'
}

const cardBackground = (id: Persona) => PERSONA_FALLBACK[id] ?? PERSONA_FALLBACK.lazy

function select(card: HomePersonaCard) {
  if (card.id !== props.modelValue) hapticLight()
  emit('update:modelValue', card.id)
}

// Keep the selected card in view (e.g. when the 5th "都市丽人" is enabled and
// chosen, or when persona is restored from storage and sits off-screen).
function scrollSelectedIntoView(behavior: ScrollBehavior = 'smooth') {
  const el = track.value?.querySelector<HTMLElement>('.persona-card--selected')
  el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior })
}

watch(() => props.modelValue, () => nextTick(scrollSelectedIntoView))
watch(() => props.cards.length, () => nextTick(() => scrollSelectedIntoView('instant' as ScrollBehavior)), { immediate: true })
</script>

<template>
  <div class="persona-scroll">
    <div ref="track" class="persona-track">
    <button
      v-for="card in cards"
      :key="card.id"
      class="persona-card"
      :class="{ 'persona-card--selected': modelValue === card.id }"
      :style="[cardStyle, { background: cardBackground(card.id) }]"
      :aria-pressed="modelValue === card.id"
      @click="select(card)"
    >
      <img
        :src="card.imageUrl"
        :alt="card.title"
        class="persona-img"
        loading="lazy"
        decoding="async"
        @error="onImgError"
      >
      <span class="persona-shade" aria-hidden="true" />

      <span class="persona-text">
        <strong>{{ card.title }}</strong>
        <small>{{ card.tagline }}</small>
      </span>

      <span
        v-if="modelValue === card.id"
        class="persona-check"
        aria-hidden="true"
      >
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12l5 5 9-11" />
        </svg>
      </span>
    </button>
    </div>
  </div>
</template>

<style scoped>
/* Horizontal snap-scrolling row. With 4 cards they fit flush; when a 5th is
   enabled the cards narrow so the 5th peeks ~28px, hinting at horizontal
   scroll instead of wrapping to a second row. */
.persona-scroll {
  margin: 0 -14px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-padding-left: 14px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.persona-scroll::-webkit-scrollbar { display: none; }

.persona-track {
  display: flex;
  gap: 8px;
  padding: 4px 14px;
}

.persona-card {
  position: relative;
  height: 130px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  background: #1a1f2a;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  scroll-snap-align: start;
  transition: transform 0.15s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.persona-card:active {
  transform: scale(0.97);
}

.persona-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.persona-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.04) 25%, rgba(1, 5, 9, 0.30) 54%, rgba(1, 5, 9, 0.96) 100%);
}

.persona-text {
  position: absolute;
  z-index: 2;
  left: 9px;
  right: 7px;
  bottom: 9px;
  text-align: left;
}

.persona-text strong {
  display: block;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.15;
  color: #fff;
}

.persona-text small {
  display: block;
  margin-top: 3px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 9px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Keep a 1px border always so selecting (which adds an outer ring via
   box-shadow) doesn't shift siblings in the scroll row. */
.persona-card--selected {
  border-color: var(--accent, #c7ff1f);
  box-shadow:
    0 0 0 1.5px var(--accent, #c7ff1f),
    0 8px 26px rgba(176, 255, 31, 0.18);
}

.persona-check {
  position: absolute;
  z-index: 4;
  right: 6px;
  bottom: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #071006;
  background: var(--accent, #c7ff1f);
  box-shadow: 0 4px 10px rgba(199, 255, 31, 0.4);
}

@media (max-width: 370px) {
  .persona-track { gap: 6px; }
  .persona-text strong { font-size: 12px; }
  .persona-text small { font-size: 8px; }
}
</style>
