import { z } from 'zod'
import { safeCoverImageUrl } from '../services/amap/imagePolicy.js'

// Homepage persona cards use the fixed Persona id contract; only display fields,
// order and the enabled flag are editable.
export const personaIdSchema = z.enum(['fast', 'couple', 'family', 'lazy', 'urban'])

const nullableImage = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional()
  .refine(value => value == null || safeCoverImageUrl(value) !== null, '图片必须是 https:// 地址或本地上传的 /covers/ 路径')

export const homePersonaUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(20).optional(),
    subtitle: z.string().trim().max(40).nullable().optional(),
    imageUrl: nullableImage,
    sortOrder: z.number().int().min(-10000).max(10000).optional(),
    enabled: z.boolean().optional(),
    expectedVersion: z.number().int().min(1),
  })
  .strict()
