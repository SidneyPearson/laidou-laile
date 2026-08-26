/**
 * 欢愉引擎：为「来都来了」注入轻量惊喜（delight）。
 *
 * 设计原则：
 * - 每个效果都服务功能或情绪，不遮挡核心操作；
 * - 纯 CSS 动画，装饰性元素一律 aria-hidden，不干扰读屏；
 * - 尊重 prefers-reduced-motion，动效在系统降级时自动关闭；
 * - 任何一步失败都静默降级，绝不阻塞主流程。
 */

const EMOJI_POOL = ['🎇', '✨', '🚶', '🌇', '🍜', '🏮', '💫', '☕']

const DEFAULT_COLORS = ['#c7ff1f', '#ffffff', '#ffd166', '#7dd3fc', '#f9a8d4']

/** 用户系统是否要求减少动效（True = 关闭彩带/漂浮等装饰动画）。 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface BurstOptions {
  /** 粒子数量，默认 24。 */
  count?: number
  /** 颜色池，默认品牌酸橙 + 白色 + 暖色系。 */
  colors?: string[]
  /** 粒子尺寸范围 [min, max] 像素。 */
  size?: [number, number]
  /** 动画时长 ms。 */
  duration?: number
}

/** 在 anchor 元素中心爆一簇彩带/光点。装饰性，动画结束自动清理。 */
export function burstConfetti(anchor: HTMLElement | null, options: BurstOptions = {}): void {
  if (!anchor || prefersReducedMotion()) return
  const { count = 24, colors = DEFAULT_COLORS, size = [6, 12], duration = 1100 } = options
  const doc = anchor.ownerDocument ?? document
  const host = doc.body
  const rect = anchor.getBoundingClientRect()
  if (!rect.width && !rect.height) return
  const originX = rect.left + rect.width / 2 + window.scrollX
  const originY = rect.top + rect.height / 2 + window.scrollY

  const pieces: HTMLElement[] = []
  for (let i = 0; i < count; i++) {
    const piece = doc.createElement('span')
    piece.className = 'delight-confetti'
    piece.setAttribute('aria-hidden', 'true')
    const width = size[0] + Math.random() * (size[1] - size[0])
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6
    const dist = 70 + Math.random() * 130
    const tx = Math.cos(angle) * dist
    const ty = Math.sin(angle) * dist - 40
    piece.style.cssText = [
      `left:${originX}px`,
      `top:${originY}px`,
      `width:${width.toFixed(1)}px`,
      `height:${(width * 0.6).toFixed(1)}px`,
      `background:${colors[i % colors.length]}`,
      `--tx:${tx.toFixed(1)}px`,
      `--ty:${ty.toFixed(1)}px`,
      `--rot:${(Math.random() * 360).toFixed(0)}deg`,
      `animation-duration:${(duration / 1000).toFixed(2)}s`,
    ].join(';')
    pieces.push(piece)
  }
  pieces.forEach(piece => host.appendChild(piece))
  window.setTimeout(() => pieces.forEach(piece => piece.remove()), duration + 300)
}

/** 从 anchor 顶部漂浮一簇 emoji（彩蛋/庆祝用）。装饰性，自动清理。 */
export function floatEmojis(anchor: HTMLElement | null, count = 12, duration = 3000): void {
  if (!anchor || prefersReducedMotion()) return
  const doc = anchor.ownerDocument ?? document
  const host = doc.body
  const rect = anchor.getBoundingClientRect()
  if (!rect.width && !rect.height) return
  const originX = rect.left + rect.width / 2 + window.scrollX
  const originY = rect.top + window.scrollY

  const pieces: HTMLElement[] = []
  for (let i = 0; i < count; i++) {
    const el = doc.createElement('span')
    el.className = 'delight-emoji'
    el.setAttribute('aria-hidden', 'true')
    el.textContent = EMOJI_POOL[i % EMOJI_POOL.length]
    const dx = (Math.random() - 0.5) * 240
    const rise = 90 + Math.random() * 130
    el.style.cssText = [
      `left:${originX}px`,
      `top:${originY}px`,
      `--dx:${dx.toFixed(1)}px`,
      `--rise:${rise.toFixed(1)}px`,
      `font-size:${(16 + Math.random() * 14).toFixed(1)}px`,
      `animation-duration:${(duration / 1000).toFixed(2)}s`,
    ].join(';')
    pieces.push(el)
  }
  pieces.forEach(piece => host.appendChild(piece))
  window.setTimeout(() => pieces.forEach(piece => piece.remove()), duration + 300)
}

/** 时段问候：首页画像面板标题等位置的轻快开场白。 */
export function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了，先记下，明天出发'
  if (hour < 11) return '早上好，今天想去哪儿逛？'
  if (hour < 14) return '中午好，吃饱了正好遛遛'
  if (hour < 18) return '下午好，今天的身份是？'
  return '晚上好，夜景安排上了吗？'
}

/** 从文案池轮换取一条（用稳定 index 做“盐”，同一操作重复出现时不腻）。 */
export function pickCopy(pool: readonly string[], index: number): string {
  if (pool.length === 0) return ''
  return pool[Math.abs(index) % pool.length]
}

/** 超过今日计划上限（默认 3 个）时的趣味提醒，反复触发时轮换文案不重复念叨。 */
const PLAN_LIMIT_MESSAGES = [
  '今天 3 个已满员，这个先留给下次吧',
  '一天逛不完，3 个已经是今天的体力极限',
  '再贪就逛不完啦，3 个是今天的满分',
  '先记 3 个，腿和相机都谢谢你的克制',
] as const
let planLimitMessageCounter = 0
export function playfulPlanLimitMessage(): string {
  const message = pickCopy(PLAN_LIMIT_MESSAGES, planLimitMessageCounter)
  planLimitMessageCounter += 1
  return message
}
