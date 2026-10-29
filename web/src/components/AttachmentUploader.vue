<script setup>
import { computed, ref, watch } from 'vue';
import { api, uploadFile } from '@/api.js';
import { useMetaStore } from '@/stores/meta.js';
import { useUiStore } from '@/stores/ui.js';
import { formatBytes } from '@/utils/format.js';
import Icon from './Icon.vue';
import AttachmentGallery from './AttachmentGallery.vue';

const props = defineProps({
  entityType: { type: String, required: true },
  entityId: { type: Number, default: null },
  attachments: { type: Array, default: () => [] },
  label: { type: String, default: 'Aggiungi foto o file' },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['change']);
const ui = useUiStore();
const meta = useMetaStore();

const items = ref([...props.attachments]);
const pending = ref([]);
const uploading = ref(false);
const dragOver = ref(false);
const inputRef = ref(null);

watch(
  () => props.attachments,
  (value) => {
    items.value = [...value];
  },
);

const maxMb = computed(() => meta.maxUploadMb || 15);
const total = computed(() => items.value.length + pending.value.length);

function pick() {
  inputRef.value?.click();
}

function isAllowed(file) {
  const name = file.name.toLowerCase();
  const okType =
    file.type.startsWith('image/') ||
    ['application/pdf', 'text/plain', 'application/msword'].includes(file.type) ||
    name.endsWith('.docx');
  if (!okType) {
    ui.error('Puoi allegare immagini, PDF o documenti Word.');
    return false;
  }
  if (file.size > maxMb.value * 1024 * 1024) {
    ui.error(`“${file.name}” supera il limite di ${maxMb.value} MB.`);
    return false;
  }
  return true;
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []).filter(isAllowed);
  if (!files.length) return;
  if (props.entityId) {
    uploading.value = true;
    try {
      for (const file of files) {
        const data = await uploadFile(file, props.entityType, props.entityId);
        items.value.push(data.attachment);
      }
      emit('change', [...items.value]);
    } catch (err) {
      ui.error(err.message);
    } finally {
      uploading.value = false;
    }
  } else {
    for (const file of files) {
      pending.value.push({
        key: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        isImage: file.type.startsWith('image/'),
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      });
    }
  }
  if (inputRef.value) inputRef.value.value = '';
}

function onDrop(event) {
  dragOver.value = false;
  handleFiles(event.dataTransfer?.files);
}

function removePending(item) {
  if (item.url) URL.revokeObjectURL(item.url);
  pending.value = pending.value.filter((p) => p.key !== item.key);
}

async function removeExisting(att) {
  const ok = await ui.confirm({
    title: 'Rimuovere l’allegato?',
    message: `“${att.name}” verrà eliminato definitivamente.`,
    confirmLabel: 'Rimuovi',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/attachments/${att.id}`, { method: 'DELETE' });
    items.value = items.value.filter((a) => a.id !== att.id);
    emit('change', [...items.value]);
    ui.success('Allegato rimosso.');
  } catch (err) {
    ui.error(err.message);
  }
}

async function flush(entityId) {
  if (!pending.value.length) return [];
  uploading.value = true;
  const uploaded = [];
  try {
    for (const item of pending.value) {
      const data = await uploadFile(item.file, props.entityType, entityId);
      uploaded.push(data.attachment);
      items.value.push(data.attachment);
      if (item.url) URL.revokeObjectURL(item.url);
    }
    pending.value = [];
    emit('change', [...items.value]);
    return uploaded;
  } catch (err) {
    ui.error(`Allegato non caricato: ${err.message}`);
    return uploaded;
  } finally {
    uploading.value = false;
  }
}

defineExpose({ flush, hasPending: computed(() => pending.value.length > 0) });
</script>

<template>
  <div class="uploader" :class="{ 'drag-over': dragOver }" @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false" @drop.prevent="onDrop">
    <AttachmentGallery :attachments="items" :editable="true" :compact="compact" @remove="removeExisting" />

    <div v-if="pending.length" class="pending-grid">
      <div v-for="item in pending" :key="item.key" class="pending-item">
        <img v-if="item.isImage" :src="item.url" :alt="item.name" />
        <span v-else class="pending-file"><Icon name="file" :size="22" /></span>
        <button type="button" class="pending-remove" aria-label="Rimuovi" @click="removePending(item)">
          <Icon name="x" :size="12" />
        </button>
        <span class="pending-badge">Da caricare</span>
      </div>
    </div>

    <button type="button" class="upload-tile" :class="{ compact }" :disabled="uploading" @click="pick">
      <span v-if="uploading" class="spinner" />
      <Icon v-else :name="entityType === 'plant' || entityType === 'recipe' ? 'camera' : 'paperclip'" :size="20" />
      <span class="upload-label">{{ uploading ? 'Carico…' : label }}</span>
      <span v-if="!compact" class="upload-hint">Immagini, PDF · max {{ maxMb }} MB</span>
    </button>

    <input
      ref="inputRef"
      type="file"
      class="visually-hidden"
      accept="image/*,application/pdf,.doc,.docx,.txt"
      multiple
      @change="handleFiles($event.target.files)"
    />

    <p v-if="total && !compact" class="upload-count">{{ total }} allegati · {{ formatBytes(items.reduce((sum, a) => sum + (a.size || 0), 0)) }}</p>
  </div>
</template>

<style scoped>
.uploader {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: 16px;
  transition: background 0.15s ease;
}
.uploader.drag-over {
  background: var(--primary-soft);
  outline: 2px dashed var(--primary);
  outline-offset: 4px;
}
.upload-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 108px;
  padding: 14px;
  border: 1.5px dashed var(--line-strong);
  border-radius: 14px;
  background: var(--surface-2);
  color: var(--muted);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  width: 100%;
}
.upload-tile.compact {
  min-height: 64px;
  padding: 8px;
}
.upload-tile:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}
.upload-label {
  font-size: 13px;
  font-weight: 600;
}
.upload-hint {
  font-size: 11px;
  opacity: 0.8;
}
.upload-count {
  margin: 0;
  font-size: 11.5px;
  color: var(--muted);
}
.pending-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 10px;
}
.pending-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface-2);
}
.pending-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pending-file {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
}
.pending-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 0;
  background: rgba(30, 22, 15, 0.62);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.pending-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: rgba(255, 253, 249, 0.9);
  color: var(--ink-soft);
  border-radius: 5px;
  padding: 2px 5px;
}
</style>
