<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHistory, type HistoryEntry } from '../composables/useHistory'
import RouteCompare from '../components/RouteCompare.vue'

const router = useRouter()
const { entries, hasEntries, removeEntry, clearAll, formatPrefSummary, formatTimeLabel, formatDistanceLabel } = useHistory()

const expandedId = ref<string | null>(null)
const showClearConfirm = ref(false)
const selectedId = ref<string | null>(null)
const deletePendingId = ref<string | null>(null)

function handleRouteSelect(rt: import('../types/route').Route) {
  selectedId.value = selectedId.value === rt.id ? null : rt.id
}

function goBack() {
  router.push({ name: 'home' })
}

function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    selectedId.value = null
  } else {
    expandedId.value = id
    selectedId.value = null
  }
}

function requestDelete(id: string, e: Event) {
  e.stopPropagation()
  deletePendingId.value = id
}

function confirmDelete(e: Event) {
  e.stopPropagation()
  const id = deletePendingId.value
  if (!id) return
  if (expandedId.value === id) expandedId.value = null
  selectedId.value = null
  removeEntry(id)
  deletePendingId.value = null
}

function cancelDelete(e: Event) {
  e.stopPropagation()
  deletePendingId.value = null
}

function handleClear() {
  clearAll()
  showClearConfirm.value = false
  expandedId.value = null
  selectedId.value = null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${m}月${day}日`
}

function formatWeather(entry: HistoryEntry): string {
  if (!entry.weather) return ''
  return `${entry.weather.weather} ${entry.weather.temperature}°`
}
</script>

<template>
  <div class="h-full flex flex-col max-w-md mx-auto">
    <!-- Top bar -->
    <header class="flex-shrink-0 flex items-center justify-between px-5 pt-12 pb-4">
      <button
        class="w-9 h-9 flex items-center justify-center rounded-full bg-white
               shadow-sm border border-gray-100 text-gray-500 active:bg-gray-50"
        @click="goBack"
        aria-label="返回"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <h2 class="text-base font-semibold text-gray-800">历史路线</h2>
      <button
        v-if="hasEntries"
        class="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 text-xs active:bg-gray-50"
        @click="showClearConfirm = true"
        aria-label="清空历史记录"
      >
        清空
      </button>
      <div v-else class="w-9 h-9"></div>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-auto px-5 pb-6">
      <!-- Empty state -->
      <div v-if="!hasEntries" class="text-center py-16">
        <p class="text-5xl mb-4">📭</p>
        <p class="text-gray-400 text-sm">还没有历史路线</p>
        <p class="text-gray-300 text-xs mt-1">生成路线后会自动保存</p>
        <button
          class="btn-primary mt-6 px-8 py-2.5 text-sm font-medium"
          @click="goBack"
        >
          去生成路线
        </button>
      </div>

      <!-- History list -->
      <div v-else class="space-y-3">
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all"
          :class="expandedId === entry.id ? 'ring-2 ring-primary-100' : ''"
        >
          <!-- Summary (tappable) -->
          <button
            class="w-full px-4 py-3.5 text-left active:bg-gray-50 transition-colors"
            @click="toggleExpand(entry.id)"
          >
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-sm font-semibold text-gray-800 truncate">
                  {{ entry.locationName }}
                </span>
                <span class="text-xs text-gray-300 flex-shrink-0">{{ formatDate(entry.createdAt) }}</span>
              </div>
              <span
                v-if="formatWeather(entry)"
                class="text-xs text-gray-400 flex-shrink-0 ml-2"
              >{{ formatWeather(entry) }}</span>
            </div>

            <p class="text-xs text-gray-500 mb-2 truncate">
              {{ formatPrefSummary(entry.request) }}
            </p>

            <div class="flex items-center gap-3 text-xs text-gray-400">
              <span>⏱ {{ formatTimeLabel(entry.request.timeOption) }}</span>
              <span>📏 {{ formatDistanceLabel(entry.request.distance) }}</span>
              <span>📍 {{ entry.routes.length }}条路线</span>
              <span class="ml-auto">{{ expandedId === entry.id ? '收起 ▲' : '展开 ▼' }}</span>
            </div>
          </button>

          <!-- Delete button / confirmation -->
          <div class="px-4 pb-2 flex justify-end items-center gap-2">
            <template v-if="deletePendingId === entry.id">
              <span class="text-xs text-red-500 font-medium">确认删除？</span>
              <button
                class="text-xs px-2 py-0.5 rounded bg-red-500 text-white font-medium"
                @click="confirmDelete($event)"
              >
                删除
              </button>
              <button
                class="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-500"
                @click="cancelDelete($event)"
              >
                取消
              </button>
            </template>
            <button
              v-else
              class="text-xs text-gray-300 hover:text-red-400 transition-colors"
              @click="requestDelete(entry.id, $event)"
            >
              删除
            </button>
          </div>

          <!-- Expanded routes -->
          <div v-if="expandedId === entry.id" class="border-t border-gray-50 px-3 pb-3 pt-2">
            <RouteCompare :routes="entry.routes" :selected-id="selectedId" @select="handleRouteSelect" />
          </div>
        </div>
      </div>
    </div>

    <!-- Clear confirm dialog -->
    <div
      v-if="showClearConfirm"
      class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-8"
      @click.self="showClearConfirm = false"
    >
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <p class="text-base font-semibold text-gray-800 mb-2">清空历史记录</p>
        <p class="text-sm text-gray-400 mb-5">确定要删除所有历史路线吗？此操作不可撤销。</p>
        <div class="flex gap-3">
          <button
            class="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium"
            @click="showClearConfirm = false"
          >
            取消
          </button>
          <button
            class="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium"
            @click="handleClear"
          >
            清空
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
