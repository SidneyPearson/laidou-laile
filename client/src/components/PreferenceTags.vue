<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  PREFERENCE_LABELS,
  CUISINE_LABELS,
  SCENIC_LABELS,
  WANDER_LABELS,
  type PreferenceTag,
  type CuisineType,
  type ScenicType,
  type WanderType,
} from '../types/route'

const props = defineProps<{
  modelValue: PreferenceTag[]
  cuisineTypes: CuisineType[]
  scenicTypes: ScenicType[]
  wanderTypes: WanderType[]
  customCuisine: string[]
  customScenic: string[]
  customWander: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PreferenceTag[]]
  'update:cuisineTypes': [value: CuisineType[]]
  'update:scenicTypes': [value: ScenicType[]]
  'update:wanderTypes': [value: WanderType[]]
  'update:customCuisine': [value: string[]]
  'update:customScenic': [value: string[]]
  'update:customWander': [value: string[]]
}>()

const tags: PreferenceTag[] = ['food', 'wander', 'scenic']

const cuisineOptions: CuisineType[] = ['hotpot', 'noodles', 'pastries', 'bbq', 'local_cuisine', 'western', 'coffee_tea', 'buffet']
const scenicOptions: ScenicType[] = ['popular', 'street']
const wanderOptions: WanderType[] = ['shopping', 'cafe', 'entertainment', 'hidden', 'museum']

const showFoodPanel = computed(() => props.modelValue.includes('food'))
const showScenicPanel = computed(() => props.modelValue.includes('scenic'))
const showWanderPanel = computed(() => props.modelValue.includes('wander'))

// ── Custom input state ──
const showCuisineInput = ref(false)
const cuisineInputText = ref('')
const showScenicInput = ref(false)
const scenicInputText = ref('')
const showWanderInput = ref(false)
const wanderInputText = ref('')

function toggle(tag: PreferenceTag, selected: PreferenceTag[]) {
  if (selected.includes(tag)) {
    if (selected.length > 1) {
      emit('update:modelValue', selected.filter((t) => t !== tag))
    }
  } else {
    emit('update:modelValue', [...selected, tag])
  }
}

function toggleCuisine(type: CuisineType) {
  const arr = [...props.cuisineTypes]
  const idx = arr.indexOf(type)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(type)
  emit('update:cuisineTypes', arr)
}

function toggleScenic(type: ScenicType) {
  const arr = [...props.scenicTypes]
  const idx = arr.indexOf(type)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(type)
  emit('update:scenicTypes', arr)
}

function toggleWander(type: WanderType) {
  const arr = [...props.wanderTypes]
  const idx = arr.indexOf(type)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(type)
  emit('update:wanderTypes', arr)
}

// ── Custom input handlers ──
function addCustomCuisine() {
  const val = cuisineInputText.value.trim()
  if (!val) return
  if (props.customCuisine.includes(val)) return
  emit('update:customCuisine', [...props.customCuisine, val])
  cuisineInputText.value = ''
  showCuisineInput.value = false
}

function removeCustomCuisine(val: string) {
  emit('update:customCuisine', props.customCuisine.filter(v => v !== val))
}

function addCustomScenic() {
  const val = scenicInputText.value.trim()
  if (!val) return
  if (props.customScenic.includes(val)) return
  emit('update:customScenic', [...props.customScenic, val])
  scenicInputText.value = ''
  showScenicInput.value = false
}

function removeCustomScenic(val: string) {
  emit('update:customScenic', props.customScenic.filter(v => v !== val))
}

function addCustomWander() {
  const val = wanderInputText.value.trim()
  if (!val) return
  if (props.customWander.includes(val)) return
  emit('update:customWander', [...props.customWander, val])
  wanderInputText.value = ''
  showWanderInput.value = false
}

function removeCustomWander(val: string) {
  emit('update:customWander', props.customWander.filter(v => v !== val))
}
</script>

<template>
  <div>
    <!-- Main tags -->
    <div class="flex gap-2.5">
      <button
        v-for="tag in tags"
        :key="tag"
        :class="[
          'tag text-center flex-1',
          modelValue.includes(tag) ? 'tag-active' : 'tag-inactive',
        ]"
        @click="toggle(tag, modelValue)"
      >
        {{ PREFERENCE_LABELS[tag] }}
      </button>
    </div>

    <!-- Food sub-panel -->
    <Transition name="sub-panel">
      <div v-if="showFoodPanel" class="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-100 space-y-3">
        <div>
          <p class="text-xs font-semibold text-gray-500 mb-2">想吃类型（可多选，不选则不限）</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="c in cuisineOptions"
              :key="c"
              :class="[
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                props.cuisineTypes.includes(c)
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-600 border border-gray-200',
              ]"
              @click="toggleCuisine(c)"
            >
              {{ CUISINE_LABELS[c] }}
            </button>
            <!-- Custom cuisine chips -->
            <button
              v-for="v in props.customCuisine"
              :key="'cc-'+v"
              class="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500 text-white transition-colors"
              @click="removeCustomCuisine(v)"
            >
              {{ v }} ✕
            </button>
            <!-- Custom input -->
            <span v-if="showCuisineInput" class="inline-flex items-center gap-1">
              <input
                ref="cuisineInputEl"
                v-model="cuisineInputText"
                type="text"
                class="w-20 px-2 py-1 rounded-full text-xs border border-orange-300 bg-white outline-none focus:border-orange-400"
                placeholder="如: 日料"
                @keyup.enter="addCustomCuisine()"
              />
              <button
                class="text-xs text-orange-500 font-medium"
                @click="addCustomCuisine()"
              >确定</button>
            </span>
            <button
              v-else
              class="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-400 border border-dashed border-gray-300 hover:border-orange-300 hover:text-orange-500 transition-colors"
              @click="showCuisineInput = true; cuisineInputText = ''"
            >
              + 自定义
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Scenic sub-panel -->
    <Transition name="sub-panel">
      <div v-if="showScenicPanel" class="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100 space-y-3">
        <div>
          <p class="text-xs font-semibold text-gray-500 mb-2">景点类型（可多选，不选则不限）</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="st in scenicOptions"
              :key="st"
              :class="[
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                props.scenicTypes.includes(st)
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-gray-600 border border-gray-200',
              ]"
              @click="toggleScenic(st)"
            >
              {{ SCENIC_LABELS[st] }}
            </button>
            <!-- Custom scenic chips -->
            <button
              v-for="v in props.customScenic"
              :key="'cs-'+v"
              class="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500 text-white transition-colors"
              @click="removeCustomScenic(v)"
            >
              {{ v }} ✕
            </button>
            <!-- Custom input -->
            <span v-if="showScenicInput" class="inline-flex items-center gap-1">
              <input
                v-model="scenicInputText"
                type="text"
                class="w-20 px-2 py-1 rounded-full text-xs border border-emerald-300 bg-white outline-none focus:border-emerald-400"
                placeholder="如: 公园"
                @keyup.enter="addCustomScenic()"
              />
              <button
                class="text-xs text-emerald-500 font-medium"
                @click="addCustomScenic()"
              >确定</button>
            </span>
            <button
              v-else
              class="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-400 border border-dashed border-gray-300 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
              @click="showScenicInput = true; scenicInputText = ''"
            >
              + 自定义
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Wander sub-panel -->
    <Transition name="sub-panel">
      <div v-if="showWanderPanel" class="mt-3 p-3 bg-purple-50 rounded-xl border border-purple-100 space-y-3">
        <div>
          <p class="text-xs font-semibold text-gray-500 mb-2">休闲方式（可多选，不选则不限）</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="wt in wanderOptions"
              :key="wt"
              :class="[
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                props.wanderTypes.includes(wt)
                  ? 'bg-purple-500 text-white'
                  : 'bg-white text-gray-600 border border-gray-200',
              ]"
              @click="toggleWander(wt)"
            >
              {{ WANDER_LABELS[wt] }}
            </button>
            <!-- Custom wander chips -->
            <button
              v-for="v in props.customWander"
              :key="'cw-'+v"
              class="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500 text-white transition-colors"
              @click="removeCustomWander(v)"
            >
              {{ v }} ✕
            </button>
            <!-- Custom input -->
            <span v-if="showWanderInput" class="inline-flex items-center gap-1">
              <input
                v-model="wanderInputText"
                type="text"
                class="w-20 px-2 py-1 rounded-full text-xs border border-purple-300 bg-white outline-none focus:border-purple-400"
                placeholder="如: 书店"
                @keyup.enter="addCustomWander()"
              />
              <button
                class="text-xs text-purple-500 font-medium"
                @click="addCustomWander()"
              >确定</button>
            </span>
            <button
              v-else
              class="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-400 border border-dashed border-gray-300 hover:border-purple-300 hover:text-purple-500 transition-colors"
              @click="showWanderInput = true; wanderInputText = ''"
            >
              + 自定义
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.sub-panel-enter-active {
  transition: all 0.25s ease-out;
}
.sub-panel-leave-active {
  transition: all 0.15s ease-in;
}
.sub-panel-enter-from {
  opacity: 0;
  transform: translateY(-8px);
  max-height: 0;
}
.sub-panel-enter-to {
  opacity: 1;
  transform: translateY(0);
  max-height: 300px;
}
.sub-panel-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 300px;
}
.sub-panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
  max-height: 0;
}
</style>
