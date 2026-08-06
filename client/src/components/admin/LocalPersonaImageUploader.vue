<script setup lang="ts">
/**
 * DEV-ONLY component. Dynamically imported only when import.meta.env.DEV, so
 * the entire module (canvas compression + /api/admin/local-image call) is
 * tree-shaken out of the production bundle.
 *
 * In dev it lets an admin pick a large image, which is compressed in-browser
 * (canvas → JPEG, longest edge 540px) and written into the project source tree
 * by the Vite middleware in client/build/localImageUploadPlugin.ts.
 */
import { computed, ref } from 'vue'
import { localPersonaImage } from '../../assets/homepage/local-images'
import { compressImageForPersona, uploadLocalPersonaImage } from '../../admin/localImageUpload'

const props = defineProps<{ personaId: string }>()

const supported = computed(() => !!localPersonaImage(props.personaId))

const uploading = ref(false)
const status = ref('')
const errorMsg = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function pickFile() {
  fileInput.value?.click()
}

async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !supported.value) return
  uploading.value = true
  status.value = '压缩中…'
  errorMsg.value = ''
  try {
    const { dataUrl, bytes } = await compressImageForPersona(props.personaId, file)
    status.value = '写入本地项目…'
    const result = await uploadLocalPersonaImage(props.personaId, dataUrl)
    status.value = `已替换（${(bytes / 1024).toFixed(0)} KB → ${result.file}），页面即将刷新`
  } catch (caught: unknown) {
    errorMsg.value = caught instanceof Error ? caught.message : '上传失败'
    status.value = ''
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div v-if="supported" class="rounded-xl border border-dashed border-[var(--admin-line)] bg-[var(--admin-surface-muted)] p-3">
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="admin-button-secondary" :disabled="uploading" @click="pickFile">
        {{ uploading ? '处理中…' : '上传本地图并自动压缩' }}
      </button>
      <span v-if="status" class="text-xs text-[var(--admin-muted)]">{{ status }}</span>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onFileChosen">
    </div>
    <p v-if="errorMsg" class="mt-2 text-xs text-[var(--admin-danger)]">{{ errorMsg }}</p>
    <p class="mt-2 text-[11px] leading-5 text-[var(--admin-muted)]">
      仅本地开发可用：选择大图后会在浏览器压缩成 JPG（最长边 540px），直接替换 client/src/assets/homepage/ 里的源图并刷新页面。替换完需重新 build + 部署才会上线。
    </p>
  </div>
</template>
