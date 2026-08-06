import { z } from 'zod'

// ── /suggest-order ─────────────────────────────────
// Only reorders the exact curated place references supplied by the user.
// Never searches for, generates, adds, or replaces a place.
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
