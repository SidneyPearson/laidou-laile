<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  batchPublish,
  deleteSpot,
  listCities,
  listSpots,
  publishSpot,
  unpublishSpot,
  verifySpot,
} from '../../admin/api'
import type { AdminCity, AdminSpot, PublicationStatus, VerificationStatus } from '../../admin/types'
import {
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
  SPOT_CATEGORIES,
  SPOT_CATEGORY_LABELS,
  SPOT_TIERS,
  SPOT_TIER_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
} from '../../admin/types'
import AdminBadge from '../../components/admin/AdminBadge.vue'
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue'

const route = useRoute()
const router = useRouter()
const queryValue = (key: string) => typeof route.query[key] === 'string' ? String(route.query[key]) : ''
const spots = ref<AdminSpot[]>([])
const cities = ref<AdminCity[]>([])
const total = ref(0)
const totalPages = ref(0)
const selected = ref<string[]>([])
const error = ref('')
const deleteNotice = ref('')
const loading = ref(false)
const deleting = ref(false)
const batchLoading = ref(false)
const pendingIds = ref(new Set<string>())
const filters = reactive({
  page: Math.max(1, Number(queryValue('page')) || 1),
  pageSize: 20,
  keyword: queryValue('keyword'),
  cityAdcode: queryValue('cityAdcode'),
  category: queryValue('category'),
  tier: queryValue('tier'),
  verificationStatus: queryValue('verificationStatus'),
  publicationStatus: queryValue('publicationStatus'),
})
const pageLabel = computed(() => totalPages.value === 0 ? '0 / 0' : `${filters.page} / ${totalPages.value}`)
const hasFilters = computed(() => Boolean(filters.keyword || filters.cityAdcode || filters.category || filters.tier || filters.verificationStatus || filters.publicationStatus))

// The active filters as a route query object. Carried onto spot-edit links so
// "返回" can restore the exact filtered list instead of resetting to all cities.
const listQuery = computed<Record<string, string>>(() => {
  const q: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'pageSize') continue
    if (value === '' || value === null || value === undefined) continue
    if (key === 'page' && value === 1) continue
    q[key] = String(value)
  }
  return q
})

async function syncQuery() {
  const query = Object.fromEntries(Object.entries(filters)
    .filter(([key, value]) => key !== 'pageSize' && value !== '' && !(key === 'page' && value === 1))
    .map(([key, value]) => [key, String(value)]))
  await router.replace({ path: '/admin/spots', query })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
    const result = await listSpots(params)
    spots.value = result.items
    total.value = result.total
    totalPages.value = result.totalPages
    selected.value = selected.value.filter(id => result.items.some(spot => spot.id === id))
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '地点列表加载失败'
  } finally {
    loading.value = false
  }
}

async function action(kind: 'verify' | 'publish' | 'unpublish' | 'delete', spot: AdminSpot) {
  error.value = ''
  deleteNotice.value = ''
  if (kind === 'delete') {
    if (!confirm(`确定删除「${spot.name}」？此操作不可撤销。`)) return
  }
  pendingIds.value = new Set([...pendingIds.value, spot.id])
  if (kind === 'delete') deleting.value = true
  try {
    if (kind === 'verify') await verifySpot(spot.id, spot.version)
    if (kind === 'publish') await publishSpot(spot.id, spot.version)
    if (kind === 'unpublish') await unpublishSpot(spot.id, spot.version)
    if (kind === 'delete') await deleteSpot(spot.id, spot.version)
    if (kind === 'delete') {
      const wasLastOnPage = spots.value.length === 1
      selected.value = selected.value.filter(id => id !== spot.id)

      // Re-read D1 immediately so the deleted row disappears from the list
      // and pagination/counts stay in sync without a browser refresh.
      if (wasLastOnPage && filters.page > 1) {
        filters.page -= 1
        await syncQuery()
      }
      await load()
      deleteNotice.value = '地点已删除'
      window.setTimeout(() => { deleteNotice.value = '' }, 900)
      return
    }
    // Refresh the list after non-destructive actions. For unpublish→delete
    // chains, load() also updates spot.version so a subsequent delete uses
    // the fresh version instead of the stale one (which would 409).
    await load()
  } catch (caught: any) {
    error.value = caught.message + (caught.details ? `：${JSON.stringify(caught.details)}` : '')
  } finally {
    if (kind === 'delete') deleting.value = false
    const next = new Set(pendingIds.value)
    next.delete(spot.id)
    pendingIds.value = next
  }
}

async function publishSelected() {
  const chosen = spots.value
    .filter(spot => selected.value.includes(spot.id))
    .map(spot => ({ id: spot.id, expectedVersion: spot.version }))
  if (chosen.length === 0) return
  error.value = ''
  batchLoading.value = true
  try {
    const response = await batchPublish(chosen) as { results: Array<{ id: string; ok: boolean; error?: string }> }
    const failures = response.results.filter(result => !result.ok)
    if (failures.length > 0) error.value = failures.map(result => `${result.id}：${result.error ?? '发布失败'}`).join('；')
    selected.value = failures.map(result => result.id)
    await load()
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '批量发布失败'
  } finally {
    batchLoading.value = false
  }
}

async function search() {
  filters.page = 1
  await syncQuery()
  await load()
}

async function clearFilters() {
  Object.assign(filters, { page: 1, keyword: '', cityAdcode: '', category: '', tier: '', verificationStatus: '', publicationStatus: '' })
  await syncQuery()
  await load()
}

async function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === filters.page) return
  filters.page = page
  await syncQuery()
  await load()
}

function verificationTone(status: VerificationStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'verified') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'stale') return 'warning'
  return 'neutral'
}

function publicationTone(status: PublicationStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'published') return 'success'
  if (status === 'pending_review') return 'warning'
  return 'neutral'
}

watch(
  () => [filters.cityAdcode, filters.category, filters.tier, filters.verificationStatus, filters.publicationStatus],
  () => {
    filters.page = 1
    void syncQuery().then(load)
  },
)

watch(
  () => route.query,
  () => {
    const next = {
      keyword: queryValue('keyword'),
      cityAdcode: queryValue('cityAdcode'),
      category: queryValue('category'),
      tier: queryValue('tier'),
      verificationStatus: queryValue('verificationStatus'),
      publicationStatus: queryValue('publicationStatus'),
    }
    const page = Math.max(1, Number(queryValue('page')) || 1)
    if (
      next.keyword !== filters.keyword
      || next.cityAdcode !== filters.cityAdcode
      || next.category !== filters.category
      || next.tier !== filters.tier
      || next.verificationStatus !== filters.verificationStatus
      || next.publicationStatus !== filters.publicationStatus
      || page !== filters.page
    ) {
      Object.assign(filters, next, { page })
      selected.value = []
      void load()
    }
  },
  { deep: false },
)

onMounted(async () => {
  try { cities.value = (await listCities({ page: 1, pageSize: 100 })).items }
  catch { /* The adcode from the URL remains usable when city options cannot load. */ }
  await load()
})
</script>

<template>
  <section>
    <div v-if="deleting" class="admin-delete-progress" role="status" aria-label="正在删除地点"><span /></div>
    <div v-if="deleteNotice" class="admin-delete-success-overlay" role="status" aria-live="polite">
      <div class="admin-delete-success-card">✓ <span>{{ deleteNotice }}</span></div>
    </div>
    <AdminPageHeader eyebrow="Place Ledger" title="地点编目台账" :description="`当前检索到 ${total} 条地点。验证、人工分级和发布状态共同决定地点是否进入 H5。`">
      <template #actions><RouterLink to="/admin/spots/new" class="admin-button-primary">新增地点</RouterLink></template>
    </AdminPageHeader>

    <section class="admin-toolbar mt-6">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div class="flex gap-2 md:col-span-2 xl:col-span-2">
          <input v-model="filters.keyword" placeholder="名称、搜索名或地址" class="admin-input min-w-0 flex-1" @keyup.enter="search">
          <button type="button" class="admin-button-secondary flex-none" @click="search">搜索</button>
        </div>
        <select v-model="filters.cityAdcode" class="admin-input">
          <option value="">全部城市</option>
          <option v-for="city in cities" :key="city.adcode" :value="city.adcode">{{ city.name }} · {{ city.adcode }}</option>
          <option v-if="filters.cityAdcode && !cities.some(city => city.adcode === filters.cityAdcode)" :value="filters.cityAdcode">{{ filters.cityAdcode }}</option>
        </select>
        <select v-model="filters.category" class="admin-input"><option value="">全部分类</option><option v-for="value in SPOT_CATEGORIES" :key="value" :value="value">{{ SPOT_CATEGORY_LABELS[value] }}</option></select>
        <select v-model="filters.tier" class="admin-input"><option value="">全部级别</option><option v-for="value in SPOT_TIERS" :key="value" :value="value">{{ SPOT_TIER_LABELS[value] }}</option></select>
        <select v-model="filters.verificationStatus" class="admin-input"><option value="">全部验证</option><option v-for="value in VERIFICATION_STATUSES" :key="value" :value="value">{{ VERIFICATION_STATUS_LABELS[value] }}</option></select>
        <select v-model="filters.publicationStatus" class="admin-input"><option value="">全部发布</option><option v-for="value in PUBLICATION_STATUSES" :key="value" :value="value">{{ PUBLICATION_STATUS_LABELS[value] }}</option></select>
      </div>
      <div v-if="hasFilters" class="mt-3 flex items-center justify-between border-t border-[var(--admin-line)] pt-3 text-xs text-[var(--admin-muted)]"><span>筛选条件已同步到当前页面地址</span><button type="button" class="font-semibold text-[var(--admin-accent)]" @click="clearFilters">清除筛选</button></div>
    </section>

    <p v-if="error" role="alert" class="admin-alert admin-alert-error mt-4">{{ error }}</p>

    <div v-if="selected.length" class="admin-panel sticky top-28 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:top-4">
      <p class="text-sm"><strong>本页已选 {{ selected.length }} 项</strong><span class="ml-2 text-[var(--admin-muted)]">批量发布仍会逐项检查验证和版本条件</span></p>
      <div class="flex gap-2"><button type="button" class="admin-button-secondary" @click="selected = []">取消选择</button><button type="button" class="admin-button-primary" :disabled="batchLoading" @click="publishSelected">{{ batchLoading ? '发布中…' : '批量发布' }}</button></div>
    </div>

    <div class="admin-panel mt-5 overflow-hidden">
      <div class="ledger-heading hidden lg:grid"><span>地点身份</span><span>分类 / 级别</span><span>验证 / 发布</span><span>地点事实</span><span class="text-right">操作</span></div>
      <div v-if="loading" class="space-y-px bg-[var(--admin-line)]"><div v-for="index in 5" :key="index" class="skeleton h-28"></div></div>
      <div v-else-if="spots.length" class="divide-y divide-[var(--admin-line)]">
        <article v-for="spot in spots" :key="spot.id" class="ledger-row">
          <div class="flex min-w-0 gap-3">
            <input v-model="selected" type="checkbox" :value="spot.id" :aria-label="`选择 ${spot.name}`" class="mt-1 h-4 w-4 flex-none accent-primary-600">
            <div class="min-w-0"><RouterLink :to="{ path: `/admin/spots/${spot.id}`, query: listQuery }" class="font-semibold text-[var(--admin-accent)] hover:underline">{{ spot.name }}</RouterLink><p class="mt-1 truncate font-mono text-[11px] text-[var(--admin-muted)]">{{ spot.id }} · v{{ spot.version }} · {{ spot.cityAdcode }}</p></div>
          </div>
          <div class="flex flex-wrap items-start gap-2 lg:block"><AdminBadge :label="SPOT_CATEGORY_LABELS[spot.category]" tone="neutral" /><div class="mt-0 lg:mt-2"><AdminBadge :label="SPOT_TIER_LABELS[spot.tier]" :tone="spot.tier === 'S' || spot.tier === 'A' ? 'accent' : 'neutral'" /></div></div>
          <div class="flex flex-wrap items-start gap-2 lg:block"><AdminBadge :label="VERIFICATION_STATUS_LABELS[spot.verificationStatus]" :tone="verificationTone(spot.verificationStatus)" /><div class="mt-0 lg:mt-2"><AdminBadge :label="PUBLICATION_STATUS_LABELS[spot.publicationStatus]" :tone="publicationTone(spot.publicationStatus)" /></div></div>
          <div class="min-w-0 text-sm"><p class="truncate">{{ spot.address ?? '尚无地址' }}</p><p class="mt-1 truncate font-mono text-[11px] text-[var(--admin-muted)]">{{ spot.amapPoiId ?? '无高德地点编号' }}</p><p class="mt-1 text-[11px] text-[var(--admin-muted)]">最后验证：{{ spot.verifiedAt ?? '未校验' }}</p></div>
          <div class="flex flex-wrap justify-start gap-2 lg:justify-end"><button type="button" class="ledger-action" :disabled="pendingIds.has(spot.id)" @click="action('verify', spot)">验证</button><button v-if="spot.publicationStatus !== 'published'" type="button" class="ledger-action ledger-action-publish" :disabled="pendingIds.has(spot.id)" @click="action('publish', spot)">发布</button><button v-else type="button" class="ledger-action ledger-action-warning" :disabled="pendingIds.has(spot.id)" @click="action('unpublish', spot)">下架</button><button v-if="spot.publicationStatus !== 'published'" type="button" class="ledger-action ledger-action-danger" :disabled="pendingIds.has(spot.id)" @click="action('delete', spot)">删除</button></div>
        </article>
      </div>
      <div v-else class="admin-empty-state"><p class="font-semibold text-[var(--admin-ink)]">没有符合条件的地点</p><p class="mt-1">调整筛选条件，或新增一条地点档案。</p></div>
    </div>

    <div class="mt-4 flex items-center justify-between gap-3 text-sm"><p class="text-[var(--admin-muted)]">第 {{ pageLabel }} 页 · 共 {{ total }} 条</p><div class="flex gap-2"><button type="button" class="admin-button-secondary" :disabled="filters.page <= 1 || loading" @click="goToPage(filters.page - 1)">上一页</button><button type="button" class="admin-button-secondary" :disabled="filters.page >= totalPages || loading" @click="goToPage(filters.page + 1)">下一页</button></div></div>
  </section>
</template>

<style scoped>
.ledger-heading { grid-template-columns: minmax(210px, 1.35fr) minmax(170px, 1fr) minmax(150px, .8fr) minmax(210px, 1.2fr) minmax(150px, .8fr); @apply gap-4 border-b border-[var(--admin-line)] bg-[var(--admin-surface-muted)] px-4 py-3 text-xs font-semibold text-[var(--admin-muted)]; }
.ledger-row { @apply grid gap-4 px-4 py-4 transition lg:items-center; }
.ledger-row:hover { background: #fffcf6; }
@media (min-width: 1024px) { .ledger-row { grid-template-columns: minmax(210px, 1.35fr) minmax(170px, 1fr) minmax(150px, .8fr) minmax(210px, 1.2fr) minmax(150px, .8fr); } }
.ledger-action { @apply min-h-9 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-info)] disabled:opacity-40; }
.ledger-action-publish { color: var(--admin-success); }
.ledger-action-warning { color: var(--admin-warning); }
.ledger-action-danger { color: var(--admin-danger); }
.admin-delete-progress { position: fixed; top: 0; right: 0; left: 0; z-index: 60; height: 3px; overflow: hidden; background: rgba(239, 187, 167, 0.35); }
.admin-delete-progress span { display: block; width: 38%; height: 100%; border-radius: 999px; background: var(--admin-accent); animation: admin-delete-progress 1.1s ease-in-out infinite; }
.admin-delete-success-overlay { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; pointer-events: none; background: rgba(55, 42, 31, 0.06); }
.admin-delete-success-card { display: flex; min-width: 220px; align-items: center; justify-content: center; gap: 10px; border: 1px solid #b9ddc5; border-radius: 16px; background: rgba(247, 255, 249, 0.97); box-shadow: 0 20px 50px rgba(55, 42, 31, 0.2); color: #287649; font-size: 18px; font-weight: 700; padding: 18px 24px; animation: admin-delete-success-in 0.2s ease-out; }
@keyframes admin-delete-progress { 0% { transform: translateX(-120%); } 50% { transform: translateX(180%); } 100% { transform: translateX(300%); } }
@keyframes admin-delete-success-in { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (max-width: 640px) { .admin-delete-success-card { min-width: 0; margin: 16px; padding: 16px 20px; font-size: 16px; } }
</style>
