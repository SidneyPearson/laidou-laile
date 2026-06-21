import { ref, type Ref } from 'vue'

export interface SwipeState {
  currentIndex: number
  isDragging: boolean
  isAnimating: boolean
  offsetX: number
  transitionDuration: number
}

export interface SwipeOptions {
  /** Min horizontal px to trigger a swipe (default 60) */
  threshold?: number
  /** Max allowed offset in px before damping (default 120) */
  maxOffset?: number
  /** Damping factor for excess offset (0-1, default 0.3) */
  dampingFactor?: number
  /** Snap-back animation duration in ms (default 300) */
  snapDuration?: number
}

export function useSwipe(
  totalItems: number,
  onChange: (index: number) => void,
  options?: SwipeOptions,
) {
  const { threshold = 60, maxOffset = 120, dampingFactor = 0.3, snapDuration = 300 } = options || {}

  const state = ref<SwipeState>({
    currentIndex: 0,
    isDragging: false,
    isAnimating: false,
    offsetX: 0,
    transitionDuration: 0,
  })

  let startX = 0
  let startY = 0
  let isHorizontal: boolean | null = null // null = undetermined
  let primaryIdentifier: number | null = null

  function getClientX(e: TouchEvent | PointerEvent): number {
    if ('touches' in e) {
      // Find the tracked touch
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === primaryIdentifier) return e.touches[i].clientX
      }
      return e.touches[0]?.clientX || 0
    }
    return (e as PointerEvent).clientX
  }

  function getClientY(e: TouchEvent | PointerEvent): number {
    if ('touches' in e) {
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === primaryIdentifier) return e.touches[i].clientY
      }
      return e.touches[0]?.clientY || 0
    }
    return (e as PointerEvent).clientY
  }

  function applyDamping(rawDx: number): number {
    const absDx = Math.abs(rawDx)
    const sign = rawDx > 0 ? 1 : -1
    if (absDx <= maxOffset) return rawDx
    return sign * (maxOffset + (absDx - maxOffset) * dampingFactor)
  }

  function clampIndex(index: number): number {
    return Math.max(0, Math.min(totalItems - 1, index))
  }

  // ── Touch handlers ────────────────────────

  function onTouchStart(e: TouchEvent) {
    if (state.value.isDragging || state.value.isAnimating) return
    primaryIdentifier = e.touches[0]?.identifier ?? null
    startX = e.touches[0]?.clientX ?? 0
    startY = e.touches[0]?.clientY ?? 0
    isHorizontal = null
    state.value.isDragging = true
    state.value.offsetX = 0
    state.value.transitionDuration = 0
  }

  function onTouchMove(e: TouchEvent) {
    if (!state.value.isDragging) return

    const dx = getClientX(e) - startX
    const dy = getClientY(e) - startY

    // Determine scroll direction on first significant move
    if (isHorizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isHorizontal = Math.abs(dx) > Math.abs(dy)
    }
    // If vertical scroll, let it pass through
    if (isHorizontal === false) return

    // Block page scroll when swiping horizontally
    if (isHorizontal) e.preventDefault()

    // Apply edge clamping + damping
    const ci = state.value.currentIndex
    let clampedDx = dx
    if (ci === 0 && dx > 0) clampedDx = applyDamping(dx) // at first card, damp right swipe
    else if (ci === totalItems - 1 && dx < 0) clampedDx = applyDamping(dx) // at last card, damp left swipe
    else clampedDx = applyDamping(dx)

    state.value.offsetX = clampedDx
  }

  function onTouchEnd(e: TouchEvent) {
    if (!state.value.isDragging) return
    state.value.isDragging = false

    const dx = state.value.offsetX

    if (Math.abs(dx) >= threshold) {
      // Swipe triggered
      if (dx < 0 && state.value.currentIndex < totalItems - 1) {
        state.value.currentIndex++
      } else if (dx > 0 && state.value.currentIndex > 0) {
        state.value.currentIndex--
      }
      state.value.currentIndex = clampIndex(state.value.currentIndex)
      onChange(state.value.currentIndex)
    }

    // Animate back to 0
    state.value.isAnimating = true
    state.value.offsetX = 0
    state.value.transitionDuration = snapDuration
    setTimeout(() => {
      state.value.isAnimating = false
      state.value.transitionDuration = 0
    }, snapDuration)

    isHorizontal = null
    primaryIdentifier = null
  }

  // ── Pointer handlers (mouse / pen) ────────

  function onPointerDown(e: PointerEvent) {
    if (state.value.isDragging || state.value.isAnimating) return
    if (e.pointerType === 'touch') return // let touch handlers deal with it
    primaryIdentifier = null
    startX = e.clientX
    startY = e.clientY
    isHorizontal = null
    state.value.isDragging = true
    state.value.offsetX = 0
    state.value.transitionDuration = 0
    ;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: PointerEvent) {
    if (!state.value.isDragging || e.pointerType === 'touch') return
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (isHorizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isHorizontal = Math.abs(dx) > Math.abs(dy)
    }
    if (isHorizontal === false) return

    if (isHorizontal) e.preventDefault()

    const ci = state.value.currentIndex
    let clampedDx = dx
    if (ci === 0 && dx > 0) clampedDx = applyDamping(dx)
    else if (ci === totalItems - 1 && dx < 0) clampedDx = applyDamping(dx)
    else clampedDx = applyDamping(dx)

    state.value.offsetX = clampedDx
  }

  function onPointerUp(e: PointerEvent) {
    if (!state.value.isDragging || e.pointerType === 'touch') return
    state.value.isDragging = false

    const dx = state.value.offsetX

    if (Math.abs(dx) >= threshold) {
      if (dx < 0 && state.value.currentIndex < totalItems - 1) {
        state.value.currentIndex++
      } else if (dx > 0 && state.value.currentIndex > 0) {
        state.value.currentIndex--
      }
      state.value.currentIndex = clampIndex(state.value.currentIndex)
      onChange(state.value.currentIndex)
    }

    state.value.isAnimating = true
    state.value.offsetX = 0
    state.value.transitionDuration = snapDuration
    setTimeout(() => {
      state.value.isAnimating = false
      state.value.transitionDuration = 0
    }, snapDuration)

    isHorizontal = null
  }

  function goTo(index: number) {
    if (index >= 0 && index < totalItems) {
      state.value.currentIndex = index
      onChange(index)
    }
  }

  return {
    state: state as Readonly<Ref<SwipeState>>,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    goTo,
  }
}
