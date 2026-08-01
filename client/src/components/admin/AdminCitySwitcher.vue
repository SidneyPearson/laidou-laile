<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listCities } from '../../admin/api'
import type { AdminCity } from '../../admin/types'

const props = withDefaults(defineProps<{ id?: string }>(), { id: 'admin-city-switcher' })
const route = useRoute()
const router = useRouter()
const cities = ref<AdminCity[]>([])
const error = ref('')

onMounted(async () => {
  try {
    cities.value = (await listCities({ page: 1, pageSize: 100 })).items
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : '城市入口加载失败'
  }
})

async function openCity(event: Event) {
  const cityAdcode = (event.target as HTMLSelectElement).value
  const query = cityAdcode ? { cityAdcode } : {}
  await router.push({ path: '/admin/spots', query })
}
</script>

<template>
  <div>
    <label :for="props.id" class="mb-2 block text-xs font-semibold text-[var(--admin-muted)]">快速打开城市地点库</label>
    <select
      :id="props.id"
      class="admin-input text-sm"
      :value="typeof route.query.cityAdcode === 'string' ? route.query.cityAdcode : ''"
      @change="openCity"
    >
      <option value="">全部城市</option>
      <option v-for="city in cities" :key="city.adcode" :value="city.adcode">{{ city.name }} · {{ city.adcode }}</option>
    </select>
    <p v-if="error" class="mt-2 text-xs text-[var(--admin-danger)]">{{ error }}</p>
  </div>
</template>
