/**
 * Dev-only image upload for the 首页画像 admin page.
 *
 * Compresses a chosen image in the browser (canvas → JPEG, longest edge capped
 * to the card's target size) and POSTs it to the Vite dev middleware, which
 * writes the JPEG into client/src/assets/homepage/ and reloads.
 *
 * This is a LOCAL BUILD-TIME workflow: the endpoint only exists on the Vite dev
 * server (it is stripped from the production build), and the admin UI only
 * shows the control in dev.
 */
import { localPersonaImage } from '../assets/homepage/local-images'

export const localImageUploadEnabled = import.meta.env.DEV

export interface LocalUploadResult {
  ok: boolean
  id: string
  file: string
  bytes: number
  maxEdge: number
}

/** Downscale so the longest edge is <= maxEdge, preserving aspect ratio. */
function targetSize(width: number, height: number, maxEdge: number): { w: number; h: number } {
  if (width <= maxEdge && height <= maxEdge) return { w: width, h: height }
  return width >= height
    ? { w: maxEdge, h: Math.round((height * maxEdge) / width) }
    : { w: Math.round((width * maxEdge) / height), h: maxEdge }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolveUrl(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolveImg, reject) => {
    const img = new Image()
    img.onload = () => resolveImg(img)
    img.onerror = () => reject(new Error('DECODE_FAILED'))
    img.src = src
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolveBlob, reject) => {
    canvas.toBlob(
      blob => (blob ? resolveBlob(blob) : reject(new Error('ENCODE_FAILED'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Compress an uploaded File to a JPEG data URL with the given constraints. */
export async function compressImageToJpeg(
  file: File,
  spec: { maxEdge: number; quality: number },
): Promise<{ dataUrl: string; bytes: number }> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')

  const original = await fileToDataUrl(file)
  const img = await loadImage(original)
  const { w, h } = targetSize(img.naturalWidth, img.naturalHeight, spec.maxEdge)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE')
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await canvasToJpeg(canvas, spec.quality)
  if (blob.size > 5 * 1024 * 1024) throw new Error('压缩后仍超过 5MB，请换更小的图')

  // Convert blob → data URL (split to avoid the base64 comma in the match).
  const dataUrl = await new Promise<string>((resolveDataUrl, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolveDataUrl(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('READ_FAILED'))
    reader.readAsDataURL(blob)
  })

  return { dataUrl, bytes: blob.size }
}

/** Compress an uploaded File to a JPEG data URL sized for the given persona. */
export async function compressImageForPersona(id: string, file: File): Promise<{ dataUrl: string; spec: { file: string; maxEdge: number; quality: number }; bytes: number }> {
  const spec = localPersonaImage(id)
  if (!spec) throw new Error('该画像不支持本地替换图')
  const { dataUrl, bytes } = await compressImageToJpeg(file, spec)
  return { dataUrl, spec, bytes }
}

export async function uploadLocalPersonaImage(
  id: string,
  dataUrl: string,
): Promise<LocalUploadResult> {
  const res = await fetch('/__local-dev/persona-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id, dataUrl }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error?.message || body?.error?.code || '上传失败')
  }
  return body as LocalUploadResult
}

/* -------------------- covers (city / spot) -------------------- */

/** Covers are shown much larger than persona cards, so they get a bigger
 *  budget: longest edge 1200px, slightly higher JPEG quality. */
export const COVER_IMAGE_SPEC = { maxEdge: 1200, quality: 0.8 } as const

/** Safe cover file key: lowercase slug, used as `/covers/<name>.jpg`. */
export function sanitizeCoverName(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 80)
}

export interface LocalCoverUploadResult {
  ok: boolean
  /** Same-origin public path, e.g. `/covers/shanghai-the-bund.jpg`. */
  path: string
  bytes: number
}

/** Upload a browser-compressed cover JPEG; the Vite dev middleware writes it
 *  to client/public/covers/<name>.jpg so it ships verbatim with the build and
 *  stays reachable at a stable same-origin path after deploy. */
export async function uploadLocalCoverImage(
  name: string,
  dataUrl: string,
): Promise<LocalCoverUploadResult> {
  const res = await fetch('/__local-dev/cover-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name, dataUrl }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error?.message || body?.error?.code || '上传失败')
  }
  return body as LocalCoverUploadResult
}
