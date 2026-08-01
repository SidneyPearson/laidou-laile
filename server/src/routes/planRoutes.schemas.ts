import { z } from 'zod'

// ── Enums (kept in sync with client/src/types/route.ts) ──
const preferenceTag = z.enum(['food', 'wander', 'scenic'])
const cuisineType = z.enum([
  'hotpot', 'noodles', 'pastries', 'bbq',
  'local_cuisine', 'western', 'coffee_tea', 'buffet',
])
const scenicType = z.enum(['popular', 'street'])
const wanderType = z.enum(['shopping', 'cafe', 'entertainment', 'hidden', 'museum'])
const timeOption = z.union([z.literal(60), z.literal(120), z.literal(240), z.literal(480)])
const distanceOption = z.union([
  z.literal(0), z.literal(500), z.literal(1000), z.literal(3000), z.literal(5000),
])

// ── Primitives ─────────────────────────────────────
const lat = z.number().finite().min(-90).max(90)
const lng = z.number().finite().min(-180).max(180)
const customText = z.string().trim().min(1).max(20)

// ── /suggest-order ─────────────────────────────────
const routeAnchor = z.object({
  hotspotId: z.string().trim().regex(/^[a-z0-9-]{3,80}$/),
  amapPoiId: z.string().trim().min(1).max(50),
})

export const suggestOrderRequestSchema = z.object({
  city: z.string().trim().min(1).max(20),
  places: z.array(routeAnchor).min(2).max(6),
  startPeriod: z.enum(['morning', 'afternoon', 'evening']).optional(),
  weather: z.object({
    weather: z.string().trim().max(20),
    isRainy: z.boolean(),
    note: z.string().trim().max(120).optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  const hotspotIds = value.places.map(place => place.hotspotId)
  const poiIds = value.places.map(place => place.amapPoiId)
  if (new Set(hotspotIds).size !== hotspotIds.length || new Set(poiIds).size !== poiIds.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['places'],
      message: '地点不能重复',
    })
  }
})

// ── /generate ──────────────────────────────────────
export const generateRequestSchema = z.object({
  lat,
  lng,
  areaName: z.string().trim().min(1).max(80).optional(),
  timeOption,
  distance: distanceOption,
  preferences: z.array(preferenceTag).min(1).max(3),
  cuisineTypes: z.array(cuisineType).max(8).optional(),
  scenicTypes: z.array(scenicType).max(2).optional(),
  wanderTypes: z.array(wanderType).max(5).optional(),
  customCuisine: z.array(customText).max(5).optional(),
  customScenic: z.array(customText).max(5).optional(),
  customWander: z.array(customText).max(5).optional(),
})
export type GenerateRequest = z.infer<typeof generateRequestSchema>

// ── Route (used by /refine & /replace-stop) ────────
export const stopSchema = z.object({
  name: z.string().min(1).max(80),
  address: z.string().max(200),
  visitDurationMinutes: z.number().int().min(1).max(300),
  notes: z.string().max(400),
  amapPoiId: z.string().max(50).nullable(),
  lng,
  lat,
  photoTip: z.string().max(200).optional(),
  distanceMeters: z.number().finite().min(0).max(100000).optional(),
  openTime: z.string().max(10).optional(),
  closeTime: z.string().max(10).optional(),
  openNow: z.boolean().optional(),
  socialEvidence: z.array(z.object({
    platform: z.enum(['美团', '抖音', '小红书']),
    title: z.string().max(120),
    url: z.string().url().max(2000),
    // Optional while accepting route payloads produced before evidence scoring.
    confidence: z.number().finite().min(0).max(1).optional(),
  })).max(3).optional(),
  recommendationType: z.enum(['social_hot', 'amap_fallback']).optional(),
  socialScore: z.number().finite().min(0).max(100).optional(),
  rankingReason: z.string().max(200).optional(),
  evidenceSummary: z.string().max(200).optional(),
  popularityReason: z.string().max(200).optional(),
})

const routeSchema = z.object({
  id: z.string().max(100),
  kind: z.enum(['route', 'food_list']).optional(),
  name: z.string().min(1).max(30),
  tagline: z.string().max(60),
  stops: z.array(stopSchema).min(1).max(12),
  totalDurationMinutes: z.number().int().min(0).max(1000),
  walkingDistanceMeters: z.number().int().min(0).max(100000),
  tips: z.string().max(400),
  direction: z.string().max(40).optional(),
  reason: z.string().max(200).optional(),
  axes: z.object({
    goal: z.string().max(30),
    behavior: z.string().max(30),
    info: z.string().max(30),
  }).optional(),
  divergenceExempt: z.boolean().optional(),
})

// ── /refine ────────────────────────────────────────
export const refineRequestSchema = z.object({
  route: routeSchema,
  removeStopIndices: z.array(z.number().int().nonnegative()).max(12).default([])
    .transform((arr) => [...new Set(arr)]),
  extraRequirements: z.string().trim().max(200).optional(),
  city: z.string().max(60).default(''),
  weather: z.string().max(30).default('晴'),
  timeMinutes: z.number().int().min(30).max(600).default(240),
  distance: z.number().int().min(0).max(50000).default(0),
  preferences: z.array(preferenceTag).max(3).default([]),
  customCuisine: z.array(customText).max(5).optional(),
  customScenic: z.array(customText).max(5).optional(),
  customWander: z.array(customText).max(5).optional(),
  origin: z.object({ lat, lng }).optional(),
}).superRefine((v, ctx) => {
  const max = v.route.stops.length
  for (const idx of v.removeStopIndices) {
    if (idx >= max) {
      ctx.addIssue({
        code: 'custom',
        path: ['removeStopIndices'],
        message: '要移除的地点不存在',
      })
      break
    }
  }
})
export type RefineRequest = z.infer<typeof refineRequestSchema>

// ── /replace-stop ──────────────────────────────────
export const replaceStopRequestSchema = z.object({
  route: routeSchema,
  stopIndex: z.number().int().nonnegative(),
  preferences: z.array(preferenceTag).max(3).default(['food']),
  distance: z.number().int().min(0).max(50000).default(0),
  adcode: z.string().max(10).optional(),
  timeMinutes: z.number().int().min(30).max(600).optional(),
  origin: z.object({ lat, lng }).optional(),
  customCuisine: z.array(customText).max(5).optional(),
  customScenic: z.array(customText).max(5).optional(),
  customWander: z.array(customText).max(5).optional(),
}).superRefine((v, ctx) => {
  if (v.stopIndex >= v.route.stops.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['stopIndex'],
      message: '要替换的地点不存在',
    })
  }
})
export type ReplaceStopRequest = z.infer<typeof replaceStopRequestSchema>
