<script setup lang="ts">
/**
 * "Slide to start" control. The knob sits at the left in a locked state; the
 * user drags it right to unlock, which emits `unlock` (the parent navigates to
 * the explore page). Works with touch and mouse via Pointer Events.
 *
 * Tapping alone does nothing — the intentional drag is the interaction. If the
 * drag is released before the threshold the knob springs back.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { hapticSelect, hapticSuccess } from '../../utils/haptics'

const props = defineProps<{
  disabled?: boolean
  /** Locked-state hint shown centered in the track. */
  hint?: string
  /** Shown in the filled portion once unlocked is near. */
  readyHint?: string
}>()

const emit = defineEmits<{ unlock: [] }>()

const track = ref<HTMLElement | null>(null)
const dragging = ref(false)
const offset = ref(0) // px the knob is translated from the left
const unlocked = ref(false)
let maxOffset = 0
let startX = 0
let pointerId: number | null = null
const thresholdReached = ref(false) // fires the threshold haptic once per drag

const TRIGGER_RATIO = 0.72

function recomputeMax() {
  if (!track.value) return
  const style = getComputedStyle(track.value)
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const knob = track.value.querySelector('.slide-knob') as HTMLElement | null
  const knobW = knob ? knob.offsetWidth : 56
  maxOffset = track.value.clientWidth - padX - knobW
  if (!dragging.value) offset.value = 0
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled || unlocked.value) return
  // Only start when pressing the knob itself.
  const target = e.target as HTMLElement
  if (!target.closest('.slide-knob')) return
  recomputeMax()
  if (maxOffset <= 0) return
  dragging.value = true
  startX = e.clientX
  pointerId = e.pointerId
  thresholdReached.value = false
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pointerId) return
  const next = Math.min(maxOffset, Math.max(0, e.clientX - startX))
  offset.value = next
  // One-time bump when the knob first crosses the unlock threshold.
  const past = maxOffset > 0 && next >= maxOffset * TRIGGER_RATIO
  if (past && !thresholdReached.value) {
    thresholdReached.value = true
    hapticSelect()
  } else if (!past && thresholdReached.value) {
    thresholdReached.value = false
  }
}

function finishDrag() {
  if (!dragging.value) return
  dragging.value = false
  pointerId = null
  if (maxOffset > 0 && offset.value >= maxOffset * TRIGGER_RATIO) {
    unlocked.value = true
    offset.value = maxOffset
    hapticSuccess()
    emit('unlock')
    return
  }
  // spring back
  thresholdReached.value = false
  offset.value = 0
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  finishDrag()
}
function onPointerCancel(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  dragging.value = false
  pointerId = null
  thresholdReached.value = false
  offset.value = 0
}

onMounted(() => {
  recomputeMax()
  window.addEventListener('resize', recomputeMax)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', recomputeMax)
})

const progress = () => (maxOffset > 0 ? Math.min(1, offset.value / maxOffset) : 0)
const pastThreshold = () => maxOffset > 0 && offset.value >= maxOffset * TRIGGER_RATIO
const hintText = () => {
  if (unlocked.value) return props.readyHint || '已解锁'
  if (dragging.value && pastThreshold()) return '松开解锁'
  return props.hint || '向右滑动开始'
}
</script>

<template>
  <div
    ref="track"
    class="slide-track"
    :class="{ 'is-disabled': disabled, 'is-dragging': dragging, 'is-unlocked': unlocked }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <span class="slide-fill" :style="{ width: `${offset + 52}px` }" aria-hidden="true" />

    <span class="slide-hint" :class="{ 'is-ready': pastThreshold() }">{{ hintText() }}</span>

    <span
      class="slide-knob"
      :class="{ 'slide-knob--ready': thresholdReached }"
      :style="{ transform: `translateX(${offset}px)` }"
      role="slider"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="Math.round(progress() * 100)"
      aria-label="滑动开始探索"
      :aria-disabled="disabled || unlocked"
    >
      <svg v-if="!unlocked" class="slide-knob-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M13 5l7 7-7 7" />
      </svg>
      <svg v-else class="slide-knob-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12l5 5 9-11" />
      </svg>
    </span>
  </div>
</template>

<style scoped>
.slide-track {
  position: relative;
  display: flex;
  align-items: center;
  height: 64px;
  padding: 6px;
  border-radius: 999px;
  background: #e9f79c;
  box-shadow: 0 12px 30px rgba(199, 255, 31, 0.28);
  overflow: hidden;
  user-select: none;
  touch-action: none;
  -webkit-user-select: none;
  cursor: default;
}

.slide-track.is-disabled {
  opacity: 0.55;
  box-shadow: none;
}

/* The filled (darker accent) region that grows behind the knob as it slides. */
.slide-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: linear-gradient(90deg, #d8f25a 0%, #c7ff1f 100%);
  border-radius: 999px;
  transition: width 0s;
}

.slide-hint {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 800;
  color: #2a3510;
  letter-spacing: 3px;
  pointer-events: none;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.is-unlocked .slide-hint {
  opacity: 0;
}

.slide-hint.is-ready {
  color: #0c1204;
  opacity: 0.92;
}

.slide-knob {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #0c1204;
  color: var(--accent, #c7ff1f);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
  cursor: grab;
}

.is-dragging .slide-knob {
  transition: none;
  cursor: grabbing;
}

.slide-knob-ico {
  width: 22px;
  height: 22px;
}

/* A pulsing glow ring appears when the knob crosses the unlock threshold,
   reinforcing the haptic bump. Uses box-shadow (not transform) so it doesn't
   fight the inline translateX positioning the drag applies. */
.slide-knob--ready {
  animation: knob-ring 0.5s ease;
  box-shadow: 0 0 0 6px rgba(199, 255, 31, 0.22), 0 4px 14px rgba(0, 0, 0, 0.28);
}

@keyframes knob-ring {
  0% { box-shadow: 0 0 0 0 rgba(199, 255, 31, 0.45), 0 4px 14px rgba(0, 0, 0, 0.28); }
  100% { box-shadow: 0 0 0 10px rgba(199, 255, 31, 0), 0 4px 14px rgba(0, 0, 0, 0.28); }
}

.is-unlocked .slide-knob {
  color: var(--accent, #c7ff1f);
}
</style>
