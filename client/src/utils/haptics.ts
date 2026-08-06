/**
 * Thin wrapper around the Vibration API.
 *
 * Supported on Android Chrome; iOS Safari does not implement `navigator.vibrate`
 * and silently no-ops. Calls are always safe: if the API is missing or the
 * pattern is rejected, nothing happens. Patterns are in milliseconds and can be
 * a single number or an on/off sequence.
 */
type VibratePattern = number | number[]

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** Light tick — used when selecting a persona card. */
export function hapticLight(): void {
  if (!isSupported()) return
  try { navigator.vibrate(10) } catch { /* ignore */ }
}

/** Short bump — used when the slide-to-start knob crosses the unlock threshold. */
export function hapticSelect(): void {
  if (!isSupported()) return
  try { navigator.vibrate(18) } catch { /* ignore */ }
}

/** Success pattern — used when unlock completes. */
export function hapticSuccess(): void {
  if (!isSupported()) return
  try { navigator.vibrate([18, 40, 30]) } catch { /* ignore */ }
}

/** Generic vibration with a custom pattern. */
export function haptic(pattern: VibratePattern): void {
  if (!isSupported()) return
  try { navigator.vibrate(pattern) } catch { /* ignore */ }
}
