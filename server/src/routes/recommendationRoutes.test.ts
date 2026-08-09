import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Bindings } from '../config/env.js'
import type { CityRecord, SpotRecord } from '../domain/curation.js'
import type { CurationRepository } from '../repositories/curationRepository.js'
import { createRecommendationRoutes } from './recommendationRoutes.js'

const env = { DB: {} as D1Database } as Bindings
const city: CityRecord = {
  adcode: '310000',
  provinceName: '上海',
  name: '上海',
  slug: 'shanghai',
  intro: null,
  coverImageUrl: null,
  status: 'published',
  priority: 1,
  reviewIntervalDays: 7,
  lastContentReviewAt: null,
  lastRefreshRunId: null,
  createdAt: '',
  updatedAt: '',
}

const baseSpot: SpotRecord = {
  id: 'bund',
  cityAdcode: '310000',
  name: '外滩',
  searchName: '外滩',
  amapName: '外滩',
  amapPoiId: 'B0TEST',
  district: '黄浦区',
  address: null,
  lng: 121.49,
  lat: 31.24,
  category: 'classic_landmark',
  tier: 'A',
  priority: 1,
  reason: '推荐',
  tierReason: '理由',
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
  version: 1,
  createdAt: '',
  updatedAt: '',
}

function repository(overrides: Partial<CurationRepository> = {}): CurationRepository {
  return {
    async listCities(query) {
      return {
        items: query.page === 1 ? [city] : [],
        page: query.page,
        pageSize: query.pageSize,
        total: 1,
        totalPages: 1,
      }
    },
    async listPublishedCities() { return [city] },
    async findPublishedCity() { return null },
    async listPublished() { return [] },
    async createCity() { throw new Error('unused') },
    async updateCity() { return null },
    async listSpots() { return { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 } },
    async getSpot() { return null },
    async createSpot() { throw new Error('unused') },
    async updateSpot() { return null },
    async setVerification() { return null },
    async setPublication() { return null },
    async deleteSpot() { return null },
    async dashboard() { return { publishedCities: 0, draftSpots: 0, pendingReview: 0, publishedSpots: 0, verificationFailed: 0, staleSpots: 0 } },
    async audit() {},
    ...overrides,
  }
}

function app(repo: CurationRepository) {
  const value = new Hono<{ Bindings: Bindings }>()
  value.route('/api/recommendations/cities', createRecommendationRoutes({ repository: () => repo }))
  return value
}

describe('city recommendation routes', () => {
  it('rejects invalid recommendation query values instead of silently ignoring them', async () => {
    const response = await app(repository()).request(
      '/api/recommendations/cities?category=wrong&rainy=maybe',
      {},
      env,
    )
    expect(response.status).toBe(400)
  })

  it('exposes only published cities that carry at least one published, verified spot', async () => {
    const repo = repository({
      async listPublished() {
        return [{
          ...baseSpot,
          id: 'bund',
          name: '外滩',
          category: 'classic_landmark',
          tier: 'A',
        }]
      },
    })
    const response = await app(repo).request('/api/recommendations/cities', {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      source: 'd1',
      managedAdcodes: ['310000'],
      cities: [{ adcode: '310000', coverImageUrl: null, attractions: [{ id: 'bund' }] }],
    })
  })

  it('hides a published city whose spots are all draft/unverified (empty result, not a restore)', async () => {
    // listPublished already returns [] by default, simulating no public spots.
    const response = await app(repository()).request('/api/recommendations/cities', {}, env)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ source: 'd1', cities: [] })
  })

  it('returns a transparent 503 static fallback when D1 is unavailable', async () => {
    const repo = repository({
      async listPublishedCities(): Promise<CityRecord[]> { throw new Error('no such table') },
    })
    const response = await app(repo).request('/api/recommendations/cities', {}, env)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      source: 'static_fallback',
      fallbackReason: 'D1_UNAVAILABLE',
    })
  })

  it('keeps S/A ahead of a matched high-priority B and excludes C', async () => {
    const base: SpotRecord = {
      id: 'a',
      cityAdcode: '310000',
      name: 'A',
      searchName: 'A',
      amapName: 'A',
      amapPoiId: 'poi',
      district: null,
      address: null,
      lng: 121,
      lat: 31,
      category: 'museum_culture',
      tier: 'A',
      priority: 1,
      reason: '推荐',
      tierReason: '理由',
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
      version: 1,
      createdAt: '',
      updatedAt: '',
    }
    const response = await app(repository({
      async listPublished() {
        return [
          base,
          { ...base, id: 'b', name: 'B', tier: 'B', priority: 999, personas: ['culture'] },
          { ...base, id: 'c', name: 'C', tier: 'C', priority: 999 },
        ]
      },
    })).request('/api/recommendations/cities?personas=culture', {}, env)
    expect(response.status).toBe(200)
    const body = await response.json() as { cities: Array<{ attractions: Array<{ id: string }> }> }
    expect(body.cities[0].attractions.map(spot => spot.id)).toEqual(['a', 'b'])
  })
})
