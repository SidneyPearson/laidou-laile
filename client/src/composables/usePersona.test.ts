import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPersonaForTests, usePersona } from './usePersona'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

describe('usePersona', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    resetPersonaForTests()
  })

  it('resets the chosen flag and removes the persisted preference', () => {
    const state = usePersona()
    state.setPersona('family')
    expect(state.hasChosenPersona.value).toBe(true)
    state.resetPersona()
    expect(state.persona.value).toBe('urban')
    expect(state.hasChosenPersona.value).toBe(false)
    expect(localStorage.getItem('laidou-v03-persona')).toBeNull()
  })
})
