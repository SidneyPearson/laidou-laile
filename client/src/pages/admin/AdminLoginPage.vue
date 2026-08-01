<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminAuth } from '../../admin/auth'

const password = ref('')
const error = ref('')
const loading = ref(false)
const router = useRouter()
const route = useRoute()
const auth = useAdminAuth()

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(password.value)
    const target = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin')
      ? route.query.redirect
      : '/admin'
    await router.replace(target)
  } catch (caught: unknown) {
    password.value = ''
    error.value = caught instanceof Error ? caught.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="admin-shell grid min-h-full place-items-center p-4 md:p-8">
    <div class="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-surface)] shadow-[0_24px_70px_rgba(55,42,31,0.12)] md:grid-cols-[1.05fr_0.95fr]">
      <section class="relative hidden min-h-[520px] overflow-hidden border-r border-[var(--admin-line)] bg-[var(--admin-ink)] p-10 text-white md:flex md:flex-col">
        <div class="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10"></div>
        <div class="absolute -right-6 top-16 h-40 w-40 rounded-full border border-primary-400/30"></div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-primary-300">来都来了</p>
        <h1 class="mt-5 text-4xl font-bold leading-tight">城市内容<br>编辑部</h1>
        <p class="mt-3 text-sm tracking-[0.18em] text-white/55">地图工作台 · EDITORIAL DESK</p>
        <div class="mt-auto border-l-2 border-primary-500 pl-4 text-sm leading-7 text-white/70">
          <p>核验城市地点事实</p>
          <p>编辑推荐级别与理由</p>
          <p>人工发布可信城市灵感</p>
        </div>
      </section>

      <form class="flex min-h-[480px] flex-col justify-center p-7 md:p-10" @submit.prevent="submit">
        <div class="md:hidden">
          <p class="admin-eyebrow">来都来了</p>
          <p class="mt-2 text-xs text-[var(--admin-muted)]">城市内容编辑部 · 地图工作台</p>
        </div>
        <p class="admin-eyebrow mt-8 md:mt-0">编辑身份验证</p>
        <h2 class="mt-2 text-3xl font-bold tracking-tight">回到工作台</h2>
        <p class="mt-3 text-sm leading-6 text-[var(--admin-muted)]">使用单管理员密码登录。会话只保存在安全浏览器 Cookie 中，不在前端存储凭据。</p>
        <label class="mt-8 block text-sm font-semibold">
          管理员密码
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            autofocus
            class="admin-input mt-2"
            placeholder="输入管理员密码"
          >
        </label>
        <p v-if="error" role="alert" class="admin-alert admin-alert-error mt-4">{{ error }}</p>
        <button class="admin-button-primary mt-5 w-full py-3" :disabled="loading">
          {{ loading ? '正在进入编辑部…' : '进入编辑部' }}
        </button>
        <p class="mt-5 text-center text-xs text-[var(--admin-muted)]">仅限授权内容管理员使用</p>
      </form>
    </div>
  </main>
</template>
