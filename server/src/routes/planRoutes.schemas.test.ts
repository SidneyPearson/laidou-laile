import { describe, it, expect } from 'vitest'
import {
  generateRequestSchema,
  refineRequestSchema,
  replaceStopRequestSchema,
  stopSchema,
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

describe('stopSchema recommendation contracts', () => {
  it('accepts and preserves a social recommendation with scored evidence', () => {
    const parsed = stopSchema.parse({
      ...validStop,
      recommendationType: 'social_hot',
      socialScore: 82,
      rankingReason: '小红书与抖音均有公开提及',
      evidenceSummary: '2个平台公开提及',
      socialEvidence: [{
        platform: '小红书',
        title: '探店笔记',
        url: 'https://www.xiaohongshu.com/explore/1',
        confidence: 0.92,
      }],
    })

    expect(parsed).toMatchObject({
      recommendationType: 'social_hot',
      socialScore: 82,
      rankingReason: '小红书与抖音均有公开提及',
      evidenceSummary: '2个平台公开提及',
      socialEvidence: [{ confidence: 0.92 }],
    })
  })

  it('accepts an Amap fallback with no social evidence', () => {
    expect(stopSchema.parse({
      ...validStop,
      recommendationType: 'amap_fallback',
      socialScore: 0,
      socialEvidence: [],
    })).toMatchObject({
      recommendationType: 'amap_fallback',
      socialScore: 0,
      socialEvidence: [],
    })
  })

  it('constrains confidence to 0..1 and socialScore to 0..100', () => {
    const evidence = {
      platform: '小红书',
      title: '探店笔记',
      url: 'https://www.xiaohongshu.com/explore/1',
    }

    expect(stopSchema.safeParse({
      ...validStop,
      socialEvidence: [{ ...evidence, confidence: -0.01 }],
    }).success).toBe(false)
    expect(stopSchema.safeParse({
      ...validStop,
      socialEvidence: [{ ...evidence, confidence: 1.01 }],
    }).success).toBe(false)
    expect(stopSchema.safeParse({ ...validStop, socialScore: -1 }).success).toBe(false)
    expect(stopSchema.safeParse({ ...validStop, socialScore: 101 }).success).toBe(false)
  })

  it('keeps legacy stops and unscored legacy evidence compatible', () => {
    expect(stopSchema.safeParse(validStop).success).toBe(true)
    expect(stopSchema.safeParse({
      ...validStop,
      socialEvidence: [{
        platform: '美团',
        title: '旧版公开证据',
        url: 'https://www.dianping.com/shop/1',
      }],
    }).success).toBe(true)
  })
})

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

  it('accepts and trims an optional selected area name', () => {
    const r = generateRequestSchema.safeParse({ ...base, areaName: '  宽窄巷子  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.areaName).toBe('宽窄巷子')
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

  it('accepts and trims inherited custom preference fields', () => {
    const r = refineRequestSchema.safeParse({
      ...base, customCuisine: ['  本帮面  '], customScenic: ['古迹'], customWander: ['咖啡'],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.customCuisine).toEqual(['本帮面'])
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

  it('accepts inherited custom preference fields', () => {
    expect(replaceStopRequestSchema.safeParse({
      ...base, customCuisine: ['本帮面'], customScenic: ['古迹'], customWander: ['咖啡'],
    }).success).toBe(true)
  })
})
