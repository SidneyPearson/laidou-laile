<script setup lang="ts">
defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'use-location': []
  'manual': []
  'dismiss': []
}>()

function onMaskClick() {
  emit('dismiss')
}
</script>

<template>
  <Transition name="loc-sheet">
    <div v-if="visible" class="loc-mask" @click.self="onMaskClick">
      <div class="loc-sheet" role="dialog" aria-label="位置选择">
        <div class="grabber" />

        <div class="sheet-body">
          <div class="location-art" aria-hidden="true">
            <svg class="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s6-4.4 6-11a6 6 0 1 0-12 0c0 6.6 6 11 6 11Z" />
              <circle cx="12" cy="10" r="2" />
            </svg>
          </div>

          <div class="sheet-copy">
            <h3>发现你来到了这里</h3>
            <p>选择出发城市后，我们才能给你推荐附近值得去的城市体验和户外玩法。</p>
          </div>

          <div class="sheet-actions">
            <button class="btn-primary-loc" @click="emit('use-location')">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              使用当前位置
            </button>
            <button class="btn-ghost-loc" aria-label="选择热门城市" @click="emit('manual')">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16v16H4z" />
                <path d="M9 9h6M9 13h6M9 17h3" />
              </svg>
              选择热门城市
            </button>
          </div>

          <button class="look-around" @click="emit('dismiss')">暂时看看 ›</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.loc-mask {
  position: fixed;
  z-index: 70;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.loc-sheet {
  width: 100%;
  max-width: 480px;
  padding: 10px 18px calc(22px + env(safe-area-inset-bottom));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-bottom: 0;
  border-radius: 30px 30px 0 0;
  background:
    linear-gradient(180deg, rgba(24, 29, 39, 0.97), rgba(10, 14, 22, 0.99));
  box-shadow: 0 -24px 60px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.grabber {
  width: 48px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.32);
}

.sheet-body {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 14px;
  align-items: center;
}

.location-art {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--accent, #c7ff1f);
  background: radial-gradient(circle, rgba(181, 255, 31, 0.16), rgba(181, 255, 31, 0.02) 67%);
  filter: drop-shadow(0 0 18px rgba(181, 255, 31, 0.35));
}

.sheet-copy h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}

.sheet-copy p {
  margin: 6px 0 0;
  color: rgba(255, 255, 255, 0.68);
  font-size: 11px;
  line-height: 1.55;
}

.sheet-actions {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}

.sheet-actions button {
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.12s ease, opacity 0.2s ease;
}

.sheet-actions button:active {
  transform: scale(0.97);
}

.btn-primary-loc {
  border: 0;
  color: #0a1206;
  background: var(--accent, #c7ff1f);
  font-weight: 800;
  box-shadow: 0 8px 20px rgba(199, 255, 31, 0.3);
}

.btn-ghost-loc {
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.look-around {
  grid-column: 1 / -1;
  margin-top: 2px;
  padding: 8px;
  text-align: center;
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
  background: transparent;
  border: 0;
}

/* Slide-up transition */
.loc-sheet-enter-active,
.loc-sheet-leave-active {
  transition: opacity 0.25s ease;
}
.loc-sheet-enter-active .loc-sheet,
.loc-sheet-leave-active .loc-sheet {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.loc-sheet-enter-from,
.loc-sheet-leave-to {
  opacity: 0;
}
.loc-sheet-enter-from .loc-sheet,
.loc-sheet-leave-to .loc-sheet {
  transform: translateY(100%);
}
</style>
