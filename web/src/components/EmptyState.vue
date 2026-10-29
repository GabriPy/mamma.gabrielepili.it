<script setup>
import Icon from './Icon.vue';

defineProps({
  icon: { type: String, default: 'sparkle' },
  title: { type: String, default: 'Ancora niente qui' },
  text: { type: String, default: '' },
  tone: { type: String, default: 'sage' },
});
</script>

<template>
  <div class="empty" :class="`empty-${tone}`">
    <span class="empty-icon"><Icon :name="icon" :size="24" /></span>
    <h3>{{ title }}</h3>
    <p v-if="text">{{ text }}</p>
    <div v-if="$slots.default" class="empty-action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 34px 20px;
  color: var(--muted);
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--sage-soft);
  color: var(--sage);
  margin-bottom: 14px;
}
.empty-primary .empty-icon {
  background: var(--primary-soft);
  color: var(--primary);
}
.empty-gold .empty-icon {
  background: var(--gold-soft);
  color: var(--gold);
}
.empty-rose .empty-icon {
  background: var(--rose-soft);
  color: var(--rose);
}
.empty-sky .empty-icon {
  background: var(--blue-soft);
  color: var(--blue);
}
.empty h3 {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 600;
  color: var(--ink);
  margin: 0 0 6px;
}
.empty p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  max-width: 38ch;
}
.empty-action {
  margin-top: 16px;
}
</style>
