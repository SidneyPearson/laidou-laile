<script setup lang="ts">
import { PREFERENCE_LABELS, type PreferenceTag } from '../types/route'

defineProps<{
  modelValue: PreferenceTag[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PreferenceTag[]]
}>()

const tags: PreferenceTag[] = ['food', 'wander', 'photo', 'less_walk', 'local', 'rainy_day']

function toggle(tag: PreferenceTag, selected: PreferenceTag[]) {
  if (selected.includes(tag)) {
    if (selected.length > 1) {
      emit('update:modelValue', selected.filter((t) => t !== tag))
    }
  } else {
    emit('update:modelValue', [...selected, tag])
  }
}
</script>

<template>
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
</template>
