<script setup>
import { useUiStore } from '@/stores/ui.js';
import Icon from './Icon.vue';

const ui = useUiStore();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="ui.confirmState" class="confirm-backdrop" @click.self="ui.answerConfirm(false)">
        <div class="confirm-card" role="alertdialog" aria-modal="true">
          <span class="confirm-icon" :class="{ danger: ui.confirmState.danger }">
            <Icon :name="ui.confirmState.danger ? 'alert' : 'info'" :size="22" />
          </span>
          <h2>{{ ui.confirmState.title }}</h2>
          <p v-if="ui.confirmState.message">{{ ui.confirmState.message }}</p>
          <div class="confirm-actions">
            <button type="button" class="btn btn-ghost" @click="ui.answerConfirm(false)">
              {{ ui.confirmState.cancelLabel }}
            </button>
            <button
              type="button"
              class="btn"
              :class="ui.confirmState.danger ? 'btn-danger' : 'btn-primary'"
              @click="ui.answerConfirm(true)"
            >
              {{ ui.confirmState.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(38, 28, 18, 0.42);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  padding: 22px;
}
.confirm-card {
  width: min(420px, 100%);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 26px 24px 20px;
  box-shadow: 0 30px 80px -30px rgba(50, 32, 14, 0.55);
  text-align: left;
}
.confirm-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  margin-bottom: 14px;
}
.confirm-icon.danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.confirm-card h2 {
  font-size: 22px;
  margin: 0 0 8px;
}
.confirm-card p {
  margin: 0;
  color: var(--muted);
  font-size: 14.5px;
  line-height: 1.55;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
  flex-wrap: wrap;
}
</style>
