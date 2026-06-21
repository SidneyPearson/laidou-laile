import { z } from 'zod'

// Stop schema — each stop in a route
const stopSchema = z.object({
  name: z.string().min(1).max(50),
  address: z.string().min(1).max(200),
  visitDurationMinutes: z.number().int().min(5).max(180),
  notes: z.string().min(1).max(300),
  amapPoiId: z.string().nullable(),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  photoTip: z.string().max(200).optional(),
})

// Route schema
const routeSchema = z.object({
  name: z.string().min(2).max(20),
  tagline: z.string().min(2).max(50),
  stops: z.array(stopSchema).min(1).max(6),
  totalDurationMinutes: z.number().int().min(10).max(300),
  walkingDistanceMeters: z.number().int().min(0).max(10000),
  tips: z.string().min(1).max(200),
})

// LLM output schema — array of 1-3 routes
export const llmOutputSchema = z.object({
  routes: z.array(routeSchema).min(1).max(3),
})

export type LLMOutput = z.infer<typeof llmOutputSchema>

/** Parse and validate LLM JSON output. Returns validated routes or null. */
export function parseAndValidate(raw: string): LLMOutput | null {
  // Strip markdown code fences if present
  let json = raw.trim()
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }

  try {
    const parsed = JSON.parse(json)
    const result = llmOutputSchema.safeParse(parsed)
    if (result.success) return result.data
    console.error('LLM output validation failed:', result.error.issues)
    return null
  } catch (err) {
    console.error('LLM output JSON parse failed:', err)
    return null
  }
}

/** Format validation errors for retry prompt */
export function formatValidationErrors(raw: string): string {
  let json = raw.trim()
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  try {
    const parsed = JSON.parse(json)
    const result = llmOutputSchema.safeParse(parsed)
    if (!result.success) {
      return result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')
    }
  } catch {
    return '  - Invalid JSON syntax'
  }
  return '  - Unknown validation error'
}
