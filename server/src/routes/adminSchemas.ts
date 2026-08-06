import { z } from 'zod'
import { cityStatusSchema, publicationStatusSchema, spotCategorySchema, spotTierSchema, verificationStatusSchema } from '../domain/curation.js'
import { safeHttpsImageUrl } from '../services/amap/imagePolicy.js'

const shortText = z.string().trim().min(1).max(120)
const nullableUrl = z.string().trim().url().max(1000).nullable().optional()
const nullableHttpsImage = nullableUrl.refine(value => value == null || safeHttpsImageUrl(value) !== null, '封面必须是 https:// 开头的图片地址')
export const paginationSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict()

export const cityListSchema = paginationSchema.extend({ keyword: z.string().trim().max(80).optional() }).strict()
export const cityCreateSchema = z.object({
  adcode: z.string().regex(/^\d{6}$/), provinceName: shortText, name: shortText,
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/), intro: z.string().trim().max(1000).nullable().optional(),
  coverImageUrl: nullableHttpsImage, status: cityStatusSchema, priority: z.number().int().min(-10000).max(10000),
  reviewIntervalDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
}).strict()
export const cityUpdateSchema = cityCreateSchema.omit({ adcode: true }).partial().strict()

const sourceSchema = z.object({ title: shortText, url: nullableUrl, sourceName: z.string().trim().max(120).nullable().optional(), checkedAt: z.string().datetime().nullable().optional() }).strict()
export const spotWriteSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]{3,100}$/), cityAdcode: z.string().regex(/^\d{6}$/), name: shortText, searchName: shortText,
  district: z.string().trim().max(120).nullable().optional(), address: z.string().trim().max(300).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(), lat: z.number().min(-90).max(90).nullable().optional(),
  category: spotCategorySchema, tier: spotTierSchema, priority: z.number().int().min(-10000).max(10000),
  reason: z.string().trim().min(1).max(1000), tierReason: z.string().trim().min(1).max(1000),
  personas: z.array(z.string().trim().min(1).max(40)).max(30), tags: z.array(z.string().trim().min(1).max(40)).max(30),
  suggestedDuration: z.string().trim().max(100).nullable().optional(), bestTime: z.string().trim().max(120).nullable().optional(),
  indoorFriendly: z.boolean(), reservationRequired: z.boolean(), reservationNote: z.string().trim().max(500).nullable().optional(),
  coverImageUrl: nullableHttpsImage, publicationStatus: publicationStatusSchema, sourceKind: z.string().trim().max(60).nullable().optional(),
  sources: z.array(sourceSchema).max(20).optional(),
}).strict()
export const spotCreateSchema = spotWriteSchema
export const spotUpdateSchema = spotWriteSchema.omit({ id: true }).partial().extend({ expectedVersion: z.number().int().min(1) }).strict()
export const spotListSchema = paginationSchema.extend({ keyword: z.string().trim().max(80).optional(), cityAdcode: z.string().regex(/^\d{6}$/).optional(), category: spotCategorySchema.optional(), tier: spotTierSchema.optional(), verificationStatus: verificationStatusSchema.optional(), publicationStatus: publicationStatusSchema.optional() }).strict()
export const versionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict()
export const batchPublishSchema = z.object({ spots: z.array(z.object({ id: z.string().min(1).max(100), expectedVersion: z.number().int().min(1) }).strict()).min(1).max(50) }).strict()
export const loginSchema = z.object({ password: z.string().min(1).max(1024) }).strict()
