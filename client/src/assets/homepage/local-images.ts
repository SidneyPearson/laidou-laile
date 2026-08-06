/**
 * Local-only artwork replacement map.
 *
 * The dev upload tool (see client/vite.config.ts) writes a compressed JPEG to
 * the file named here when an admin uploads a replacement for a persona card.
 *
 * This is a BUILD-TIME, LOCAL-DEV-ONLY workflow: the file on disk is replaced,
 * then rebuilt and deployed. There is no runtime upload in production. All five
 * personas (fast/couple/family/lazy/urban) have bundled artwork and can be
 * replaced this way.
 */
export interface LocalImageSpec {
  /** File name inside client/src/assets/homepage/. */
  file: string
  /** Longest edge in px after compression. */
  maxEdge: number
  /** JPEG quality 0..1 (canvas.toBlob). */
  quality: number
}

export const LOCAL_PERSONA_IMAGES: Record<string, LocalImageSpec> = {
  couple: { file: '02-persona-couple.jpg', maxEdge: 540, quality: 0.72 },
  family: { file: '03-persona-family.jpg', maxEdge: 540, quality: 0.72 },
  fast: { file: '04-persona-soldier.jpg', maxEdge: 540, quality: 0.72 },
  lazy: { file: '05-persona-lazy.jpg', maxEdge: 540, quality: 0.72 },
  urban: { file: '06-persona-urban.jpg', maxEdge: 540, quality: 0.72 },
}

export function localPersonaImage(id: string): LocalImageSpec | null {
  return LOCAL_PERSONA_IMAGES[id] ?? null
}
