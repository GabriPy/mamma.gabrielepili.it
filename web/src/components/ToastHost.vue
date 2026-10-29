<script setup>
import { useUiStore } from '@/stores/ui.js';
import Icon from './Icon.vue';

const ui = useUiStore();
const icons = { success: 'check', error: 'alert', info: 'info' };
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="toast in ui.toasts" :key="toast.id" class="toast" :class="`toast-${toast.type}`">
          <span class="toast-icon"><Icon :name="icons[toast.type] || 'info'" :size="17" /></span>
          <span class="toast-text">{{ toast.message }}</span>
          <button type="button" class="toast-close" aria-label="Chiudi" @click="ui.dismissToast(toast.id)">
            <Icon name="x" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  z-index: 200;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(92vw, 440px);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: #2f2822;
  color: #fbf4e8;
  border-radius: 14px;
  padding: 11px 12px 11px 14px;
  font-size: 13.5px;
  line-height: 1.35;
  box-shadow: 0 16px 40px -18px rgba(30, 20, 12, 0.8);
}
.toast-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex: none;
}
.toast-success .toast-icon {
  background: rgba(124, 168, 125, 0.22);
  color: #b9d8b4;
}
.toast-error .toast-icon {
  background: rgba(214, 118, 96, 0.24);
  color: #f0b3a5;
}
.toast-info .toast-icon {
  background: rgba(143, 172, 197, 0.22);
  color: #b9d0e4;
}
.toast-text {
  flex: 1;
}
.toast-close {
  background: transparent;
  border: 0;
  color: rgba(251, 244, 232, 0.55);
  padding: 4px;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.toast-close:hover {
  color: #fbf4e8;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
@media (max-width: 720px) {
  .toast-stack {
    bottom: calc(78px + env(safe-area-inset-bottom));
    width: 92vw;
  }
}
</style>
