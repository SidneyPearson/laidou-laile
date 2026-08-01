import type { AmapPOI } from '../../types/poi.js'
import type {
  RecommendationType,
  SocialEvidence,
  SocialPlatform,
} from '../../types/route.js'

export type FoodCandidate = AmapPOI & { socialEvidence?: SocialEvidence[] }

export interface FoodRankingContext {
  maxDistance: number
  cuisinePattern?: RegExp
}

export interface FoodScoreBreakdown {
  /** Evidence contribution to the 100-point total, maximum 40. */
  social: number
  /** Amap rating contribution, maximum 25. */
  amapRating: number
  /** Explicit cuisine-name match contribution, maximum 20. */
  cuisine: number
  /** Distance contribution, maximum 10. */
  distance: number
  /** Fixed ordinary-chain deduction. */
  chainPenalty: number
}

export interface FoodRankingResult {
  poi: FoodCandidate
  /** Deterministic overall rank score on a 0..100 scale. */
  score: number
  breakdown: FoodScoreBreakdown
  /**
   * Internal evidence-only score on a 0..100 scale. It is converted into the
   * breakdown's maximum-40 social contribution and is not a platform rating.
   */
  socialScore: number
  recommendationType: RecommendationType
  rankingReason: string
  evidenceSummary: string
}

const ORDINARY_CHAIN_RE = /(?:肯德基|麦当劳|星巴克|必胜客|汉堡王|德克士|华莱士|达美乐|赛百味|蜜雪冰城|瑞幸咖啡|库迪咖啡|\bDQ\b)/iu

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function platformList(evidence: SocialEvidence[]): SocialPlatform[] {
  return [...new Set(evidence.map(item => item.platform))]
}

/**
 * Normalise evidence strength to 0..100. Distinct platforms provide up to 60%
 * of the value and the strongest concrete-shop confidence provides up to 40%.
 */
export function evidenceScore(evidence: SocialEvidence[] | undefined): number {
  if (!evidence?.length) return 0
  const distinctPlatforms = Math.min(3, platformList(evidence).length)
  const maxConfidence = evidence.reduce(
    (best, item) => Math.max(best, clamp(item.confidence ?? 0.7, 0, 1)),
    0,
  )
  const socialContribution = distinctPlatforms * 8 + maxConfidence * 16
  return Math.round(clamp((socialContribution / 40) * 100, 0, 100))
}

export function totalScore(parts: FoodScoreBreakdown): number {
  return round1(clamp(
    parts.social
      + parts.amapRating
      + parts.cuisine
      + parts.distance
      + parts.chainPenalty,
    0,
    100,
  ))
}

function matchesCuisine(name: string, pattern: RegExp | undefined): boolean {
  if (!pattern) return false
  pattern.lastIndex = 0
  const matches = pattern.test(name)
  pattern.lastIndex = 0
  return matches
}

function distanceLabel(distance: number): string {
  const safeDistance = Math.max(0, Math.round(distance))
  return safeDistance >= 1000
    ? `${(safeDistance / 1000).toFixed(1)}km`
    : `${safeDistance}m`
}

function defaultRankingReason(
  candidate: FoodCandidate,
  platforms: SocialPlatform[],
): string {
  if (platforms.length > 0) {
    return `${platforms.join('、')}公开提及，结合高德评分与距离排序`
  }
  if (candidate.rating) {
    return `高德评分 ${candidate.rating}，距出发点约 ${distanceLabel(candidate.distance)}`
  }
  return `距出发点约 ${distanceLabel(candidate.distance)}，按品类与距离排序`
}

export function scoreFoodCandidate(
  candidate: FoodCandidate,
  context: FoodRankingContext,
): FoodRankingResult {
  const socialEvidence = candidate.socialEvidence ?? []
  const platforms = platformList(socialEvidence)
  const socialScore = evidenceScore(socialEvidence)
  const rating = clamp(Number.parseFloat(candidate.rating ?? '0') || 0, 0, 5)
  const maxDistance = Math.max(0, context.maxDistance)
  const candidateDistance = Math.max(0, candidate.distance)
  const distance = maxDistance > 0
    ? round1(10 * (1 - clamp(candidateDistance / maxDistance, 0, 1)))
    : candidateDistance === 0 ? 10 : 0
  const breakdown: FoodScoreBreakdown = {
    social: round1(socialScore * 0.4),
    amapRating: round1(rating * 5),
    cuisine: matchesCuisine(candidate.name, context.cuisinePattern) ? 20 : 0,
    distance,
    chainPenalty: ORDINARY_CHAIN_RE.test(candidate.name) ? -5 : 0,
  }
  const recommendationType: RecommendationType = socialEvidence.length > 0
    ? 'social_hot'
    : 'amap_fallback'

  return {
    poi: candidate,
    score: totalScore(breakdown),
    breakdown,
    socialScore,
    recommendationType,
    rankingReason: defaultRankingReason(candidate, platforms),
    evidenceSummary: platforms.length > 0
      ? `${platforms.length}个平台公开提及`
      : '高德高分补充',
  }
}

export function rankFoodCandidates(
  candidates: FoodCandidate[],
  context: FoodRankingContext,
): FoodRankingResult[] {
  const maxCandidateDistance = candidates.reduce(
    (maximum, candidate) => Math.max(maximum, Math.max(0, candidate.distance)),
    0,
  )
  const effectiveContext = context.maxDistance > 0
    ? context
    : { ...context, maxDistance: maxCandidateDistance }

  return candidates
    .map(candidate => scoreFoodCandidate(candidate, effectiveContext))
    .sort((left, right) => {
      const scoreDiff = right.score - left.score
      if (scoreDiff !== 0) return scoreDiff
      const evidenceDiff = right.socialScore - left.socialScore
      if (evidenceDiff !== 0) return evidenceDiff
      const ratingDiff = Number(right.poi.rating ?? 0) - Number(left.poi.rating ?? 0)
      if (ratingDiff !== 0) return ratingDiff
      const distanceDiff = left.poi.distance - right.poi.distance
      if (distanceDiff !== 0) return distanceDiff
      return left.poi.name.localeCompare(right.poi.name, 'zh-CN')
    })
}
