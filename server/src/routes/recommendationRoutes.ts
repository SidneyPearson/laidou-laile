import { Hono } from 'hono'
import { z, ZodError } from 'zod'
import type { Bindings } from '../config/env.js'
import { D1CurationRepository } from '../repositories/d1CurationRepository.js'
import { selectMainRecommendations, spotCategorySchema } from '../domain/curation.js'
import type { CurationRepository } from '../repositories/curationRepository.js'
import { badRequest } from '../middleware/errorHandler.js'

const recommendationQuerySchema = z.object({
  category: spotCategorySchema.optional(),
  personas: z.string().trim().max(800).optional().transform(value =>
    (value ?? '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 20)),
  rainy: z.enum(['true', 'false']).optional().transform(value => value === 'true'),
}).strict()

function queryContext(url: string) {
  return recommendationQuerySchema.parse(
    Object.fromEntries(new URL(url).searchParams.entries()),
  )
}

export interface RecommendationRouteDependencies {
  repository?: (db: D1Database) => CurationRepository
}

export function createRecommendationRoutes(dependencies: RecommendationRouteDependencies = {}) {
  const routes = new Hono<{ Bindings: Bindings }>()
  routes.get('/', async c => {
    try {
      const context = queryContext(c.req.url)
      const repository = dependencies.repository?.(c.env.DB) ?? new D1CurationRepository(c.env.DB)
      const [publishedCities, managedCities] = await Promise.all([
        repository.listPublishedCities(),
        repository.listCities({ page: 1, pageSize: 100 }),
      ])
      const managedAdcodes = [...managedCities.items.map(city => city.adcode)]
      for (let page = 2; page <= managedCities.totalPages; page++) {
        const result = await repository.listCities({ page, pageSize: 100 })
        managedAdcodes.push(...result.items.map(city => city.adcode))
      }
      const withSpots = await Promise.all(publishedCities.map(async city => {
        const spots = selectMainRecommendations(await repository.listPublished(city.adcode), context)
        return { city, spots }
      }))
      // Only expose published cities that actually have at least one published,
      // verified spot — a published city with no public content must not show.
      const data = withSpots
        .filter(({ spots }) => spots.length > 0)
        .map(({ city, spots }) => ({
          adcode: city.adcode,
          province: city.provinceName,
          name: city.name,
          coverImageUrl: city.coverImageUrl,
          attractions: spots.map(spot => ({
            id: spot.id, name: spot.name, lat: spot.lat, lng: spot.lng, category: spot.category, tier: spot.tier,
          })),
        }))
      // V0.1 favors editorial consistency over edge caching: opening the H5
      // city picker after an admin publish/unpublish must read the latest D1 state.
      c.header('Cache-Control', 'no-store')
      return c.json({ cities: data, source: 'd1', managedAdcodes })
    } catch (err) {
      if (err instanceof ZodError) return badRequest(c, err)
      console.error('D1 recommendation fallback:', err instanceof Error ? err.message : 'database unavailable')
      return c.json({
        cities: [],
        source: 'static_fallback',
        fallbackReason: 'D1_UNAVAILABLE',
        managedAdcodes: [],
      }, 503)
    }
  })
  return routes
}
