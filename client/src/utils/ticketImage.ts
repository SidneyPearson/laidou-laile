/** 图片服务无响应时按时降级，避免把票根操作锁在“正在生成”。 */
export async function loadTicketImage(
  sources: (string | undefined)[],
  signal: AbortSignal,
  timeoutMs = 3000,
): Promise<HTMLImageElement | null> {
  for (const source of [...new Set(sources.filter(Boolean))] as string[]) {
    const image = await new Promise<HTMLImageElement | null>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
      const candidate = new Image()
      const finish = (value: HTMLImageElement | null, aborted = false) => {
        clearTimeout(timer)
        candidate.onload = null
        candidate.onerror = null
        signal.removeEventListener('abort', abort)
        if (!value) candidate.removeAttribute('src')
        if (aborted) reject(new DOMException('Cancelled', 'AbortError'))
        else resolve(value)
      }
      const abort = () => finish(null, true)
      const timer = setTimeout(() => finish(null), timeoutMs)
      signal.addEventListener('abort', abort, { once: true })
      candidate.crossOrigin = 'anonymous'
      candidate.onload = () => finish(candidate)
      candidate.onerror = () => finish(null)
      candidate.src = source
    })
    if (image) return image
  }
  return null
}

export function encodeTicket(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('Image encoding timed out')) }, 4000)
    signal.addEventListener('abort', abort, { once: true })
    try {
      canvas.toBlob(blob => {
        cleanup()
        if (blob) resolve(blob)
        else reject(new Error('Image could not be encoded'))
      }, 'image/png')
    } catch (error) { cleanup(); reject(error) }
  })
}
