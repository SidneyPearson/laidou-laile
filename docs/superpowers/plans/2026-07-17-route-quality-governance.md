# Route Quality Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate irrelevant POIs, recover useful candidates in popular areas, and make every route count label match the final stop array.

**Architecture:** Keep Amap as the POI fact source and add deterministic recall, suitability, and presentation policies around the existing planner. AI may organize verified candidates, but final filtering, time/distance enforcement, and count copy run after AI output.

**Tech Stack:** TypeScript 5.7, Cloudflare Workers, Hono, Vitest, Vue 3, npm workspaces

## Global Constraints

- Schools, training centers, service stations, offices, and other non-visitor venues must never be returned as attractions.
- Temporary recall expansion must not allow a final stop outside the user-selected distance.
- One hour targets 2 stops, two hours 3 stops, half-day 4–5 stops, and one day 5–6 stops.
- Candidate shortage returns the actual qualified count; it never duplicates or invents stops.
- Pure food requests remain `food_list` rankings rather than visit itineraries.
- Every `N家`, `N个地点`, and `TOP N` phrase is derived from the final `stops.length`.
- Existing API error shape and old client compatibility remain unchanged.

---

### Task 1: Reject non-visitor POIs deterministically

**Files:**
- Modify: `server/src/services/planner/poiQuality.ts`
- Modify: `server/src/services/planner/poiQuality.test.ts`
- Modify: `server/src/services/amap/poiSearch.ts`

**Interfaces:**
- Consumes: `{ name, address?, type?, typecode? }` from normalized Amap POIs.
- Produces: `classifyPoiQuality(poi): PoiQualityResult` and `filterUsablePois(pois): pois` with visitor-ineligible POIs removed.

- [ ] **Step 1: Add failing rejection cases**

```ts
it.each([
  ['西安市回民中学', '科教文化服务;学校', '141200'],
  ['浙江省卫生计生系统培训中心', '科教文化服务;培训机构', '141400'],
  ['美的星级服务站', '生活服务;维修站点', '071600'],
  ['湖滨发行站', '生活服务', '070000'],
  ['上城区青少年活动中心', '科教文化服务', '140000'],
])('rejects non-visitor venue %s', (name, type, typecode) => {
  expect(classifyPoiQuality({ name, type, typecode }).decision).toBe('reject')
})

it('keeps a real museum despite the education type prefix', () => {
  expect(classifyPoiQuality({
    name: '孙庆海历史博物馆', type: '科教文化服务;博物馆', typecode: '140100',
  }).decision).not.toBe('reject')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -w server -- poiQuality.test.ts`

Expected: FAIL because `PoiTextLike` does not accept `type`/`typecode` and the venues are not rejected.

- [ ] **Step 3: Extend the quality contract and hard rules**

```ts
export interface PoiTextLike {
  name: string
  address?: string
  type?: string
  typecode?: string
}

const NON_VISITOR_NAME_RE = /学校|中学|小学|幼儿园|培训中心|培训学校|培训机构|青少年活动中心|服务站|维修站|发行站|办事处|政务中心|办公区/
const VISITOR_OVERRIDE_RE = /博物馆|美术馆|展览馆|纪念馆|科技馆|文化馆|剧院|艺术馆/

if (NON_VISITOR_NAME_RE.test(text) && !VISITOR_OVERRIDE_RE.test(text)) {
  return { decision: 'reject', reason: PoiQualityReason.NON_VISITOR_AREA }
}
```

Pass `type` and `typecode` through every call to `classifyPoiQuality`; keep the museum override narrower than the rejection expressions.

- [ ] **Step 4: Run quality and Amap search tests**

Run: `npm test -w server -- poiQuality.test.ts poiSearch.quality.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the classifier change**

```bash
git add server/src/services/planner/poiQuality.ts server/src/services/planner/poiQuality.test.ts server/src/services/amap/poiSearch.ts
git commit -m "fix: reject non-visitor route candidates"
```

### Task 2: Build explicit recall variants for sparse popular-area searches

**Files:**
- Create: `server/src/services/planner/recallPolicy.ts`
- Create: `server/src/services/planner/recallPolicy.test.ts`
- Modify: `server/src/services/amap/poiSearch.ts`
- Modify: `server/src/services/amap/poiSearch.quality.test.ts`

**Interfaces:**
- Produces: `buildRecallQueries(input: RecallQueryInput): RecallQuery[]`.
- Consumes downstream: `searchNearbyPOIs()` executes returned keyword/type combinations and still calls `dedupeAndSort()` once.

- [ ] **Step 1: Add failing recall-policy tests**

```ts
expect(buildRecallQueries({ preference: 'food', subtypes: ['local_cuisine'], area: '宽窄巷子' }))
  .toEqual([
    { keywords: '本地菜|老字号|本帮菜|特色菜', types: '050000' },
    { keywords: '宽窄巷子|成都特色菜|川菜|小吃', types: '050000' },
    { keywords: '', types: '050000' },
  ])

expect(buildRecallQueries({ preference: 'wander', subtypes: ['shopping', 'entertainment'], area: '北京路步行街' }))
  .toContainEqual({ keywords: '北京路步行街|商场|购物中心|步行街|集市', types: '060000' })
```

- [ ] **Step 2: Verify the new module is missing**

Run: `npm test -w server -- recallPolicy.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the pure recall builder**

```ts
export interface RecallQueryInput {
  preference: PreferenceTag
  subtypes: string[]
  area: string
}

export interface RecallQuery {
  keywords: string
  types: string
}

export function buildRecallQueries(input: RecallQueryInput): RecallQuery[] {
  const area = input.area.trim()
  if (input.preference === 'food' && input.subtypes.includes('local_cuisine')) {
    return [
      { keywords: CUISINE_KEYWORDS.local_cuisine, types: '050000' },
      { keywords: [area, '成都特色菜', '川菜', '小吃'].filter(Boolean).join('|'), types: '050000' },
      { keywords: '', types: '050000' },
    ]
  }
  const subtypeConfig: Record<string, RecallQuery> = {
    shopping: { keywords: '商场|购物中心|步行街|集市', types: '060000' },
    entertainment: { keywords: '电影院|KTV|桌游|密室|演出', types: '080000' },
    cafe: { keywords: '咖啡|茶馆|茶饮|书吧', types: '050000' },
    popular: { keywords: '著名景点|名胜古迹|地标|必去', types: '110000|140000' },
  }
  return input.subtypes
    .map(subtype => subtypeConfig[subtype])
    .filter((query): query is RecallQuery => Boolean(query))
    .slice(0, 3)
    .map(query => ({ ...query, keywords: [area, query.keywords].filter(Boolean).join('|') }))
}
```

The returned array is capped at three queries so Amap request volume remains bounded.

- [ ] **Step 4: Integrate variants without relaxing final distance**

Add `areaName?: string` to `searchNearbyPOIs` parameters. Execute recall variants as supplementary `/place/text` calls, normalize each result, merge them with existing promises, and preserve the existing final distance check in `foodPlanner`/`routePolicy`.

- [ ] **Step 5: Test query count and category isolation**

Run: `npm test -w server -- recallPolicy.test.ts poiSearch.quality.test.ts`

Expected: PASS; food queries use `050000`, shopping uses `060000`, entertainment uses `080000`, and no case creates more than three variants per selected preference.

- [ ] **Step 6: Commit recall recovery**

```bash
git add server/src/services/planner/recallPolicy.ts server/src/services/planner/recallPolicy.test.ts server/src/services/amap/poiSearch.ts server/src/services/amap/poiSearch.quality.test.ts
git commit -m "fix: recover sparse popular-area poi searches"
```

### Task 3: Enforce the agreed stop-count policy

**Files:**
- Modify: `server/src/services/planner/timeBudget.ts`
- Modify: `server/src/services/planner/timeBudget.test.ts`
- Modify: `server/src/services/planner/foodPlanner.ts`
- Modify: `server/src/services/planner/generatePlan.foodList.test.ts`

**Interfaces:**
- Produces: `getStopCountRange(minutes)` with exact agreed targets.
- Consumes: all planners use the same upper limit; food lists use `max` when enough qualified candidates exist.

- [ ] **Step 1: Add exact count-contract tests**

```ts
it.each([
  [60, { min: 2, max: 2 }],
  [120, { min: 3, max: 3 }],
  [240, { min: 4, max: 5 }],
  [480, { min: 5, max: 6 }],
])('maps %i minutes to the agreed range', (minutes, expected) => {
  expect(getStopCountRange(minutes)).toEqual(expected)
})
```

- [ ] **Step 2: Verify the old ranges fail**

Run: `npm test -w server -- timeBudget.test.ts`

Expected: FAIL for 60, 120, and 480 minutes.

- [ ] **Step 3: Replace the range table and reuse it in food lists**

```ts
export function getStopCountRange(minutes: number): { min: number; max: number } {
  if (minutes <= 60) return { min: 2, max: 2 }
  if (minutes <= 120) return { min: 3, max: 3 }
  if (minutes <= 240) return { min: 4, max: 5 }
  return { min: 5, max: 6 }
}
```

In `buildPlainFoodList`, replace the fixed `8` cap with `getStopCountRange(input.timeMinutes).max`. Apply the same cap after AI comments are matched back to verified candidates.

- [ ] **Step 4: Test truthful shortage behavior**

Add a test with one qualified candidate for a 60-minute request and assert the route contains one stop, does not duplicate it, and the tagline says `共 1 家`.

Run: `npm test -w server -- timeBudget.test.ts generatePlan.foodList.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit stop-count policy**

```bash
git add server/src/services/planner/timeBudget.ts server/src/services/planner/timeBudget.test.ts server/src/services/planner/foodPlanner.ts server/src/services/planner/generatePlan.foodList.test.ts
git commit -m "fix: enforce truthful route stop targets"
```

### Task 4: Derive all count copy from final arrays

**Files:**
- Create: `server/src/services/planner/countPresentation.ts`
- Create: `server/src/services/planner/countPresentation.test.ts`
- Modify: `server/src/services/planner/foodPresentation.ts`
- Modify: `server/src/services/planner/routePolicy.ts`
- Modify: `server/src/services/planner/foodPresentation.test.ts`

**Interfaces:**
- Produces: `syncCountPresentation(route: Route): Route`.
- Consumes: called after the final route policy removes, fits, or reallocates stops.

- [ ] **Step 1: Add failing copy examples from the 10-combination audit**

```ts
expect(syncCountPresentation(route({ tagline: '评分最高 · 火锅 TOP3', stops: twoStops })).tagline)
  .toBe('评分最高 · 火锅 TOP2')
expect(syncCountPresentation(route({ tagline: '5个地点', stops: fourStops })).tagline)
  .toBe('4个地点')
expect(syncCountPresentation(foodRoute({ stops: oneStop })).tagline)
  .toContain('共 1 家')
```

- [ ] **Step 2: Verify copy remains stale before implementation**

Run: `npm test -w server -- countPresentation.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement narrow numeric replacement**

```ts
export function syncCountPresentation(route: Route): Route {
  const count = route.stops.length
  const tagline = route.tagline
    .replace(/TOP\s*\d+/gi, `TOP${count}`)
    .replace(/\d+\s*个地点/g, `${count}个地点`)
    .replace(/共\s*\d+\s*家/g, `共 ${count} 家`)
  return syncFoodListPresentation({ ...route, tagline })
}
```

Call this function only after `fitStopsToTimeBudget`, distance filtering, quality filtering, and distinct allocation have finished.

- [ ] **Step 4: Run presentation and policy suites**

Run: `npm test -w server -- countPresentation.test.ts foodPresentation.test.ts routePolicy.test.ts generatePlan.foodList.test.ts`

Expected: PASS with no `TOP3` route containing fewer than three stops.

- [ ] **Step 5: Commit final-array presentation**

```bash
git add server/src/services/planner/countPresentation.ts server/src/services/planner/countPresentation.test.ts server/src/services/planner/foodPresentation.ts server/src/services/planner/foodPresentation.test.ts server/src/services/planner/routePolicy.ts
git commit -m "fix: derive route counts from final stops"
```

### Task 5: Add explainable candidate-shortage diagnostics

**Files:**
- Create: `server/src/services/planner/qualityDiagnostics.ts`
- Create: `server/src/services/planner/qualityDiagnostics.test.ts`
- Modify: `server/src/services/routeGenerator.ts`
- Modify: `server/src/routes/planRoutes.ts`
- Modify: `server/src/routes/planRoutes.test.ts`

**Interfaces:**
- Produces: `QualityDiagnostics` containing `recalled`, `rejectedByType`, `rejectedByDistance`, and `qualified` counts.
- API behavior: success keeps `fallbackReason`; final zero routes keep `NO_POIS_FOUND` but return an actionable message.

- [ ] **Step 1: Add diagnostics formatter tests**

```ts
expect(formatShortageReason({ recalled: 18, rejectedByType: 3, rejectedByDistance: 15, qualified: 0 }))
  .toBe('已找到18个候选，但合格地点均超出当前距离；可尝试扩大探索范围')
expect(formatShortageReason({ recalled: 0, rejectedByType: 0, rejectedByDistance: 0, qualified: 0 }))
  .toBe('当前品类暂无可用地点；可尝试放宽类型')
```

- [ ] **Step 2: Verify failure**

Run: `npm test -w server -- qualityDiagnostics.test.ts planRoutes.test.ts`

Expected: FAIL before diagnostics exist.

- [ ] **Step 3: Add diagnostics without changing the error envelope**

Keep `{ error: { code: 'NO_POIS_FOUND', message } }`. Replace the generic message with `formatShortageReason()` only when diagnostics are present, and log the numeric fields once per request.

- [ ] **Step 4: Run route API tests**

Run: `npm test -w server -- qualityDiagnostics.test.ts planRoutes.test.ts routeGenerator.quality.test.ts`

Expected: PASS; HTTP status and `error.code` remain unchanged.

- [ ] **Step 5: Commit diagnostics**

```bash
git add server/src/services/planner/qualityDiagnostics.ts server/src/services/planner/qualityDiagnostics.test.ts server/src/services/routeGenerator.ts server/src/routes/planRoutes.ts server/src/routes/planRoutes.test.ts
git commit -m "fix: explain empty route outcomes"
```

### Task 6: Lock the 10 audited combinations into regression coverage

**Files:**
- Create: `server/src/services/planner/knownCombinationRegression.test.ts`
- Create: `docs/qa/route-quality-10-combinations.md`

**Interfaces:**
- Consumes: mocked Amap candidates representing Shanghai Bund, West Lake, Hefang Street, Nanluoguxiang, Kuanzhai Alley, Muslim Quarter, and Beijing Road.
- Produces: a repeatable regression gate and a manual local acceptance checklist.

- [ ] **Step 1: Encode the hard invariants**

```ts
function expectHardInvariants(route: Route, maxDistance: number) {
  expect(route.stops.every(stop => maxDistance === 0 || (stop.distanceMeters ?? Infinity) <= maxDistance)).toBe(true)
  expect(route.stops.some(stop => /学校|培训中心|服务站|发行站/.test(stop.name))).toBe(false)
  const topCount = route.tagline.match(/TOP\s*(\d+)/i)?.[1]
  const placeCount = route.tagline.match(/(\d+)\s*个地点/)?.[1]
  const shopCount = route.tagline.match(/共\s*(\d+)\s*家/)?.[1]
  for (const value of [topCount, placeCount, shopCount].filter(Boolean)) {
    expect(Number(value)).toBe(route.stops.length)
  }
}
```

- [ ] **Step 2: Add named cases for all 10 combinations**

Use the exact selections and observed failures from `docs/qa/route-quality-10-combinations.md`. Assert Shanghai food lists, Hangzhou scenic/wander, Beijing coffee/hotpot, Chengdu local cuisine, Xi'an mixed food/scenic, and Guangzhou shopping/entertainment independently.

- [ ] **Step 3: Run focused and complete server suites**

Run: `npm test -w server -- knownCombinationRegression.test.ts`

Expected: PASS for all 10 cases.

Run: `npm test -w server`

Expected: all server tests PASS.

- [ ] **Step 4: Run typecheck and build**

Run: `npm run typecheck && npm run build`

Expected: exit code 0; client assets and `client/dist/_worker.js` are produced.

- [ ] **Step 5: Re-run the local matrix against port 9090**

Follow `docs/qa/route-quality-10-combinations.md`, record actual route names/counts, and require: no irrelevant POIs, 100% count consistency, and at least 8/10 combinations usable.

- [ ] **Step 6: Commit the regression gate**

```bash
git add server/src/services/planner/knownCombinationRegression.test.ts docs/qa/route-quality-10-combinations.md
git commit -m "test: cover audited route combinations"
```
