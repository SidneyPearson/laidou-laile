import { chatCompletionWithFallback } from '../llm/client.js'
import { searchNearbyPOIs } from '../amap/poiSearch.js'
import { haversineDist } from '../../utils/geo.js'
import type { AmapPOI } from '../../types/poi.js'
import type { Route, Stop, PreferenceTag } from '../../types/route.js'
import type { PlanInput } from './types.js'
import { estimateWalkDistFromStops, fmtDist } from './routeMetrics.js'
import { estimateVisitDuration } from './timeBudget.js'

/**
 * Scenic-only without sub-types: search Amap for scenic POIs, LLM organizes
 * into themed routes.
 */
export async function generateScenicRoutes(input: PlanInput): Promise<Route[] | null> {
  const isCityWide = input.distance === 0
  const scenicKws = isCityWide
    ? `${input.city}必去|${input.city}地标|著名景点|5A景区|热门景点|名胜古迹`
    : '景点|名胜|地标|故居|博物馆|园林|打卡'
  return generateThemedRoutes(input, ['scenic'], '景点|名胜|地标|故居|博物馆|园林|打卡', scenicKws)
}

/** Wander-only without sub-types. */
export async function generateWanderRoutes(input: PlanInput): Promise<Route[] | null> {
  return generateThemedRoutes(input, ['wander'], '商场|咖啡馆|特色街|博物馆|书店|文创|娱乐')
}

/**
 * Reusable: search Amap for POIs by preference, LLM organizes into 2-3
 * themed routes.
 */
export async function generateThemedRoutes(
  input: PlanInput,
  preferences: PreferenceTag[],
  fallbackKeywords: string,
  scenicKeywords?: string,
): Promise<Route[] | null> {
  const { position, distance, timeMinutes, adcode, city, weather } = input

  const pois = await searchNearbyPOIs({
    lat: position.lat, lng: position.lng,
    distance, timeOption: timeMinutes as 60 | 120 | 240 | 480,
    preferences,
    adcode,
    wideMode: distance === 0,
    scenicKeywords,
    customKeywords: preferences.includes('scenic') ? input.customScenic : input.customWander,
  })

  if (pois.length === 0) return null

  // For 全城范围 (distance=0), take from the FAR end: distant POIs are more
  // likely to be famous landmarks, while nearby ones are neighborhood parks.
  // Reverse so the closest among the far group comes first.
  const candidates = distance === 0
    ? pois.slice(-30).reverse()
    : pois.slice(0, 30)

  const poiTable = candidates.map((p, i) =>
    `${i + 1}. ${p.name} | ${p.type || ''} | ${p.address} | 距您${fmtDist(p.distance)}`
  ).join('\n')

  const prompt = `你是${city}的资深导游。以下是通过高德地图搜索到的附近地点，请从中挑选最好的 3-8 个，组织成 2-3 条主题各异的游玩路线。

## 可选地点
${poiTable}

## 要求
- 2-3 条路线，主题明显不同
- 每条路线 1-3 个 stop
- 路线名简短有记忆点（3-8字），符合${city}本地特色
- 每个 stop 的 notes 写简短介绍（15字以内）
- tips 中体现天气建议（当前天气：${weather}）
- ⚠️ 结构分化：各路线必须在「用户行为/信息组织」上不同，不能只是换地点。每条 route 给出 axes 三轴(goal/behavior/info)、direction、reason 三个字段。
  - goal: eat|sightsee|culture|shop|relax|nature|nightlife
  - behavior: deep_single(深度泡一处)|hop_multi(多点连逛)|efficient_route(高效顺路)|free_wander(随机漫游)
  - info: by_theme|by_ranking|by_geography|by_time
  - 任意两条路线 axes 至少两轴不同。

只输出 JSON，格式：
{
  "routes": [
    { "name": "路线名", "tagline": "一句话特色",
      "axes": { "goal": "sightsee", "behavior": "deep_single", "info": "by_theme" },
      "direction": "深度 · 一处慢逛", "reason": "为什么与其它不同",
      "stops": [
        { "name": "地点名", "visitDurationMinutes": 40, "notes": "简短介绍" }
    ], "tips": "实用小贴士" }
  ]
}`

  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: `你是${city}的资深导游，熟悉本地每一个角落。只输出 JSON。` },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
    }, 22000)
  } catch {
    return buildSimpleThemedRoutes(candidates, preferences, fallbackKeywords, input)
  }

  try {
    let json = raw.trim()
    if (json.startsWith('```')) json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed.routes) || parsed.routes.length === 0) {
      return buildSimpleThemedRoutes(candidates, preferences, fallbackKeywords, input)
    }

    const poiByName = new Map<string, AmapPOI>()
    for (const p of candidates) {
      poiByName.set(p.name, p)
      const simple = p.name.replace(/[（(][^)）]*[)）]/g, '').trim()
      if (simple !== p.name) poiByName.set(simple, p)
    }

    const routes: Route[] = []
    for (const r of parsed.routes) {
      const stops: Stop[] = []
      for (const s of (r.stops || [])) {
        let poi = poiByName.get(s.name)
        if (!poi) {
          for (const [key, p] of poiByName) {
            if (key.includes(s.name) || s.name.includes(key)) { poi = p; break }
          }
        }
        if (!poi) continue
        const dist = poi.distance > 0 ? poi.distance
          : Math.round(haversineDist(position.lat, position.lng, poi.lat, poi.lng))
        stops.push({
          name: poi.name,
          address: poi.address,
          visitDurationMinutes: s.visitDurationMinutes || 40,
          notes: s.notes || poi.address,
          amapPoiId: poi.id,
          lng: poi.lng,
          lat: poi.lat,
          distanceMeters: dist,
        })
      }
      if (stops.length > 0) {
        const walkDist = estimateWalkDistFromStops(stops)
        routes.push({
          id: crypto.randomUUID(),
          name: r.name,
          tagline: r.tagline || `${stops.length}个地点`,
          stops,
          totalDurationMinutes: stops.reduce((s, st) => s + st.visitDurationMinutes, 0)
            + Math.ceil((walkDist / 100) * 1.5),
          walkingDistanceMeters: walkDist,
          tips: r.tips || '祝你玩得开心',
          direction: r.direction,
          reason: r.reason,
          axes: r.axes,
        })
      }
    }
    if (routes.length > 0) return routes
  } catch {
    console.warn('Failed to parse LLM themed routes')
  }

  return buildSimpleThemedRoutes(candidates, preferences, fallbackKeywords, input)
}

/** Simple fallback: split POIs into routes by distance. */
export function buildSimpleThemedRoutes(
  candidates: AmapPOI[],
  _preferences: PreferenceTag[],
  _keywords: string,
  input: PlanInput,
): Route[] | null {
  const { position } = input
  const top = candidates.slice(0, 9)
  if (top.length === 0) return null

  const routes: Route[] = []
  const perRoute = Math.min(3, Math.ceil(top.length / 3))
  const chunks = Math.min(3, Math.ceil(top.length / perRoute))

  for (let i = 0; i < chunks; i++) {
    const chunk = top.slice(i * perRoute, (i + 1) * perRoute)
    if (chunk.length === 0) continue
    const stops: Stop[] = chunk.map((p) => {
      const dist = p.distance > 0 ? p.distance
        : Math.round(haversineDist(position.lat, position.lng, p.lat, p.lng))
      return {
        name: p.name,
        address: p.address,
        visitDurationMinutes: estimateVisitDuration(p),
        notes: `${p.address}，距您${fmtDist(dist)}`,
        amapPoiId: p.id,
        lng: p.lng,
        lat: p.lat,
        distanceMeters: dist,
      }
    })
    const walkDist = estimateWalkDistFromStops(stops)
    routes.push({
      id: crypto.randomUUID(),
      name: `路线${i + 1}`,
      tagline: `${stops.length}个地点`,
      stops,
      totalDurationMinutes: stops.length * 40 + Math.ceil((walkDist / 100) * 1.5),
      walkingDistanceMeters: walkDist,
      tips: '',
    })
  }
  return routes.length > 0 ? routes : null
}
