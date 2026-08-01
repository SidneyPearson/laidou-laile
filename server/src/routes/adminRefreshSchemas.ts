import { z } from 'zod'

export const refreshRunIdSchema = z.string().trim().regex(/^[a-f0-9]{32}$/)
export const refreshAdcodeSchema = z.string().regex(/^\d{6}$/)
export const importPreviewSchema = z.object({
  rawJson: z.string().min(2).max(256 * 1024),
}).strict()
export const importConfirmSchema = importPreviewSchema.extend({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export const noChangeConfirmSchema = z.object({
  confirmed: z.literal(true),
  note: z.string().trim().max(500).nullable().optional(),
}).strict()
export const candidateDecisionSchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
}).strict()
export const candidateAcceptSchema = candidateDecisionSchema.extend({
  expectedVersion: z.number().int().min(1).optional(),
  applyToPublished: z.boolean().default(false),
  highRiskConfirmed: z.boolean().default(false),
}).strict()
export const emptyActionSchema = z.object({}).strict()
