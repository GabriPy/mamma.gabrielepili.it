<script setup>
import { ref } from 'vue';
import { formatBytes } from '@/utils/format.js';
import Icon from './Icon.vue';

const props = defineProps({
  attachments: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['remove']);
const lightbox = ref(null);

function open(att) {
  if (att.isImage) lightbox.value = att;
  else window.open(`${att.url}?download=1`, '_blank', 'noopener');
}

function extension(name) {
  return String(name || '').split('.').pop().slice(0, 4).toUpperCase();
}
</script>

<template>
  <div v-if="attachments.length" class="attachments" :class="{ compact }">
    <div v-for="att in attachments" :key="att.id" class="attachment">
      <button type="button" class="attachment-open" :title="att.name" @click="open(att)">
        <img v-if="att.isImage" :src="att.url" :alt="att.name" loading="lazy" />
        <span v-else class="attachment-file">
          <Icon name="file" :size="22" />
          <span class="attachment-ext">{{ extension(att.name) }}</span>
        </span>
      </button>
      <span v-if="!compact" class="attachment-name">{{ att.name }}</span>
      <button
        v-if="editable"
        type="button"
        class="attachment-remove"
        aria-label="Rimuovi allegato"
        @click="emit('remove', att)"
      >
        <Icon name="x" :size="13" />
      </button>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="lightbox" class="lightbox" @click.self="lightbox = null">
        <div class="lightbox-panel">
          <header>
            <span class="lightbox-name">{{ lightbox.name }}</span>
            <span class="lightbox-meta">{{ formatBytes(lightbox.size) }}</span>
            <a :href="`${lightbox.url}?download=1`" class="btn btn-ghost btn-sm" download>
              <Icon name="download" :size="15" /> Scarica
            </a>
            <button type="button" class="btn-icon" aria-label="Chiudi" @click="lightbox = null">
              <Icon name="x" :size="18" />
            </button>
          </header>
          <img :src="lightbox.url" :alt="lightbox.name" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.attachments {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 10px;
}
.attachments.compact {
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
}
.attachment {
  position: relative;
  min-width: 0;
}
.attachment-open {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface-2);
  padding: 0;
  cursor: zoom-in;
}
.compact .attachment-open {
  border-radius: 10px;
}
.attachment-open img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.35s ease;
}
.attachment-open:hover img {
  transform: scale(1.04);
}
.attachment-file {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--muted);
}
.attachment-ext {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
}
.attachment-name {
  display: block;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.attachment-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 0;
  background: rgba(30, 22, 15, 0.62);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.attachment:hover .attachment-remove,
.attachment:focus-within .attachment-remove {
  opacity: 1;
}
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 160;
  background: rgba(24, 17, 11, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.lightbox-panel {
  max-width: min(1000px, 100%);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lightbox-panel header {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #f7efe2;
  flex-wrap: wrap;
}
.lightbox-name {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lightbox-meta {
  font-size: 12px;
  opacity: 0.6;
}
.lightbox-panel header .btn-icon {
  color: #f7efe2;
}
.lightbox-panel img {
  max-width: 100%;
  max-height: calc(92vh - 60px);
  object-fit: contain;
  border-radius: 12px;
  display: block;
  margin: 0 auto;
}
@media (hover: none) {
  .attachment-remove {
    opacity: 1;
  }
}
</style>
