import type { Route, PreferenceTag } from '../types/route.js'

// ── Axis values (shared with LLM prompt, hardcoded for determinism) ──

export const GOAL_VALUES = [
  'eat', 'sightsee', 'culture', 'shop', 'relax', 'nature', 'nightlife',
] as const
export const BEHAVIOR_VALUES = [
  'deep_single', 'hop_multi', 'efficient_route', 'free_wander',
] as const
export const INFO_VALUES = [
  'by_theme', 'by_ranking', 'by_geography', 'by_time',
] as const

export type GoalAxis = typeof GOAL_VALUES[number]
export type BehaviorAxis = typeof BEHAVIOR_VALUES[number]
export type InfoAxis = typeof INFO_VALUES[number]

export interface RouteAxes {
  goal: GoalAxis
  behavior: BehaviorAxis
  info: InfoAxis
}

// ── Human-readable labels for each axis value ──

const GOAL_LABEL: Record<GoalAxis, string> = {
  eat: '觅食', sightsee: '景点打卡', culture: '文化熏陶',
  shop: '购物', relax: '休闲放松', nature: '自然散步', nightlife: '夜生活',
}

const BEHAVIOR_LABEL: Record<BehaviorAxis, string> = {
  deep_single: '深度 · 一处慢逛',
  hop_multi: '连逛 · 多点串',
  efficient_route: '顺路 · 最省脚',
  free_wander: '漫游 · 不设限',
}

const INFO_LABEL: Record<InfoAxis, string> = {
  by_theme: '主题串', by_ranking: '排名比', by_geography: '地理流', by_time: '时间线',
}

// ── Divergence rule: ≥2 axes different = ≥30° ──
// Accepts loose string axes (LLM may emit values outside the enum; equality still holds).

interface LooseAxes {
  goal: string
  behavior: string
  info: string
}

export function axisDiffCount(a: LooseAxes, b: LooseAxes): number {
  return (a.goal !== b.goal ? 1 : 0)
    + (a.behavior !== b.behavior ? 1 : 0)
    + (a.info !== b.info ? 1 : 0)
}

export function meetsDivergence(a: LooseAxes, b: LooseAxes): boolean {
  return axisDiffCount(a, b) >= 2
}

// ── Heuristic axis inference for routes without explicit axes from LLM ──

interface InferCtx {
  preferences: PreferenceTag[]
}

export function inferAxes(route: Route, ctx: InferCtx): RouteAxes {
  // ── Goal (功能目标): from stop type keywords, or user preference ──
  const allNotes = route.stops.map(s => (s.notes || '') + s.name).join('')
  let goal: GoalAxis = 'sightsee'
  if (ctx.preferences.includes('food')) goal = 'eat'
  else if (ctx.preferences.includes('wander')) goal = 'relax'
  // Override from notes
  if (allNotes.match(/咖啡|茶馆|书店|文创/)) goal = 'relax'
  if (allNotes.match(/博物|展览|历史|故居/)) goal = 'culture'
  if (allNotes.match(/商场|购物|步行街/)) goal = 'shop'
  if (allNotes.match(/公园|森林|山|湖/)) goal = 'nature'
  if (allNotes.match(/酒吧|夜|live/)) goal = 'nightlife'

  // ── Behavior (用户行为): from stop count + visit duration distribution ──
  const stopCount = route.stops.length
  const durations = route.stops.map(s => s.visitDurationMinutes || 30)
  const maxDur = Math.max(...durations)
  const avgDur = durations.reduce((a, b) => a + b, 0) / durations.length

  let behavior: BehaviorAxis = 'hop_multi'
  if (stopCount === 1 || (stopCount <= 3 && maxDur >= 60)) {
    // 1 stop, or 2-3 stops with one long session = deep dive
    behavior = 'deep_single'
  } else if (maxDur / avgDur < 1.5 && stopCount >= 3) {
    // Evenly spread durations + many stops = hop between many spots
    behavior = 'hop_multi'
  }

  // ── Info (信息组织): from route naming pattern and stop order ──
  let info: InfoAxis = 'by_theme'
  // Gourmet comparison cards = by_ranking (score/distance/popularity)
  if (route.tagline?.includes('评分') || route.tagline?.includes('距离')) {
    info = 'by_ranking'
  }
  // Day trip timeline = by_geography
  if (route.tips?.includes('步行') || route.name.includes('一日') || route.name.includes('半日')) {
    info = 'by_geography'
  }

  return { goal, behavior, info }
}

// ── Annotate a route with human-readable direction + reason ──

export function annotate(route: Route, axes: LooseAxes): Route {
  const direction = BEHAVIOR_LABEL[axes.behavior as BehaviorAxis] ?? '特色路线'

  // Reason = one sentence explaining how this differs from others
  const goalLabel = GOAL_LABEL[axes.goal as GoalAxis] ?? '探索'
  const infoLabel = INFO_LABEL[axes.info as InfoAxis] ?? '主题串'
  const reasonPieces: string[] = [goalLabel]
  reasonPieces.push(
    axes.behavior === 'deep_single' ? '1-2个点深度体验' :
    axes.behavior === 'hop_multi' ? `${route.stops.length}个点连逛` :
    axes.behavior === 'efficient_route' ? '按地理顺路排' :
    '自由漫步',
  )
  reasonPieces.push(infoLabel)
  const reason = reasonPieces.join(' · ')

  return {
    ...route,
    direction: route.direction || direction,
    reason,
    axes,
  }
}

// ── Enforce ≥30° divergence: produce maximal pairwise-valid subset ──
// Greedy: iterate routes in order; keep a route if it differs ≥2 axes from all already-kept.
// Exempt routes (marked divergenceExempt) pass through unconditionally and do NOT participate in comparison.

interface DivergeResult {
  kept: Route[]
  dropped: Array<{ route: Route; reason: string }>
}

export function enforceDivergence(routes: Route[], ctx: InferCtx): DivergeResult {
  const kept: Route[] = []
  const dropped: Array<{ route: Route; reason: string }> = []

  for (const r of routes) {
    // Exempt routes pass through directly (美食对比等)
    if (r.divergenceExempt) {
      kept.push(r)
      continue
    }

    // Infer axes if not already present
    const axes = r.axes ?? inferAxes(r, ctx)

    // Check against all already-kept non-exempt routes
    const keptNonExempt = kept.filter(k => !k.divergenceExempt)
    const conflicts = keptNonExempt.filter(k => {
      const otherAxes = k.axes ?? inferAxes(k, ctx)
      return !meetsDivergence(axes, otherAxes)
    })

    if (conflicts.length === 0) {
      // No conflict → annotate and keep
      kept.push(annotate(r, axes))
    } else {
      // Conflicts → drop and explain why
      const conflictNames = conflicts.map(c => `"${c.name}"`).join(', ')
      dropped.push({
        route: r,
        reason: `与已保留路线 ${conflictNames} 结构差异不足 30°，已降级舍弃`,
      })
    }
  }

  return { kept, dropped }
}

// ── Prompt fragment for LLM: explain axis enum + divergence rule ──
// Embedded into buildUserPrompt for 3-route generation mode.

export const AXIS_PROMPT_FRAGMENT = `
## 📐 结构分化强制约束 (30° 原则)

以下是每条路线必须填写的三个轴枚举。任意两条路线必须有 **至少两个轴不同**，否则不合格会被自动丢弃。

### 三个轴枚举(每条 route 必须选):
- **goal** (功能目标): eat | sightsee | culture | shop | relax | nature | nightlife
- **behavior** (用户行为): deep_single (深度泡一处) | hop_multi (多点连逛) | efficient_route (高效顺路) | free_wander (随机漫游)
- **info** (信息组织): by_theme | by_ranking | by_geography | by_time

### 规则:
1. 每条 route 必须增加三个新字段:
   - **axes**: { goal, behavior, info } - 三选一
   - **direction**: 结构方向一句话,如"深度·一处慢逛"
   - **reason**: 为什么与其它方案不同,一句话(如"景点·多点连逛·主题串")
2. 任意两条路线的 axes 必须有≥2个值不同(差异不足则被丢弃)
3. 不能通过"换地点名"或"调整顺序"充数——三条路线的用户行为或功能目标必须真的不同
4. 例如:
   - Route1: {goal:sightsee, behavior:hop_multi, info:by_theme}
   - Route2: {goal:eat, behavior:deep_single, info:by_ranking} → 三个轴全不同
   - Route3: {goal:sightsee, behavior:hop_multi, info:by_ranking} → 与Route1只有1轴不同 → 不合格

请保证三条路线的差异真实存在,而不是措辞上的微差。`
