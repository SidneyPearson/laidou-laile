const ALLOWED_AMAP_HOSTS = new Set([
  'store.is.autonavi.com',
  'aos-cdn-image.amap.com',
])

export function safeAmapImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || !ALLOWED_AMAP_HOSTS.has(url.hostname.toLowerCase())) return null
    return url.toString()
  } catch { return null }
}

/** Validate an admin-supplied image URL: require HTTPS and strip credentials,
 *  but do NOT restrict the host (editors may use any image CDN). */
export function safeHttpsImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch { return null }
}

/** Same-origin cover path produced by the dev-only local upload workflow
 *  (client/public/covers/<slug>.jpg ships verbatim with the build). The
 *  pattern mirrors the Vite middleware's name validation: slug only, no
 *  path separators or traversal. */
export const LOCAL_COVER_PATH_RE = /^\/covers\/[a-z0-9][a-z0-9-]{0,79}\.jpg$/

/** Cover fields accept either an admin-supplied HTTPS image URL or a
 *  same-origin `/covers/<slug>.jpg` path from the local upload workflow. */
export function safeCoverImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (LOCAL_COVER_PATH_RE.test(value)) return value
  return safeHttpsImageUrl(value)
}

export function safeAmapImages(photos: Array<{ url: string; title: string }> | undefined): Array<{ url: string; title: string }> {
  return (photos ?? []).flatMap(photo => {
    const url = safeAmapImageUrl(photo.url)
    return url ? [{ url, title: photo.title.slice(0, 120) }] : []
  })
}
