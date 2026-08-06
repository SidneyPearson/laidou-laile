/**
 * Central registry of homepage imagery.
 *
 * The hero cover and all five homepage persona cards are bundled locally —
 * replace the JPG in this folder and rebuild to swap the artwork (no image
 * host needed). Inspiration/recommendation cards pull their cover directly
 * from the admin spot library (`coverImageUrl`), with a theme-gradient
 * fallback in the card component.
 */
import type { Persona } from '../../types/explore'
import heroCover from './01-hero-shanghai-cover.jpg'
import personaCouple from './02-persona-couple.jpg'
import personaFamily from './03-persona-family.jpg'
import personaSoldier from './04-persona-soldier.jpg'
import personaLazy from './05-persona-lazy.jpg'
import personaUrban from './06-persona-urban.jpg'

export const homepageAssets = {
  hero: heroCover,
  personas: {
    couple: personaCouple,
    family: personaFamily,
    fast: personaSoldier,
    lazy: personaLazy,
    /** "都市丽人/精致" — bundled city-night artwork (replaceable via the dev
     *  image uploader like the other four). */
    urban: personaUrban,
  } satisfies Record<Persona, string>,
} as const

/** Resolve the image for a persona card. An empty/whitespace override (the
 *  normal state — image_url is NULL in D1) falls back to the artwork bundled
 *  with the app; a non-empty HTTPS override wins, so editors can point a card
 *  at a remote image without rebuilding. */
export function personaImage(id: Persona, override?: string | null): string {
  const custom = typeof override === 'string' ? override.trim() : ''
  return custom || homepageAssets.personas[id]
}

/** Copy overrides for persona cards. The id/emoji/tagline in the data layer
 *  stay untouched; this only changes what the homepage card displays. */
export const personaCardCopy: Partial<Record<Persona, { title: string; tagline: string }>> = {
  couple: { title: '情侣约会', tagline: '浪漫 · 夜景 · 出片' },
  family: { title: '亲子玩乐', tagline: '互动 · 成长 · 有趣' },
  fast: { title: '特种兵式', tagline: '高效 · 打卡 · 省时' },
  lazy: { title: '懒人躺平', tagline: '放松 · 慢游 · 舒适' },
}
