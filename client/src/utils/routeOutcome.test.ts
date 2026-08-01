import { describe, expect, it } from 'vitest'
import { shouldPersistGeneratedRoutes } from './routeOutcome'

describe('shouldPersistGeneratedRoutes', () => {
  it('persists only successful non-empty results', () => {
    expect(shouldPersistGeneratedRoutes('success', [{ id: 'route' }])).toBe(true)
    expect(shouldPersistGeneratedRoutes('cancelled', [{ id: 'route' }])).toBe(false)
    expect(shouldPersistGeneratedRoutes('error', [{ id: 'route' }])).toBe(false)
    expect(shouldPersistGeneratedRoutes('success', [])).toBe(false)
  })
})
