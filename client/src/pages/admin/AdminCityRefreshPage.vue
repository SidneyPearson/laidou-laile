<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  acceptRefreshCandidate,
  cancelRefreshRun,
  completeRefreshRun,
  confirmNoMaterialChange,
  confirmRefreshImport,
  getRefreshRun,
  ignoreRefreshCandidate,
  previewRefreshImport,
  rejectRefreshCandidate,
  startCityRefresh,
  verifyRefreshCandidate,
} from '../../admin/api'
import {
  PUBLICATION_STATUS_LABELS,
  REFRESH_ASSESSMENT_LABELS,
  REFRESH_CANDIDATE_TYPE_LABELS,
  REFRESH_DECISION_LABELS,
  REFRESH_RUN_STATUS_LABELS,
  SPOT_CATEGORY_LABELS,
  SPOT_TIER_LABELS,
  type AdminSpot,
  type RefreshCandidate,
  type RefreshPreview,
  type RefreshRunDetail,
} from '../../admin/types'
import AdminBadge from '../../components/admin/AdminBadge.vue'
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue'

const route = useRoute()
const router = useRouter()
const detail = ref<RefreshRunDetail | null>(null)
const rawJson = ref('')
const preview = ref<RefreshPreview | null>(null)
const error = ref('')
const notice = ref('')
const loading = ref(false)
const decisionNotes = reactive<Record<string, string>>({})
const completion = ref<{ nextReviewDueAt?: string } | null>(null)

const pendingCount = computed(() => detail.value?.candidates.filter(candidate => candidate.decision === 'pending').length ?? 0)
const currentSpotMap = computed(() => new Map(detail.value?.currentSpots.map(spot => [spot.id, spot]) ?? []))
const noChangeCandidate = computed(() => detail.value?.candidates.find(candidate => candidate.candidateType === 'no_material_change'))
const canComplete = computed(() => detail.value?.run.status === 'reviewing' && pendingCount.value === 0)
const publishedSpots = computed(() => detail.value?.currentSpots.filter(spot => spot.publicationStatus === 'published') ?? [])
const tierCounts = computed(() => Object.fromEntries(['S', 'A', 'B', 'C'].map(tier => [
  tier,
  publishedSpots.value.filter(spot => spot.tier === tier).length,
])))
const categoryCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const spot of publishedSpots.value) counts.set(spot.category, (counts.get(spot.category) ?? 0) + 1)
  return [...counts.entries()]
})
const workflowSteps = computed(() => {
  const status = detail.value?.run.status
  const hasImport = Boolean(detail.value?.run.resultImportedAt || detail.value?.candidates.length)
  const complete = status === 'completed'
  return [
    { number: 1, label: '检索准备', state: detail.value ? 'complete' : 'current' },
    { number: 2, label: '导入结果', state: hasImport ? 'complete' : 'current' },
    { number: 3, label: '校验预览', state: hasImport ? 'complete' : preview.value ? 'current' : 'locked' },
    { number: 4, label: '逐项审核', state: complete ? 'complete' : hasImport ? 'current' : 'locked' },
    { number: 5, label: '完成复核', state: complete ? 'complete' : canComplete.value ? 'current' : 'locked' },
  ]
})

const jsonExample = `{
  "schemaVersion": "1.0",
  "city": { "name": "上海", "adcode": "310000" },
  "researchedAt": "2026-07-26T00:00:00.000Z",
  "searchSummary": "检索结论摘要",
  "noMaterialChange": true,
  "sources": [
    {
      "title": "来源标题",
      "url": "https://example.com/page",
      "sourceName": "官方网站",
      "sourceKind": "official"
    }
  ],
  "existingSpotChanges": [],
  "newCandidates": [],
  "possibleClosedOrRenamed": []
}`

async function load() {
  const runId = String(route.params.runId ?? '')
  if (!runId) return
  loading.value = true
  try {
    detail.value = await getRefreshRun(runId)
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '复核任务加载失败'
  } finally {
    loading.value = false
  }
}

async function initialize() {
  const adcode = String(route.params.adcode ?? '')
  if (adcode && !route.params.runId) {
    loading.value = true
    try {
      const result = await startCityRefresh(adcode)
      await router.replace(`/admin/refresh-runs/${result.run.id}`)
      await load()
    } catch (caught: unknown) {
      error.value = caught instanceof Error ? caught.message : '复核任务创建失败'
    } finally {
      loading.value = false
    }
    return
  }
  await load()
}

async function copyPrompt() {
  if (!detail.value?.run.promptText) return
  try {
    await navigator.clipboard.writeText(detail.value.run.promptText)
    notice.value = '检索提示词已复制'
  } catch {
    error.value = '复制失败，请手动选择提示词'
  }
}

async function validateImport() {
  if (!detail.value) return
  error.value = ''
  notice.value = ''
  try {
    preview.value = await previewRefreshImport(detail.value.run.id, rawJson.value)
  } catch (caught: unknown) {
    preview.value = null
    error.value = caught instanceof Error ? caught.message : 'JSON校验失败'
  }
}

async function confirmImport() {
  if (!detail.value || !preview.value?.valid) return
  try {
    await confirmRefreshImport(detail.value.run.id, rawJson.value, preview.value.previewHash)
    preview.value = null
    notice.value = '候选已导入，现在需要逐项人工审核'
    await load()
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '候选导入失败'
  }
}

function currentSpot(candidate: RefreshCandidate): AdminSpot | undefined {
  return candidate.targetSpotId ? currentSpotMap.value.get(candidate.targetSpotId) : undefined
}

function sourceUrl(source: Record<string, unknown>): string | null {
  return typeof source.url === 'string' && source.url.startsWith('https://') ? source.url : null
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function categoryLabel(value: string) {
  return SPOT_CATEGORY_LABELS[value as keyof typeof SPOT_CATEGORY_LABELS] ?? value
}

function candidateCanAccept(candidate: RefreshCandidate) {
  if (candidate.candidateType === 'possible_duplicate') return false
  if (candidate.candidateType !== 'new_spot') return true
  return candidate.amapVerificationStatus === 'verified'
    && candidate.systemAssessment === 'recommended_update'
    && candidate.amapVerification !== null
}

async function verifyCandidate(candidate: RefreshCandidate) {
  error.value = ''
  try {
    await verifyRefreshCandidate(candidate.id)
    await load()
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '高德验证失败'
  }
}

async function acceptCandidate(candidate: RefreshCandidate) {
  const spot = currentSpot(candidate)
  const highRisk = candidate.candidateType === 'possible_closed' || candidate.candidateType === 'rename'
  const published = spot?.publicationStatus === 'published'
  if (highRisk && !window.confirm('这是关闭或改名高风险建议。系统不会自动下架；确认继续记录人工决定吗？')) return
  if (published && candidate.candidateType !== 'possible_closed'
    && !window.confirm('该地点当前已发布。确认将审核后的字段变更应用到线上地点吗？')) return
  try {
    await acceptRefreshCandidate(candidate.id, {
      note: decisionNotes[candidate.id] || null,
      expectedVersion: spot?.version,
      applyToPublished: published,
      highRiskConfirmed: highRisk,
    })
    await load()
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '接受候选失败'
  }
}

async function decide(candidate: RefreshCandidate, decision: 'reject' | 'ignore') {
  try {
    if (decision === 'reject') await rejectRefreshCandidate(candidate.id, decisionNotes[candidate.id])
    else await ignoreRefreshCandidate(candidate.id, decisionNotes[candidate.id])
    await load()
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '保存人工决定失败'
  }
}

async function confirmNoChange() {
  if (!detail.value || !window.confirm('确认已人工查看检索结果，本周确实没有实质变化吗？')) return
  try {
    await confirmNoMaterialChange(detail.value.run.id, decisionNotes[noChangeCandidate.value?.id ?? ''])
    await load()
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '无变化确认失败'
  }
}

async function complete() {
  if (!detail.value || !canComplete.value) return
  if (!window.confirm('确认所有候选均已处理，并完成本次城市内容复核吗？')) return
  try {
    completion.value = await completeRefreshRun(detail.value.run.id)
    notice.value = '本次城市内容复核已完成'
    await load()
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '完成复核失败'
  }
}

async function cancel() {
  if (!detail.value || !window.confirm('确认取消本次复核任务吗？已导入的候选不会应用到地点数据。')) return
  try {
    await cancelRefreshRun(detail.value.run.id)
    await router.replace('/admin/cities')
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '取消任务失败'
  }
}

onMounted(initialize)

watch(
  () => [route.params.runId, route.params.adcode],
  () => {
    detail.value = null
    preview.value = null
    rawJson.value = ''
    completion.value = null
    error.value = ''
    notice.value = ''
    void initialize()
  },
)
</script>

<template>
  <section>
    <AdminPageHeader
      eyebrow="City Review Desk"
      :title="detail?.city.name ? `${detail.city.name} · 资料复核桌` : '资料复核桌'"
      description="外部检索只负责提供候选，所有变化仍需经过结构校验、高德验证与逐项人工决定。"
    >
      <template #meta>
        <p v-if="detail" class="mt-2 font-mono text-xs text-[var(--admin-muted)]">{{ REFRESH_RUN_STATUS_LABELS[detail.run.status] }} · {{ detail.run.startedAt }}</p>
      </template>
      <template #actions>
        <RouterLink to="/admin/cities" class="admin-button-secondary">返回城市档案</RouterLink>
        <button v-if="detail && !['completed','cancelled','failed'].includes(detail.run.status)" type="button" class="admin-button-danger" @click="cancel">取消任务</button>
      </template>
    </AdminPageHeader>

    <p v-if="error" role="alert" class="admin-alert admin-alert-error mt-4">{{ error }}</p>
    <p v-if="notice" aria-live="polite" class="admin-alert admin-alert-success mt-4">{{ notice }}</p>

    <nav v-if="detail" aria-label="复核进度" class="admin-panel mt-6 overflow-x-auto p-4">
      <ol class="flex min-w-[680px] items-center">
        <li v-for="(step,index) in workflowSteps" :key="step.number" class="flex flex-1 items-center last:flex-none">
          <div class="flex items-center gap-2">
            <span class="workflow-dot" :class="`workflow-dot-${step.state}`">{{ step.number }}</span>
            <span class="whitespace-nowrap text-xs font-semibold" :class="step.state === 'locked' ? 'text-[var(--admin-muted)]' : 'text-[var(--admin-ink)]'">{{ step.label }}<span class="sr-only">（{{ step.state === 'complete' ? '已完成' : step.state === 'current' ? '当前步骤' : '尚未开始' }}）</span></span>
          </div>
          <span v-if="index < workflowSteps.length - 1" class="mx-3 h-px flex-1 bg-[var(--admin-line)]"></span>
        </li>
      </ol>
    </nav>

    <template v-if="detail">
      <article class="step-card">
        <div class="step-number">1</div>
        <div class="min-w-0 flex-1">
          <p class="admin-eyebrow">Research Brief</p>
          <h3 class="mt-1 text-lg font-bold">检索准备与当前底稿</h3>
          <p class="text-sm text-gray-500">
            本次复核：{{ detail.run.startedAt }} · 上次复核：{{ detail.city.lastContentReviewAt ?? '从未复核' }}
            · 当前已发布 {{ detail.city.publishedSpotCount }} 个地点
          </p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p v-for="tier in ['S','A','B','C']" :key="tier" class="summary-box">{{ tier }} 级：{{ tierCounts[tier] ?? 0 }}</p>
          </div>
          <div class="mt-3 flex flex-wrap gap-2 text-xs">
            <span v-for="[category,count] in categoryCounts" :key="category" class="rounded-full bg-gray-100 px-3 py-1">{{ categoryLabel(category) }}：{{ count }}</span>
          </div>
          <div class="mt-4 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
            <div class="min-w-0">
              <p class="mb-2 text-xs font-semibold text-[var(--admin-muted)]">当前已发布地点清单</p>
              <div class="rounded-lg border border-[var(--admin-line)] bg-[var(--admin-surface)]">
                <div v-for="spot in publishedSpots" :key="spot.id" class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--admin-line)] p-3 text-xs last:border-b-0">
                  <div class="min-w-0"><p class="truncate font-semibold">{{ spot.name }}</p><p class="mt-1 truncate font-mono text-[10px] text-[var(--admin-muted)]">{{ spot.id }}</p></div>
                  <div class="flex items-start gap-1"><AdminBadge :label="SPOT_CATEGORY_LABELS[spot.category]" tone="neutral" /><AdminBadge :label="SPOT_TIER_LABELS[spot.tier]" :tone="spot.tier === 'S' || spot.tier === 'A' ? 'accent' : 'neutral'" /></div>
                </div>
                <div v-if="publishedSpots.length === 0" class="admin-empty-state py-8">当前没有已发布地点</div>
              </div>
            </div>
            <div class="min-w-0">
              <p class="mb-2 text-xs font-semibold text-[var(--admin-muted)]">联网检索提示词</p>
              <textarea :value="detail.run.promptText ?? ''" readonly class="admin-input h-80 font-mono text-xs leading-5"></textarea>
              <button type="button" class="admin-button-primary mt-3" @click="copyPrompt">一键复制提示词</button>
            </div>
          </div>
        </div>
      </article>

      <article class="step-card">
        <div class="step-number">2</div>
        <div class="min-w-0 flex-1">
          <p class="admin-eyebrow">External Findings</p>
          <h3 class="mt-1 text-lg font-bold">导入外部检索结果</h3>
          <p class="mt-1 text-sm text-red-600">只接受 JSON 对象，不接受 Markdown 说明或 ``` 代码块。</p>
          <textarea v-model="rawJson" class="admin-input mt-4 h-72 font-mono text-xs" placeholder="在此粘贴完整 JSON"></textarea>
          <details class="mt-3 rounded-xl bg-gray-50 p-3 text-sm">
            <summary class="cursor-pointer font-medium">查看最小无变化示例</summary>
            <pre class="mt-3 overflow-auto whitespace-pre-wrap text-xs">{{ jsonExample }}</pre>
          </details>
          <button type="button" class="admin-button-primary mt-3" @click="validateImport">校验并预览</button>
        </div>
      </article>

      <article v-if="preview" class="step-card">
        <div class="step-number">3</div>
        <div class="min-w-0 flex-1">
          <p class="admin-eyebrow">Validation Preview</p>
          <h3 class="mt-1 text-lg font-bold">结构校验与导入预览</h3>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p class="summary-box">结构：{{ preview.valid ? '合法' : '存在错误' }}</p>
            <p class="summary-box">来源：{{ preview.summary.sourceCount }}</p>
            <p class="summary-box">新地点：{{ preview.summary.newSpotCount }}</p>
            <p class="summary-box">现有地点变化：{{ preview.summary.existingChangeCount }}</p>
            <p class="summary-box">疑似关闭/改名：{{ preview.summary.possibleClosedCount }}</p>
            <p class="summary-box">重复：{{ preview.summary.duplicateCount }}</p>
            <p class="summary-box">无实质变化：{{ preview.summary.noMaterialChange ? '是' : '否' }}</p>
            <p class="summary-box">错误：{{ preview.summary.errorCount }}</p>
          </div>
          <ul v-if="preview.errors.length" class="mt-3 list-disc pl-5 text-sm text-red-600"><li v-for="item in preview.errors" :key="item">{{ item }}</li></ul>
          <p class="mt-3 text-sm text-gray-500">预览不会写入候选表。只有点击下方确认按钮后才会保存候选。</p>
          <button type="button" class="admin-button-primary mt-3" :disabled="!preview.valid" @click="confirmImport">确认导入候选</button>
        </div>
      </article>

      <article v-if="detail.candidates.length" class="step-card">
        <div class="step-number">4</div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="admin-eyebrow">Human Review</p><h3 class="mt-1 text-lg font-bold">逐项人工审核</h3></div><AdminBadge :label="`待处理 ${pendingCount} 项`" :tone="pendingCount ? 'warning' : 'success'" /></div>
          <div class="mt-4 space-y-4">
            <section v-for="candidate in detail.candidates" :key="candidate.id" class="candidate-card">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-semibold">{{ candidate.proposedName || currentSpot(candidate)?.name || '本周无实质变化' }}</p>
                  <div class="mt-2 flex flex-wrap gap-2"><AdminBadge :label="REFRESH_CANDIDATE_TYPE_LABELS[candidate.candidateType]" tone="info" /><AdminBadge :label="REFRESH_DECISION_LABELS[candidate.decision]" :tone="candidate.decision === 'pending' ? 'warning' : candidate.decision === 'accepted' ? 'success' : 'neutral'" /></div>
                </div>
                <AdminBadge :label="REFRESH_ASSESSMENT_LABELS[candidate.systemAssessment]" :tone="candidate.systemAssessment === 'high_risk_manual_review' || candidate.systemAssessment === 'invalid' ? 'danger' : 'warning'" />
              </div>
              <p class="mt-2 text-sm text-gray-600">{{ candidate.systemAssessmentReason }}</p>
              <div v-if="currentSpot(candidate)" class="mt-3 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-surface-muted)] p-3 text-sm">
                <p class="font-medium">当前系统内容</p>
                <p>{{ currentSpot(candidate)?.name }} · {{ SPOT_CATEGORY_LABELS[currentSpot(candidate)!.category] }} · {{ SPOT_TIER_LABELS[currentSpot(candidate)!.tier] }} · {{ PUBLICATION_STATUS_LABELS[currentSpot(candidate)!.publicationStatus] }} · v{{ currentSpot(candidate)?.version }}</p>
              </div>
              <div class="mt-3 grid gap-3 lg:grid-cols-2">
                <div><p class="text-sm font-medium">AI 建议内容</p><pre class="data-box">{{ formatJson(candidate.proposedData) }}</pre></div>
                <div><p class="text-sm font-medium">字段级差异</p><pre class="data-box">{{ formatJson(candidate.diff ?? {}) }}</pre></div>
              </div>
              <div v-if="candidate.evidence.length" class="mt-3">
                <p class="text-sm font-medium">来源链接（系统未自动验证网页真实性）</p>
                <ul class="mt-1 space-y-1 text-sm">
                  <li v-for="(source,index) in candidate.evidence" :key="index">
                    <a v-if="sourceUrl(source)" :href="sourceUrl(source)!" target="_blank" rel="noopener noreferrer" class="break-all text-primary-600 underline">{{ source.title || sourceUrl(source) }}</a>
                    <span v-else>{{ source.title || '无有效链接' }}</span>
                  </li>
                </ul>
              </div>
              <div class="mt-3 rounded-lg border border-[#bad1df] bg-[var(--admin-info-soft)] p-3 text-sm text-[var(--admin-info)]">
                高德验证：{{ candidate.amapVerificationStatus }}
                <pre v-if="candidate.amapVerification" class="mt-2 overflow-auto whitespace-pre-wrap text-xs">{{ formatJson(candidate.amapVerification) }}</pre>
              </div>
              <template v-if="candidate.decision === 'pending' && detail.run.status === 'reviewing'">
                <textarea v-model="decisionNotes[candidate.id]" class="admin-input mt-3" placeholder="人工审核备注（可选）"></textarea>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button v-if="['new_spot','possible_duplicate','rename','possible_closed'].includes(candidate.candidateType)" type="button" class="admin-button-secondary text-[var(--admin-info)]" @click="verifyCandidate(candidate)">高德验证</button>
                  <button v-if="candidate.candidateType === 'no_material_change'" type="button" class="admin-button-primary" @click="confirmNoChange">主动确认无实质变化</button>
                  <button v-else-if="candidate.candidateType !== 'possible_duplicate'" type="button" class="admin-button-primary" :disabled="!candidateCanAccept(candidate)" :title="candidateCanAccept(candidate) ? '' : '新地点必须通过高德验证后才能接受'" @click="acceptCandidate(candidate)">接受建议</button>
                  <button type="button" class="admin-button-danger" @click="decide(candidate,'reject')">拒绝</button>
                  <button type="button" class="admin-button-secondary" @click="decide(candidate,'ignore')">忽略</button>
                </div>
              </template>
              <p v-else-if="candidate.decision === 'pending' && detail.run.status !== 'reviewing'" class="mt-3 text-xs text-[var(--admin-muted)]">复核任务当前状态为 {{ REFRESH_RUN_STATUS_LABELS[detail.run.status] }}，无法执行人工决定。</p>
            </section>
          </div>
        </div>
      </article>

      <article class="step-card">
        <div class="step-number">5</div>
        <div class="min-w-0 flex-1">
          <p class="admin-eyebrow">Close Review</p>
          <h3 class="mt-1 text-lg font-bold">完成本次复核</h3>
          <p class="mt-1 text-sm text-gray-500">只有所有候选均已处理后，才会更新城市的上次内容复核时间。</p>
          <p v-if="pendingCount" class="mt-3 text-sm text-amber-700">仍有 {{ pendingCount }} 条候选待处理。</p>
          <p v-if="completion?.nextReviewDueAt" class="mt-3 text-sm text-green-700">下次预计复核：{{ completion.nextReviewDueAt }}</p>
          <button type="button" class="admin-button-primary mt-3" :disabled="!canComplete" @click="complete">完成本次复核</button>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.step-card { @apply relative mt-5 flex gap-4 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-surface)] p-4 shadow-[0_8px_28px_rgba(55,42,31,0.04)] md:p-5; }
.step-card:not(:last-child)::after { content: ''; position: absolute; left: 31px; top: 100%; width: 1px; height: 21px; background: var(--admin-line); }
.step-number { background: var(--admin-ink); @apply grid h-8 w-8 flex-none place-items-center rounded-full font-mono text-xs font-bold text-white; }
.summary-box { background: var(--admin-surface-muted); border: 1px solid var(--admin-line); @apply rounded-lg p-3 text-sm; }
.data-box { background: var(--admin-surface-muted); border: 1px solid var(--admin-line); @apply mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-xs leading-5; }
.candidate-card { border: 1px solid var(--admin-line); background: #fffcf7; @apply rounded-xl p-4; }
.workflow-dot { @apply grid h-8 w-8 place-items-center rounded-full border font-mono text-xs font-bold; }
.workflow-dot-complete { background: var(--admin-success-soft); border-color: #b9ddc8; color: var(--admin-success); }
.workflow-dot-current { background: var(--admin-accent); border-color: var(--admin-accent); @apply text-white; }
.workflow-dot-locked { background: var(--admin-surface-muted); border-color: var(--admin-line); color: var(--admin-muted); }
</style>
