<script setup lang="ts">
import { computed } from 'vue'
import {
  PREFERENCE_LABELS,
  MEAL_LABELS, CUISINE_LABELS,
  PHOTO_LABELS, SCENIC_LABELS,
  WANDER_LABELS, WALK_LEVEL_LABELS,
  type PreferenceTag,
  type MealType, type CuisineType,
  type PhotoType, type ScenicType,
  type WanderType, type WalkLevel,
} from '../types/route'

const props = defineProps<{
  modelValue: PreferenceTag[]
  mealTypes: MealType[]
  cuisineTypes: CuisineType[]
  photoTypes: PhotoType[]
  scenicTypes: ScenicType[]
  wanderTypes: WanderType[]
  walkLevel: WalkLevel | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PreferenceTag[]]
  'update:mealTypes': [value: MealType[]]
  'update:cuisineTypes': [value: CuisineType[]]
  'update:photoTypes': [value: PhotoType[]]
  'update:scenicTypes': [value: ScenicType[]]
  'update:wanderTypes': [value: WanderType[]]
  'update:walkLevel': [value: WalkLevel | null]
}>()

const tags: PreferenceTag[] = ['food', 'wander', 'photo', 'less_walk', 'scenic']

const mealOptions: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const cuisineOptions: CuisineType[] = ['hotpot', 'noodles', 'pastries', 'bbq', 'local_cuisine', 'western', 'coffee_tea']
const photoOptions: PhotoType[] = ['landmark', 'street']
const scenicOptions: ScenicType[] = ['popular', 'museum', 'hidden']
const wanderOptions: WanderType[] = ['shopping', 'cafe', 'entertainment', 'park']
const walkLevelOptions: WalkLevel[] = ['minimal', 'moderate']

const showFoodPanel = computed(() => props.modelValue.includes('food'))
const showPhotoPanel = computed(() => props.modelValue.includes('photo'))
const showScenicPanel = computed(() => props.modelValue.includes('scenic'))
const showWanderPanel = computed(() => props.modelValue.includes('wander'))
const showWalkPanel = computed(() => props.modelValue.includes('less_walk'))

function toggle(tag: PreferenceTag, selected: PreferenceTag[]) {
  if (selected.includes(tag)) {
    if (selected.length > 1) {
      emit('update:modelValue', selected.filter((t) => t !== tag))
    }
  } else {
    emit('update:modelValue', [...selected, tag])
  }
}

function toggleMeal(type: MealType) {
  const arr = [...props.mealTypes]
  const idx = arr.indexOf(type)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(type)
  emit('update:mealTypes', arr)
}

function toggleCuisine(type: CuisineType) {
  const arr = [...props.cuisineTypes]
  const idx = arr.indexOf(type)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(type)
  emit('update:cuisineTypes', arr)
}

function togglePhoto(type: PhotoType) {
  const arr = [...props.photoTypes]
  const idx = arr.indexOf(type)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(type)
  emit('update:photoTypes', arr)
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

function setWalkLevel(level: WalkLevel) {
  emit('update:walkLevel', props.walkLevel === level ? null : level)
}
</script>

<template>
  <div>
    <!-- Main tags -->
    <div class="grid grid-cols-3 gap-2.5">
      <button
        v-for="tag in tags"
        :key="tag"
        :class="[
          'tag text-center',
          modelValue.includes(tag) ? 'tag-active' : 'tag-inactive',
        ]"
        @click="toggle(tag, modelValue)"
      >
        {{ PREFERENCE_LABELS[tag] }}
      </button>
    </div>

    <!-- Food sub-panel -->
    <div v-if="showFoodPanel" class="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-100 space-y-3">
      <div>
        <p class="text-xs font-semibold text-gray-500 mb-2">用餐时段（可多选）</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="m in mealOptions"
            :key="m"
            :class="[
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              props.mealTypes.includes(m)
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200',
            ]"
            @click="toggleMeal(m)"
          >
            {{ MEAL_LABELS[m] }}
          </button>
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold text-gray-500 mb-2">想吃类型（可多选）</p>
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

    <!-- Photo sub-panel -->
    <div v-if="showPhotoPanel" class="mt-3 p-3 bg-sky-50 rounded-xl border border-sky-100 space-y-3">
      <div>
        <p class="text-xs font-semibold text-gray-500 mb-2">拍摄场景（可多选）</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="pt in photoOptions"
            :key="pt"
            :class="[
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              props.photoTypes.includes(pt)
                ? 'bg-sky-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200',
            ]"
            @click="togglePhoto(pt)"
          >
            {{ PHOTO_LABELS[pt] }}
          </button>
        </div>
      </div>
    </div>

    <!-- Scenic sub-panel -->
    <div v-if="showScenicPanel" class="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100 space-y-3">
      <div>
        <p class="text-xs font-semibold text-gray-500 mb-2">景点类型（可多选）</p>
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

    <!-- Wander sub-panel -->
    <div v-if="showWanderPanel" class="mt-3 p-3 bg-purple-50 rounded-xl border border-purple-100 space-y-3">
      <div>
        <p class="text-xs font-semibold text-gray-500 mb-2">休闲方式（可多选）</p>
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

    <!-- Less-walk sub-panel -->
    <div v-if="showWalkPanel" class="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
      <p class="text-xs font-semibold text-gray-500 mb-2">步行距离（单选）</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="wl in walkLevelOptions"
          :key="wl"
          :class="[
            'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            props.walkLevel === wl
              ? 'bg-amber-500 text-white'
              : 'bg-white text-gray-600 border border-gray-200',
          ]"
          @click="setWalkLevel(wl)"
        >
          {{ WALK_LEVEL_LABELS[wl] }}
        </button>
      </div>
    </div>
  </div>
</template>
