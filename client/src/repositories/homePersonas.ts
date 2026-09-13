import axios from 'axios'
import { personaLabel } from '../utils/personaLabels'
import type { Persona } from '../types/explore'
import { homepageAssets, personaCardCopy, personaImage } from '../assets/homepage'

export interface HomePersonaCard {
  id: Persona
  title: string
  tagline: string
  /** Resolved image URL — never empty: a null/empty D1 image_url falls back to
   *  the bundled artwork for that persona. */
  imageUrl: string
  sortOrder: number
}

interface ApiCard {
  id: Persona
  title: string
  tagline: string
  imageUrl: string | null
  sortOrder: number
}

interface ApiResponse {
  cards: ApiCard[]
  source: 'd1' | 'static_fallback'
  fallbackReason?: string
}

/** Built-in defaults used when the API is unavailable (mirrors the current
 *  hardcoded cards so the homepage never goes blank). Order matches sort_order. */
const FALLBACK_CARDS: HomePersonaCard[] = [
  {
    id: 'fast',
    title: personaCardCopy.fast!.title,
    tagline: personaCardCopy.fast!.tagline,
    imageUrl: homepageAssets.personas.fast,
    sortOrder: 10,
  },
  {
    id: 'couple',
    title: personaCardCopy.couple!.title,
    tagline: personaCardCopy.couple!.tagline,
    imageUrl: homepageAssets.personas.couple,
    sortOrder: 20,
  },
  {
    id: 'family',
    title: personaCardCopy.family!.title,
    tagline: personaCardCopy.family!.tagline,
    imageUrl: homepageAssets.personas.family,
    sortOrder: 30,
  },
  {
    id: 'lazy',
    title: personaCardCopy.lazy!.title,
    tagline: personaCardCopy.lazy!.tagline,
    imageUrl: homepageAssets.personas.lazy,
    sortOrder: 40,
  },
  {
    id: 'urban',
    title: personaCardCopy.urban!.title,
    tagline: personaCardCopy.urban!.tagline,
    imageUrl: homepageAssets.personas.urban,
    sortOrder: 50,
  },
]

/** The fallback cards (also the initial render state before the API resolves). */
export function defaultHomePersonaCards(): HomePersonaCard[] {
  return FALLBACK_CARDS.map(card => ({ ...card }))
}

function isValidId(id: unknown): id is Persona {
  return typeof id === 'string' && (['fast', 'couple', 'family', 'lazy', 'urban'] as string[]).includes(id)
}

/** Fetch enabled homepage persona cards from the backend. Returns the built-in
 *  defaults on any network/5xx error so the homepage is never empty. */
export async function fetchHomePersonas(signal?: AbortSignal): Promise<HomePersonaCard[]> {
  try {
    const { data } = await axios.get<ApiResponse>('/api/home/personas', {
      signal,
      timeout: 6000,
      validateStatus: status => status === 200 || status === 503,
    })
    if (data?.source === 'd1' && Array.isArray(data.cards)) {
      const cards = data.cards
        .filter((card): card is ApiCard => isValidId(card.id) && typeof card.title === 'string')
        .map(card => ({
          id: card.id,
          title: personaLabel(card.title),
          tagline: card.tagline ?? '',
          imageUrl: personaImage(card.id, card.imageUrl),
          sortOrder: Number(card.sortOrder) || 0,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder)
      if (cards.length > 0) return cards
    }
    return defaultHomePersonaCards()
  } catch {
    return defaultHomePersonaCards()
  }
}
