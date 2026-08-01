import type { Route, SocialEvidence, SocialPlatform } from '../../types/route.js'
import { evidenceScore } from './foodRanking.js'

const PLATFORM_DOMAINS: Record<SocialPlatform, readonly string[]> = {
  '美团': ['meituan.com', 'dianping.com'],
  '抖音': ['douyin.com'],
  '小红书': ['xiaohongshu.com'],
}

function isSameOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

/** Evidence is displayable only when its platform claim can be verified from
 * a confidence-scored HTTPS URL on that platform's public domain. */
export function isValidEvidence(evidence: SocialEvidence): boolean {
  const domains = PLATFORM_DOMAINS[evidence.platform]
  if (!domains || !evidence.title.trim()) return false
  if (typeof evidence.confidence !== 'number'
    || !Number.isFinite(evidence.confidence)
    || evidence.confidence < 0.7) return false

  try {
    const url = new URL(evidence.url)
    if (url.protocol !== 'https:') return false
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    return domains.some(domain => isSameOrSubdomain(hostname, domain))
  } catch {
    return false
  }
}

/** Final API-output guard: unsupported or legacy platform claims are replaced
 * with an explicit Amap-only fallback label. */
export function enforceEvidencePolicy(route: Route): Route {
  return {
    ...route,
    stops: route.stops.map(stop => {
      const hasEvidenceMetadata = stop.recommendationType !== undefined
        || stop.socialEvidence !== undefined
        || stop.socialScore !== undefined
        || stop.evidenceSummary !== undefined
        || stop.popularityReason !== undefined
      // Social recommendation fields are optional for old clients and for
      // non-food routes. Do not turn an unrelated scenic stop into an Amap
      // restaurant fallback merely because it has no evidence metadata.
      if (route.kind !== 'food_list' && !hasEvidenceMetadata) return stop

      const evidence = (stop.socialEvidence ?? []).filter(isValidEvidence)
      if (evidence.length === 0) {
        return {
          ...stop,
          socialEvidence: undefined,
          recommendationType: 'amap_fallback' as const,
          socialScore: 0,
          evidenceSummary: '高德高分补充',
          popularityReason: undefined,
        }
      }
      const platformCount = new Set(evidence.map(item => item.platform)).size
      return {
        ...stop,
        socialEvidence: evidence,
        recommendationType: 'social_hot' as const,
        socialScore: evidenceScore(evidence),
        evidenceSummary: `${platformCount}个平台公开提及`,
      }
    }),
  }
}
