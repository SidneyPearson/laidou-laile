# Social Food Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank food recommendations by verifiable public Meituan/Dianping, Douyin, and Xiaohongshu evidence while truthfully labeling Amap-only fallback restaurants.

**Architecture:** Tavily performs one cached basic search per uncached area; deterministic matching converts public search results into confidence-scored evidence attached to verified Amap POIs. A rule-based 100-point scorer fixes ranking order, while AI may add short commentary without changing facts or order.

**Tech Stack:** TypeScript 5.7, Cloudflare Workers Cache API, Tavily basic search, Hono, Vitest, Vue 3

## Global Constraints

- Tavily uses at most one `basic` credit per uncached area and does not retry a failed paid request.
- Only public URLs on Meituan/Dianping, Douyin, or Xiaohongshu count as platform evidence.
- A platform label requires a concrete shop-name match and a clickable evidence URL.
- `social_hot` always has at least one evidence item; evidence-free restaurants are `amap_fallback`.
- Amap remains the source of name, address, coordinates, distance, and base rating.
- Social score is an internal ranking weight, not a platform-issued score.
- Ordinary chain brands lose up to 5 points unless supported by reliable evidence.
- Old clients remain compatible with all new optional response fields.

---

### Task 1: Extend evidence and recommendation contracts

**Files:**
- Modify: `server/src/types/route.ts`
- Modify: `client/src/types/route.ts`
- Modify: `server/src/routes/planRoutes.schemas.ts`
- Modify: `server/src/routes/planRoutes.schemas.test.ts`

**Interfaces:**
- Produces: `RecommendationType`, confidence-scored `SocialEvidence`, and optional ranking fields on `Stop`.

- [ ] **Step 1: Add schema tests for both recommendation modes**

```ts
const baseStop = {
  name: '茶然居', address: '测试路1号', visitDurationMinutes: 30,
  notes: '测试门店', amapPoiId: 'poi-1', lng: 116.4, lat: 39.9,
}

expect(stopSchema.parse({
  ...baseStop,
  recommendationType: 'social_hot',
  socialScore: 82,
  rankingReason: '小红书与抖音均有公开提及',
  evidenceSummary: '2个平台公开提及',
  socialEvidence: [{ platform: '小红书', title: '探店笔记', url: 'https://www.xiaohongshu.com/explore/1', confidence: 0.92 }],
})).toBeTruthy()
```

Add a second assertion for `amap_fallback` with an empty/absent evidence array.

- [ ] **Step 2: Verify the new fields fail validation**

Run: `npm test -w server -- planRoutes.schemas.test.ts`

Expected: FAIL because the enum and confidence field are not defined.

- [ ] **Step 3: Add matching server/client types**

```ts
export type RecommendationType = 'social_hot' | 'amap_fallback'

export interface SocialEvidence {
  platform: SocialPlatform
  title: string
  url: string
  confidence: number
}
```

Add optional `recommendationType`, `socialScore`, `rankingReason`, and `evidenceSummary` to both `Stop` interfaces. Add equivalent optional fields to the Zod stop schema and constrain `confidence` to `0..1` and `socialScore` to `0..100`.

- [ ] **Step 4: Run schema and workspace type checks**

Run: `npm test -w server -- planRoutes.schemas.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit contracts**

```bash
git add server/src/types/route.ts client/src/types/route.ts server/src/routes/planRoutes.schemas.ts server/src/routes/planRoutes.schemas.test.ts
git commit -m "feat: add social food evidence contracts"
```

### Task 2: Match concrete shops with confidence scores

**Files:**
- Modify: `server/src/services/planner/socialFoodSearch.ts`
- Modify: `server/src/services/planner/socialFoodSearch.test.ts`

**Interfaces:**
- Produces: `matchSocialEvidence(shopName, results): SocialEvidence[]` where every item has `confidence`.
- Preserves: `searchSocialFoodEvidence(area)` one-credit cache behavior.

- [ ] **Step 1: Add high, medium, and rejected matching cases**

```ts
expect(matchSocialEvidence('茶然居(南锣鼓巷店)', [{
  title: '小红书｜茶然居南锣鼓巷店探店', content: '茶然居值得打卡',
  url: 'https://www.xiaohongshu.com/explore/1',
}])[0].confidence).toBeGreaterThanOrEqual(0.9)

expect(matchSocialEvidence('茶然居(南锣鼓巷店)', [{
  title: '南锣鼓巷美食推荐', content: '十家咖啡与茶馆合集',
  url: 'https://www.xiaohongshu.com/explore/2',
}])).toEqual([])
```

Add a brand-only match with an unknown branch and assert confidence between `0.7` and `0.89`.

- [ ] **Step 2: Verify existing exact-substring matching fails the matrix**

Run: `npm test -w server -- socialFoodSearch.test.ts`

Expected: FAIL on confidence and branch-aware cases.

- [ ] **Step 3: Implement normalized brand/branch tokens**

```ts
interface ShopTokens { brand: string; branch: string }

function shopTokens(value: string): ShopTokens {
  const match = value.match(/^(.+?)[（(]([^）)]+)[）)]$/)
  return {
    brand: normalizeShopName(match?.[1] ?? value),
    branch: normalizeShopName((match?.[2] ?? '').replace(/店$/, '')),
  }
}
```

Score `0.95` for brand+branch, `0.78` for an unambiguous brand-only match with brand length at least four Chinese characters, and reject category/area-only text. Keep one evidence item per URL and at most three per shop.

- [ ] **Step 4: Re-run matching and one-credit tests**

Run: `npm test -w server -- socialFoodSearch.test.ts`

Expected: PASS, including the existing cache test that asserts one Tavily call.

- [ ] **Step 5: Commit evidence matching**

```bash
git add server/src/services/planner/socialFoodSearch.ts server/src/services/planner/socialFoodSearch.test.ts
git commit -m "feat: score concrete social food evidence"
```

### Task 3: Add deterministic 100-point food ranking

**Files:**
- Create: `server/src/services/planner/foodRanking.ts`
- Create: `server/src/services/planner/foodRanking.test.ts`
- Modify: `server/src/services/planner/foodPlanner.ts`

**Interfaces:**
- Produces: `scoreFoodCandidate(candidate, context): FoodRankingResult` and `rankFoodCandidates(candidates, context)`.
- Consumes: verified Amap POIs with optional `socialEvidence`.

- [ ] **Step 1: Add exact scoring-order tests**

```ts
const candidate = (name: string, options: {
  rating: string; distance: number; evidence?: SocialEvidence[]
}): FoodCandidate => ({
  id: name, name, address: `${name}地址`, type: '餐饮服务', typecode: '050000',
  lng: 116.4, lat: 39.9, cost: null, parentId: null,
  rating: options.rating, distance: options.distance,
  socialEvidence: options.evidence,
})

const ranked = rankFoodCandidates([
  candidate('肯德基', { rating: '4.8', distance: 100 }),
  candidate('茶然居', { rating: '4.5', distance: 350, evidence: xhsEvidence }),
  candidate('阿娘面馆', { rating: '4.7', distance: 500 }),
], { maxDistance: 1000, cuisinePattern: /面馆|茶/ })

expect(ranked.map(item => item.poi.name)).toEqual(['茶然居', '阿娘面馆', '肯德基'])
expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
expect(ranked[2].breakdown.chainPenalty).toBe(-5)
```

- [ ] **Step 2: Verify the ranking module is absent**

Run: `npm test -w server -- foodRanking.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the fixed score breakdown**

```ts
export interface FoodScoreBreakdown {
  social: number
  amapRating: number
  cuisine: number
  distance: number
  chainPenalty: number
}

export function totalScore(parts: FoodScoreBreakdown): number {
  return Math.max(0, Math.min(100,
    parts.social + parts.amapRating + parts.cuisine + parts.distance + parts.chainPenalty,
  ))
}
```

Allocate maxima of 40/25/20/10 and `-5` chain penalty. Social score uses distinct platforms plus maximum confidence; rating maps `0..5` to `0..25`; distance declines linearly inside `maxDistance`; cuisine is 20 for a clear match and 0 otherwise.

- [ ] **Step 4: Integrate ranking before list truncation**

Replace evidence-count/rating sorting in `generateFoodList` with `rankFoodCandidates`. Preserve this deterministic order after AI comments return by mapping comments onto the already ranked POIs rather than iterating the model order.

Populate `recommendationType`, `socialScore`, `rankingReason`, and `evidenceSummary` when converting ranked candidates to stops.

- [ ] **Step 5: Run ranking and food-list suites**

Run: `npm test -w server -- foodRanking.test.ts generatePlan.foodList.test.ts foodPresentation.test.ts`

Expected: PASS; AI output cannot reorder or add candidates.

- [ ] **Step 6: Commit deterministic ranking**

```bash
git add server/src/services/planner/foodRanking.ts server/src/services/planner/foodRanking.test.ts server/src/services/planner/foodPlanner.ts
git commit -m "feat: rank food by verified social evidence"
```

### Task 4: Enforce evidence invariants before API output

**Files:**
- Create: `server/src/services/planner/evidencePolicy.ts`
- Create: `server/src/services/planner/evidencePolicy.test.ts`
- Modify: `server/src/services/planner/generatePlan.ts`
- Modify: `server/src/services/planner/foodPresentation.ts`

**Interfaces:**
- Produces: `enforceEvidencePolicy(route: Route): Route`.
- Guarantees: no unsupported platform label reaches the client.

- [ ] **Step 1: Add invalid and valid stop tests**

```ts
expect(enforceEvidencePolicy(foodRoute(stop({ recommendationType: 'social_hot' }))).stops[0])
  .toMatchObject({ recommendationType: 'amap_fallback', socialScore: 0 })

expect(enforceEvidencePolicy(foodRoute(stop({
  recommendationType: 'social_hot', socialEvidence: [validEvidence],
}))).stops[0].recommendationType).toBe('social_hot')
```

- [ ] **Step 2: Verify unsupported labels currently survive**

Run: `npm test -w server -- evidencePolicy.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the final evidence policy**

```ts
export function enforceEvidencePolicy(route: Route): Route {
  return {
    ...route,
    stops: route.stops.map(stop => {
      const evidence = (stop.socialEvidence ?? []).filter(isValidEvidence)
      if (evidence.length === 0) return {
        ...stop,
        socialEvidence: undefined,
        recommendationType: 'amap_fallback',
        socialScore: 0,
        evidenceSummary: '高德高分补充',
      }
      return { ...stop, socialEvidence: evidence, recommendationType: 'social_hot' }
    }),
  }
}
```

`isValidEvidence` must check supported platform, HTTPS URL, matching domain, non-empty title, and confidence `>= 0.7`.

- [ ] **Step 4: Apply policy after all route changes**

Call `enforceEvidencePolicy` after final route policy/count synchronization so refinement or replacement cannot leak stale labels.

Run: `npm test -w server -- evidencePolicy.test.ts generatePlan.foodList.test.ts planRoutes.schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit evidence guard**

```bash
git add server/src/services/planner/evidencePolicy.ts server/src/services/planner/evidencePolicy.test.ts server/src/services/planner/generatePlan.ts server/src/services/planner/foodPresentation.ts
git commit -m "fix: guard social food claims with evidence"
```

### Task 5: Show platform evidence and honest fallback labels

**Files:**
- Modify: `client/src/components/StopCard.vue`
- Modify: `client/src/components/uiContracts.test.ts`
- Modify: `client/src/types/route.ts`

**Interfaces:**
- Consumes: optional stop recommendation/evidence fields.
- Produces: accessible external evidence links and a visible Amap fallback label.

- [ ] **Step 1: Add UI contract assertions**

```ts
expect(stopCard).toContain("stop.recommendationType === 'social_hot'")
expect(stopCard).toContain('平台热门')
expect(stopCard).toContain('高德高分补充')
expect(stopCard).toContain(':aria-label="`查看${evidence.platform}来源：${evidence.title}`"')
expect(stopCard).toContain('rel="noopener noreferrer"')
```

- [ ] **Step 2: Verify the fallback label and accessible link name are missing**

Run: `npm test -w client -- uiContracts.test.ts`

Expected: FAIL.

- [ ] **Step 3: Render recommendation type and evidence links**

```vue
<span v-if="stop.recommendationType === 'social_hot'" class="...">平台热门</span>
<span v-else-if="stop.recommendationType === 'amap_fallback'" class="...">高德高分补充</span>

<a
  v-for="evidence in stop.socialEvidence"
  :key="evidence.url"
  :href="evidence.url"
  :aria-label="`查看${evidence.platform}来源：${evidence.title}`"
  target="_blank"
  rel="noopener noreferrer"
>
  {{ evidence.platform }}提及 ↗
</a>
```

Render `rankingReason` below the label when present. Do not render empty evidence containers.

- [ ] **Step 4: Run client tests and build**

Run: `npm test -w client -- uiContracts.test.ts && npm run build -w client`

Expected: PASS and successful Vite build.

- [ ] **Step 5: Commit evidence UI**

```bash
git add client/src/components/StopCard.vue client/src/components/uiContracts.test.ts client/src/types/route.ts
git commit -m "feat: show verified food recommendation sources"
```

### Task 6: Verify free-tier degradation and the full acceptance matrix

**Files:**
- Modify: `server/src/services/planner/socialFoodSearch.test.ts`
- Modify: `server/src/services/planner/generatePlan.foodList.test.ts`
- Create: `docs/qa/social-food-evidence-acceptance.md`

**Interfaces:**
- Produces: release gate for one-credit behavior, fallback honesty, and end-to-end source links.

- [ ] **Step 1: Add free-tier failure cases**

Mock timeout, HTTP 401, 429, and 500. For each case assert `searchSocialFoodEvidence()` resolves `[]`, performs exactly one `fetch`, and does not throw.

- [ ] **Step 2: Add planner degradation cases**

For evidence-free Amap candidates assert every stop is `amap_fallback`, no `socialEvidence` is returned, and the route remains usable. For matched candidates assert `social_hot` and at least one confidence-scored HTTPS evidence URL.

- [ ] **Step 3: Run all automated gates**

Run: `npm test && npm run typecheck && npm run build`

Expected: all server/client tests PASS; both builds exit 0.

- [ ] **Step 4: Re-run the 10 combinations on localhost:9090**

Record each restaurant, recommendation type, score reason, and source link in `docs/qa/social-food-evidence-acceptance.md`. Require:

- all platform badges open a matching public source;
- all evidence-free restaurants say `高德高分补充`;
- no ordinary chain outranks a reliably evidenced independent restaurant solely because it is nearer;
- no request consumes more than one uncached Tavily basic search;
- at least 8/10 combinations pass and the remainder contain no false platform claims.

- [ ] **Step 5: Commit the release gate**

```bash
git add server/src/services/planner/socialFoodSearch.test.ts server/src/services/planner/generatePlan.foodList.test.ts docs/qa/social-food-evidence-acceptance.md
git commit -m "test: verify social food evidence degradation"
```
