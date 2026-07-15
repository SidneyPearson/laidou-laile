import { describe, it, expect } from 'vitest'
import {
  generateRequestSchema,
  refineRequestSchema,
  replaceStopRequestSchema,
} from './planRoutes.schemas.js'

const validStop = {
  name: '外婆家',
  address: '南京东路',
  visitDurationMinutes: 60,
  notes: '本帮菜',
  amapPoiId: 'B000A7BD6C',
  lng: 121.47,
  lat: 31.23,
}

const validRoute = {
  id: 'route-1',
  name: '示例路线',
  tagline: '一句话',
  stops: [validStop],
  totalDurationMinutes: 90,
  walkingDistanceMeters: 500,
  tips: '提前预约',
}

describe('generateRequestSchema', () => {
  const base = {
    lat: 31.23, lng: 121.47,
    timeOption: 120, distance: 1000,
    preferences: ['food'],
  }

  it('accepts a minimal valid request', () => {
    const r = generateRequestSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it('rejects non-finite lat/lng', () => {
    expect(generateRequestSchema.safeParse({ ...base, lat: NaN }).success).toBe(false)
    expect(generateRequestSchema.safeParse({ ...base, lng: Infinity }).success).toBe(false)
  })

  it('rejects lat/lng outside range', () => {
    expect(generateRequestSchema.safeParse({ ...base, lat: 100 }).success).toBe(false)
    expect(generateRequestSchema.safeParse({ ...base, lng: -200 }).success).toBe(false)
  })

  it('rejects illegal timeOption', () => {
    expect(generateRequestSchema.safeParse({ ...base, timeOption: 30 }).success).toBe(false)
    expect(generateRequestSchema.safeParse({ ...base, timeOption: 90 }).success).toBe(false)
  })

  it('rejects illegal distance', () => {
    expect(generateRequestSchema.safeParse({ ...base, distance: 2000 }).success).toBe(false)
    expect(generateRequestSchema.safeParse({ ...base, distance: 999 }).success).toBe(false)
  })

  it('rejects unknown preference values', () => {
    expect(generateRequestSchema.safeParse({
      ...base, preferences: ['sleep' as unknown],
    }).success).toBe(false)
  })

  it('rejects empty preferences', () => {
    expect(generateRequestSchema.safeParse({ ...base, preferences: [] }).success).toBe(false)
  })

  it('caps custom* arrays at length 5', () => {
    const many = Array.from({ length: 6 }, (_, i) => `tag${i}`)
    expect(generateRequestSchema.safeParse({ ...base, customCuisine: many }).success).toBe(false)
  })

  it('rejects overly long custom text', () => {
    expect(generateRequestSchema.safeParse({
      ...base, customCuisine: ['A'.repeat(21)],
    }).success).toBe(false)
  })

  it('trims custom text', () => {
    const r = generateRequestSchema.safeParse({ ...base, customCuisine: ['  火锅  '] })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.customCuisine?.[0]).toBe('火锅')
    }
  })
})

describe('refineRequestSchema', () => {
  const base = {
    route: validRoute,
    removeStopIndices: [0],
    city: '上海',
    weather: '晴',
    timeMinutes: 240,
    distance: 1000,
  }

  it('accepts a valid request', () => {
    expect(refineRequestSchema.safeParse(base).success).toBe(true)
  })

  it('applies defaults for optional fields', () => {
    const r = refineRequestSchema.safeParse({
      route: validRoute,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.removeStopIndices).toEqual([])
      expect(r.data.city).toBe('')
      expect(r.data.weather).toBe('晴')
      expect(r.data.timeMinutes).toBe(240)
      expect(r.data.distance).toBe(0)
    }
  })

  it('rejects negative removeStopIndices', () => {
    expect(refineRequestSchema.safeParse({
      ...base, removeStopIndices: [-1],
    }).success).toBe(false)
  })

  it('rejects out-of-range removeStopIndices', () => {
    // route has 1 stop → index 5 is invalid
    expect(refineRequestSchema.safeParse({
      ...base, removeStopIndices: [5],
    }).success).toBe(false)
  })

  it('dedupes removeStopIndices', () => {
    const routeWith3 = {
      ...validRoute,
      stops: [validStop, validStop, validStop],
    }
    const r = refineRequestSchema.safeParse({
      ...base, route: routeWith3, removeStopIndices: [0, 0, 1, 1, 2],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.removeStopIndices).toEqual([0, 1, 2])
    }
  })

  it('rejects extra requirements longer than 200 chars', () => {
    expect(refineRequestSchema.safeParse({
      ...base, extraRequirements: 'A'.repeat(201),
    }).success).toBe(false)
  })
})

describe('replaceStopRequestSchema', () => {
  const base = {
    route: validRoute,
    stopIndex: 0,
    preferences: ['food'],
    distance: 1000,
  }

  it('accepts a valid request', () => {
    expect(replaceStopRequestSchema.safeParse(base).success).toBe(true)
  })

  it('rejects out-of-range stopIndex', () => {
    expect(replaceStopRequestSchema.safeParse({
      ...base, stopIndex: 99,
    }).success).toBe(false)
  })

  it('rejects negative stopIndex', () => {
    expect(replaceStopRequestSchema.safeParse({
      ...base, stopIndex: -1,
    }).success).toBe(false)
  })

  it('defaults preferences to ["food"] when absent', () => {
    const r = replaceStopRequestSchema.safeParse({
      route: validRoute, stopIndex: 0,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.preferences).toEqual(['food'])
    }
  })
})
