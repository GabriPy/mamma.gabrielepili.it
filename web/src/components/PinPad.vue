<script setup>
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  max: { type: Number, default: 4 },
  disabled: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'complete']);

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'blank', '0', 'back'];

function press(key) {
  if (props.disabled) return;
  if (key === 'blank') return;
  if (key === 'back') {
    emit('update:modelValue', props.modelValue.slice(0, -1));
    return;
  }
  if (props.modelValue.length >= props.max) return;
  const next = props.modelValue + key;
  emit('update:modelValue', next);
  if (next.length === props.max) emit('complete', next);
}
</script>

<template>
  <div class="pinpad" :class="{ 'pinpad-error': error }" @contextmenu.prevent>
    <button
      v-for="key in keys"
      :key="key"
      type="button"
      class="pin-key"
      :class="{ 'pin-key-blank': key === 'blank', 'pin-key-back': key === 'back' }"
      :disabled="disabled || key === 'blank'"
      :aria-label="key === 'back' ? 'Cancella' : key === 'blank' ? '' : key"
      @click="press(key)"
    >
      <Icon v-if="key === 'back'" name="chevron-left" :size="24" />
      <template v-else-if="key !== 'blank'">{{ key }}</template>
    </button>
  </div>
</template>

<style scoped>
.pinpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
}
.pin-key {
  appearance: none;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  height: 62px;
  border-radius: 18px;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 500;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s ease, transform 0.1s ease, border-color 0.15s ease;
  box-shadow: 0 1px 0 rgba(70, 50, 30, 0.04);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.pin-key:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--line-strong);
}
.pin-key:active:not(:disabled) {
  transform: scale(0.96);
  background: var(--primary-soft);
}
.pin-key:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
.pin-key-blank {
  border: 0;
  background: transparent;
  box-shadow: none;
  cursor: default;
}
.pin-key-back {
  color: var(--muted);
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.pin-key-back:hover:not(:disabled) {
  background: var(--surface-2);
}
.pinpad-error .pin-key {
  border-color: rgba(180, 67, 47, 0.4);
}
@media (max-width: 380px) {
  .pinpad {
    gap: 9px;
  }
  .pin-key {
    height: 56px;
    border-radius: 16px;
    font-size: 24px;
  }
}
</style>
