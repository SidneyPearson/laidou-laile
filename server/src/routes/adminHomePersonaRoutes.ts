import { Hono } from 'hono'
import { ZodError } from 'zod'
import type { Bindings } from '../config/env.js'
import { badRequest } from '../middleware/errorHandler.js'
import { requireAdmin, requireMutationOrigin } from '../middleware/adminAuth.js'
import { parseJsonBody } from '../utils/requestBody.js'
import { D1HomePersonaRepository } from '../repositories/d1HomePersonaRepository.js'
import type { HomePersonaRepository } from '../repositories/homePersonaRepository.js'
import { homePersonaUpdateSchema } from './adminHomePersonaSchemas.js'

const BODY_LIMIT = 16 * 1024
function now() { return new Date().toISOString() }
function error(c: any, status: number, code: string, message: string) {
  return c.json({ error: { code, message } }, status)
}

export interface AdminHomePersonaRouteDependencies {
  repository?: (db: D1Database) => HomePersonaRepository
}

/** Admin endpoints for the fixed homepage persona cards. Reuses the same
 *  auth + CSRF middleware as cities/spots. No create/delete — ids are fixed. */
export function createAdminHomePersonaRoutes(
  dependencies: AdminHomePersonaRouteDependencies = {},
) {
  const routes = new Hono<{ Bindings: Bindings }>()
  const repository =
    dependencies.repository ?? ((db: D1Database) => new D1HomePersonaRepository(db))

  routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
  routes.use('*', requireAdmin)
  routes.use('*', async (c, next) =>
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method) ? requireMutationOrigin(c, next) : next())

  routes.get('/home-personas', async (c) => {
    const cards = await repository(c.env.DB).list()
    return c.json({
      items: cards.map(card => ({
        id: card.id,
        title: card.title,
        subtitle: card.subtitle ?? '',
        imageUrl: card.imageUrl,
        sortOrder: card.sortOrder,
        enabled: card.enabled,
        version: card.version,
        updatedAt: card.updatedAt,
      })),
      total: cards.length,
    })
  })

  routes.patch('/home-personas/:id', async (c) => {
    const raw = await parseJsonBody(c, BODY_LIMIT)
    if (raw instanceof Response) return raw

    let input
    try {
      input = homePersonaUpdateSchema.parse(raw)
    } catch (e) {
      if (e instanceof ZodError) return badRequest(c, e)
      throw e
    }

    const { expectedVersion, ...changes } = input
    const repo = repository(c.env.DB)
    const row = await repo.update(c.req.param('id'), expectedVersion, changes, now())
    if (row === 'conflict') return error(c, 409, 'VERSION_CONFLICT', '卡片已被其他操作更新')
    if (!row) return error(c, 404, 'NOT_FOUND', '卡片不存在')

    await repo.audit('home_persona.update', 'home_persona', row.id, changes, now())
    return c.json({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle ?? '',
      imageUrl: row.imageUrl,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      version: row.version,
      updatedAt: row.updatedAt,
    })
  })

  return routes
}

export default createAdminHomePersonaRoutes()
