import { z } from 'zod'

// Stop schema — LLM outputs name + notes, we fill lng/lat/address/amapPoiId via Amap verification
const stopSchema = z.object({
  name: z.string().min(1).max(50),
  visitDurationMinutes: z.number().int().min(5).max(180),
  notes: z.string().min(1).max(300),
  photoTip: z.string().max(200).optional(),
  // These fields are filled by Amap verification, not by LLM
  address: z.string().max(200).optional(),
  amapPoiId: z.string().nullable().optional(),
  lng: z.number().min(-180).max(180).optional(),
  lat: z.number().min(-90).max(90).optional(),
})

// Route schema
const routeSchema = z.object({
  name: z.string().min(2).max(20),
  tagline: z.string().min(2).max(50),
  stops: z.array(stopSchema).min(1).max(8),
  totalDurationMinutes: z.number().int().min(10).max(540),
  walkingDistanceMeters: z.number().int().min(0).max(50000),
  tips: z.string().min(1).max(200),
  // Structural divergence metadata (3-route mode). Optional: lenient on missing/partial.
  direction: z.string().max(40).optional(),
  reason: z.string().max(120).optional(),
  axes: z.object({
    goal: z.string(),
    behavior: z.string(),
    info: z.string(),
  }).optional(),
})

// LLM output schema — array of 1-3 routes
export const llmOutputSchema = z.object({
  routes: z.array(routeSchema).min(1).max(3),
})

export type LLMOutput = z.infer<typeof llmOutputSchema>

/** Try to repair truncated JSON by closing open structures */
function tryRepairJson(raw: string): string | null {
  let json = raw.trim()

  // Strip markdown fences
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }

  // If it parses as-is, return it
  try { JSON.parse(json); return json } catch {}

  // Count open/close brackets and braces
  let braces = 0, brackets = 0
  let inString = false, escaped = false
  for (let i = 0; i < json.length; i++) {
    const ch = json[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') braces++
    if (ch === '}') braces--
    if (ch === '[') brackets++
    if (ch === ']') brackets--
  }

  // If we're inside a string, close it
  if (inString) json += '"'

  // Close any open structures
  json += ']'.repeat(Math.max(0, brackets)) + '}'.repeat(Math.max(0, braces))

  try { JSON.parse(json); return json } catch { return null }
}

/** Parse and validate LLM JSON output. Returns validated routes or null. */
export function parseAndValidate(raw: string): LLMOutput | null {
  // Try direct parse first
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
  } catch {
    // Try repair on parse failure
    const repaired = tryRepairJson(json)
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired)
        const result = llmOutputSchema.safeParse(parsed)
        if (result.success) {
          console.log('✅ Repaired truncated LLM JSON successfully')
          return result.data
        }
        console.error('LLM output (repaired) validation failed:', result.error.issues)
      } catch {
        console.error('LLM output JSON repair also failed')
      }
    } else {
      console.error('LLM output JSON parse failed: unterminated/invalid')
    }
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
