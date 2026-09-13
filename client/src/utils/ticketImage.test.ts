import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeTicket, loadTicketImage } from './ticketImage'

class PendingImage {
  static instances: PendingImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''
  crossOrigin = ''
  constructor() { PendingImage.instances.push(this) }
  removeAttribute() { this.src = '' }
}
beforeEach(() => {
  vi.useFakeTimers()
  PendingImage.instances = []
  vi.stubGlobal('Image', PendingImage)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('ticket image deadlines', () => {
  it('stops waiting even when a server emits neither load nor error', async () => {
    const pending = loadTicketImage(['https://example.test/image'], new AbortController().signal)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await pending).toBeNull()
    expect(PendingImage.instances[0].onload).toBeNull()
    expect(PendingImage.instances[0].src).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('loads the fallback after an unresponsive primary image', async () => {
    const pending = loadTicketImage(['primary', 'fallback'], new AbortController().signal)
    await vi.advanceTimersByTimeAsync(3000)
    const fallback = PendingImage.instances[1]
    expect(fallback.src).toBe('fallback')
    fallback.onload?.()
    expect(await pending).toBe(fallback)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels pending work when the sheet closes without starting fallback', async () => {
    const controller = new AbortController()
    const pending = loadTicketImage(['primary', 'fallback'], controller.signal)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
    expect(PendingImage.instances).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('bounds canvas encoding when the browser never calls back', async () => {
    const canvas = { toBlob: vi.fn() } as unknown as HTMLCanvasElement
    const pending = encodeTicket(canvas, new AbortController().signal)
    const assertion = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(4000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
})
