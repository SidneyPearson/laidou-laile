import { Hono } from 'hono'
import { recommendCitySpots } from '../services/explore/exploreService.js'
import { exploreRecommendRequestSchema } from './exploreRoutes.schemas.js'
import { zodErrorToBody } from '../middleware/errorHandler.js'
import type { Bindings } from '../config/env.js'
import { D1CurationRepository } from '../repositories/d1CurationRepository.js'
import type { CurationRepository } from '../repositories/curationRepository.js'

type RecommendFn = typeof recommendCitySpots

interface ExploreRouteDependencies {
  recommend?: RecommendFn
  repository?: (db: D1Database) => CurationRepository
}

export function createExploreRoutes(dependencies: ExploreRouteDependencies = {}) {
  const recommend = dependencies.recommend ?? recommendCitySpots
  const repositoryFor = dependencies.repository ?? ((db: D1Database) => new D1CurationRepository(db))
  const routes = new Hono<{ Bindings: Bindings }>()

  routes.post('/recommend', async (c) => {
    const contentLength = Number(c.req.header('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
      return c.json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' },
      }, 413)
    }

    let raw: unknown
    try {
      const text = await c.req.text()
      if (new TextEncoder().encode(text).byteLength > 16 * 1024) {
        return c.json({
          error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' },
        }, 413)
      }
      raw = JSON.parse(text)
    } catch {
      return c.json({
        error: { code: 'INVALID_JSON', message: '请求格式错误' },
      }, 400)
    }

    const parsed = exploreRecommendRequestSchema.safeParse(raw)
    if (!parsed.success) return c.json(zodErrorToBody(parsed.error), 400)

    const repository = repositoryFor(c.env.DB)
    const result = await recommend(parsed.data, { repository })
    if (!result) {
      return c.json({
        error: { code: 'CITY_NOT_SUPPORTED', message: '这座城市的精选内容还在准备中' },
      }, 404)
    }
    if (result.spots.length === 0) {
      return c.json({
        error: { code: 'NO_VERIFIED_SPOTS', message: '地点校验暂时不可用，请稍后重试' },
      }, 503)
    }

    c.header('Cache-Control', 'private, max-age=300')
    return c.json(result)
  })

  return routes
}

export default createExploreRoutes()
