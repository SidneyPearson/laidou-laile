<script setup lang="ts">
/**
 * DEV-ONLY component. Dynamically imported only when import.meta.env.DEV, so
 * the entire module (canvas compression + /__local-dev/cover-image call) is
 * tree-shaken out of the production bundle.
 *
 * Same local workflow as the persona image uploader, but for city/spot
 * covers: the browser compresses the pick (canvas → JPEG, longest edge
 * 1200px) and the Vite middleware writes it to client/public/covers/<name>.jpg.
 * The stored value is the same-origin path (/covers/<name>.jpg), which keeps
 * working after build + deploy because public/ files ship verbatim.
 */
import { ref } from 'vue'
import {
  COVER_IMAGE_SPEC,
  compressImageToJpeg,
  sanitizeCoverName,
  uploadLocalCoverImage,
} from '../../admin/localImageUpload'

const props = defineProps<{ name: string }>()
const emit = defineEmits<{
  uploaded: [path: string]
}>()

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
  if (!file) return

  const coverName = sanitizeCoverName(props.name)
  if (!coverName) {
    errorMsg.value = '先填写并保存编号/标识，再上传封面'
    return
  }

  uploading.value = true
  status.value = '压缩中…'
  errorMsg.value = ''
  try {
    const { dataUrl, bytes } = await compressImageToJpeg(file, COVER_IMAGE_SPEC)
    status.value = '写入本地项目…'
    const result = await uploadLocalCoverImage(coverName, dataUrl)
    status.value = `已生成 ${result.path}（${(bytes / 1024).toFixed(0)} KB），保存后生效`
    emit('uploaded', result.path)
  } catch (caught: unknown) {
    errorMsg.value = caught instanceof Error ? caught.message : '上传失败'
    status.value = ''
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="rounded-xl border border-dashed border-[var(--admin-line)] bg-[var(--admin-surface-muted)] p-3">
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="admin-button-secondary" :disabled="uploading" @click="pickFile">
        {{ uploading ? '处理中…' : '上传本地图并自动压缩' }}
      </button>
      <span v-if="status" class="text-xs text-[var(--admin-muted)]">{{ status }}</span>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onFileChosen">
    </div>
    <p v-if="errorMsg" class="mt-2 text-xs text-[var(--admin-danger)]">{{ errorMsg }}</p>
    <p class="mt-2 text-[11px] leading-5 text-[var(--admin-muted)]">
      仅本地开发可用：选择大图后会在浏览器压缩成 JPG（最长边 1200px），写入 client/public/covers/ 并把同源路径填进封面字段。仍需保存表单 + 重新 build 部署才会上线。
    </p>
  </div>
</template>
