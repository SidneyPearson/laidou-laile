<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createSpot, getSpot, listCities, updateSpot, verifySpot } from '../../admin/api'
import { sanitizeCoverName } from '../../admin/localImageUpload'
import {
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
  SPOT_CATEGORIES,
  SPOT_CATEGORY_LABELS,
  SPOT_TIERS,
  SPOT_TIER_LABELS,
  VERIFICATION_STATUS_LABELS,
  type AdminCity,
  type AdminSpot,
  type SpotSource,
} from '../../admin/types'
import AdminBadge from '../../components/admin/AdminBadge.vue'
import AdminFormSection from '../../components/admin/AdminFormSection.vue'
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue'

// Dev-only local cover uploader (browser compression + write to
// client/public/covers via the Vite middleware). Excluded from prod bundle.
const LocalCoverImageUploader = import.meta.env.DEV
  ? defineAsyncComponent(() => import('../../components/admin/LocalCoverImageUploader.vue'))
  : null

const route = useRoute()
const router = useRouter()

// Filters carried over from the spot ledger (cityAdcode, category, …) so
// "返回" restores the exact filtered list instead of resetting to all cities.
const BACK_QUERY_KEYS = ['cityAdcode', 'category', 'tier', 'verificationStatus', 'publicationStatus', 'keyword', 'page'] as const
const backQuery = computed<Record<string, string>>(() => {
  const q: Record<string, string> = {}
  for (const key of BACK_QUERY_KEYS) {
    const raw = route.query[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === 'string' && value !== '' && !(key === 'page' && value === '1')) q[key] = value
  }
  return q
})
const backToList = computed(() => ({ path: '/admin/spots', query: backQuery.value }))

const error = ref('')
const saving = ref(false)
const verifying = ref(false)
const dirty = ref(false)
const isNew = computed(() => !route.params.id)
const form = reactive<any>({ id: '', cityAdcode: '310000', name: '', searchName: '', district: null, address: null, lng: null, lat: null, category: 'classic_landmark', tier: 'B', priority: 0, reason: '', tierReason: '', suggestedDuration: null, bestTime: null, indoorFriendly: false, reservationRequired: false, reservationNote: null, coverImageUrl: null, publicationStatus: 'draft', sourceKind: 'admin', version: 1, amapPoiId: null, verificationStatus: 'unverified', verifiedAt: null })
const personasText = ref('')
const tagsText = ref('')
const sources = ref<SpotSource[]>([])
const cities = ref<AdminCity[]>([])
const imageCandidates = ref<Array<{ url: string; title: string }>>([])

// Local uploads join the candidate grid so they can be compared against the
// Amap candidates before picking (the choice still only lands on 保存).
function handleLocalCoverUploaded(path: string) {
  if (!imageCandidates.value.some(image => image.url === path)) {
    imageCandidates.value = [{ url: path, title: '本地上传' }, ...imageCandidates.value]
  }
  form.coverImageUrl = path
}

function fill(spot: AdminSpot) {
  Object.assign(form, spot)
  personasText.value = spot.personas.join(',')
  tagsText.value = spot.tags.join(',')
  sources.value = (spot.sources ?? []).map(source => ({ ...source }))
  void nextTick(() => { dirty.value = false })
}

async function load() {
  if (!isNew.value) {
    try { fill(await getSpot(String(route.params.id))) }
    catch (caught: unknown) { error.value = caught instanceof Error ? caught.message : '地点加载失败' }
  }
}

async function loadCities() {
  try { cities.value = (await listCities({ page: 1, pageSize: 100 })).items }
  catch (caught: unknown) { error.value = caught instanceof Error ? caught.message : '城市列表加载失败' }
}

function payload() {
  return {
    id: form.id,
    cityAdcode: form.cityAdcode,
    name: form.name,
    searchName: form.searchName,
    district: form.district || null,
    address: form.address || null,
    lng: form.lng === '' ? null : form.lng,
    lat: form.lat === '' ? null : form.lat,
    category: form.category,
    tier: form.tier,
    priority: form.priority,
    reason: form.reason,
    tierReason: form.tierReason,
    personas: personasText.value.split(',').map(value => value.trim()).filter(Boolean),
    tags: tagsText.value.split(',').map(value => value.trim()).filter(Boolean),
    suggestedDuration: form.suggestedDuration || null,
    bestTime: form.bestTime || null,
    indoorFriendly: form.indoorFriendly,
    reservationRequired: form.reservationRequired,
    reservationNote: form.reservationNote || null,
    coverImageUrl: form.coverImageUrl || null,
    publicationStatus: form.publicationStatus,
    sourceKind: form.sourceKind || null,
    sources: sources.value.filter(source => source.title.trim()),
  }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    if (isNew.value) {
      const row = await createSpot(payload())
      await router.replace({ path: `/admin/spots/${row.id}`, query: { ...route.query } })
      fill(row)
    } else {
      const { id, publicationStatus, ...changes } = payload()
      fill(await updateSpot(form.id, { ...changes, ...(publicationStatus === 'published' ? {} : { publicationStatus }), expectedVersion: form.version }))
    }
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '地点保存失败'
  } finally {
    saving.value = false
  }
}

async function verify() {
  if (dirty.value) {
    error.value = '请先保存修改，再执行高德验证'
    return
  }
  verifying.value = true
  error.value = ''
  try {
    const result = await verifySpot(form.id, form.version)
    fill(result.spot)
    imageCandidates.value = result.imageCandidates ?? []
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '高德验证失败'
  } finally {
    verifying.value = false
  }
}

function addSource() { sources.value.push({ title: '', url: null, sourceName: null, checkedAt: null }) }
function removeSource(index: number) { sources.value.splice(index, 1) }
function verificationLabel(value: string) { return VERIFICATION_STATUS_LABELS[value as keyof typeof VERIFICATION_STATUS_LABELS] ?? value }
function verificationTone(): 'success' | 'warning' | 'danger' | 'neutral' {
  if (form.verificationStatus === 'verified') return 'success'
  if (form.verificationStatus === 'failed') return 'danger'
  if (form.verificationStatus === 'stale') return 'warning'
  return 'neutral'
}

watch(() => route.params.id, load)
watch([() => ({ ...form }), personasText, tagsText, sources], () => { dirty.value = true }, { deep: true })
onMounted(() => { void Promise.all([load(), loadCities()]) })
</script>

<template>
  <section>
    <AdminPageHeader
      eyebrow="Place Dossier"
      :title="isNew ? '新增地点档案' : `编辑 ${form.name}`"
      description="人工分类、推荐级别和编辑理由不会被高德验证自动覆盖。事实字段发生变化后需要重新保存和验证。"
    >
      <template #meta><div class="mt-3 flex flex-wrap gap-2"><AdminBadge v-if="!isNew" :label="verificationLabel(form.verificationStatus)" :tone="verificationTone()" /><AdminBadge v-if="!isNew" :label="PUBLICATION_STATUS_LABELS[form.publicationStatus as keyof typeof PUBLICATION_STATUS_LABELS]" :tone="form.publicationStatus === 'published' ? 'success' : 'neutral'" /><AdminBadge :label="dirty ? '有未保存修改' : '编辑稿已保存'" :tone="dirty ? 'warning' : 'success'" /></div></template>
      <template #actions><RouterLink :to="backToList" class="admin-button-secondary">返回地点库</RouterLink><button v-if="!isNew" type="button" class="admin-button-secondary" :disabled="verifying" @click="verify">{{ verifying ? '验证中…' : '高德验证' }}</button></template>
    </AdminPageHeader>

    <p v-if="error" role="alert" class="admin-alert admin-alert-error mt-5">{{ error }}</p>

    <form class="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]" @submit.prevent="save">
      <div class="min-w-0 space-y-5">
        <AdminFormSection title="身份与位置" description="稳定编号用于数据关联；搜索名称、城市和坐标用于高德事实核验。">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label>稳定编号（ID）<input v-model="form.id" :disabled="!isNew" required class="admin-input mt-1"></label>
            <label>名称<input v-model="form.name" required class="admin-input mt-1"></label>
            <label>高德搜索名称<input v-model="form.searchName" required class="admin-input mt-1"></label>
            <label>城市<select v-model="form.cityAdcode" required class="admin-input mt-1"><option v-for="city in cities" :key="city.adcode" :value="city.adcode">{{ city.name }} · {{ city.adcode }}</option><option v-if="!cities.some(city => city.adcode === form.cityAdcode)" :value="form.cityAdcode">{{ form.cityAdcode }}</option></select></label>
            <label>区县<input v-model="form.district" class="admin-input mt-1"></label>
            <label>地址<input v-model="form.address" class="admin-input mt-1"></label>
            <label>经度<input v-model.number="form.lng" type="number" step="any" class="admin-input mt-1"></label>
            <label>纬度<input v-model.number="form.lat" type="number" step="any" class="admin-input mt-1"></label>
          </div>
        </AdminFormSection>

        <AdminFormSection title="分类与排序" description="S/A 是主推荐，B 仅在条件命中时进入，C 不进入城市主推荐。">
          <div class="grid gap-4 md:grid-cols-2">
            <label>分类<select v-model="form.category" class="admin-input mt-1"><option v-for="value in SPOT_CATEGORIES" :key="value" :value="value">{{ SPOT_CATEGORY_LABELS[value] }}</option></select></label>
            <label>级别<select v-model="form.tier" class="admin-input mt-1"><option v-for="value in SPOT_TIERS" :key="value" :value="value">{{ SPOT_TIER_LABELS[value] }}</option></select></label>
            <label>同级优先级<input v-model.number="form.priority" type="number" class="admin-input mt-1"></label>
            <label>发布状态<select v-model="form.publicationStatus" :disabled="form.publicationStatus === 'published'" class="admin-input mt-1"><option v-for="value in PUBLICATION_STATUSES.filter(value => value !== 'published' || form.publicationStatus === 'published')" :key="value" :value="value">{{ PUBLICATION_STATUS_LABELS[value] }}</option></select><span v-if="form.publicationStatus === 'published'" class="mt-1 block text-xs text-[var(--admin-muted)]">已发布地点请在地点库执行下架。</span></label>
          </div>
        </AdminFormSection>

        <AdminFormSection title="编辑推荐" description="说明为什么推荐，以及为什么属于当前级别；发布时两项都不能为空。">
          <div class="grid gap-4">
            <label>推荐理由<textarea v-model="form.reason" required rows="4" class="admin-input mt-1"></textarea></label>
            <label>级别理由<textarea v-model="form.tierReason" required rows="4" class="admin-input mt-1"></textarea></label>
          </div>
        </AdminFormSection>

        <AdminFormSection title="到访信息" description="只填写有依据且能帮助路线匹配的信息，不推测价格、营业时间或客流。">
          <div class="grid gap-4 md:grid-cols-2">
            <label>适用画像（逗号分隔）<input v-model="personasText" class="admin-input mt-1"></label>
            <label>标签（逗号分隔）<input v-model="tagsText" class="admin-input mt-1"></label>
            <label>建议停留时间<input v-model="form.suggestedDuration" class="admin-input mt-1"></label>
            <label>推荐时段<input v-model="form.bestTime" class="admin-input mt-1"></label>
            <label class="check-field"><input v-model="form.indoorFriendly" type="checkbox" class="accent-primary-600">室内友好</label>
            <label class="check-field"><input v-model="form.reservationRequired" type="checkbox" class="accent-primary-600">需要预约</label>
            <label class="md:col-span-2">预约提醒<textarea v-model="form.reservationNote" rows="3" class="admin-input mt-1"></textarea></label>
          </div>
        </AdminFormSection>

        <AdminFormSection title="数据来源" description="保留人工判断依据。来源链接可以为空，但来源标题必须清晰。">
          <div class="flex justify-end"><button type="button" class="text-sm font-semibold text-[var(--admin-accent)]" @click="addSource">＋ 新增来源</button></div>
          <div v-if="sources.length" class="mt-3 space-y-3">
            <div v-for="(source, index) in sources" :key="index" class="grid gap-2 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-surface-muted)] p-3 md:grid-cols-[1fr_1fr_1.3fr_auto]">
              <input v-model="source.title" placeholder="来源标题" class="admin-input">
              <input v-model="source.sourceName" placeholder="来源名称" class="admin-input">
              <input v-model="source.url" type="url" placeholder="来源链接（可空）" class="admin-input">
              <button type="button" class="min-h-10 px-2 text-sm text-[var(--admin-danger)]" :aria-label="`删除来源 ${index + 1}`" @click="removeSource(index)">删除</button>
            </div>
          </div>
          <div v-else class="admin-empty-state py-7">尚未添加数据来源。</div>
        </AdminFormSection>
      </div>

      <aside class="space-y-5 xl:sticky xl:top-6">
        <section class="admin-panel overflow-hidden">
          <div class="border-b border-[var(--admin-line)] px-4 py-3"><p class="admin-eyebrow">Visual Record</p><h2 class="mt-1 font-bold">封面与图片候选</h2></div>
          <div class="min-h-48 bg-gradient-to-br from-primary-100 to-orange-200"><img v-if="form.coverImageUrl" :src="form.coverImageUrl" alt="地点封面预览" class="h-48 w-full object-cover" @error="form.coverImageUrl=null"><div v-else class="grid h-48 place-items-center text-sm text-primary-800/60">尚未选择封面</div></div>
          <div class="space-y-3 p-4">
            <label>封面图片地址<input v-model="form.coverImageUrl" type="text" placeholder="HTTPS 地址或本地上传的 /covers/ 路径" class="admin-input mt-1"></label>
            <component
              :is="LocalCoverImageUploader"
              v-if="LocalCoverImageUploader"
              :name="sanitizeCoverName(form.id)"
              @uploaded="handleLocalCoverUploaded"
            />
          </div>
          <div v-if="imageCandidates.length" class="border-t border-[var(--admin-line)] p-4"><p class="text-xs font-semibold text-[var(--admin-muted)]">图片候选（高德安全图片 / 本地上传，选择后仍需保存）</p><div class="mt-3 grid grid-cols-2 gap-2"><button v-for="image in imageCandidates" :key="image.url" type="button" class="overflow-hidden rounded-lg border-2 bg-[var(--admin-surface-muted)] text-left" :class="form.coverImageUrl === image.url ? 'border-primary-500' : 'border-transparent'" @click="form.coverImageUrl = image.url"><img :src="image.url" :alt="image.title || '地点图片'" class="h-24 w-full object-cover"><span class="block truncate px-2 py-1 text-[11px] text-[var(--admin-muted)]">{{ image.title || '地点图片' }}</span></button></div></div>
        </section>

        <section class="admin-panel p-4">
          <p class="admin-eyebrow">Verification</p><h2 class="mt-1 font-bold">事实验证侧栏</h2>
          <dl class="mt-4 divide-y divide-[var(--admin-line)] text-sm">
            <div class="py-3"><dt class="text-xs text-[var(--admin-muted)]">验证状态</dt><dd class="mt-1"><AdminBadge :label="verificationLabel(form.verificationStatus)" :tone="verificationTone()" /></dd></div>
            <div class="py-3"><dt class="text-xs text-[var(--admin-muted)]">高德地点编号</dt><dd class="mt-1 break-all font-mono text-xs">{{ form.amapPoiId ?? '无' }}</dd></div>
            <div class="py-3"><dt class="text-xs text-[var(--admin-muted)]">最后验证</dt><dd class="mt-1">{{ form.verifiedAt ?? '未验证' }}</dd></div>
            <div class="py-3"><dt class="text-xs text-[var(--admin-muted)]">当前版本</dt><dd class="mt-1 font-mono">v{{ form.version }}</dd></div>
          </dl>
          <div class="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[var(--admin-surface-muted)] p-3 font-mono text-xs"><div><p class="font-sans text-[10px] text-[var(--admin-muted)]">经度 LNG</p><p class="mt-1 break-all">{{ form.lng ?? '—' }}</p></div><div><p class="font-sans text-[10px] text-[var(--admin-muted)]">纬度 LAT</p><p class="mt-1 break-all">{{ form.lat ?? '—' }}</p></div></div>
          <p class="mt-4 text-xs leading-5 text-[var(--admin-muted)]">{{ dirty ? '当前编辑稿有未保存修改，必须先保存才能高德验证。' : '编辑稿已保存，可以执行高德验证。' }}</p>
          <button v-if="!isNew" type="button" class="admin-button-secondary mt-3 w-full" :disabled="dirty || verifying" @click="verify">{{ verifying ? '验证中…' : '执行高德验证' }}</button>
        </section>
      </aside>

      <div class="admin-panel sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 p-3 xl:col-span-2">
        <p class="text-xs text-[var(--admin-muted)]">{{ dirty ? '编辑稿尚未保存' : '当前编辑稿已保存' }}<span v-if="!isNew"> · v{{ form.version }}</span></p>
        <div class="flex gap-2"><RouterLink :to="backToList" class="admin-button-secondary">返回</RouterLink><button class="admin-button-primary px-6" :disabled="saving">{{ saving ? '保存中…' : '保存编辑稿' }}</button></div>
      </div>
    </form>
  </section>
</template>

<style scoped>
label { @apply text-sm font-semibold text-[var(--admin-ink)]; }
.check-field { @apply flex min-h-11 items-center gap-2 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-surface-muted)] px-3; }
</style>
