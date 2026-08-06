import { Hono } from 'hono'
import type { Bindings } from '../config/env.js'
import { D1HomePersonaRepository } from '../repositories/d1HomePersonaRepository.js'
import type { HomePersonaRepository } from '../repositories/homePersonaRepository.js'

export interface HomePersonaRouteDependencies {
  repository?: (db: D1Database) => HomePersonaRepository
}

/** Public, unauthenticated read of enabled homepage persona cards.
 *  Mirrors recommendationRoutes: any D1 failure degrades to a 503 with an
 *  empty list so the H5 can fall back to its built-in defaults. */
export function createHomePersonaRoutes(
  dependencies: HomePersonaRouteDependencies = {},
) {
  const repositoryFor =
    dependencies.repository ?? ((db: D1Database) => new D1HomePersonaRepository(db))
  const routes = new Hono<{ Bindings: Bindings }>()

  routes.get('/', async (c) => {
    try {
      const cards = await repositoryFor(c.env.DB).listPublished()
      c.header('Cache-Control', 'no-store')
      return c.json({
        cards: cards.map(card => ({
          id: card.id,
          title: card.title,
          tagline: card.subtitle ?? '',
          imageUrl: card.imageUrl,
          sortOrder: card.sortOrder,
        })),
        source: 'd1',
      })
    } catch (err) {
      console.error(
        'D1 home persona fallback:',
        err instanceof Error ? err.message : 'database unavailable',
      )
      return c.json(
        { cards: [], source: 'static_fallback', fallbackReason: 'D1_UNAVAILABLE' },
        503,
      )
    }
  })

  return routes
}

export default createHomePersonaRoutes()
