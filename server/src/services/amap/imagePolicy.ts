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

export function safeAmapImages(photos: Array<{ url: string; title: string }> | undefined): Array<{ url: string; title: string }> {
  return (photos ?? []).flatMap(photo => {
    const url = safeAmapImageUrl(photo.url)
    return url ? [{ url, title: photo.title.slice(0, 120) }] : []
  })
}
