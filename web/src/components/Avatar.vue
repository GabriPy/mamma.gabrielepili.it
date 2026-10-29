<script setup>
import { computed } from 'vue';
import { initials } from '@/utils/format.js';

const props = defineProps({
  name: { type: String, default: '' },
  emoji: { type: String, default: '' },
  color: { type: String, default: '#C0553A' },
  size: { type: Number, default: 40 },
  ring: { type: Boolean, default: false },
});

function rgba(hex, alpha) {
  const clean = String(hex || '#C0553A').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(full || 'C0553A', 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: rgba(props.color, 0.16),
  color: props.color,
  boxShadow: props.ring ? `0 0 0 2px var(--surface), 0 0 0 4px ${rgba(props.color, 0.28)}` : 'none',
  fontSize: `${Math.round(props.size * 0.46)}px`,
}));
</script>

<template>
  <span class="avatar" :style="style" :title="name">
    <span v-if="emoji" class="avatar-emoji">{{ emoji }}</span>
    <span v-else class="avatar-initials">{{ initials(name) }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex: none;
  font-weight: 600;
  user-select: none;
  line-height: 1;
}
.avatar-emoji {
  transform: translateY(1px);
  filter: saturate(0.95);
}
.avatar-initials {
  font-size: 0.85em;
  letter-spacing: 0.02em;
}
</style>
