import { describe, expect, it } from 'vitest'
import type { CityRecord, SpotRecord } from './curation.js'
import {
  buildWeeklyReviewPrompt,
  calculateCityReviewState,
} from './weeklyRefresh.js'
import {
  buildRefreshPreview,
  parseExternalRefreshJson,
  RefreshImportError,
} from '../services/weeklyRefreshService.js'

function city(overrides: Partial<CityRecord> = {}): CityRecord {
  return {
    adcode: '310000',
    provinceName: '上海',
    name: '上海',
    slug: 'shanghai',
    intro: null,
    coverImageUrl: null,
    status: 'published',
    priority: 1,
    reviewIntervalDays: 7,
    lastContentReviewAt: '2026-07-01T00:00:00.000Z',
    lastRefreshRunId: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function spot(overrides: Partial<SpotRecord> = {}): SpotRecord {
  return {
    id: 'shanghai-the-bund',
    cityAdcode: '310000',
    name: '外滩',
    searchName: '外滩',
    amapName: '外滩',
    amapPoiId: 'POI1',
    district: null,
    address: null,
    lng: 121,
    lat: 31,
    category: 'classic_landmark',
    tier: 'S',
    priority: 100,
    reason: '推荐',
    tierReason: '全国知名',
    personas: [],
    tags: [],
    suggestedDuration: null,
    bestTime: null,
    indoorFriendly: false,
    reservationRequired: false,
    reservationNote: null,
    coverImageUrl: null,
    verificationStatus: 'verified',
    verifiedAt: '',
    publicationStatus: 'published',
    sourceKind: null,
    version: 2,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    city: { name: '上海', adcode: '310000' },
    researchedAt: '2026-07-26T00:00:00.000Z',
    searchSummary: '已检索官方网站与权威媒体。',
    noMaterialChange: true,
    sources: [{
      title: '官方来源',
      url: 'https://example.com/official',
      sourceName: '官方网站',
      sourceKind: 'official',
    }],
    existingSpotChanges: [],
    newCandidates: [],
    possibleClosedOrRenamed: [],
    ...overrides,
  }
}

describe('weekly city review timing', () => {
  it('marks a published city due exactly seven days after review', () => {
    const state = calculateCityReviewState(city(), '2026-07-08T00:00:00.000Z')
    expect(state.due).toBe(true)
    expect(state.overdueDays).toBe(0)
    expect(state.label).toBe('今天到期')
  })

  it('does not remind before the interval and counts overdue days from day eight', () => {
    expect(calculateCityReviewState(city(), '2026-07-07T23:59:59.000Z').due).toBe(false)
    expect(calculateCityReviewState(city(), '2026-07-09T00:00:00.000Z').overdueDays).toBe(1)
  })

  it('does not remind draft or disabled cities', () => {
    expect(calculateCityReviewState(city({ status: 'draft' }), '2026-08-01T00:00:00.000Z').due).toBe(false)
    expect(calculateCityReviewState(city({ status: 'disabled' }), '2026-08-01T00:00:00.000Z').due).toBe(false)
  })

  it('marks a never-reviewed published city as due', () => {
    const state = calculateCityReviewState(city({ lastContentReviewAt: null }), '2026-07-26T00:00:00.000Z')
    expect(state).toMatchObject({ due: true, neverReviewed: true, label: '从未复核' })
  })
})

describe('weekly review prompt and untrusted import', () => {
  it('includes current spots, categories, tiers and web-search safeguards without secrets', () => {
    const prompt = buildWeeklyReviewPrompt(city(), [spot()], '2026-07-26T00:00:00.000Z')
    expect(prompt).toContain('shanghai-the-bund｜外滩｜classic_landmark｜S')
    expect(prompt).toContain('museum_culture')
    expect(prompt).toContain('务必联网搜索')
    expect(prompt).toContain('只输出合法 JSON')
    expect(prompt.toLowerCase()).not.toContain('admin_session_secret')
    expect(prompt.toLowerCase()).not.toContain('cookie')
  })

  it('rejects malformed JSON and Markdown code fences explicitly', () => {
    expect(() => parseExternalRefreshJson('{')).toThrowError(RefreshImportError)
    expect(() => parseExternalRefreshJson('```json\n{}\n```')).toThrow('去掉Markdown代码块')
  })

  it('rejects unknown schema versions, non-HTTPS sources and illegal personas', () => {
    expect(() => parseExternalRefreshJson(JSON.stringify(result({ schemaVersion: '2.0' })))).toThrow('schemaVersion')
    expect(() => parseExternalRefreshJson(JSON.stringify(result({
      sources: [{ title: 'x', url: 'http://example.com', sourceName: 'x', sourceKind: 'official' }],
    })))).toThrow('HTTPS')
    expect(() => parseExternalRefreshJson(JSON.stringify(result({
      noMaterialChange: false,
      newCandidates: [{
        name: '新地点',
        searchName: '新地点',
        category: 'nature',
        suggestedTier: 'B',
        reason: '推荐理由',
        tierReason: '级别理由',
        tags: [],
        personas: ['hacker'],
        bestTime: '',
        suggestedDuration: '',
        indoorFriendly: false,
        reservationRequired: false,
        reservationNote: '',
        evidenceUrls: ['https://a.example/x', 'https://b.example/y'],
      }],
    })))).toThrow()
  })

  it('rejects city mismatch and combined candidate counts over 50', async () => {
    await expect(buildRefreshPreview(
      JSON.stringify(result({ city: { name: '北京', adcode: '110000' } })),
      city(),
      [spot()],
      () => 'a'.repeat(32),
    )).rejects.toThrow('上海')

    const changes = Array.from({ length: 50 }, (_, index) => ({
      spotId: `spot-${index}`,
      changeType: 'tier_change',
      proposed: { tier: 'A' },
      reason: '变化',
      evidenceUrls: [],
    }))
    expect(() => parseExternalRefreshJson(JSON.stringify(result({
      noMaterialChange: false,
      existingSpotChanges: changes,
      newCandidates: [{
        name: '新地点', searchName: '新地点', category: 'nature', suggestedTier: 'B',
        reason: '推荐', tierReason: '级别', tags: [], personas: [], bestTime: '',
        suggestedDuration: '', indoorFriendly: false, reservationRequired: false,
        reservationNote: '', evidenceUrls: [],
      }],
    })))).toThrow('最多导入50条')
  })

  it('keeps XSS-looking strings as plain candidate text and never creates a spot during preview', async () => {
    const raw = JSON.stringify(result({
      noMaterialChange: false,
      newCandidates: [{
        name: '<img src=x onerror=alert(1)>',
        searchName: '测试地点',
        category: 'nature',
        suggestedTier: 'B',
        reason: '<script>alert(1)</script>',
        tierReason: '测试',
        tags: [],
        personas: [],
        bestTime: '',
        suggestedDuration: '',
        indoorFriendly: false,
        reservationRequired: false,
        reservationNote: '',
        evidenceUrls: ['https://a.example/x', 'https://b.example/y'],
      }],
    }))
    const preview = await buildRefreshPreview(raw, city(), [spot()], () => 'b'.repeat(32))
    expect(preview.candidates[0].proposedName).toBe('<img src=x onerror=alert(1)>')
    expect(preview.candidates[0].systemAssessment).toBe('needs_amap_verification')
    expect(preview.candidates[0].proposedData.reason).toBe('<script>alert(1)</script>')
  })

  it('marks synonymous punctuation-only updates as no material change', async () => {
    const preview = await buildRefreshPreview(JSON.stringify(result({
      noMaterialChange: false,
      existingSpotChanges: [{
        spotId: 'shanghai-the-bund',
        changeType: 'existing_update',
        proposed: { reason: '推，荐。' },
        reason: '文案整理',
        evidenceUrls: [],
      }],
    })), city(), [spot()], () => 'c'.repeat(32))
    expect(preview.candidates[0]).toMatchObject({
      candidateType: 'no_material_change',
      systemAssessment: 'no_material_change',
    })
  })
})
