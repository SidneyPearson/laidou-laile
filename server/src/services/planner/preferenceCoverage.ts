import type { PreferenceTag, Route, Stop } from '../../types/route.js'

function identity(stop: Stop): string {
  return stop.amapPoiId || `${stop.name}\u0000${stop.lng}\u0000${stop.lat}`
}

function inferScope(stop: Stop): PreferenceTag | undefined {
  if (stop.preferenceScope) return stop.preferenceScope
  const typecode = stop.typecode ?? ''
  if (typecode.startsWith('05')) return 'food'
  if (typecode.startsWith('11') || typecode.startsWith('14')) return 'scenic'
  if (typecode.startsWith('06') || typecode.startsWith('07') || typecode.startsWith('08')) return 'wander'
  return undefined
}

/** Match final public stops back to verified provider types and find missing intents. */
export function findMissingPreferences(
  finalRoutes: Route[],
  evidenceRoutes: Route[],
  requested: PreferenceTag[],
): PreferenceTag[] {
  if (requested.length < 2) return []
  const evidenceScopes = new Map<string, PreferenceTag>()
  for (const stop of evidenceRoutes.flatMap(route => [
    ...route.stops,
    ...(route.candidateStops ?? []),
  ])) {
    const scope = inferScope(stop)
    if (scope) evidenceScopes.set(identity(stop), scope)
  }

  const covered = new Set<PreferenceTag>()
  for (const stop of finalRoutes.flatMap(route => route.stops)) {
    const scope = inferScope(stop) ?? evidenceScopes.get(identity(stop))
    if (scope) covered.add(scope)
  }
  return [...new Set(requested)].filter(preference => !covered.has(preference))
}

export function preferenceLabels(preferences: PreferenceTag[]): string {
  const labels: Record<PreferenceTag, string> = { food: '美食', scenic: '景点', wander: '休闲' }
  return preferences.map(preference => labels[preference]).join('、')
}
