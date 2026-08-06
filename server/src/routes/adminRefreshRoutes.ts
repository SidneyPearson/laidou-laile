import { Hono } from 'hono'
import { ZodError, type ZodType } from 'zod'
import type { Bindings } from '../config/env.js'
import { buildWeeklyReviewPrompt, calculateCityReviewState, uniqueEvidenceCount } from '../domain/weeklyRefresh.js'
import { badRequest } from '../middleware/errorHandler.js'
import { requireAdmin, requireMutationOrigin } from '../middleware/adminAuth.js'
import { D1CityRefreshRepository } from '../repositories/d1CityRefreshRepository.js'
import type { CityRefreshRepository, RefreshCandidateRecord } from '../repositories/cityRefreshRepository.js'
import { D1CurationRepository } from '../repositories/d1CurationRepository.js'
import type { CurationRepository, SpotWrite } from '../repositories/curationRepository.js'
import { safeAmapImages } from '../services/amap/imagePolicy.js'
import { verifyPlace } from '../services/amap/placeVerifier.js'
import { buildRefreshPreview, RefreshImportError } from '../services/weeklyRefreshService.js'
import { parseJsonBody } from '../utils/requestBody.js'
import {
  candidateAcceptSchema,
  candidateDecisionSchema,
  emptyActionSchema,
  importConfirmSchema,
  importPreviewSchema,
  noChangeConfirmSchema,
  refreshAdcodeSchema,
  refreshRunIdSchema,
} from './adminRefreshSchemas.js'

const BODY_LIMIT = 256 * 1024
const now = () => new Date().toISOString()

function randomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
}

function error(c: any, status: number, code: string, message: string, details?: unknown) {
  return c.json({ error: { code, message, ...(details ? { details } : {}) } }, status)
}

async function body(c: any, schema: ZodType) {
  const raw = await parseJsonBody(c, BODY_LIMIT)
  if (raw instanceof Response) return raw
  try {
    return schema.parse(raw)
  } catch (caught) {
    if (caught instanceof ZodError) return badRequest(c, caught)
    throw caught
  }
}

function param(c: any, name: string, schema: ZodType<string>): string | Response {
  const parsed = schema.safeParse(c.req.param(name))
  return parsed.success ? parsed.data : error(c, 400, 'INVALID_PARAMS', `${name}不合法`)
}

function evidenceUrls(candidate: RefreshCandidateRecord): string[] {
  return candidate.evidence.flatMap(item => typeof item.url === 'string' ? [item.url] : [])
}

export interface AdminRefreshDependencies {
  refreshRepository?: (db: D1Database) => CityRefreshRepository
  curationRepository?: (db: D1Database) => CurationRepository
  verify?: typeof verifyPlace
  clock?: () => string
  idFactory?: () => string
}

export function createAdminRefreshRoutes(dependencies: AdminRefreshDependencies = {}) {
  const routes = new Hono<{ Bindings: Bindings }>()
  const refreshRepository = (db: D1Database) => dependencies.refreshRepository?.(db) ?? new D1CityRefreshRepository(db)
  const curationRepository = (db: D1Database) => dependencies.curationRepository?.(db) ?? new D1CurationRepository(db)
  const verify = dependencies.verify ?? verifyPlace
  const currentTime = dependencies.clock ?? now
  const createId = dependencies.idFactory ?? randomId

  routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
  routes.use('*', requireAdmin)
  routes.use('*', async (c, next) =>
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method) ? requireMutationOrigin(c, next) : next())

  routes.get('/city-refresh/due', async c => {
    const timestamp = currentTime()
    const cities = await refreshRepository(c.env.DB).listReviewCities()
    const items = cities.map(city => ({
      city,
      review: calculateCityReviewState(city, timestamp),
      activeRun: city.activeRunId ? { id: city.activeRunId, status: city.activeRunStatus } : null,
    }))
    const published = items.filter(item => item.city.status === 'published')
    const weekAgo = Date.parse(timestamp) - 7 * 86_400_000
    return c.json({
      items,
      summary: {
        dueCities: published.filter(item => item.review.due).length,
        overdueCities: published.filter(item => item.review.overdueDays > 0).length,
        neverReviewedCities: published.filter(item => item.review.neverReviewed).length,
        activeRuns: published.filter(item => item.activeRun).length,
        completedThisWeek: published.filter(item =>
          item.city.lastContentReviewAt && Date.parse(item.city.lastContentReviewAt) >= weekAgo).length,
      },
    })
  })

  routes.post('/cities/:adcode/refresh-runs', async c => {
    const adcode = param(c, 'adcode', refreshAdcodeSchema)
    if (adcode instanceof Response) return adcode
    const input = await body(c, emptyActionSchema)
    if (input instanceof Response) return input
    const timestamp = currentTime()
    const repo = refreshRepository(c.env.DB)
    const city = await repo.getCity(adcode)
    if (!city) return error(c, 404, 'NOT_FOUND', '城市不存在')
    if (city.status !== 'published') return error(c, 422, 'CITY_NOT_PUBLISHED', '只有已开放城市需要内容复核')
    const id = createId()
    const created = await repo.createRun(id, adcode, timestamp)
    if (created === 'active_exists') return error(c, 409, 'ACTIVE_REFRESH_EXISTS', '该城市已有未完成的复核任务')
    if (!created) return error(c, 404, 'NOT_FOUND', '城市不存在')
    const publishedSpots = await curationRepository(c.env.DB).listPublished(adcode)
    const prompt = buildWeeklyReviewPrompt(city, publishedSpots, timestamp)
    const run = await repo.savePrompt(id, prompt, timestamp)
    await curationRepository(c.env.DB).audit('city_refresh.start', 'city_refresh_run', id, { cityAdcode: adcode }, timestamp)
    return c.json({ run, city, prompt }, 201)
  })

  routes.get('/refresh-runs/:runId', async c => {
    const runId = param(c, 'runId', refreshRunIdSchema)
    if (runId instanceof Response) return runId
    const repo = refreshRepository(c.env.DB)
    const run = await repo.getRun(runId)
    if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    const [city, candidates, spots] = await Promise.all([
      repo.getCity(run.cityAdcode),
      repo.getRunCandidates(runId),
      repo.listCitySpots(run.cityAdcode),
    ])
    return c.json({ run, city, candidates, currentSpots: spots })
  })

  routes.get('/refresh-runs/:runId/prompt', async c => {
    const runId = param(c, 'runId', refreshRunIdSchema)
    if (runId instanceof Response) return runId
    const run = await refreshRepository(c.env.DB).getRun(runId)
    if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    return c.json({ prompt: run.promptText, generatedAt: run.promptGeneratedAt, schemaVersion: run.schemaVersion })
  })

  routes.post('/refresh-runs/:runId/import-preview', async c => {
    const runId = param(c, 'runId', refreshRunIdSchema)
    if (runId instanceof Response) return runId
    const input = await body(c, importPreviewSchema)
    if (input instanceof Response) return input
    const repo = refreshRepository(c.env.DB)
    const run = await repo.getRun(runId)
    if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    const city = await repo.getCity(run.cityAdcode)
    if (!city) return error(c, 404, 'NOT_FOUND', '城市不存在')
    try {
      const preview = await buildRefreshPreview(input.rawJson, city, await repo.listCitySpots(city.adcode), createId)
      return c.json({
        previewHash: preview.previewHash,
        valid: preview.valid,
        errors: preview.errors,
        summary: preview.summary,
        candidates: preview.candidates,
      })
    } catch (caught) {
      if (caught instanceof RefreshImportError) return error(c, 400, caught.code, caught.message, caught.details)
      throw caught
    }
  })

  routes.post('/refresh-runs/:runId/import-confirm', async c => {
    const runId = param(c, 'runId', refreshRunIdSchema)
    if (runId instanceof Response) return runId
    const input = await body(c, importConfirmSchema)
    if (input instanceof Response) return input
    const repo = refreshRepository(c.env.DB)
    const run = await repo.getRun(runId)
    if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    const city = await repo.getCity(run.cityAdcode)
    if (!city) return error(c, 404, 'NOT_FOUND', '城市不存在')
    try {
      const preview = await buildRefreshPreview(input.rawJson, city, await repo.listCitySpots(city.adcode), createId)
      if (preview.previewHash !== input.previewHash) return error(c, 409, 'PREVIEW_CHANGED', '粘贴内容已变化，请重新校验预览')
      if (!preview.valid) return error(c, 422, 'PREVIEW_HAS_ERRORS', '预览仍有未处理的结构或匹配错误', preview.errors)
      const saved = await repo.saveImport(runId, input.rawJson, { ...preview.summary, previewHash: preview.previewHash }, preview.candidates, currentTime())
      if (saved === 'invalid_state') return error(c, 409, 'INVALID_REFRESH_STATE', '当前任务状态不能再次导入')
      await curationRepository(c.env.DB).audit('city_refresh.import', 'city_refresh_run', runId, preview.summary, currentTime())
      return c.json({ run: saved, summary: preview.summary }, 201)
    } catch (caught) {
      if (caught instanceof RefreshImportError) return error(c, 400, caught.code, caught.message, caught.details)
      throw caught
    }
  })

  routes.post('/refresh-runs/:runId/confirm-no-change', async c => {
    const runId = param(c, 'runId', refreshRunIdSchema)
    if (runId instanceof Response) return runId
    const input = await body(c, noChangeConfirmSchema)
    if (input instanceof Response) return input
    const repo = refreshRepository(c.env.DB)
    const run = await repo.getRun(runId)
    if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    if (run.status !== 'reviewing') return error(c, 409, 'INVALID_REFRESH_STATE', '当前任务状态不能确认无实质变化')
    const candidates = await repo.getRunCandidates(runId)
    const candidate = candidates.find(item => item.candidateType === 'no_material_change' && item.decision === 'pending')
    if (!candidate) return error(c, 422, 'NO_CHANGE_NOT_AVAILABLE', '当前任务没有待确认的“无实质变化”声明')
    const updated = await repo.decideCandidate(candidate.id, 'accepted', input.note ?? '管理员确认本周无实质变化', currentTime())
    await curationRepository(c.env.DB).audit('city_refresh.confirm_no_change', 'city_refresh_candidate', candidate.id, { runId, note: input.note }, currentTime())
    return c.json(updated)
  })

  routes.post('/refresh-candidates/:candidateId/verify', async c => {
    const candidateId = param(c, 'candidateId', refreshRunIdSchema)
    if (candidateId instanceof Response) return candidateId
    const input = await body(c, emptyActionSchema)
    if (input instanceof Response) return input
    const repo = refreshRepository(c.env.DB)
    const candidate = await repo.getCandidate(candidateId)
    if (!candidate) return error(c, 404, 'NOT_FOUND', '候选不存在')
    if (!['new_spot', 'possible_duplicate', 'rename', 'possible_closed'].includes(candidate.candidateType)) {
      return error(c, 422, 'AMAP_NOT_REQUIRED', '该候选不需要高德验证')
    }
    const run = await repo.getRun(candidate.runId)
    if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    if (run.status !== 'reviewing') return error(c, 409, 'INVALID_REFRESH_STATE', '当前任务状态不能验证候选')
    const spots = await repo.listCitySpots(run.cityAdcode)
    const target = candidate.targetSpotId ? spots.find(spot => spot.id === candidate.targetSpotId) : undefined
    const searchName = candidate.proposedSearchName || candidate.proposedName || target?.searchName
    if (!searchName) return error(c, 422, 'MISSING_SEARCH_NAME', '候选缺少高德搜索名称')
    const match = await verify(searchName, target?.lng ?? 0, target?.lat ?? 0, run.cityAdcode)
    const timestamp = currentTime()
    if (!match) {
      const assessment = candidate.candidateType === 'new_spot' ? 'needs_more_evidence' : 'high_risk_manual_review'
      const updated = await repo.updateCandidateVerification(candidate.id, 'failed', null, assessment, '高德未找到可信匹配，不能据此自动修改地点', timestamp)
      await curationRepository(c.env.DB).audit('city_refresh.verify', 'city_refresh_candidate', candidate.id, { matched: false }, timestamp)
      return c.json(updated)
    }
    const duplicate = spots.find(spot => spot.amapPoiId === match.id
      && (candidate.candidateType === 'possible_duplicate' || spot.id !== candidate.targetSpotId))
    const sourceCount = uniqueEvidenceCount(evidenceUrls(candidate))
    const risk = ['rename', 'possible_closed'].includes(candidate.candidateType)
    const assessment = duplicate ? 'possible_duplicate'
      : risk ? 'high_risk_manual_review'
      : sourceCount < 2 ? 'needs_more_evidence'
      : 'recommended_update'
    const reason = duplicate ? `高德地点编号已被“${duplicate.name}”使用`
      : risk ? '高德仅验证地点存在；关闭或改名仍需人工判断'
      : sourceCount < 2 ? '高德验证成功，但不同来源不足两个'
      : '高德验证成功、来源数量满足要求且未命中现有地点'
    const verification = {
      amapPoiId: match.id,
      amapName: match.name,
      address: match.address,
      lng: match.lng,
      lat: match.lat,
      images: safeAmapImages(match.photos),
    }
    const updated = await repo.updateCandidateVerification(candidate.id, 'verified', verification, assessment, reason, timestamp)
    await curationRepository(c.env.DB).audit('city_refresh.verify', 'city_refresh_candidate', candidate.id, { matched: true, amapPoiId: match.id, duplicateSpotId: duplicate?.id }, timestamp)
    return c.json(updated)
  })

  routes.post('/refresh-candidates/:candidateId/accept', async c => {
    const candidateId = param(c, 'candidateId', refreshRunIdSchema)
    if (candidateId instanceof Response) return candidateId
    const input = await body(c, candidateAcceptSchema)
    if (input instanceof Response) return input
    const refreshRepo = refreshRepository(c.env.DB)
    const candidate = await refreshRepo.getCandidate(candidateId)
    if (!candidate) return error(c, 404, 'NOT_FOUND', '候选不存在')
    if (candidate.decision !== 'pending') return error(c, 409, 'CANDIDATE_ALREADY_REVIEWED', '候选已处理')
    const run = await refreshRepo.getRun(candidate.runId)
    if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    if (run.status !== 'reviewing') return error(c, 409, 'INVALID_REFRESH_STATE', '当前任务状态不能接受候选')
    const timestamp = currentTime()
    const curationRepo = curationRepository(c.env.DB)

    if (candidate.candidateType === 'possible_duplicate') {
      return error(c, 422, 'DUPLICATE_REQUIRES_RESOLUTION', '疑似重复候选不能直接接受，请核对现有地点后拒绝或忽略')
    }

    if (candidate.candidateType === 'new_spot') {
      if (candidate.amapVerificationStatus !== 'verified' || candidate.systemAssessment !== 'recommended_update' || !candidate.amapVerification) {
        return error(c, 422, 'NEW_SPOT_NOT_READY', '新地点必须通过高德验证、来源检查和重复检查后才能接受')
      }
      const run = await refreshRepo.getRun(candidate.runId)
      if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
      const data = candidate.proposedData as Record<string, any>
      const spotId = `curated-${candidate.id}`
      const write: SpotWrite = {
        id: spotId,
        cityAdcode: run.cityAdcode,
        name: String(data.name),
        searchName: String(data.searchName),
        category: data.category,
        tier: data.tier,
        priority: 0,
        reason: String(data.reason),
        tierReason: String(data.tierReason),
        personas: Array.isArray(data.personas) ? data.personas : [],
        tags: Array.isArray(data.tags) ? data.tags : [],
        suggestedDuration: data.suggestedDuration || null,
        bestTime: data.bestTime || null,
        indoorFriendly: !!data.indoorFriendly,
        reservationRequired: !!data.reservationRequired,
        reservationNote: data.reservationNote || null,
        publicationStatus: 'draft',
        sourceKind: 'weekly_refresh',
        sources: candidate.evidence.map((item, index) => ({
          title: typeof item.title === 'string' ? item.title : `复核来源${index + 1}`,
          url: typeof item.url === 'string' ? item.url : null,
          sourceName: typeof item.sourceName === 'string' ? item.sourceName : null,
          checkedAt: timestamp,
        })),
      }
      const created = await curationRepo.createSpot(write, timestamp)
      const verification = candidate.amapVerification as Record<string, any>
      const verified = await curationRepo.setVerification(created.id, created.version, {
        amapName: String(verification.amapName),
        amapPoiId: String(verification.amapPoiId),
        address: String(verification.address ?? ''),
        lng: Number(verification.lng),
        lat: Number(verification.lat),
        coverImageUrl: Array.isArray(verification.images) ? verification.images[0]?.url ?? null : null,
        verificationStatus: 'verified',
        verifiedAt: timestamp,
      }, timestamp)
      await refreshRepo.decideCandidate(candidate.id, 'accepted', input.note ?? '接受为地点草稿', timestamp)
      await curationRepo.audit('city_refresh.accept_new_spot', 'spot', created.id, { candidateId: candidate.id, publicationStatus: 'draft' }, timestamp)
      return c.json({ candidate: await refreshRepo.getCandidate(candidate.id), spot: verified }, 201)
    }

    if (['possible_closed', 'rename'].includes(candidate.candidateType) && !input.highRiskConfirmed) {
      return error(c, 422, 'HIGH_RISK_CONFIRMATION_REQUIRED', '关闭或改名建议必须进行最终人工确认')
    }
    if (candidate.candidateType === 'possible_closed') {
      const updated = await refreshRepo.decideCandidate(candidate.id, 'accepted', input.note ?? '已确认风险；未自动下架', timestamp)
      await curationRepo.audit('city_refresh.accept_closure_risk', 'city_refresh_candidate', candidate.id, { targetSpotId: candidate.targetSpotId, autoApplied: false }, timestamp)
      return c.json({ candidate: updated, spotChanged: false })
    }

    if (!candidate.targetSpotId) return error(c, 422, 'MISSING_TARGET', '现有地点变更缺少目标地点')
    const current = await curationRepo.getSpot(candidate.targetSpotId)
    if (!current) return error(c, 404, 'NOT_FOUND', '目标地点不存在')
    if (input.expectedVersion === undefined) return error(c, 422, 'EXPECTED_VERSION_REQUIRED', '应用现有地点变更必须提供当前版本')
    if (current.publicationStatus === 'published' && !input.applyToPublished) {
      return error(c, 422, 'PUBLISHED_APPLY_CONFIRMATION_REQUIRED', '必须明确确认应用到当前已发布地点')
    }
    const proposed = candidate.proposedData as Record<string, unknown>
    const allowedKeys = [
      'name', 'searchName', 'category', 'tier', 'reason', 'tierReason', 'tags',
      'personas', 'bestTime', 'suggestedDuration', 'indoorFriendly',
      'reservationRequired', 'reservationNote',
    ]
    const changes = Object.fromEntries(Object.entries(proposed).filter(([key]) => allowedKeys.includes(key)))
    const updated = await curationRepo.updateSpot(current.id, input.expectedVersion, changes, timestamp)
    if (updated === 'conflict') return error(c, 409, 'VERSION_CONFLICT', '地点版本已变化，请刷新后重新审核')
    if (!updated) return error(c, 404, 'NOT_FOUND', '目标地点不存在')
    await refreshRepo.decideCandidate(candidate.id, 'accepted', input.note ?? '已应用人工确认的变更', timestamp)
    await curationRepo.audit('city_refresh.accept_existing_update', 'spot', current.id, { candidateId: candidate.id, beforeVersion: current.version, afterVersion: updated.version, diff: candidate.diff }, timestamp)
    return c.json({ candidate: await refreshRepo.getCandidate(candidate.id), spot: updated })
  })

  for (const decision of ['rejected', 'ignored'] as const) {
    const action = decision === 'rejected' ? 'reject' : 'ignore'
    routes.post(`/refresh-candidates/:candidateId/${action}`, async c => {
      const candidateId = param(c, 'candidateId', refreshRunIdSchema)
      if (candidateId instanceof Response) return candidateId
      const input = await body(c, candidateDecisionSchema)
      if (input instanceof Response) return input
      const repo = refreshRepository(c.env.DB)
      const candidate = await repo.getCandidate(candidateId)
      if (!candidate) return error(c, 404, 'NOT_FOUND', '候选不存在')
      if (candidate.decision !== 'pending') return error(c, 409, 'CANDIDATE_ALREADY_REVIEWED', '候选已处理')
      const run = await repo.getRun(candidate.runId)
      if (!run) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
      if (run.status !== 'reviewing') return error(c, 409, 'INVALID_REFRESH_STATE', '当前任务状态不能拒绝或忽略候选')
      const updated = await repo.decideCandidate(candidateId, decision, input.note ?? null, currentTime())
      if (!updated) return error(c, 404, 'NOT_FOUND_OR_REVIEWED', '候选不存在或已处理')
      await curationRepository(c.env.DB).audit(`city_refresh.${action}`, 'city_refresh_candidate', candidateId, { note: input.note }, currentTime())
      return c.json(updated)
    })
  }

  routes.post('/refresh-runs/:runId/complete', async c => {
    const runId = param(c, 'runId', refreshRunIdSchema)
    if (runId instanceof Response) return runId
    const input = await body(c, emptyActionSchema)
    if (input instanceof Response) return input
    const timestamp = currentTime()
    const completed = await refreshRepository(c.env.DB).completeRun(runId, timestamp)
    if (completed === 'pending_candidates') return error(c, 422, 'PENDING_CANDIDATES', '仍有未处理候选，不能完成复核')
    if (completed === 'invalid_state') return error(c, 409, 'INVALID_REFRESH_STATE', '当前任务状态不能完成')
    if (!completed) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    await curationRepository(c.env.DB).audit('city_refresh.complete', 'city_refresh_run', runId, { cityAdcode: completed.cityAdcode, completedAt: timestamp }, timestamp)
    const city = await refreshRepository(c.env.DB).getCity(completed.cityAdcode)
    return c.json({ run: completed, city, nextReviewDueAt: city ? new Date(Date.parse(timestamp) + city.reviewIntervalDays * 86_400_000).toISOString() : null })
  })

  routes.post('/refresh-runs/:runId/cancel', async c => {
    const runId = param(c, 'runId', refreshRunIdSchema)
    if (runId instanceof Response) return runId
    const input = await body(c, emptyActionSchema)
    if (input instanceof Response) return input
    const cancelled = await refreshRepository(c.env.DB).cancelRun(runId, currentTime())
    if (cancelled === 'invalid_state') return error(c, 409, 'INVALID_REFRESH_STATE', '当前任务不能取消')
    if (!cancelled) return error(c, 404, 'NOT_FOUND', '复核任务不存在')
    await curationRepository(c.env.DB).audit('city_refresh.cancel', 'city_refresh_run', runId, {}, currentTime())
    return c.json(cancelled)
  })

  return routes
}
