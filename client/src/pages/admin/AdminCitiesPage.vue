<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createCity, listCities, refreshDue, updateCity } from '../../admin/api'
import { sanitizeCoverName } from '../../admin/localImageUpload'
import {
  CITY_STATUSES,
  CITY_STATUS_LABELS,
  REFRESH_RUN_STATUS_LABELS,
  type AdminCity,
  type CityStatus,
  type RefreshDueItem,
} from '../../admin/types'
import AdminBadge from '../../components/admin/AdminBadge.vue'
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue'

// Dev-only local cover uploader (browser compression + write to
// client/public/covers via the Vite middleware). Excluded from prod bundle.
const LocalCoverImageUploader = import.meta.env.DEV
  ? defineAsyncComponent(() => import('../../components/admin/LocalCoverImageUploader.vue'))
  : null

const router = useRouter()
const cities = ref<AdminCity[]>([])
const reviews = ref(new Map<string, RefreshDueItem>())
const error = ref('')
const loading = ref(true)
const saving = ref(false)
const selectedAdcode = ref<string | null>(null)
const editing = ref<string | null>(null)
const dossierHeading = ref<HTMLElement | null>(null)
const form = reactive({
  adcode: '',
  provinceName: '',
  name: '',
  slug: '',
  intro: '',
  coverImageUrl: null as string | null,
  status: 'draft' as CityStatus,
  priority: 0,
  reviewIntervalDays: 7 as 7 | 14 | 30,
})

// Cover file key: stable per city, e.g. city-shanghai → /covers/city-shanghai.jpg.
const coverUploadName = computed(() => sanitizeCoverName(`city-${form.slug || form.adcode}`))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [cityResult, reviewResult] = await Promise.all([
      listCities({ page: 1, pageSize: 100 }),
      refreshDue(),
    ])
    cities.value = cityResult.items
    reviews.value = new Map(reviewResult.items.map(item => [item.city.adcode, item]))
    if (!selectedAdcode.value && cityResult.items.length) selectedAdcode.value = cityResult.items[0].adcode
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '城市列表加载失败'
  } finally {
    loading.value = false
  }
}

function selectCity(city: AdminCity) {
  selectedAdcode.value = city.adcode
  editing.value = null
}

async function edit(city?: AdminCity) {
  editing.value = city?.adcode ?? 'new'
  selectedAdcode.value = city?.adcode ?? null
  Object.assign(form, city
    ? { ...city, intro: city.intro ?? '', coverImageUrl: city.coverImageUrl }
    : { adcode: '', provinceName: '', name: '', slug: '', intro: '', coverImageUrl: null, status: 'draft', priority: 0, reviewIntervalDays: 7 })
  await nextTick()
  dossierHeading.value?.focus()
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    if (editing.value === 'new') {
      const city = await createCity({
        adcode: form.adcode,
        provinceName: form.provinceName,
        name: form.name,
        slug: form.slug,
        intro: form.intro || null,
        coverImageUrl: form.coverImageUrl,
        status: form.status,
        priority: form.priority,
        reviewIntervalDays: form.reviewIntervalDays,
      })
      selectedAdcode.value = city.adcode
    } else {
      await updateCity(editing.value!, {
        provinceName: form.provinceName,
        name: form.name,
        slug: form.slug,
        intro: form.intro || null,
        coverImageUrl: form.coverImageUrl,
        status: form.status,
        priority: form.priority,
        reviewIntervalDays: form.reviewIntervalDays,
      })
      selectedAdcode.value = editing.value
    }
    editing.value = null
    await load()
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '城市保存失败'
  } finally {
    saving.value = false
  }
}

function currentCity() {
  return cities.value.find(city => city.adcode === selectedAdcode.value)
}

function openRefresh(city: AdminCity) {
  const active = reviews.value.get(city.adcode)?.activeRun
  void router.push(active ? `/admin/refresh-runs/${active.id}` : `/admin/cities/${city.adcode}/refresh`)
}

function cityTone(status: CityStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'published') return 'success'
  if (status === 'draft') return 'warning'
  return 'neutral'
}

function reviewTone(item: RefreshDueItem | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (!item) return 'neutral'
  return { green: 'success', yellow: 'warning', red: 'danger', gray: 'neutral' }[item.review.tone] as 'success' | 'warning' | 'danger' | 'neutral'
}

onMounted(load)
</script>

<template>
  <section>
    <AdminPageHeader eyebrow="City Dossiers" title="城市档案" description="维护城市开放状态、地点规模和人工复核周期。城市开放后，只有验证通过且已发布的地点会同步到 H5。">
      <template #actions><button type="button" class="admin-button-primary" @click="edit()">新增城市</button></template>
    </AdminPageHeader>
    <p v-if="error" role="alert" class="admin-alert admin-alert-error mt-5">{{ error }}</p>

    <div v-if="loading" class="mt-6 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div class="skeleton h-96 rounded-xl"></div><div class="skeleton h-96 rounded-xl"></div>
    </div>

    <div v-else class="mt-6 grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section class="admin-panel overflow-hidden">
        <div class="border-b border-[var(--admin-line)] px-4 py-3">
          <p class="text-xs font-semibold text-[var(--admin-muted)]">档案索引 · {{ cities.length }} 个城市</p>
        </div>
        <div v-if="cities.length" class="divide-y divide-[var(--admin-line)]">
          <button v-for="city in cities" :key="city.adcode" type="button" class="city-row" :class="{ 'city-row-active': selectedAdcode === city.adcode }" @click="selectCity(city)">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 text-left"><p class="font-semibold">{{ city.name }} <span class="font-normal text-[var(--admin-muted)]">{{ city.provinceName }}</span></p><p class="mt-1 font-mono text-[11px] text-[var(--admin-muted)]">{{ city.adcode }} · {{ city.slug }}</p></div>
              <AdminBadge :label="CITY_STATUS_LABELS[city.status]" :tone="cityTone(city.status)" />
            </div>
            <div class="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--admin-muted)]"><span>地点 {{ city.publishedSpotCount }} / {{ city.spotCount }} 已发布</span><span :class="reviews.get(city.adcode)?.review.tone === 'red' ? 'text-[var(--admin-danger)]' : ''">{{ reviews.get(city.adcode)?.review.label ?? '未读取' }}</span></div>
          </button>
        </div>
        <div v-else class="admin-empty-state">还没有城市档案，请新增第一座城市。</div>
      </section>

      <section class="min-w-0">
        <template v-if="editing">
          <div ref="dossierHeading" tabindex="-1" class="admin-panel p-5 outline-none md:p-6">
            <div class="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--admin-line)] pb-4">
              <div><p class="admin-eyebrow">{{ editing === 'new' ? 'New Dossier' : 'Edit Dossier' }}</p><h2 class="mt-1 text-xl font-bold">{{ editing === 'new' ? '建立城市档案' : `编辑 ${form.name}` }}</h2></div>
              <button type="button" class="admin-button-secondary" @click="editing = null">取消编辑</button>
            </div>
            <form class="mt-5 grid gap-4 md:grid-cols-2" @submit.prevent="save">
              <label>城市行政编码<input v-model="form.adcode" :disabled="editing !== 'new'" required placeholder="例如：310000" class="admin-input mt-1"></label>
              <label>省份名称<input v-model="form.provinceName" required placeholder="省份" class="admin-input mt-1"></label>
              <label>城市名称<input v-model="form.name" required placeholder="城市名" class="admin-input mt-1"></label>
              <label>英文标识<input v-model="form.slug" required placeholder="例如：shanghai" class="admin-input mt-1"></label>
              <label>城市排序<input v-model.number="form.priority" type="number" placeholder="数字越大越靠前" class="admin-input mt-1"></label>
              <label>城市状态<select v-model="form.status" class="admin-input mt-1"><option v-for="status in CITY_STATUSES" :key="status" :value="status">{{ CITY_STATUS_LABELS[status] }}</option></select></label>
              <label>人工复核周期<select v-model.number="form.reviewIntervalDays" class="admin-input mt-1"><option :value="7">每 7 天</option><option :value="14">每 14 天</option><option :value="30">每 30 天</option></select></label>
              <label class="md:col-span-2">城市简介<textarea v-model="form.intro" rows="4" placeholder="城市简介" class="admin-input mt-1"></textarea></label>
              <label class="md:col-span-2">封面地址<input v-model="form.coverImageUrl" type="text" placeholder="HTTPS 图片地址或本地上传的 /covers/ 路径（可空）" class="admin-input mt-1"></label>
              <component
                :is="LocalCoverImageUploader"
                v-if="LocalCoverImageUploader"
                class="md:col-span-2"
                :name="coverUploadName"
                @uploaded="(path: string) => { form.coverImageUrl = path }"
              />
              <div class="flex flex-wrap gap-2 border-t border-[var(--admin-line)] pt-4 md:col-span-2"><button class="admin-button-primary" :disabled="saving">{{ saving ? '保存中…' : '保存城市档案' }}</button><button type="button" class="admin-button-secondary" @click="editing = null">取消</button></div>
            </form>
          </div>
        </template>

        <template v-else-if="currentCity()">
          <article class="admin-panel overflow-hidden">
              <div class="relative min-h-40 bg-[var(--admin-ink)] p-6 text-white" :style="currentCity()?.coverImageUrl ? { backgroundImage: `linear-gradient(rgba(28,20,16,.42),rgba(28,20,16,.42)), url(${currentCity()!.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}">
                <div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(circle at 80% 20%, #ee4d24 0, transparent 35%), linear-gradient(120deg, transparent 55%, rgba(255,255,255,.15) 55%, transparent 56%)"></div>
              <div class="relative"><p class="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">{{ currentCity()!.provinceName }} · {{ currentCity()!.adcode }}</p><h2 class="mt-2 text-3xl font-bold">{{ currentCity()!.name }}</h2><p class="mt-2 max-w-2xl text-sm leading-6 text-white/65">{{ currentCity()!.intro || '尚未填写城市简介。' }}</p></div>
            </div>
            <div class="grid gap-px bg-[var(--admin-line)] sm:grid-cols-3">
              <div class="bg-[var(--admin-surface)] p-4"><p class="text-xs text-[var(--admin-muted)]">地点发布</p><p class="mt-1 text-xl font-bold">{{ currentCity()!.publishedSpotCount }} / {{ currentCity()!.spotCount }}</p></div>
              <div class="bg-[var(--admin-surface)] p-4"><p class="text-xs text-[var(--admin-muted)]">复核周期</p><p class="mt-1 text-xl font-bold">{{ currentCity()!.reviewIntervalDays }} 天</p></div>
              <div class="bg-[var(--admin-surface)] p-4"><p class="text-xs text-[var(--admin-muted)]">城市排序</p><p class="mt-1 text-xl font-bold">{{ currentCity()!.priority }}</p></div>
            </div>
            <div class="space-y-5 p-5 md:p-6">
              <div class="flex flex-wrap gap-2"><AdminBadge :label="CITY_STATUS_LABELS[currentCity()!.status]" :tone="cityTone(currentCity()!.status)" /><AdminBadge :label="reviews.get(currentCity()!.adcode)?.review.label ?? '未读取复核状态'" :tone="reviewTone(reviews.get(currentCity()!.adcode))" /><AdminBadge v-if="reviews.get(currentCity()!.adcode)?.activeRun" :label="REFRESH_RUN_STATUS_LABELS[reviews.get(currentCity()!.adcode)!.activeRun!.status]" tone="info" /></div>
              <div class="grid gap-4 text-sm sm:grid-cols-2"><div><p class="text-xs text-[var(--admin-muted)]">上次内容复核</p><p class="mt-1 font-medium">{{ currentCity()!.lastContentReviewAt ?? '从未复核' }}</p></div><div><p class="text-xs text-[var(--admin-muted)]">H5 同步</p><p class="mt-1 font-medium">{{ currentCity()!.status === 'published' ? `已同步 ${currentCity()!.publishedSpotCount} 个已发布地点` : '城市尚未开放' }}</p></div></div>
              <div class="flex flex-wrap gap-2 border-t border-[var(--admin-line)] pt-5"><button type="button" class="admin-button-primary" @click="edit(currentCity()!)">编辑档案</button><button v-if="currentCity()!.status === 'published'" type="button" class="admin-button-secondary" @click="openRefresh(currentCity()!)">{{ reviews.get(currentCity()!.adcode)?.activeRun ? '继续本周复核' : '开始本周复核' }}</button><RouterLink :to="`/admin/spots?cityAdcode=${currentCity()!.adcode}`" class="admin-button-secondary">查看地点库</RouterLink></div>
            </div>
          </article>
        </template>
        <div v-else class="admin-panel admin-empty-state">从左侧选择一座城市，查看完整档案。</div>
      </section>
    </div>
  </section>
</template>

<style scoped>
label { @apply text-sm font-semibold text-[var(--admin-ink)]; }
.city-row { @apply block w-full px-4 py-4 text-left transition; }
.city-row:hover { background: var(--admin-surface-muted); }
.city-row-active { background: var(--admin-accent-soft); box-shadow: inset 3px 0 0 var(--admin-accent); }
</style>
