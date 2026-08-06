<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { listHomePersonas, updateHomePersona } from '../../admin/api'
import type { AdminHomePersona } from '../../admin/types'
import { defineAsyncComponent } from 'vue'
import { personaImage } from '../../assets/homepage'
import type { Persona } from '../../types/explore'
import AdminBadge from '../../components/admin/AdminBadge.vue'
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue'

// The local-image uploader (canvas compression + write-to-disk dev endpoint)
// is code-split and only loaded in dev, so the production bundle excludes it
// entirely. The Vite middleware it calls is also serve-only (apply: 'serve').
const LocalPersonaImageUploader = import.meta.env.DEV
  ? defineAsyncComponent(() => import('../../components/admin/LocalPersonaImageUploader.vue'))
  : null

const personas = ref<AdminHomePersona[]>([])
const selectedId = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref('')

// Lightbox for previewing the (effective) cover image at full size.
const lightboxSrc = ref<string | null>(null)
function openPreview(src: string) { lightboxSrc.value = src }
function closePreview() { lightboxSrc.value = null }
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') closePreview() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const form = reactive({
  title: '',
  subtitle: '',
  imageUrl: '' as string | null,
  sortOrder: 0,
  enabled: true,
  version: 0,
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    personas.value = await listHomePersonas()
    if (!selectedId.value && personas.value.length) selectPersona(personas.value[0])
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '画像列表加载失败'
  } finally {
    loading.value = false
  }
}

function selectPersona(persona: AdminHomePersona) {
  selectedId.value = persona.id
  form.title = persona.title
  form.subtitle = persona.subtitle ?? ''
  form.imageUrl = persona.imageUrl ?? ''
  form.sortOrder = persona.sortOrder
  form.enabled = persona.enabled
  form.version = persona.version
  savedAt.value = ''
}

function current() {
  return personas.value.find(p => p.id === selectedId.value) ?? null
}

/** Resolve the image a persona actually shows: a custom URL wins, otherwise
 *  the bundled artwork for that id. Empty D1 image_url = bundled default. */
function effectiveImage(persona: Pick<AdminHomePersona, 'id' | 'imageUrl'>): string {
  return personaImage(persona.id as Persona, persona.imageUrl)
}

/** The form preview reacts to the typed URL, falling back to the bundled art. */
const previewImage = computed(() => {
  const id = selectedId.value as Persona | null
  if (!id) return ''
  return personaImage(id, form.imageUrl)
})
const usingBundled = computed(() => !form.imageUrl?.trim())

async function save() {
  if (!selectedId.value) return
  saving.value = true
  error.value = ''
  savedAt.value = ''
  try {
    const updated = await updateHomePersona(selectedId.value, {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      imageUrl: form.imageUrl?.trim() || null,
      sortOrder: form.sortOrder,
      enabled: form.enabled,
      expectedVersion: form.version,
    })
    const index = personas.value.findIndex(p => p.id === selectedId.value)
    if (index >= 0) personas.value[index] = updated
    form.version = updated.version
    savedAt.value = '已保存'
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section>
    <AdminPageHeader
      eyebrow="Homepage Personas"
      title="首页画像"
      description="首页身份卡片的标题、副标题、封面图和排序。画像 id 固定，停用后不在首页展示。"
    />

    <p v-if="error" role="alert" class="admin-alert admin-alert-error mt-5">{{ error }}</p>

    <div v-if="loading" class="mt-6 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div class="skeleton h-80 rounded-xl"></div>
      <div class="skeleton h-80 rounded-xl"></div>
    </div>

    <div v-else class="mt-6 grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <!-- Left: persona list -->
      <section class="admin-panel overflow-hidden">
        <div class="border-b border-[var(--admin-line)] px-4 py-3">
          <p class="text-xs font-semibold text-[var(--admin-muted)]">画像索引 · {{ personas.length }} 个</p>
        </div>
        <div v-if="personas.length" class="divide-y divide-[var(--admin-line)]">
          <button
            v-for="persona in personas"
            :key="persona.id"
            type="button"
            class="persona-row"
            :class="{ 'persona-row-active': selectedId === persona.id }"
            @click="selectPersona(persona)"
          >
            <div class="flex items-center gap-3 text-left">
              <img
                :src="effectiveImage(persona)"
                :alt="persona.title"
                class="persona-thumb h-11 w-11 flex-shrink-0 cursor-zoom-in rounded-lg object-cover"
                loading="lazy"
                @error="(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')"
                @click.stop="openPreview(effectiveImage(persona))"
              >
              <div class="min-w-0">
                <p class="truncate font-semibold">{{ persona.title }}</p>
                <p class="mt-0.5 truncate text-xs text-[var(--admin-muted)]">{{ persona.subtitle || '无副标题' }}</p>
              </div>
            </div>
            <AdminBadge
              :label="persona.enabled ? '展示中' : '已停用'"
              :tone="persona.enabled ? 'success' : 'neutral'"
            />
          </button>
        </div>
        <div v-else class="admin-empty-state">暂无画像配置。</div>
      </section>

      <!-- Right: edit form -->
      <section v-if="current()" class="min-w-0">
        <div class="admin-panel p-5 md:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--admin-line)] pb-4">
            <div>
              <p class="admin-eyebrow">Edit Persona</p>
              <h2 class="mt-1 text-xl font-bold">编辑 {{ current()!.title }}</h2>
              <p class="mt-1 font-mono text-[11px] text-[var(--admin-muted)]">id: {{ current()!.id }} · v{{ form.version }}</p>
            </div>
            <AdminBadge
              :label="current()!.enabled ? '展示中' : '已停用'"
              :tone="current()!.enabled ? 'success' : 'neutral'"
            />
          </div>

          <form class="mt-5 grid gap-5 md:grid-cols-2" @submit.prevent="save">
            <label>
              卡片标题
              <input v-model="form.title" required maxlength="20" placeholder="例如：情侣约会" class="admin-input mt-1">
            </label>
            <label>
              排序（数字越小越靠前）
              <input v-model.number="form.sortOrder" type="number" class="admin-input mt-1">
            </label>
            <label class="md:col-span-2">
              副标题 / 标语
              <input v-model="form.subtitle" maxlength="40" placeholder="例如：浪漫 · 夜景 · 出片" class="admin-input mt-1">
            </label>
            <label class="md:col-span-2">
              封面图片地址（HTTPS，留空用项目内置图）
              <input v-model="form.imageUrl" type="url" placeholder="留空 = 内置打包图；或填 https://..." class="admin-input mt-1">
              <span class="mt-1 block text-xs font-normal text-[var(--admin-muted)]">
                {{ usingBundled ? '当前使用项目内置打包图。' : '当前使用自定义 HTTPS 图片；清空地址即可恢复内置图。' }}
              </span>
            </label>

            <!-- Dev-only local image replacement: compresses in the browser and
                 writes the JPEG into the source tree. Never rendered in prod. -->
            <div v-if="LocalPersonaImageUploader" class="md:col-span-2">
              <component :is="LocalPersonaImageUploader" :persona-id="selectedId!" />
            </div>

            <!-- Preview -->
            <div class="md:col-span-2">
              <div class="flex items-center justify-between">
                <p class="text-sm font-semibold text-[var(--admin-ink)]">预览</p>
                <button type="button" class="text-xs font-medium text-[var(--admin-accent)] hover:underline" @click="openPreview(previewImage)">查看大图</button>
              </div>
              <div class="mt-2 flex items-center gap-3 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-surface-muted)] p-3">
                <img
                  :src="previewImage"
                  :alt="form.title"
                  class="h-16 w-16 cursor-zoom-in rounded-lg object-cover"
                  @error="(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')"
                  @click="openPreview(previewImage)"
                >
                <div class="min-w-0">
                  <p class="truncate font-semibold">{{ form.title || '（未填标题）' }}</p>
                  <p class="mt-0.5 truncate text-sm text-[var(--admin-muted)]">{{ form.subtitle || '（未填副标题）' }}</p>
                  <p class="mt-0.5 truncate text-[11px] text-[var(--admin-muted)]">
                    {{ usingBundled ? '· 内置打包图' : '· 自定义图片' }}
                  </p>
                </div>
              </div>
            </div>

            <label class="check-field">
              <input v-model="form.enabled" type="checkbox" class="accent-[var(--admin-accent)]">
              在首页展示这张卡片
            </label>

            <div class="flex flex-wrap items-center gap-2 border-t border-[var(--admin-line)] pt-4 md:col-span-2">
              <button class="admin-button-primary" :disabled="saving">{{ saving ? '保存中…' : '保存修改' }}</button>
              <span v-if="savedAt" class="text-sm font-medium text-[var(--admin-success)]">{{ savedAt }}</span>
            </div>
          </form>
        </div>
      </section>
      <div v-else class="admin-panel admin-empty-state">从左侧选择一张画像卡片进行编辑。</div>
    </div>

    <!-- Image lightbox -->
    <Teleport to="body">
      <div
        v-if="lightboxSrc"
        class="lightbox-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="封面大图预览"
        @click="closePreview"
      >
        <button type="button" class="lightbox-close" aria-label="关闭预览" @click="closePreview">×</button>
        <img :src="lightboxSrc" alt="封面大图" class="lightbox-img" @click.stop>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
label { @apply text-sm font-semibold text-[var(--admin-ink)]; }
.persona-row { @apply flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition; }
.persona-row:hover { background: var(--admin-surface-muted); }
.persona-row-active { background: var(--admin-accent-soft); box-shadow: inset 3px 0 0 var(--admin-accent); }
.check-field { @apply flex items-center gap-2 text-sm font-normal text-[var(--admin-ink)]; }
.lightbox-overlay {
  @apply fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4;
}
.lightbox-img {
  max-width: min(92vw, 900px);
  max-height: 88vh;
  border-radius: 12px;
  object-fit: contain;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.lightbox-close {
  @apply absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20;
}
</style>
