<script setup lang="ts">
import { computed } from 'vue'
import { PREFERENCE_LABELS, MEAL_LABELS, CUISINE_LABELS, type PreferenceTag, type MealType, type CuisineType } from '../types/route'

const props = defineProps<{
  modelValue: PreferenceTag[]
  mealTypes: MealType[]
  cuisineTypes: CuisineType[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PreferenceTag[]]
  'update:mealTypes': [value: MealType[]]
  'update:cuisineTypes': [value: CuisineType[]]
}>()

const tags: PreferenceTag[] = ['food', 'wander', 'photo', 'less_walk', 'scenic']

const mealOptions: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const cuisineOptions: CuisineType[] = ['hotpot', 'noodles', 'pastries', 'bbq', 'local_cuisine', 'western', 'coffee_tea']

const showFoodPanel = computed(() => props.modelValue.includes('food'))

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
  </div>
</template>
