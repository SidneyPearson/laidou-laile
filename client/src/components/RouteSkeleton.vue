<template>
  <div class="card p-5 mx-1 space-y-4">
    <div>
      <div class="skeleton h-4 w-16 rounded mb-3"></div>
      <div class="skeleton h-6 w-48 rounded mb-2"></div>
      <div class="skeleton h-4 w-36 rounded"></div>
    </div>
    <div class="flex gap-4">
      <div class="skeleton h-4 w-20 rounded"></div>
      <div class="skeleton h-4 w-16 rounded"></div>
    </div>
    <div class="space-y-3 pt-2">
      <div v-for="i in 3" :key="i" class="flex gap-3">
        <div class="skeleton w-7 h-7 rounded-full flex-shrink-0"></div>
        <div class="flex-1 space-y-2">
          <div class="skeleton h-4 w-32 rounded"></div>
          <div class="skeleton h-3 w-24 rounded"></div>
          <div class="skeleton h-3 w-56 rounded"></div>
        </div>
      </div>
    </div>
  </div>
</template>
