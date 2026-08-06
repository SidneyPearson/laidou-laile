import { ref } from 'vue'
import { PERSONAS } from '../data/mockExploreSpots'
import type { Persona } from '../types/explore'

const STORAGE_KEY = 'laidou-v03-persona'
const DEFAULT_PERSONA: Persona = 'couple'

/** Module-singleton persona state shared across home / city / today pages.
 *  Persists to localStorage under the existing v03 key so all consumers stay
 *  in sync without introducing Pinia. */
const persona = ref<Persona>(loadPersona())

function loadPersona(): Persona {
  if (typeof localStorage === 'undefined') return DEFAULT_PERSONA
  const saved = localStorage.getItem(STORAGE_KEY)
  return PERSONAS.some(item => item.id === saved) ? (saved as Persona) : DEFAULT_PERSONA
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, persona.value)
  } catch {
    /* private mode / quota — ignore, in-memory state still works */
  }
}

export function usePersona() {
  function setPersona(next: Persona) {
    if (next === persona.value) return
    persona.value = next
    persist()
  }

  return {
    persona,
    setPersona,
  }
}
