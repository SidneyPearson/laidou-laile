import type { AmapPOI } from '../../types/poi.js'
import type { SocialEvidence, SocialPlatform } from '../../types/route.js'

const SEARCH_URL = 'https://api.tavily.com/search'
const CACHE_TTL_SECONDS = 24 * 60 * 60
const MAX_QUERY_SHOP_NAMES = 6
const memoryCache = new Map<string, { expiresAt: number; results: SocialSearchResult[] }>()

let apiKey: string | undefined

export interface SocialSearchResult {
  title: string
  content: string
  url: string
}

interface TavilyResponse {
  results?: unknown
}

export function initSocialFoodSearch(key?: string): void {
  apiKey = key?.trim() || undefined
}

export function platformFromUrl(value: string): SocialPlatform | null {
  try {
    const host = new URL(value).hostname.toLowerCase()
    if (host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) return '小红书'
    if (host === 'douyin.com' || host.endsWith('.douyin.com')) return '抖音'
    if (host === 'meituan.com' || host.endsWith('.meituan.com')
      || host === 'dianping.com' || host.endsWith('.dianping.com')) return '美团'
  } catch {
    return null
  }
  return null
}

function isSearchResult(value: unknown): value is SocialSearchResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.title === 'string'
    && typeof item.url === 'string'
    && typeof item.content === 'string'
    && platformFromUrl(item.url) !== null
}

function normalizeShopText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

interface ShopTokens {
  brand: string
  branch: string
}

function shopTokens(value: string): ShopTokens {
  const normalizedValue = value.normalize('NFKC').trim()
  const match = normalizedValue.match(/^(.+?)[(（]([^()（）]+)[)）]$/u)
  return {
    brand: normalizeShopText(match?.[1] ?? normalizedValue),
    branch: normalizeShopText(
      (match?.[2] ?? '').replace(/(?:旗舰店|总店|分店|门店|店)$/u, ''),
    ),
  }
}

function chineseCharacterCount(value: string): number {
  return Array.from(value).filter(character => /\p{Script=Han}/u.test(character)).length
}

export type ScoredSocialEvidence = SocialEvidence & { confidence: number }

export function matchSocialEvidence(
  shopName: string,
  results: SocialSearchResult[],
): ScoredSocialEvidence[] {
  const { brand, branch } = shopTokens(shopName)
  if (brand.length < 3) return []

  const evidence: ScoredSocialEvidence[] = []
  const seen = new Set<string>()
  for (const result of results) {
    const platform = platformFromUrl(result.url)
    if (!platform) continue
    const haystack = normalizeShopText(`${result.title} ${result.content}`)
    if (!haystack.includes(brand)) continue

    let confidence: number
    if (branch && haystack.includes(branch)) {
      confidence = 0.95
    } else if (!branch || chineseCharacterCount(brand) >= 4) {
      confidence = 0.78
    } else {
      // A short brand without its requested branch is too ambiguous to support
      // a platform claim. Area/category words alone never reach this branch.
      continue
    }

    if (seen.has(result.url)) continue
    seen.add(result.url)
    evidence.push({
      platform,
      title: result.title.slice(0, 120),
      url: result.url,
      confidence,
    })
    if (evidence.length === 3) break
  }
  return evidence
}

export function attachSocialEvidence(
  pois: AmapPOI[],
  results: SocialSearchResult[],
): Array<AmapPOI & { socialEvidence?: SocialEvidence[] }> {
  return pois.map((poi) => {
    const socialEvidence = matchSocialEvidence(poi.name, results)
    return socialEvidence.length > 0 ? { ...poi, socialEvidence } : poi
  })
}

function boundedCandidateNames(values: string[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const value of values) {
    const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 60)
    const normalized = normalizeShopText(name)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    names.push(name)
    if (names.length === MAX_QUERY_SHOP_NAMES) break
  }
  return names
}

function cacheKeyFor(area: string, candidateNames: string[]): string {
  const normalizedArea = area.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
  const shopContext = candidateNames
    .map(normalizeShopText)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .join('|')
  // v2 isolates contextual queries from the older area-only cache entries.
  return `v2:${normalizedArea}|shops:${shopContext}`
}

async function readCache(key: string): Promise<SocialSearchResult[] | null> {
  const memory = memoryCache.get(key)
  if (memory && memory.expiresAt > Date.now()) return memory.results
  if (memory) memoryCache.delete(key)

  try {
    const response = await caches.default.match(
      new Request(`https://citywalk-cache.invalid/social-food/${encodeURIComponent(key)}`),
    )
    if (!response) return null
    const value: unknown = await response.json()
    return Array.isArray(value) ? value.filter(isSearchResult) : null
  } catch {
    return null
  }
}

async function writeCache(key: string, results: SocialSearchResult[]): Promise<void> {
  memoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, results })
  try {
    await caches.default.put(
      new Request(`https://citywalk-cache.invalid/social-food/${encodeURIComponent(key)}`),
      new Response(JSON.stringify(results), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        },
      }),
    )
  } catch {
    // The Cache API is unavailable in unit tests and some local runtimes.
  }
}

/**
 * One basic Tavily request per uncached area + bounded candidate context.
 * Failures deliberately degrade to [] and are never retried in this call.
 */
export async function searchSocialFoodEvidence(
  area: string,
  candidateNames: string[] = [],
): Promise<SocialSearchResult[]> {
  if (!apiKey || !area.trim()) return []
  const boundedNames = boundedCandidateNames(candidateNames)
  const cacheKey = cacheKeyFor(area, boundedNames)
  const cached = await readCache(cacheKey)
  if (cached) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: boundedNames.length > 0
          ? `${area} 具体门店 ${boundedNames.map(name => `"${name}"`).join(' OR ')} 美团 抖音 小红书 探店 口碑`
          : `${area} 美团 抖音 小红书 网红美食 推荐 餐厅`,
        search_depth: 'basic',
        max_results: 10,
        include_domains: ['meituan.com', 'dianping.com', 'douyin.com', 'xiaohongshu.com'],
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.warn(`Social food search unavailable: HTTP ${response.status}`)
      return []
    }
    const payload = await response.json() as TavilyResponse
    const results = Array.isArray(payload.results) ? payload.results.filter(isSearchResult) : []
    await writeCache(cacheKey, results)
    return results
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'request failed'
    console.warn(`Social food search unavailable: ${reason}`)
    return []
  } finally {
    clearTimeout(timer)
  }
}
