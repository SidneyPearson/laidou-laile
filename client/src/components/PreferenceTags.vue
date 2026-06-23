<script setup lang="ts">
import { computed } from 'vue'
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
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PreferenceTag[]]
  'update:cuisineTypes': [value: CuisineType[]]
  'update:scenicTypes': [value: ScenicType[]]
  'update:wanderTypes': [value: WanderType[]]
}>()

const tags: PreferenceTag[] = ['food', 'wander', 'scenic']

const cuisineOptions: CuisineType[] = ['hotpot', 'noodles', 'pastries', 'bbq', 'local_cuisine', 'western', 'coffee_tea']
const scenicOptions: ScenicType[] = ['popular', 'street']
const wanderOptions: WanderType[] = ['shopping', 'cafe', 'entertainment', 'hidden', 'museum']

const showFoodPanel = computed(() => props.modelValue.includes('food'))
const showScenicPanel = computed(() => props.modelValue.includes('scenic'))
const showWanderPanel = computed(() => props.modelValue.includes('wander'))

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
