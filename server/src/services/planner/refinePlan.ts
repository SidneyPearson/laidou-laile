import { chatCompletionWithFallback } from '../llm/client.js'
import { buildRefinePrompt, SYSTEM_PROMPT } from '../llm/prompt.js'
import { parseAndValidate } from '../llm/schema.js'
import { verifyPlace } from '../amap/poiSearch.js'
import { haversineDist } from '../../utils/geo.js'
import { normalizeName } from '../../utils/text.js'
import type { Stop, Route } from '../../types/route.js'
import type { RefineInput } from './types.js'
import { searchSingleCuisinePOI } from './poiMatching.js'
import { extractCuisineKeyword } from './routeMetrics.js'
import { applyRoutePolicies } from './routePolicy.js'

/**
 * Refine an existing day-trip route: remove specified stops, optionally add
 * new requirements, and have LLM regenerate the route.
 *
 * When only removing stops (no extra requirements), skips LLM entirely.
 */
export async function refinePlan(input: RefineInput): Promise<Route | null> {
  const { route, removeStopIndices, extraRequirements, city, weather, timeMinutes, adcode } = input

  const keptStops = route.stops.filter((_, i) => !removeStopIndices.includes(i))
  const removedStops = route.stops.filter((_, i) => removeStopIndices.includes(i))

  if (keptStops.length === 0) return null

  // Frontend-only: no extra requirements → just return trimmed route
  if (!extraRequirements) {
    const trimmed: Route = {
      ...route,
      id: crypto.randomUUID(),
      stops: keptStops,
      totalDurationMinutes: keptStops.reduce((s, st) => s + st.visitDurationMinutes, 0) + 10,
      walkingDistanceMeters: Math.max(0, route.walkingDistanceMeters - removedStops.length * 200),
    }
    return applyRoutePolicies([trimmed], {
      origin: input.position, timeMinutes, explorationDistance: input.distance,
      preferences: input.preferences?.length ? input.preferences : ['wander'],
    }).routes[0] ?? null
  }

  // Use the geographic center of all kept stops (not just the first one) —
  // a new stop placed near the end of the route might be > input.distance
  // away from the first stop, causing verifyPlace to miss it.
  const sumLat = keptStops.reduce((s, st) => s + st.lat, 0)
  const sumLng = keptStops.reduce((s, st) => s + st.lng, 0)
  const centerLat = sumLat / keptStops.length
  const centerLng = sumLng / keptStops.length

  const spanMeters = Math.max(
    ...keptStops.map((s) => haversineDist(centerLat, centerLng, s.lat, s.lng)),
    500,
  )

  // Max verification distance: cover the full route span + buffer.
  const maxDist = Math.max(input.distance > 0 ? input.distance : 2000, spanMeters * 2)

  const reqText = extraRequirements || ''
  const cuisineFallbackKeyword = extractCuisineKeyword(reqText)

  const prompt = buildRefinePrompt({
    city,
    weather,
    timeMinutes,
    existingStops: keptStops.map((s) => ({
      name: s.name,
      notes: s.notes || '',
      address: s.address || '',
      distanceMeters: s.distanceMeters || 0,
      visitDurationMinutes: s.visitDurationMinutes,
    })),
    removedStops: removedStops.map((s) => ({ name: s.name })),
    extraRequirements,
  })

  let raw: string
  try {
    raw = await chatCompletionWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
    }, 25000)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Refine LLM call failed:', msg)
    return null
  }

  const parsed = parseAndValidate(raw)
  if (!parsed || !parsed.routes?.length) {
    console.warn('Refine: LLM output invalid, returning trimmed route')
    return null
  }

  const refined = parsed.routes[0]
  const keptNamesNorm = new Map(keptStops.map((s) => [normalizeName(s.name), s]))
  const usedNames = new Set(keptStops.map((s) => normalizeName(s.name)))

  /** Find a kept stop whose name matches (fuzzily) the LLM stop name. Each
   *  kept stop can only be matched ONCE — after matching it is removed so
   *  duplicate LLM outputs of the same stop don't create duplicates. */
  function matchKeptStop(llmName: string): Stop | undefined {
    const norm = normalizeName(llmName)
    if (keptNamesNorm.has(norm)) {
      const result = keptNamesNorm.get(norm)
      keptNamesNorm.delete(norm)
      return result
    }
    for (const [k, v] of keptNamesNorm) {
      if (k.includes(norm) || norm.includes(k)) {
        keptNamesNorm.delete(k)
        return v
      }
    }
    return undefined
  }

  const mergedStops: Stop[] = []
  const usedKeptNorm = new Set<string>()
  const usedPoiIds = new Set(keptStops.map((s) => s.amapPoiId).filter(Boolean) as string[])
  let newStopsDropped = 0
  let newStopsAdded = 0
  const droppedNames: string[] = []

  // Cuisine relevance filter: if user asked for a specific cuisine, reject
  // new stops that don't match (e.g. "世博源" mall when asking for 面馆)
  const cuisineFilter = cuisineFallbackKeyword
    ? cuisineFallbackKeyword.split('|').map((k) => k.toLowerCase())
    : null

  for (const llmStop of refined.stops) {
    const matched = matchKeptStop(llmStop.name)
    if (matched) {
      mergedStops.push({
        ...matched,
        visitDurationMinutes: llmStop.visitDurationMinutes || matched.visitDurationMinutes,
      })
      usedKeptNorm.add(normalizeName(matched.name))
      continue
    }

    // Skip if this new stop's normalized name already appeared.
    const llmNorm = normalizeName(llmStop.name)
    if (usedNames.has(llmNorm)) {
      console.warn(`Refine: skipping duplicate "${llmStop.name}"`)
      continue
    }

    // Verify new stop against Amap (using route center).
    let verified = await verifyPlace(llmStop.name, centerLng, centerLat, adcode, maxDist)

    // Fallback 1: cuisine keyword from extraRequirements
    if (!verified && cuisineFallbackKeyword) {
      console.log(`Refine: primary verify failed for "${llmStop.name}", trying cuisine fallback "${cuisineFallbackKeyword}"`)
      verified = await searchSingleCuisinePOI(cuisineFallbackKeyword, centerLng, centerLat, adcode, maxDist, usedNames)
      if (verified) console.log(`Refine: cuisine fallback found "${verified.name}"`)
    }

    // Fallback 2: keyword from the stop name itself
    if (!verified) {
      const stopKw = extractCuisineKeyword(llmStop.name)
      if (stopKw && stopKw !== cuisineFallbackKeyword) {
        console.log(`Refine: trying stop-name keyword "${stopKw}" for "${llmStop.name}"`)
        verified = await searchSingleCuisinePOI(stopKw, centerLng, centerLat, adcode, maxDist, usedNames)
        if (verified) console.log(`Refine: stop-name fallback found "${verified.name}"`)
      }
    }

    if (verified) {
      if (usedPoiIds.has(verified.id)) {
        console.warn(`Refine: skipping duplicate POI "${verified.name}" (${verified.id})`)
        droppedNames.push(llmStop.name)
        newStopsDropped++
        continue
      }
      if (cuisineFilter) {
        const verifiedNorm = normalizeName(verified.name)
        const isRelevant = cuisineFilter.some((kw) => verifiedNorm.includes(kw))
        if (!isRelevant) {
          console.warn(`Refine: rejecting irrelevant stop "${verified.name}" (cuisine filter: ${cuisineFallbackKeyword})`)
          droppedNames.push(verified.name)
          newStopsDropped++
          continue
        }
      }
      usedPoiIds.add(verified.id)
      usedNames.add(normalizeName(verified.name))
      newStopsAdded++
      mergedStops.push({
        name: verified.name,
        address: verified.address,
        visitDurationMinutes: llmStop.visitDurationMinutes || 30,
        notes: llmStop.notes || '',
        amapPoiId: verified.id,
        lng: verified.lng,
        lat: verified.lat,
        // Recomputed against the original route origin by routePolicy below.
        distanceMeters: undefined,
        photoTip: llmStop.photoTip,
      })
    } else {
      console.warn(`Refine: new stop "${llmStop.name}" not found on Amap, skipping`)
      droppedNames.push(llmStop.name)
      newStopsDropped++
    }
  }

  // FORCE back any kept stops the LLM dropped. The LLM is unreliable — it
  // often replaces kept stops despite instructions. We guarantee they're
  // always present by re-inserting any that went missing.
  for (const kept of keptStops) {
    if (!usedKeptNorm.has(normalizeName(kept.name))) {
      console.log(`Refine: LLM dropped "${kept.name}" — forcing back into route`)
      mergedStops.push(kept)
    }
  }

  if (mergedStops.length === 0) return null

  // Force-add from cuisine search when LLM fails to add anything. LLM often
  // mentions shops in tips instead of adding them as stops, or suggests mall
  // names instead of specific restaurants.
  if (newStopsAdded === 0 && extraRequirements && cuisineFallbackKeyword) {
    console.log(`Refine: LLM added 0 new stops, force-searching cuisine "${cuisineFallbackKeyword}"`)
    const forceNames = new Set(mergedStops.map((s) => normalizeName(s.name)))
    const forced = await searchSingleCuisinePOI(
      cuisineFallbackKeyword, centerLng, centerLat, adcode, maxDist, forceNames,
    )
    if (forced) {
      mergedStops.push({
        name: forced.name,
        address: forced.address,
        visitDurationMinutes: 30,
        notes: forced.address
          ? `${forced.address}${forced.rating ? `，评分 ${forced.rating}` : ''}`
          : '',
        amapPoiId: forced.id,
        lng: forced.lng,
        lat: forced.lat,
        distanceMeters: undefined,
      })
      newStopsAdded++
      console.log(`Refine: force-added "${forced.name}" (${forced.distance}m, rating=${forced.rating})`)
    } else {
      console.warn(`Refine: force-search also found nothing for "${cuisineFallbackKeyword}"`)
    }
  }

  // Sort geographically along the route axis.
  const firstKept = keptStops[0]
  const lastKept = keptStops[keptStops.length - 1]
  const axisLat = lastKept.lat - firstKept.lat
  const axisLng = lastKept.lng - firstKept.lng
  const axisLen = Math.sqrt(axisLat * axisLat + axisLng * axisLng) || 1

  mergedStops.sort((a, b) => {
    const projA = ((a.lat - firstKept.lat) * axisLat + (a.lng - firstKept.lng) * axisLng) / axisLen
    const projB = ((b.lat - firstKept.lat) * axisLat + (b.lng - firstKept.lng) * axisLng) / axisLen
    return projA - projB
  })

  // Recompute metrics from actual stops.
  const actualDuration = mergedStops.reduce((s, st) => s + st.visitDurationMinutes, 0) + 10
  let actualWalking = 0
  for (let i = 1; i < mergedStops.length; i++) {
    actualWalking += haversineDist(
      mergedStops[i - 1].lat, mergedStops[i - 1].lng,
      mergedStops[i].lat, mergedStops[i].lng,
    )
  }
  actualWalking = Math.round(actualWalking)

  // Only use LLM's route name/tagline if new stops were actually added.
  const routeName = newStopsAdded > 0 ? (refined.name || route.name) : route.name
  const routeTagline = newStopsAdded > 0 ? (refined.tagline || route.tagline) : route.tagline

  // Clean up tips: remove sentences referencing dropped/irrelevant stops.
  let tips = refined.tips || route.tips || ''
  if (droppedNames.length > 0 && tips) {
    const sentences = tips.split(/(?<=[。！？.!?])/)
    const filtered = sentences.filter((s) => {
      const keep = !droppedNames.some((dn) => s.includes(dn))
      if (!keep) console.log(`Refine: stripping tip referencing "${s.trim()}"`)
      return keep
    })
    tips = filtered.join('').trim()
    if (tips.length < 10) tips = route.tips || ''
  }

  const result: Route = {
    id: crypto.randomUUID(),
    name: routeName,
    tagline: routeTagline,
    stops: mergedStops,
    totalDurationMinutes: actualDuration,
    walkingDistanceMeters: actualWalking,
    tips,
  }
  return applyRoutePolicies([result], {
    origin: input.position, timeMinutes, explorationDistance: input.distance,
    preferences: input.preferences?.length ? input.preferences : ['wander'],
  }).routes[0] ?? null
}
