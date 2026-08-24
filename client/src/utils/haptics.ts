/**
 * Thin wrapper around the Vibration API.
 *
 * Supported on Android Chrome; iOS Safari does not implement `navigator.vibrate`
 * and silently no-ops. Calls are always safe: if the API is missing or the
 * pattern is rejected, nothing happens. Patterns are in milliseconds and can be
 * a single number or an on/off sequence.
 *
 * Chrome requires vibration to happen inside a user-gesture (transient
 * activation) window; calling it from a timer/callback outside that window logs
 * an "Intervention: Blocked call to navigator.vibrate" warning. We guard with a
 * first-interaction flag so page-initiated (non-gesture) calls are skipped
 * quietly instead of spamming the console.
 */
type VibratePattern = number | number[]

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** 页面是否已经发生过用户手势（pointerdown / keydown / touchstart）。 */
let userInteracted = false
if (typeof window !== 'undefined') {
  const markInteracted = () => { userInteracted = true }
  window.addEventListener('pointerdown', markInteracted, { once: true })
  window.addEventListener('keydown', markInteracted, { once: true })
  window.addEventListener('touchstart', markInteracted, { once: true })
}

function vibrate(pattern: VibratePattern): void {
  if (!isSupported() || !userInteracted) return
  try { navigator.vibrate(pattern) } catch { /* ignore */ }
}

/** Light tick — used when selecting a persona card. */
export function hapticLight(): void {
  vibrate(10)
}

/** Short bump — used when the slide-to-start knob crosses the unlock threshold. */
export function hapticSelect(): void {
  vibrate(18)
}

/** Success pattern — used when unlock completes. */
export function hapticSuccess(): void {
  vibrate([18, 40, 30])
}

/** Generic vibration with a custom pattern. */
export function haptic(pattern: VibratePattern): void {
  vibrate(pattern)
}
