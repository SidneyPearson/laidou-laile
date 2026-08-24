<script setup lang="ts">
import type { SpotTheme } from '../../types/explore'

export interface InspirationCard {
  /** Stable key for v-for. */
  key: string
  title: string
  tag: string
  tagline: string
  district: string
  /** Pre-formatted distance ("800m" / "2.3km"); empty when unavailable. */
  distanceLabel: string
  image: string
  /** Theme drives the gradient backdrop used when there is no cover image. */
  theme?: SpotTheme
  /** Tailwind-ish tint for the category tag. */
  tone?: 'lime' | 'violet' | 'orange' | 'sky'
  /** True when this card maps back to a verified server spot (click opens
   *  the real detail sheet). False = demo card (click routes to city). */
  verified: boolean
}

defineProps<{
  cards: InspirationCard[]
  loading: boolean
}>()

const emit = defineEmits<{
  select: [card: InspirationCard]
}>()

// If a cover URL fails to load, hide the <img> so the theme-gradient backdrop
// (always rendered behind it) shows through instead of a broken-image icon.
function onImgError(e: Event) {
  const img = e.target as HTMLImageElement | null
  if (img) img.style.display = 'none'
}
</script>

<template>
  <section>
    <div class="section-head">
      <h2>灵感推荐</h2>
    </div>

    <div v-if="loading" class="rail scroll-smooth-ios">
      <div
        v-for="n in 4"
        :key="n"
        class="rec-card-skeleton"
      />
    </div>

    <div v-else-if="cards.length === 0" class="empty">
      <div class="empty-inner">
        <p>暂时没有灵感，换个画像或城市试试</p>
      </div>
    </div>

    <div v-else class="rail scroll-smooth-ios">
      <button
        v-for="card in cards"
        :key="card.key"
        class="rec-card"
        :class="`rec-card--${card.theme ?? 'city'}`"
        :aria-label="`查看${card.title}的详情`"
        @click="emit('select', card)"
      >
        <img
          v-if="card.image"
          :src="card.image"
          :alt="card.title"
          class="rec-img"
          loading="lazy"
          decoding="async"
          @error="onImgError"
        >
        <span class="rec-gradient" aria-hidden="true" />

        <span class="rec-tag" :class="`rec-tag--${card.tone ?? 'lime'}`">
          {{ card.tag }}
        </span>

        <span v-if="!card.verified" class="rec-demo">示例</span>

        <span class="rec-info">
          <strong>{{ card.title }}</strong>
          <p>{{ card.tagline }}</p>
          <small>
            <template v-if="card.distanceLabel">
              <svg class="inline h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 21s6-4.4 6-11a6 6 0 1 0-12 0c0 6.6 6 11 6 11Z" />
                <circle cx="12" cy="10" r="2" />
              </svg>
              {{ card.distanceLabel }} · {{ card.district }}
            </template>
            <template v-else>{{ card.district }}</template>
          </small>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.section-head {
  display: flex;
  align-items: center;
  padding: 0 14px;
  margin-bottom: 12px;
}

.section-head h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
  color: #fff;
}

/* Horizontal rail: two full cards plus a ~20px peek of the next card so the
   swipe affordance is obvious. Rail content is W-28; with a 10px gap and a
   20px peek, each card is (W-58)/2 = (100% - 30px)/2. Bounded by page
   overflow-x:hidden, so no page-level scrollbar. */
.rail {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 14px 6px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  /* 骨架 → 内容淡入（数据加载完才出现） */
  animation: rail-in 0.3s ease both;
}
@keyframes rail-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .rail {
    animation: none;
  }
}
.rail::-webkit-scrollbar { display: none; }

.rec-card {
  position: relative;
  flex: 0 0 auto;
  width: calc((100% - 30px) / 2);
  height: 188px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 19px;
  background: #11161f;
  text-align: left;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease;
}

.rec-card:active {
  transform: scale(0.98);
}

/* Gradient backdrops for spots without a cover image (mirrors SpotCover's
   theme palettes so cards stay visually rich instead of grey placeholders). */
.rec-card--river {
  background: linear-gradient(165deg, #7f9eb2 0%, #bdd1cc 45%, #d28b67 100%);
}
.rec-card--lane {
  background: linear-gradient(145deg, #5b6f58, #c5aa83);
}
.rec-card--museum {
  background: linear-gradient(145deg, #9c9b93, #d7d3c7);
}
.rec-card--wonderland {
  background: linear-gradient(145deg, #7f77a8, #e69a88);
}
.rec-card--garden {
  background: linear-gradient(145deg, #b8c99f, #648976);
}
.rec-card--market {
  background: linear-gradient(145deg, #9e614f, #d4a36e);
}
.rec-card--city {
  background: linear-gradient(145deg, #748890, #b0a18f);
}
.rec-card--night {
  background: linear-gradient(145deg, #353f54, #815d67);
}

.rec-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rec-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.03) 28%, rgba(2, 7, 12, 0.18) 49%, rgba(2, 7, 12, 0.96) 100%);
}

.rec-tag {
  position: absolute;
  z-index: 2;
  top: 10px;
  left: 10px;
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.rec-tag--lime   { color: #0d1708; background: #c7ff1f; }
.rec-tag--violet { color: #fff;    background: #6d5efc; }
.rec-tag--orange { color: #2a1206; background: #ff8a3d; }
.rec-tag--sky    { color: #04223a; background: #38bdf8; }

/* 非已验证（示例/演示）卡片的角标，避免用户把示例数据当成真实内容 */
.rec-demo {
  position: absolute;
  z-index: 3;
  top: 10px;
  right: 10px;
  padding: 4px 9px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: rgba(2, 7, 14, 0.5);
  color: rgba(255, 255, 255, 0.92);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.rec-info {
  position: absolute;
  z-index: 2;
  left: 12px;
  right: 10px;
  bottom: 11px;
  display: block;
}

.rec-info strong {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.rec-info p {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.68);
  font-size: 10px;
  line-height: 1.35;
  /* The admin `reason` can be long; clamp to two lines to keep cards uniform. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.rec-info small {
  display: block;
  margin-top: 7px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
}

.rec-card-skeleton {
  flex: 0 0 auto;
  width: calc((100% - 30px) / 2);
  height: 188px;
  border-radius: 19px;
  background: rgba(255, 255, 255, 0.06);
}

.empty {
  padding: 0 14px;
}
.empty-inner {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 19px;
  background: rgba(255, 255, 255, 0.04);
  padding: 28px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
}
</style>
