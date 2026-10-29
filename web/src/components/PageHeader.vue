<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
});
</script>

<template>
  <header class="page-head">
    <div class="page-head-text">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="subtitle" class="page-sub">{{ subtitle }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
  flex-wrap: wrap;
}
.page-head-text {
  min-width: 0;
}
.eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.17em;
  text-transform: uppercase;
  color: var(--muted);
}
.page-title {
  font-family: var(--font-serif);
  font-size: clamp(30px, 3.6vw, 42px);
  line-height: 1.05;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--ink);
}
.page-sub {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 14.5px;
  max-width: 62ch;
}
.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 640px) {
  .page-head {
    margin-bottom: 20px;
    align-items: flex-start;
  }
  .page-title {
    font-size: 30px;
  }
  .page-actions {
    width: 100%;
  }
  .page-actions :deep(.btn) {
    flex: 1;
    justify-content: center;
  }
}
</style>
