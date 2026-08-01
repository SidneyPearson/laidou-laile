<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dashboard, refreshDue } from '../../admin/api'
import type { DashboardStats, RefreshDueItem, RefreshDueResponse } from '../../admin/types'
import AdminBadge from '../../components/admin/AdminBadge.vue'
import AdminMetricTile from '../../components/admin/AdminMetricTile.vue'
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue'

const data = ref<DashboardStats | null>(null)
const reviewData = ref<RefreshDueResponse | null>(null)
const error = ref('')
const loading = ref(true)

const reviewQueue = computed(() => {
  const items = reviewData.value?.items ?? []
  return [...items].sort((a, b) => {
    if (a.activeRun && !b.activeRun) return -1
    if (!a.activeRun && b.activeRun) return 1
    if (a.review.due && !b.review.due) return -1
    if (!a.review.due && b.review.due) return 1
    return b.review.overdueDays - a.review.overdueDays
  })
})

const reviewSummaries = computed(() => reviewData.value ? [
  { label: '本周待复核', value: reviewData.value.summary.dueCities, tone: 'warning' as const },
  { label: '已逾期城市', value: reviewData.value.summary.overdueCities, tone: 'danger' as const },
  { label: '从未复核', value: reviewData.value.summary.neverReviewedCities, tone: 'neutral' as const },
  { label: '正在复核', value: reviewData.value.summary.activeRuns, tone: 'info' as const },
  { label: '本周已完成', value: reviewData.value.summary.completedThisWeek, tone: 'success' as const },
] : [])

function reviewTone(item: RefreshDueItem): 'success' | 'warning' | 'danger' | 'neutral' {
  return { green: 'success', yellow: 'warning', red: 'danger', gray: 'neutral' }[item.review.tone] as 'success' | 'warning' | 'danger' | 'neutral'
}

function reviewTarget(item: RefreshDueItem) {
  return item.activeRun
    ? `/admin/refresh-runs/${item.activeRun.id}`
    : `/admin/cities/${item.city.adcode}/refresh`
}

onMounted(async () => {
  try {
    const [dashboardData, dueData] = await Promise.all([dashboard(), refreshDue()])
    data.value = dashboardData
    reviewData.value = dueData
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '工作台加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      eyebrow="Editorial Queue"
      title="今日编务"
      description="先处理影响发布质量的任务，再查看城市内容的整体状态。数字只反映当前数据，不代表趋势。"
    >
      <template #actions>
        <RouterLink to="/admin/spots/new" class="admin-button-primary">新增地点</RouterLink>
      </template>
    </AdminPageHeader>

    <p v-if="error" role="alert" class="admin-alert admin-alert-error mt-5">{{ error }}</p>

    <template v-if="loading">
      <div class="mt-6 grid gap-3 md:grid-cols-3">
        <div v-for="index in 3" :key="index" class="skeleton h-40 rounded-xl"></div>
      </div>
      <div class="skeleton mt-8 h-72 rounded-xl"></div>
    </template>

    <template v-else-if="data">
      <section class="mt-7">
        <div class="flex items-end justify-between gap-3">
          <div><p class="admin-eyebrow">Priority</p><h2 class="mt-1 text-lg font-bold">待办队列</h2></div>
          <RouterLink to="/admin/spots" class="text-sm font-semibold text-[var(--admin-accent)]">查看全部地点 →</RouterLink>
        </div>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <AdminMetricTile label="待审核" :value="data.pendingReview" description="确认内容质量后再决定是否发布" to="/admin/spots?publicationStatus=pending_review" tone="warning" />
          <AdminMetricTile label="验证失败" :value="data.verificationFailed" description="检查搜索名称、城市和地点事实" to="/admin/spots?verificationStatus=failed" tone="danger" />
          <AdminMetricTile label="需要重新验证" :value="data.staleSpots" description="事实字段发生变化，需要重新核对高德" to="/admin/spots?verificationStatus=stale" tone="info" />
        </div>
      </section>

      <section class="mt-8 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div>
          <p class="admin-eyebrow">Publishing Snapshot</p>
          <h2 class="mt-1 text-lg font-bold">发布快照</h2>
          <div class="admin-panel mt-3 divide-y divide-[var(--admin-line)] px-4">
            <div class="flex items-center justify-between py-4"><span class="text-sm text-[var(--admin-muted)]">已开放城市</span><strong class="text-2xl">{{ data.publishedCities }}</strong></div>
            <div class="flex items-center justify-between py-4"><span class="text-sm text-[var(--admin-muted)]">草稿地点</span><strong class="text-2xl">{{ data.draftSpots }}</strong></div>
            <div class="flex items-center justify-between py-4"><span class="text-sm text-[var(--admin-muted)]">已发布地点</span><strong class="text-2xl">{{ data.publishedSpots }}</strong></div>
          </div>
        </div>

        <div>
          <div class="flex items-end justify-between gap-3">
            <div><p class="admin-eyebrow">City Review Desk</p><h2 class="mt-1 text-lg font-bold">城市资料复核</h2></div>
            <RouterLink to="/admin/cities" class="text-sm font-semibold text-[var(--admin-accent)]">城市档案 →</RouterLink>
          </div>
          <div class="admin-panel mt-3 overflow-hidden">
            <div class="grid grid-cols-2 gap-px border-b border-[var(--admin-line)] bg-[var(--admin-line)] sm:grid-cols-5">
              <div v-for="item in reviewSummaries" :key="item.label" class="bg-[var(--admin-surface)] px-3 py-4">
                <p class="text-xs text-[var(--admin-muted)]">{{ item.label }}</p>
                <p class="mt-1 text-xl font-bold">{{ item.value }}</p>
              </div>
            </div>
            <div v-if="reviewQueue.length" class="divide-y divide-[var(--admin-line)]">
              <article v-for="item in reviewQueue" :key="item.city.adcode" class="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-semibold">{{ item.city.name }}</h3>
                    <AdminBadge :label="item.review.label" :tone="reviewTone(item)" />
                    <AdminBadge v-if="item.activeRun" label="任务进行中" tone="info" />
                  </div>
                  <p class="mt-1 text-xs text-[var(--admin-muted)]">上次复核：{{ item.city.lastContentReviewAt ?? '从未复核' }} · 已发布 {{ item.city.publishedSpotCount }} / {{ item.city.spotCount }} 个地点</p>
                </div>
                <RouterLink :to="reviewTarget(item)" class="admin-button-secondary w-full sm:w-auto">{{ item.activeRun ? '继续复核' : '开始复核' }}</RouterLink>
              </article>
            </div>
            <div v-else class="admin-empty-state">当前没有需要展示的城市复核任务。</div>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>
