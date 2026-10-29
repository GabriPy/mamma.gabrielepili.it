<script setup>
import { onBeforeUnmount, watch } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  size: { type: String, default: 'md' },
  closeOnBackdrop: { type: Boolean, default: true },
  hideHeader: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'close']);

function close() {
  emit('update:modelValue', false);
  emit('close');
}

function onKey(event) {
  if (event.key === 'Escape' && props.modelValue) close();
}

watch(
  () => props.modelValue,
  (open) => {
    document.body.classList.toggle('modal-open', open);
    if (open) document.addEventListener('keydown', onKey);
    else document.removeEventListener('keydown', onKey);
  },
);

onBeforeUnmount(() => {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="modal-backdrop" @click.self="closeOnBackdrop && close()">
        <div class="modal-card" :class="`modal-${size}`" role="dialog" aria-modal="true" :aria-label="title || 'Finestra'">
          <header v-if="!hideHeader" class="modal-head">
            <div>
              <h2 v-if="title">{{ title }}</h2>
              <p v-if="subtitle" class="modal-sub">{{ subtitle }}</p>
            </div>
            <button type="button" class="btn-icon modal-close" aria-label="Chiudi" @click="close">
              <Icon name="x" :size="18" />
            </button>
          </header>
          <div class="modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal-foot">
            <slot name="footer" :close="close" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(38, 28, 18, 0.42);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.modal-card {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: 0 30px 80px -30px rgba(50, 32, 14, 0.55);
  max-height: min(88vh, 900px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-sm {
  max-width: 420px;
}
.modal-md {
  max-width: 560px;
}
.modal-lg {
  max-width: 760px;
}
.modal-xl {
  max-width: 940px;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 6px;
}
.modal-head h2 {
  font-size: 24px;
  margin: 0;
}
.modal-sub {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13.5px;
}
.modal-close {
  margin-top: -4px;
  margin-right: -6px;
}
.modal-body {
  padding: 16px 24px 22px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  background: var(--surface-2);
  flex-wrap: wrap;
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}
.modal-enter-active .modal-card,
.modal-leave-active .modal-card {
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-card,
.modal-leave-to .modal-card {
  transform: translateY(14px) scale(0.985);
  opacity: 0;
}
@media (max-width: 640px) {
  .modal-backdrop {
    padding: 0;
    align-items: flex-end;
  }
  .modal-card {
    max-width: 100%;
    border-radius: 24px 24px 0 0;
    max-height: 94vh;
    border-bottom: none;
  }
  .modal-head {
    padding: 20px 20px 4px;
  }
  .modal-body {
    padding: 14px 20px 20px;
  }
  .modal-foot {
    padding: 14px 20px calc(14px + env(safe-area-inset-bottom));
  }
  .modal-enter-from .modal-card,
  .modal-leave-to .modal-card {
    transform: translateY(100%);
  }
}
</style>
