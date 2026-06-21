import { v4 as uuid } from 'uuid'
import { chatCompletionWithFallback } from './llm/client.js'
import { buildUserPrompt, SYSTEM_PROMPT } from './llm/prompt.js'
import { parseAndValidate, formatValidationErrors } from './llm/schema.js'
import type { AmapPOI } from '../types/poi.js'
import type { Route, Stop, PreferenceTag } from '../types/route.js'

// ── Types ──────────────────────────────────────────────

export interface PlanInput {
  /** User position */
  position: { lat: number; lng: number }
  /** City / district name from reverse geocode */
  city: string
  /** Current weather text, e.g. "多云" */
  weather: string
  /** Available time in minutes: 30 | 60 | 120 | 240 */
  timeMinutes: number
  /** Selected preference tags */
  preferences: PreferenceTag[]
  /** POI list from Amap — the ONLY allowed data source */
  pois: AmapPOI[]
}

export interface PlanOutput {
  routes: Route[]
  /** How the routes were generated */
  source: 'ai' | 'fallback'
  /** Reason for fallback (null if AI succeeded) */
  fallbackReason: string | null
}

// ── Main entry ────────────────────────────────────────

/**
 * Generate routes from POIs using AI (DeepSeek).
 * Falls back to rule-based generation if AI fails or returns invalid output.
 */
export async function generatePlan(input: PlanInput): Promise<PlanOutput> {
  const { pois, timeMinutes, preferences } = input

  // Guard: no POIs → immediate fallback
  if (pois.length === 0) {
    return {
      routes: [],
      source: 'fallback',
      fallbackReason: '附近暂无POI数据',
    }
  }

  // Try AI
  try {
    const aiRoutes = await tryAIGeneration(input)
    if (aiRoutes && aiRoutes.length > 0) {
      return { routes: aiRoutes, source: 'ai', fallbackReason: null }
    }
  } catch (err: any) {
    console.error('AI planning failed:', err.message)
  }

  // Fallback
  const fallbackRoutes = buildFallbackRoutes(pois, timeMinutes, preferences)
  return {
    routes: fallbackRoutes,
    source: 'fallback',
    fallbackReason: 'AI服务暂不可用，已为您生成基础路线',
  }
}

// ── AI path ───────────────────────────────────────────

async function tryAIGeneration(input: PlanInput): Promise<Route[] | null> {
  const { pois, timeMinutes, preferences, city, weather } = input

  // Build prompt
  const userPrompt = buildUserPrompt({
    city,
    weather,
    timeMinutes,
    preferences,
    pois,
  })

  // Call LLM
  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    })
  } catch {
    return null // → fallback
  }

  // Parse & validate JSON structure
  let validated = parseAndValidate(raw)

  // Retry once on schema failure
  if (!validated) {
    const errors = formatValidationErrors(raw)
    const retryPrompt = `${userPrompt}\n\n## ⚠️ 上次格式错误\n${errors}\n\n请修正后重新输出 JSON。`
    try {
      raw = await chatCompletionWithFallback({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: retryPrompt },
        ],
        temperature: 0.3,
      })
      validated = parseAndValidate(raw)
    } catch {
      // retry failed → fallback
    }
  }

  if (!validated) return null

  // Anti-hallucination: verify POIs exist in input
  const poiIndex = buildPoiIndex(pois)
  const cleanRoutes = validated.routes.map((r) => ({
    ...r,
    id: uuid(),
    stops: r.stops
      .map((s) => sanitizeStop(s, poiIndex))
      .filter((s): s is Stop => s !== null),
  })).filter((r) => r.stops.length > 0)

  return cleanRoutes.length > 0 ? cleanRoutes : null
}

// ── POI verification ──────────────────────────────────

interface PoiRecord {
  id: string
  name: string
  address: string
  lng: number
  lat: number
}

function buildPoiIndex(pois: AmapPOI[]): Map<string, PoiRecord> {
  const idx = new Map<string, PoiRecord>()
  for (const p of pois) {
    const key = normalizeKey(p.name)
    idx.set(p.id, { id: p.id, name: p.name, address: p.address, lng: p.lng, lat: p.lat })
    idx.set(key, { id: p.id, name: p.name, address: p.address, lng: p.lng, lat: p.lat })
  }
  return idx
}

function normalizeKey(s: string): string {
  return s.replace(/[（）()\s·.\-—]/g, '').toLowerCase().slice(0, 20)
}

/** Verify and fix a stop. Returns null if it can't be matched to any POI. */
function sanitizeStop(
  stop: { name: string; address: string; visitDurationMinutes: number; notes: string; amapPoiId: string | null; lng: number; lat: number },
  poiIndex: Map<string, PoiRecord>,
): Stop | null {
  // 1. Match by amapPoiId
  if (stop.amapPoiId && poiIndex.has(stop.amapPoiId)) {
    const p = poiIndex.get(stop.amapPoiId)!
    return { ...stop, name: p.name, address: p.address, lng: p.lng, lat: p.lat, amapPoiId: p.id }
  }

  // 2. Match by normalized name
  const nameKey = normalizeKey(stop.name)
  if (poiIndex.has(nameKey)) {
    const p = poiIndex.get(nameKey)!
    return { ...stop, name: p.name, address: p.address, lng: p.lng, lat: p.lat, amapPoiId: p.id }
  }

  // 3. Fuzzy: check if the stop name contains a POI name or vice versa
  for (const [, p] of poiIndex) {
    if (normalizeKey(stop.name).includes(normalizeKey(p.name)) ||
        normalizeKey(p.name).includes(normalizeKey(stop.name))) {
      return { ...stop, name: p.name, address: p.address, lng: p.lng, lat: p.lat, amapPoiId: p.id }
    }
  }

  // 4. Reject — this stop was hallucinated by the LLM
  console.warn(`⚠️ Hallucinated stop rejected: "${stop.name}"`)
  return null
}

// ── Rule-based fallback ──────────────────────────────

const PREF_LABELS: Record<string, string> = {
  food: '美食', wander: '休闲', photo: '出片', less_walk: '轻松',
  local: '本地', rainy_day: '室内',
}

function buildFallbackRoutes(
  pois: AmapPOI[],
  timeMinutes: number,
  preferences: PreferenceTag[],
): Route[] {
  const prefLabel = [...new Set(preferences.map((p) => PREF_LABELS[p] || p))].join('')

  // Deduplicate + sort by distance
  const seen = new Set<string>()
  const sorted = pois.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  }).sort((a, b) => a.distance - b.distance)

  // Split into 3 routes, max 4 stops each
  const routes: Route[] = []
  const perRoute = Math.max(2, Math.ceil(sorted.length / 3))
  const chunks = Math.min(3, Math.ceil(sorted.length / perRoute))

  for (let i = 0; i < chunks; i++) {
    const chunk = sorted.slice(i * perRoute, (i + 1) * perRoute)
    if (chunk.length === 0) continue

    const stops: Stop[] = chunk.map((p) => ({
      name: p.name,
      address: p.address,
      visitDurationMinutes: estimateDuration(p),
      notes: `${p.address}，距您约${fmtDist(p.distance)}`,
      amapPoiId: p.id,
      lng: p.lng,
      lat: p.lat,
    }))

    const totalDur = stops.reduce((s, st) => s + st.visitDurationMinutes, 0)
    const walkDist = estimateWalkDist(chunk)

    routes.push({
      id: uuid(),
      name: chunk.length === 1 ? `逛逛${chunk[0].name.slice(0, 6)}` : `${prefLabel}路线${i + 1}`,
      tagline: `${timeMinutes}分钟 · ${stops.length}个地点`,
      stops,
      totalDurationMinutes: totalDur + Math.ceil(walkDist / 100 * 1.5),
      walkingDistanceMeters: walkDist,
      tips: walkDist < 600 ? '全程步行即可，距离很近' : '可步行+共享单车结合',
    })
  }

  return routes
}

function estimateDuration(poi: AmapPOI): number {
  if (poi.typecode.startsWith('05')) return 25
  if (poi.typecode.startsWith('0604')) return 45
  if (poi.typecode.startsWith('11') || poi.typecode.startsWith('14')) return 35
  return 20
}

function estimateWalkDist(pois: AmapPOI[]): number {
  let total = 0
  for (let i = 1; i < pois.length; i++) {
    total += Math.abs(pois[i].distance - pois[i - 1].distance)
  }
  return total
}

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}
