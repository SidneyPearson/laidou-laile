<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { amapNavigationUrl, useAmapNavigation } from '../utils/amapNavigation'

const navigation = useAmapNavigation()
const target = navigation.target
const webUrl = computed(() => target.value
  ? amapNavigationUrl(target.value.name, target.value.lng, target.value.lat, 0)
  : '#')
const nativeUrl = computed(() => target.value
  ? amapNavigationUrl(target.value.name, target.value.lng, target.value.lat, 1)
  : '#')

function close() {
  navigation.close()
}

// 先让浏览器处理原生链接的默认跳转，再收起弹层。用户从高德返回时，
// 仍停留在原来的 H5 页面，不会再看到一层过期的导航选择。
function closeAfterNavigation() {
  window.setTimeout(close, 120)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && target.value) close()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- 只淡入、不位移，避免微信 WebView 在弹层移动期间吞掉第一次点击。 -->
    <Transition name="navigation-fade">
      <div
        v-if="target"
        class="navigation-mask"
        role="presentation"
        @click.self="close"
      >
        <section
          class="navigation-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="navigation-title"
        >
          <div class="navigation-handle" aria-hidden="true" />
          <p class="navigation-eyebrow">ROUTE OPTIONS</p>
          <h2 id="navigation-title">怎么去{{ target.placeName || target.name }}</h2>
          <p v-if="target.placeName" class="navigation-copy">导航将前往：{{ target.name }}。这是该地点对应的具体地图位置，请确认是否适合作为游览起点。</p>
          <p class="navigation-copy">网页路线方便返回「来都来了」；需要实时步行指引时，再选择高德 App。</p>

          <div class="navigation-actions">
            <a
              class="navigation-action navigation-action--primary"
              :href="webUrl"
              target="_blank"
              rel="noopener noreferrer"
              @click="closeAfterNavigation"
            >
              <span>
                <strong>网页导航</strong>
                <small>优先新页面打开，可从微信返回</small>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>

            <a
              class="navigation-action navigation-action--secondary"
              :href="nativeUrl"
              target="_blank"
              rel="noopener noreferrer"
              @click="closeAfterNavigation"
            >
              <span>
                <strong>打开高德 App</strong>
                <small>适合实时步行导航</small>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 5h5v5M10 14 19 5M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
              </svg>
            </a>
          </div>

          <button class="navigation-cancel" type="button" @click="close">取消</button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.navigation-mask {
  position: fixed;
  z-index: 120;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 20px 16px max(20px, env(safe-area-inset-bottom));
  background: rgba(0, 0, 0, 0.72);
  overscroll-behavior: contain;
}

.navigation-sheet {
  width: min(100%, 448px);
  padding: 10px 18px 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 28px;
  background: #0d141e;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
  color: #f7f9fb;
}

.navigation-handle {
  width: 38px;
  height: 4px;
  margin: 0 auto 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
}

.navigation-eyebrow {
  color: #c7ff1f;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.2em;
}

.navigation-sheet h2 {
  margin-top: 5px;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.35;
}

.navigation-copy {
  margin-top: 7px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
  line-height: 1.7;
}

.navigation-actions {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.navigation-action {
  display: flex;
  min-height: 66px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 18px;
  text-decoration: none;
  touch-action: manipulation;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.navigation-action:active,
.navigation-cancel:active {
  transform: scale(0.98);
}

.navigation-action--primary {
  background: #c7ff1f;
  color: #071007;
}

.navigation-action--secondary {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #f7f9fb;
}

.navigation-action span {
  display: grid;
  gap: 3px;
}

.navigation-action strong {
  font-size: 14px;
}

.navigation-action small {
  color: currentColor;
  font-size: 10px;
  opacity: 0.62;
}

.navigation-action svg {
  width: 20px;
  height: 20px;
  flex: none;
}

.navigation-cancel {
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.64);
  font-size: 13px;
  font-weight: 700;
  touch-action: manipulation;
}

.navigation-fade-enter-active,
.navigation-fade-leave-active {
  transition: opacity 0.16s ease;
}

.navigation-fade-enter-from,
.navigation-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .navigation-fade-enter-active,
  .navigation-fade-leave-active,
  .navigation-action {
    transition: none;
  }
}
</style>
