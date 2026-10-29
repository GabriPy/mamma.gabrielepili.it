<script setup>
defineProps({
  size: { type: Number, default: 40 },
  showWordmark: { type: Boolean, default: false },
  subtitle: { type: String, default: '' },
});
</script>

<template>
  <div class="brand" :style="{ '--mark-size': `${size}px` }">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="14" fill="#C0553A" />
        <path d="M11 23.5 24 12l13 11.5" stroke="#FBF4E8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M14.4 21.6V36h19.2V21.6" stroke="#FBF4E8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        <path
          d="M24 32.4c-3.4-2.2-4.6-4.7-4.6-6.7 0-1.8 1.3-3 2.9-3 1 0 1.6.5 1.7 1.2.2-.7.9-1.2 1.8-1.2 1.6 0 2.9 1.2 2.9 3 0 2-1.3 4.5-4.7 6.7Z"
          fill="#F3C9A8"
        />
      </svg>
    </span>
    <span v-if="showWordmark" class="brand-text">
      <span class="brand-name">Ghibiri Home</span>
      <span v-if="subtitle" class="brand-sub">{{ subtitle }}</span>
    </span>
  </div>
</template>

<style scoped>
.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.brand-mark {
  width: var(--mark-size);
  height: var(--mark-size);
  display: block;
  flex: none;
  border-radius: calc(var(--mark-size) * 0.29);
  box-shadow: 0 8px 18px -10px rgba(160, 66, 40, 0.65);
  overflow: hidden;
}
.brand-mark svg {
  width: 100%;
  height: 100%;
  display: block;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  min-width: 0;
}
.brand-name {
  font-family: var(--font-serif);
  font-size: calc(var(--mark-size) * 0.46);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ink);
}
.brand-sub {
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 4px;
}
</style>
