<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CoverImageSource, InspirationSpot } from '../../types/explore'

const props = defineProps<{
  spot: InspirationSpot
  eager?: boolean
}>()

const emit = defineEmits<{
  'source-change': [source: CoverImageSource]
}>()

const failed = ref(false)
const activeSource = ref<CoverImageSource>('gradient')
const currentUrl = computed(() => {
  if (activeSource.value === 'official') return props.spot.coverImageUrl
  if (activeSource.value === 'amap') {
    return props.spot.coverImageSource === 'official'
      ? props.spot.coverImageFallbackUrl
      : props.spot.coverImageUrl
  }
  return undefined
})

function initialSource(): CoverImageSource {
  if (!props.spot.coverImageUrl) return 'gradient'
  return props.spot.coverImageSource ?? 'amap'
}

watch(() => [
  props.spot.id,
  props.spot.coverImageUrl,
  props.spot.coverImageFallbackUrl,
  props.spot.coverImageSource,
], () => {
  failed.value = false
  activeSource.value = initialSource()
  emit('source-change', activeSource.value)
}, { immediate: true })

function handleError() {
  if (activeSource.value === 'official' && props.spot.coverImageFallbackUrl) {
    activeSource.value = 'amap'
    emit('source-change', 'amap')
    return
  }
  failed.value = true
  activeSource.value = 'gradient'
  emit('source-change', 'gradient')
}
</script>

<template>
  <div class="spot-cover relative h-full w-full overflow-hidden" :class="`spot-cover-${spot.theme}`">
    <img
      v-if="currentUrl && !failed"
      :src="currentUrl"
      :alt="`${spot.name}地点图片`"
      class="absolute inset-0 h-full w-full object-cover"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      @error="handleError"
    >
  </div>
</template>

<style scoped>
.spot-cover-river {
  background:
    radial-gradient(circle at 78% 24%, rgba(255, 224, 172, 0.92) 0 8%, transparent 9%),
    linear-gradient(165deg, #7f9eb2 0%, #bdd1cc 45%, #d28b67 100%);
}

.spot-cover-lane {
  background:
    linear-gradient(90deg, transparent 47%, rgba(255, 255, 255, 0.28) 48% 51%, transparent 52%),
    linear-gradient(145deg, #5b6f58, #c5aa83);
}

.spot-cover-museum {
  background:
    linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.24) 31% 47%, transparent 48%),
    linear-gradient(145deg, #9c9b93, #d7d3c7);
}

.spot-cover-wonderland {
  background:
    radial-gradient(circle at 50% 28%, rgba(255, 255, 255, 0.46), transparent 18%),
    linear-gradient(145deg, #7f77a8, #e69a88);
}

.spot-cover-garden {
  background:
    radial-gradient(circle at 24% 78%, #6e8f61 0 22%, transparent 23%),
    radial-gradient(circle at 72% 64%, #8dae7b 0 28%, transparent 29%),
    linear-gradient(145deg, #b8c99f, #648976);
}

.spot-cover-market {
  background:
    repeating-linear-gradient(90deg, transparent 0 22px, rgba(255, 255, 255, 0.12) 23px 24px),
    linear-gradient(145deg, #9e614f, #d4a36e);
}

.spot-cover-city {
  background:
    linear-gradient(90deg, transparent 0 18%, rgba(255, 255, 255, 0.22) 19% 23%, transparent 24% 55%, rgba(255, 255, 255, 0.16) 56% 66%, transparent 67%),
    linear-gradient(145deg, #748890, #b0a18f);
}

.spot-cover-night {
  background:
    radial-gradient(circle at 70% 24%, rgba(242, 196, 117, 0.85) 0 6%, transparent 7%),
    linear-gradient(145deg, #353f54, #815d67);
}
</style>
