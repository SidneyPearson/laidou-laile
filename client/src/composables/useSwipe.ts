import { ref } from 'vue'

export interface SwipeState {
  currentIndex: number
  isDragging: boolean
  offsetX: number
}

export function useSwipe(totalItems: number, onChange: (index: number) => void) {
  const state = ref<SwipeState>({
    currentIndex: 0,
    isDragging: false,
    offsetX: 0,
  })

  let startX = 0

  function onTouchStart(e: TouchEvent) {
    startX = e.touches[0].clientX
    state.value.isDragging = true
    state.value.offsetX = 0
  }

  function onTouchMove(e: TouchEvent) {
    if (!state.value.isDragging) return
    const dx = e.touches[0].clientX - startX
    state.value.offsetX = dx
  }

  function onTouchEnd() {
    state.value.isDragging = false
    const threshold = 60
    const dx = state.value.offsetX

    if (dx < -threshold && state.value.currentIndex < totalItems - 1) {
      state.value.currentIndex++
      onChange(state.value.currentIndex)
    } else if (dx > threshold && state.value.currentIndex > 0) {
      state.value.currentIndex--
      onChange(state.value.currentIndex)
    }

    state.value.offsetX = 0
  }

  function goTo(index: number) {
    if (index >= 0 && index < totalItems) {
      state.value.currentIndex = index
      onChange(index)
    }
  }

  return { state, onTouchStart, onTouchMove, onTouchEnd, goTo }
}
