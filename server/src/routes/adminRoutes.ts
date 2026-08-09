import { Hono } from 'hono'
import { ZodError } from 'zod'
import type { Bindings } from '../config/env.js'
import { badRequest } from '../middleware/errorHandler.js'
import { requireAdmin, requireMutationOrigin } from '../middleware/adminAuth.js'
import { canPublishSpot } from '../domain/curation.js'
import { D1CurationRepository } from '../repositories/d1CurationRepository.js'
import type { CurationRepository } from '../repositories/curationRepository.js'
import { verifyPlace } from '../services/amap/placeVerifier.js'
import { safeAmapImages } from '../services/amap/imagePolicy.js'
import { parseJsonBody } from '../utils/requestBody.js'
import { batchPublishSchema, cityCreateSchema, cityListSchema, cityUpdateSchema, spotCreateSchema, spotListSchema, spotUpdateSchema, versionSchema } from './adminSchemas.js'

const BODY_LIMIT = 128 * 1024
function now() { return new Date().toISOString() }
function error(c: any, status: number, code: string, message: string, details?: unknown) { return c.json({ error: { code, message, ...(details ? { details } : {}) } }, status) }
async function body(c: any, schema: any) { const raw = await parseJsonBody(c, BODY_LIMIT); if (raw instanceof Response) return raw; try { return schema.parse(raw) } catch (e) { if (e instanceof ZodError) return badRequest(c, e); throw e } }
function queryObject(url: string) { return Object.fromEntries(new URL(url).searchParams.entries()) }

export interface AdminRouteDependencies {
  repository?: (db: D1Database) => CurationRepository
  verify?: typeof verifyPlace
}

export function createAdminRoutes(dependencies: AdminRouteDependencies = {}) {
  const routes = new Hono<{ Bindings: Bindings }>()
  const repository = (db: D1Database) => dependencies.repository?.(db) ?? new D1CurationRepository(db)
  const verify = dependencies.verify ?? verifyPlace
  routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
  routes.use('*', requireAdmin)
  routes.use('*', async (c, next) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method) ? requireMutationOrigin(c, next) : next())

  routes.get('/dashboard', async c => c.json(await repository(c.env.DB).dashboard(now())))
  routes.get('/cities', async c => {
    try { const q = cityListSchema.parse(queryObject(c.req.url)); return c.json(await repository(c.env.DB).listCities(q)) }
    catch (e) { if (e instanceof ZodError) return badRequest(c, e); throw e }
  })
  routes.post('/cities', async c => { const input = await body(c, cityCreateSchema); if (input instanceof Response) return input; const row = await repository(c.env.DB).createCity(input, now()); await repository(c.env.DB).audit('city.create', 'city', row.adcode, input, now()); return c.json(row, 201) })
  routes.patch('/cities/:adcode', async c => { const input = await body(c, cityUpdateSchema); if (input instanceof Response) return input; const row = await repository(c.env.DB).updateCity(c.req.param('adcode'), input, now()); if (!row) return error(c, 404, 'NOT_FOUND', '城市不存在'); await repository(c.env.DB).audit('city.update', 'city', row.adcode, input, now()); return c.json(row) })

  routes.get('/spots', async c => {
    try { const q = spotListSchema.parse(queryObject(c.req.url)); return c.json(await repository(c.env.DB).listSpots(q)) }
    catch (e) { if (e instanceof ZodError) return badRequest(c, e); throw e }
  })
  routes.post('/spots', async c => { const input = await body(c, spotCreateSchema); if (input instanceof Response) return input; if (input.publicationStatus === 'published') return error(c, 422, 'PUBLISH_REQUIRES_VERIFICATION', '新地点必须先保存并完成高德验证'); const row = await repository(c.env.DB).createSpot(input, now()); await repository(c.env.DB).audit('spot.create', 'spot', row.id, input, now()); return c.json(row, 201) })
  routes.post('/spots/batch-publish', async c => {
    const input = await body(c, batchPublishSchema); if (input instanceof Response) return input
    const repo = repository(c.env.DB); const results: Array<{ id: string; ok: boolean; error?: string; version?: number }> = []
    for (const item of input.spots) {
      const spot = await repo.getSpot(item.id)
      const errors = spot ? canPublishSpot(spot) : ['地点不存在']
      if (!spot || errors.length) { results.push({ id: item.id, ok: false, error: errors.join('；') }); continue }
      const updated = await repo.setPublication(item.id, item.expectedVersion, 'published', now())
      if (!updated || updated === 'conflict') { results.push({ id: item.id, ok: false, error: updated === 'conflict' ? '版本冲突' : '地点不存在' }); continue }
      results.push({ id: item.id, ok: true, version: updated.version })
    }
    await repo.audit('spot.batch_publish', 'spot', 'batch', { ids: input.spots.map((x: any) => x.id), results }, now())
    return c.json({ results })
  })
  routes.get('/spots/:id', async c => { const row = await repository(c.env.DB).getSpot(c.req.param('id')); return row ? c.json(row) : error(c, 404, 'NOT_FOUND', '地点不存在') })
  routes.patch('/spots/:id', async c => { const input = await body(c, spotUpdateSchema); if (input instanceof Response) return input; const { expectedVersion, ...changes } = input; if (changes.publicationStatus === 'published') return error(c, 422, 'USE_PUBLISH_ACTION', '请使用发布操作'); const repo = repository(c.env.DB); const row = await repo.updateSpot(c.req.param('id'), expectedVersion, changes, now()); if (row === 'conflict') return error(c, 409, 'VERSION_CONFLICT', '地点已被其他操作更新'); if (!row) return error(c, 404, 'NOT_FOUND', '地点不存在'); await repo.audit('spot.update', 'spot', row.id, changes, now()); return c.json(row) })
  routes.post('/spots/:id/verify', async c => {
    const input = await body(c, versionSchema); if (input instanceof Response) return input
    const repo = repository(c.env.DB); const spot = await repo.getSpot(c.req.param('id')); if (!spot) return error(c, 404, 'NOT_FOUND', '地点不存在')
    if (spot.version !== input.expectedVersion) return error(c, 409, 'VERSION_CONFLICT', '地点已被其他操作更新')
    const match = await verify(spot.searchName, spot.lng ?? 0, spot.lat ?? 0, spot.cityAdcode)
    const timestamp = now(); const images = safeAmapImages(match?.photos)
    const row = await repo.setVerification(spot.id, spot.version, match ? { amapName: match.name, amapPoiId: match.id, address: match.address, lng: match.lng, lat: match.lat, coverImageUrl: images[0]?.url, verificationStatus: 'verified', verifiedAt: timestamp } : { amapName: null, amapPoiId: null, address: spot.address, lng: spot.lng, lat: spot.lat, verificationStatus: 'failed', verifiedAt: timestamp }, timestamp)
    if (row === 'conflict') return error(c, 409, 'VERSION_CONFLICT', '地点已被其他操作更新')
    await repo.audit('spot.verify', 'spot', spot.id, { matched: !!match, amapPoiId: match?.id ?? null }, timestamp)
    return c.json({ spot: row, imageCandidates: images })
  })
  routes.post('/spots/:id/publish', async c => {
    const input = await body(c, versionSchema); if (input instanceof Response) return input
    const repo = repository(c.env.DB); const spot = await repo.getSpot(c.req.param('id')); if (!spot) return error(c, 404, 'NOT_FOUND', '地点不存在')
    if (spot.version !== input.expectedVersion) return error(c, 409, 'VERSION_CONFLICT', '地点已被其他操作更新')
    const errors = canPublishSpot(spot); if (errors.length) return error(c, 422, 'PUBLISH_REQUIREMENTS_NOT_MET', '地点不满足发布条件', errors)
    const row = await repo.setPublication(spot.id, spot.version, 'published', now()); if (row === 'conflict') return error(c, 409, 'VERSION_CONFLICT', '地点已被其他操作更新')
    await repo.audit('spot.publish', 'spot', spot.id, { from: spot.publicationStatus, to: 'published' }, now()); return c.json(row)
  })
  routes.post('/spots/:id/unpublish', async c => {
    const input = await body(c, versionSchema); if (input instanceof Response) return input
    const repo = repository(c.env.DB); const row = await repo.setPublication(c.req.param('id'), input.expectedVersion, 'draft', now()); if (row === 'conflict') return error(c, 409, 'VERSION_CONFLICT', '地点已被其他操作更新'); if (!row) return error(c, 404, 'NOT_FOUND', '地点不存在')
    await repo.audit('spot.unpublish', 'spot', row.id, { to: 'draft' }, now()); return c.json(row)
  })
  routes.delete('/spots/:id', requireMutationOrigin, async c => {
    const input = await body(c, versionSchema); if (input instanceof Response) return input
    const id = c.req.param('id')!
    const repo = repository(c.env.DB); const result = await repo.deleteSpot(id, input.expectedVersion)
    if (result === 'published') return error(c, 422, 'STILL_PUBLISHED', '已发布的地点不能直接删除，请先下架')
    if (result === 'conflict') return error(c, 409, 'VERSION_CONFLICT', '地点已被其他操作更新')
    if (result === null) return error(c, 404, 'NOT_FOUND', '地点不存在')
    await repo.audit('spot.delete', 'spot', id, { version: input.expectedVersion }, now()); return c.json({ ok: true })
  })
  return routes
}
