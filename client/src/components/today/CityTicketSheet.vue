<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { TodaySpot } from '../../types/todayPlan'
import { burstConfetti, prefersReducedMotion } from '../../utils/delight'

const props = defineProps<{
  city: string
  persona: string
  spots: TodaySpot[]
  duration: string
}>()

const emit = defineEmits<{ close: []; saved: [] }>()
const saving = ref(false)
const saveMessage = ref('')
const saveFailed = ref(false)
/** 票根静态地图加载完成标记（未完成时显示 shimmer 占位，避免灰块）。 */
const mapLoaded = ref(false)
const fanSpots = computed(() => props.spots.slice(0, 6))
const staticMapUrl = computed(() => {
  const points = props.spots
    .slice(0, 6)
    .map(spot => `${spot.lng.toFixed(6)},${spot.lat.toFixed(6)}`)
    .join(';')
  return `/api/city/static-map?points=${encodeURIComponent(points)}`
})

const dateLabel = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
}).format(new Date())

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  let text = value
  while (text.length > 1 && ctx.measureText(text).width > maxWidth) text = text.slice(0, -1)
  return text === value ? value : `${text}…`
}

function fanStyle(index: number, total: number) {
  const offset = index - (total - 1) / 2
  const spread = total <= 3 ? 46 : 28
  const angle = total <= 3 ? 10 : 7.5
  // wrap 已经做了 -50% 居中，inner 不再重复；这里只做扇形的相对偏移和倾斜。
  return {
    transform: `translateX(${offset * spread}px) translateY(${Math.abs(offset) * 7}px) rotate(${offset * angle}deg)`,
    // Later stops stack above earlier ones: card 3 covers card 2, instead of
    // the middle card always floating above both sides.
    zIndex: String(index + 1),
  }
}

/** 入场动画在 .fan-card-wrap 上做位置/scale/rotate 动效。
 *  wrap 已经居中（translateX(-50%)），inner 的 fanStyle 只需做扇形相对偏移；
 *  每张卡用 index 做进场 delay 和起始水平偏移，依次从地图区域附近「冒」下来到扇形位置。 */
const entering = ref(false)
function wrapStyle(index: number, total: number) {
  const offset = index - (total - 1) / 2
  return {
    '--enter-delay': `${(index * 0.16).toFixed(2)}s`,
    '--enter-x': `${(offset * 26).toFixed(0)}px`,
  } as Record<string, string>
}
onMounted(() => {
  // 关闭动效的用户直接落定，无进场；其它用户下一帧触发入场。
  if (prefersReducedMotion()) {
    entering.value = true
    return
  }
  requestAnimationFrame(() => { entering.value = true })
})

function hideBrokenImage(event: Event) {
  ;(event.currentTarget as HTMLImageElement).style.display = 'none'
}

async function loadCover(spot: TodaySpot): Promise<HTMLImageElement | null> {
  const sources = [spot.coverImageUrl, spot.coverImageFallbackUrl].filter(Boolean) as string[]
  for (const source of sources) {
    const image = await new Promise<HTMLImageElement | null>(resolve => {
      const candidate = new Image()
      candidate.crossOrigin = 'anonymous'
      candidate.onload = () => resolve(candidate)
      candidate.onerror = () => resolve(null)
      candidate.src = source
    })
    if (image) return image
  }
  return null
}

async function loadImageUrl(source: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

function drawCoverCard(
  ctx: CanvasRenderingContext2D,
  spot: TodaySpot,
  image: HTMLImageElement | null,
  index: number,
  total: number,
) {
  const offset = index - (total - 1) / 2
  const width = 270
  const height = 380
  const centerX = 540 + offset * 98
  const top = 750 + Math.abs(offset) * 18

  ctx.save()
  ctx.translate(centerX, top + height)
  ctx.rotate(offset * 0.105)
  ctx.translate(-width / 2, -height)
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, 28)
  ctx.clip()

  if (image) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
    const sourceWidth = width / scale
    const sourceHeight = height / scale
    ctx.drawImage(
      image,
      (image.naturalWidth - sourceWidth) / 2,
      (image.naturalHeight - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    )
  } else {
    const fallback = ctx.createLinearGradient(0, 0, width, height)
    fallback.addColorStop(0, '#38513b')
    fallback.addColorStop(1, '#111714')
    ctx.fillStyle = fallback
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(186,255,24,.85)'
    ctx.font = '900 96px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(spot.name.slice(0, 1), width / 2, 196)
    ctx.textAlign = 'left'
  }

  const shade = ctx.createLinearGradient(0, 210, 0, height)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,.92)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 155, width, height - 155)
  ctx.fillStyle = '#baff18'
  ctx.beginPath()
  ctx.arc(44, 42, 24, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#17210a'
  ctx.font = '900 22px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('✓', 44, 50)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = '800 27px system-ui, sans-serif'
  ctx.fillText(fitText(ctx, spot.name, width - 42), 22, height - 42)
  ctx.strokeStyle = 'rgba(255,255,255,.75)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(2, 2, width - 4, height - 4, 26)
  ctx.stroke()
  ctx.restore()
}

async function generateTicket(): Promise<{ blob: Blob; url: string; filename: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1600
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
    const [coverImages, mapImage] = await Promise.all([
      Promise.all(fanSpots.value.map(loadCover)),
      loadImageUrl(staticMapUrl.value),
    ])

    const gradient = ctx.createLinearGradient(0, 0, 1080, 1440)
    gradient.addColorStop(0, '#111714')
    gradient.addColorStop(1, '#050706')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 1080, 1440)

    ctx.fillStyle = '#baff18'
    ctx.fillRect(0, 0, 1080, 22)
    ctx.font = '700 34px system-ui, sans-serif'
    ctx.fillText('来 都 来 了 · CITY PASS', 76, 105)
    ctx.font = '800 92px system-ui, sans-serif'
    ctx.fillStyle = '#f7f7f2'
    ctx.fillText(fitText(ctx, props.city || '今日城市', 900), 76, 235)
    ctx.font = '500 30px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,.58)'
    ctx.fillText(`${dateLabel}  ·  ${props.persona}模式`, 78, 296)

    if (mapImage) {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(40, 330, 1000, 550, 42)
      ctx.clip()
      const scale = Math.max(1000 / mapImage.naturalWidth, 550 / mapImage.naturalHeight)
      const sourceWidth = 1000 / scale
      const sourceHeight = 550 / scale
      ctx.drawImage(
        mapImage,
        (mapImage.naturalWidth - sourceWidth) / 2,
        (mapImage.naturalHeight - sourceHeight) / 2,
        sourceWidth,
        sourceHeight,
        40,
        330,
        1000,
        550,
      )
      const mapShade = ctx.createLinearGradient(0, 330, 0, 880)
      mapShade.addColorStop(0, 'rgba(5,7,6,.15)')
      mapShade.addColorStop(.68, 'rgba(5,7,6,.05)')
      mapShade.addColorStop(1, 'rgba(5,7,6,.82)')
      ctx.fillStyle = mapShade
      ctx.fillRect(40, 330, 1000, 550)
      ctx.restore()
      ctx.fillStyle = 'rgba(255,255,255,.9)'
      roundRect(ctx, 72, 362, 270, 58, 29)
      ctx.fillStyle = '#315f45'
      ctx.font = '800 23px system-ui, sans-serif'
      ctx.fillText(`今日足迹 · ${props.spots.length} 站`, 102, 399)
    } else {
      const mapFallback = ctx.createLinearGradient(40, 330, 1040, 880)
      mapFallback.addColorStop(0, '#20352b')
      mapFallback.addColorStop(1, '#101713')
      ctx.fillStyle = mapFallback
      roundRect(ctx, 40, 330, 1000, 550, 42)
    }

    // Canvas has no z-index; drawing in visit order gives later cards the
    // same top-layer behavior as the DOM preview.
    const drawingOrder = fanSpots.value.map((_, index) => index)
    drawingOrder.forEach(index => drawCoverCard(
      ctx,
      fanSpots.value[index],
      coverImages[index],
      index,
      fanSpots.value.length,
    ))

    ctx.fillStyle = '#baff18'
    roundRect(ctx, 76, 1210, 928, 190, 36)
    ctx.fillStyle = '#17210a'
    ctx.font = '900 58px system-ui, sans-serif'
    ctx.fillText(`${props.spots.length} 个地点 · 全部到达`, 120, 1292)
    ctx.font = '700 27px system-ui, sans-serif'
    ctx.fillText(`预计停留 ${props.duration}  ·  今日收藏完成`, 120, 1350)

    ctx.strokeStyle = 'rgba(255,255,255,.18)'
    ctx.setLineDash([12, 12])
    ctx.beginPath()
    ctx.moveTo(76, 1462)
    ctx.lineTo(1004, 1462)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#baff18'
    ctx.font = '800 31px system-ui, sans-serif'
    ctx.fillText('今天没有白来。', 76, 1535)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,.35)'
    ctx.font = '500 22px system-ui, sans-serif'
    ctx.fillText('本票仅纪念快乐，不作为报销凭证', 1004, 1533)

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Image could not be encoded')
    const url = URL.createObjectURL(blob)
    return { blob, url, filename: `${props.city || '城市'}-今日票根.png` }
}

function downloadBlob(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** 尝试走系统分享（Web Share API，带图片文件）。返回 true 表示已走分享面板。 */
async function trySystemShare(blob: Blob, url: string, filename: string): Promise<boolean> {
  if (typeof File === 'undefined') return false
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean
    share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>
  }
  if (!nav.share || typeof nav.canShare !== 'function' || !nav.canShare({ files: [file] })) return false
  await nav.share({
    files: [file],
    title: '今日城市票根',
    text: `来都来了 · ${props.city || ''} 今天没有白来`,
  })
  URL.revokeObjectURL(url)
  return true
}

async function saveTicket() {
  saving.value = true
  saveMessage.value = ''
  saveFailed.value = false
  try {
    const { blob, url, filename } = await generateTicket()
    // 移动端优先走系统分享面板：用户选「存储图像」即可直接存入系统相册。
    // 系统面板 resolve 即代表用户选了某个 action（AbortedError 才算取消），
    // 视作保存成功，1.2s 后让父组件关闭 sheet 并展示「已存入相册」提示。
    if (await trySystemShare(blob, url, filename)) {
      saveMessage.value = '✓ 已存入相册，今天没有白来'
      window.setTimeout(() => emit('saved'), 1200)
      return
    }
    downloadBlob(url, filename)
    saveMessage.value = '票根图片已开始下载，请在浏览器下载记录中查看。'
  } catch (error) {
    // 用户取消系统面板不算失败
    if ((error as Error)?.name === 'AbortError') {
      saveMessage.value = '已取消保存'
      return
    }
    saveFailed.value = true
    saveMessage.value = '保存失败，请稍后重试；也可以长按预览截图保存。'
  } finally {
    saving.value = false
  }
}

/** 分享票根：优先系统分享，不支持时降级为下载。 */
async function shareTicket() {
  if (saving.value) return
  saving.value = true
  saveMessage.value = ''
  saveFailed.value = false
  try {
    const { blob, url, filename } = await generateTicket()
    if (await trySystemShare(blob, url, filename)) {
      burstConfetti(document.querySelector<HTMLElement>('.ticket-preview'), {
        count: 32,
        size: [6, 13],
        duration: 1300,
      })
      saveMessage.value = '分享成功，今天没有白来。'
      return
    }
    downloadBlob(url, filename)
    saveMessage.value = '当前环境不支持系统分享，已改为下载图片。'
  } catch (error) {
    // 用户取消系统分享不算失败
    if ((error as Error)?.name === 'AbortError') {
      saveMessage.value = ''
      return
    }
    saveFailed.value = true
    saveMessage.value = '分享失败，请稍后重试；也可以长按预览截图保存。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm" @click.self="emit('close')">
    <section class="max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto rounded-[30px] bg-[#f7f6f2] p-4 shadow-2xl">
      <div class="mb-3 flex items-center justify-between px-1">
        <div>
          <p class="text-sm font-bold text-stone-900">今日城市票根</p>
          <p class="mt-0.5 text-[10px] text-stone-400">保存属于今天的城市纪念</p>
        </div>
        <button type="button" aria-label="关闭票根" class="h-9 w-9 rounded-full bg-stone-200 text-stone-600" @click.stop="emit('close')">×</button>
      </div>

      <div class="ticket-preview relative overflow-hidden rounded-[24px] bg-stone-950 p-6 text-white">
        <div class="ticket-glow pointer-events-none absolute -right-16 top-20 h-48 w-48 rounded-full bg-lime-300/10 blur-3xl" />
        <div class="absolute inset-x-0 top-0 h-1.5 bg-lime-300" />
        <p class="text-[10px] font-bold tracking-[0.2em] text-lime-300">来 都 来 了 · CITY PASS</p>
        <h2 class="mt-4 text-3xl font-black">{{ city }}</h2>
        <p class="mt-1 text-[10px] text-white/45">{{ dateLabel }} · {{ persona }}模式</p>

        <div class="relative -mx-2 mt-4 h-[205px] overflow-hidden rounded-[20px] bg-emerald-950">
          <div v-if="!mapLoaded" class="ticket-map-loading" aria-hidden="true" />
          <img
            :src="staticMapUrl"
            alt="今日地点地图"
            crossorigin="anonymous"
            class="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
            :class="{ 'opacity-0': !mapLoaded }"
            @load="mapLoaded = true"
            @error="hideBrokenImage"
          >
          <div class="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-stone-950/80" />
          <span class="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-emerald-900 shadow">
            今日足迹 · {{ spots.length }} 站
          </span>
        </div>

        <div class="fan-stage relative -mt-9 h-[170px]">
          <div
            v-for="(spot, index) in fanSpots"
            :key="spot.id"
            class="fan-card-wrap"
            :class="{ 'is-entering': entering }"
            :style="wrapStyle(index, fanSpots.length)"
          >
            <div
              class="fan-card relative h-[154px] w-[108px] origin-bottom overflow-hidden rounded-[15px] border border-white/70 bg-gradient-to-br from-emerald-800 to-stone-950 shadow-[0_12px_30px_rgba(0,0,0,.48)]"
              :style="fanStyle(index, fanSpots.length)"
            >
              <img
                v-if="spot.coverImageUrl || spot.coverImageFallbackUrl"
                :src="spot.coverImageUrl || spot.coverImageFallbackUrl"
                :alt="spot.name"
                class="absolute inset-0 h-full w-full object-cover"
                @error="hideBrokenImage"
              >
              <div class="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-black/10" />
              <span class="absolute left-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-lime-300 text-[10px] font-black text-stone-900">✓</span>
              <p class="absolute inset-x-2 bottom-2 line-clamp-2 text-[10px] font-bold leading-3 text-white">{{ spot.name }}</p>
            </div>
          </div>
        </div>

        <div class="relative rounded-2xl bg-lime-300 p-4 text-stone-900 shadow-[0_8px_24px_rgba(186,255,24,.12)]">
          <p class="text-lg font-black">{{ spots.length }} 个地点 · 全部到达</p>
          <p class="mt-1 text-[10px] font-semibold text-stone-700">预计停留 {{ duration }} · 今日收藏完成</p>
        </div>
        <div class="relative mt-5 flex items-end justify-between border-t border-dashed border-white/15 pt-4">
          <p class="text-xs font-bold text-lime-300">今天没有白来。</p>
          <p class="text-[10px] text-white/25">NO TRIP WASTED</p>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <button class="btn-primary py-3.5 text-sm font-bold" :disabled="saving" aria-describedby="ticket-save-status" @click="saveTicket">
          {{ saving ? '正在生成…' : '保存图片' }}
        </button>
        <button class="rounded-2xl bg-stone-900 py-3.5 text-sm font-bold text-lime-300 active:scale-[0.99]" :disabled="saving" @click="shareTicket">
          {{ saving ? '正在生成…' : '分享票根' }}
        </button>
      </div>
      <p
        id="ticket-save-status"
        class="mt-2 min-h-4 text-center text-[10px]"
        :class="saveFailed ? 'text-red-600' : 'text-emerald-700'"
        aria-live="polite"
      >
        {{ saveMessage }}
      </p>
    </section>
  </div>
</template>

<style scoped>
/* 票根预览淡入：给整张预览一个干净的舞台。 */
.ticket-preview {
  animation: ticket-fadein 480ms ease-out both;
}
@keyframes ticket-fadein {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* 打卡点扇形入场：默认从地图区域附近（translateY 负值）缩在视觉外，挂 is-entering 后
   依次落到 fan-stage 底部的扇形位置。translateX(-50%) 让 wrap 在父元素水平居中。 */
.fan-card-wrap {
  position: absolute;
  bottom: 0.5rem;
  left: 50%;
  opacity: 0;
  transform: translateX(calc(-50% + var(--enter-x, 0px))) translateY(-180px) scale(0.6) rotate(-6deg);
  will-change: transform, opacity;
}
.fan-card-wrap.is-entering {
  animation: fan-rise 720ms cubic-bezier(0.2, 1, 0.3, 1) both;
  animation-delay: var(--enter-delay, 0s);
}
@keyframes fan-rise {
  0% { opacity: 0; transform: translateX(calc(-50% + var(--enter-x, 0px))) translateY(-180px) scale(0.6) rotate(-6deg); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1) rotate(0); }
}

.fan-card {
  transition: transform 0.25s ease, filter 0.25s ease;
}

.fan-stage:hover .fan-card {
  filter: saturate(1.08);
}

/* 票根地图加载占位：shimmer 微光，加载完成后 img 淡入覆盖。 */
.ticket-map-loading {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, #12301f 30%, #1d4a31 50%, #12301f 70%);
  background-size: 200% 100%;
  animation: ticket-map-shimmer 1.3s ease infinite;
}
@keyframes ticket-map-shimmer {
  0% { background-position: 130% 0; }
  100% { background-position: -30% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .ticket-preview,
  .fan-card-wrap.is-entering {
    animation: none !important;
  }
  .fan-card-wrap {
    opacity: 1 !important;
    transform: translateX(-50%) !important;
  }
}

/* P1-5：小屏（≤360px）压缩票根预览，避免横向溢出。 */
@media (max-width: 360px) {
  .ticket-preview {
    padding: 16px 14px;
  }
  .fan-stage {
    height: 148px;
  }
  .fan-card {
    height: 134px;
    width: 96px;
  }
}
</style>
