import { z } from 'zod'

export const personaSchema = z.enum(['fast', 'couple', 'family', 'lazy', 'urban'])
export const exploreCategorySchema = z.enum([
  'all',
  'landmark',
  'district',
  'theme_park',
  'nature',
  'street',
  'mall',
  'food',
  'museum',
])

const queryCoordinate = (min: number, max: number) => z.preprocess(
  value => value === '' || value === undefined || value === null ? undefined : value,
  z.coerce.number().finite().min(min).max(max),
)

export const cityContextQuerySchema = z.object({
  lat: queryCoordinate(-90, 90),
  lng: queryCoordinate(-180, 180),
})

export const exploreRecommendRequestSchema = z.object({
  city: z.string().trim().min(1).max(30),
  adcode: z.string().trim().regex(/^\d{6}$/).optional(),
  persona: personaSchema,
  category: exploreCategorySchema,
  cursor: z.number().int().min(0).max(1000).default(0),
  limit: z.number().int().min(1).max(6).default(6),
  isRainy: z.boolean().default(false),
  // Optional user location. When both are provided the feed is boosted/ranked
  // by real distance from the user (and each spot returns distanceMeters).
  lat: queryCoordinate(-90, 90).optional(),
  lng: queryCoordinate(-180, 180).optional(),
}).refine(
  data => (data.lat === undefined) === (data.lng === undefined),
  { message: 'lat 和 lng 必须同时提供', path: ['lat'] },
)

export type ExploreRecommendRequest = z.infer<typeof exploreRecommendRequestSchema>
