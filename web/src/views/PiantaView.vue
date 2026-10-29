<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useUiStore } from '@/stores/ui.js';
import { PLANT_INTERVALS, PLANT_TYPES } from '@/utils/constants.js';
import { dueLabel, formatDateTime, relativeDay, todayString } from '@/utils/format.js';
import BaseModal from '@/components/BaseModal.vue';
import AttachmentUploader from '@/components/AttachmentUploader.vue';
import EmptyState from '@/components/EmptyState.vue';
import Icon from '@/components/Icon.vue';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const ui = useUiStore();

const plant = ref(null);
const logs = ref([]);
const loading = ref(true);
const editOpen = ref(false);
const saving = ref(false);
const formError = ref('');
const taskOpen = ref(false);
const taskEditing = ref(null);
const doneOpen = ref(false);
const doneTask = ref(null);
const busy = ref(false);

const editForm = reactive({ name: '', species: '', location: '', notes: '' });
const taskForm = reactive({ type: 'acqua', intervalDays: 7, nextDueDate: todayString(), notes: '' });
const doneForm = reactive({ doneAt: todayString(), note: '' });

const heroImage = computed(() => plant.value?.attachments?.find((a) => a.isImage) || null);

async function load() {
  loading.value = true;
  try {
    const data = await api(`/api/plants/${props.id}`);
    plant.value = data.plant;
    logs.value = data.logs;
  } catch (err) {
    ui.error(err.message);
    if (err.status === 404) router.replace('/piante');
  } finally {
    loading.value = false;
  }
}

function openEdit() {
  Object.assign(editForm, {
    name: plant.value.name,
    species: plant.value.species || '',
    location: plant.value.location || '',
    notes: plant.value.notes || '',
  });
  editOpen.value = true;
}

async function savePlant() {
  if (!editForm.name.trim()) return;
  saving.value = true;
  try {
    await api(`/api/plants/${props.id}`, {
      method: 'PATCH',
      body: {
        name: editForm.name.trim(),
        species: editForm.species.trim() || null,
        location: editForm.location.trim() || null,
        notes: editForm.notes.trim() || null,
      },
    });
    editOpen.value = false;
    ui.success('Pianta aggiornata.');
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    saving.value = false;
  }
}

function openTaskModal(task = null) {
  taskEditing.value = task;
  Object.assign(taskForm, {
    type: task?.type || 'acqua',
    intervalDays: task?.intervalDays || 7,
    nextDueDate: task?.nextDueDate || todayString(),
    notes: task?.notes || '',
  });
  taskOpen.value = true;
}

async function saveTask() {
  saving.value = true;
  try {
    if (taskEditing.value) {
      await api(`/api/plants/tasks/${taskEditing.value.id}`, {
        method: 'PATCH',
        body: { ...taskForm, notes: taskForm.notes || null },
      });
      ui.success('Attività aggiornata.');
    } else {
      await api(`/api/plants/${props.id}/tasks`, {
        method: 'POST',
        body: { ...taskForm, notes: taskForm.notes || null },
      });
      ui.success('Attività aggiunta.');
    }
    taskOpen.value = false;
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function removeTask(task) {
  const ok = await ui.confirm({
    title: 'Rimuovere l’attività?',
    message: `${PLANT_TYPES[task.type]?.label} non sarà più programmata per ${plant.value.name}.`,
    confirmLabel: 'Rimuovi',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/plants/tasks/${task.id}`, { method: 'DELETE' });
    ui.success('Attività rimossa.');
    await load();
  } catch (err) {
    ui.error(err.message);
  }
}

function openDone(task) {
  doneTask.value = task;
  doneForm.doneAt = todayString();
  doneForm.note = '';
  doneOpen.value = true;
}

async function submitDone() {
  if (!doneTask.value) return;
  saving.value = true;
  try {
    await api(`/api/plants/${props.id}/tasks/${doneTask.value.id}/done`, {
      method: 'POST',
      body: {
        doneAt: doneForm.doneAt,
        note: doneForm.note.trim() || null,
      },
    });
    doneOpen.value = false;
    ui.success(`${PLANT_TYPES[doneTask.value.type]?.done || 'Fatto'} oggi. La prossima data è stata aggiornata.`);
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function removePlant() {
  const ok = await ui.confirm({
    title: 'Eliminare la pianta?',
    message: `“${plant.value.name}” e il suo diario verranno eliminati.`,
    confirmLabel: 'Elimina',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/plants/${props.id}`, { method: 'DELETE' });
    ui.success('Pianta eliminata.');
    router.push('/piante');
  } catch (err) {
    ui.error(err.message);
  }
}

async function addToShopping() {
  if (!plant.value) return;
  busy.value = true;
  try {
    const lists = await api('/api/shopping/lists');
    const list = lists.lists.find((l) => l.isDefault) || lists.lists[0];
    await api(`/api/shopping/lists/${list.id}/items`, {
      method: 'POST',
      body: { name: `Terra per ${plant.value.name}`, category: 'Casa', note: 'Per rinvaso' },
    });
    ui.success('Aggiunto alla lista della spesa.');
  } catch (err) {
    ui.error(err.message);
  } finally {
    busy.value = false;
  }
}

function onAttachments(list) {
  plant.value.attachments = list;
}

onMounted(load);
</script>

<template>
  <div class="page-stack">
    <div class="detail-top">
      <RouterLink to="/piante" class="back-link"><Icon name="arrow-left" :size="16" /> Le piante</RouterLink>
      <div v-if="plant" class="detail-actions">
        <button type="button" class="btn btn-ghost btn-sm" @click="openEdit"><Icon name="edit" :size="15" /> Modifica</button>
      </div>
    </div>

    <div v-if="loading" class="loading-line"><span class="spinner" /> Apro il diario verde…</div>

    <template v-else-if="plant">
      <section class="plant-hero card card-flush">
        <div class="hero-media" :class="{ empty: !heroImage }">
          <img v-if="heroImage" :src="heroImage.url" :alt="plant.name" />
          <span v-else class="hero-glyph">🪴</span>
        </div>
        <div class="hero-content">
          <p class="eyebrow">Pianta di casa</p>
          <h1>{{ plant.name }}</h1>
          <p v-if="plant.species" class="species">{{ plant.species }}</p>
          <p v-if="plant.location" class="location"><Icon name="pin" :size="14" /> {{ plant.location }}</p>
          <p v-if="plant.notes" class="notes">{{ plant.notes }}</p>
          <div class="hero-actions">
            <button type="button" class="btn btn-ghost btn-sm" @click="addToShopping" :disabled="busy">
              <Icon name="basket" :size="15" /> Terra alla spesa
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="openTaskModal()">
              <Icon name="plus" :size="15" /> Nuova attività
            </button>
          </div>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-value">{{ plant.tasks.length }}</span>
          <span class="hero-stat-label">attività<br />programmate</span>
        </div>
      </section>

      <div class="plant-columns">
        <section class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">Agenda verde</p>
              <h2>Cosa fare</h2>
            </div>
            <button type="button" class="card-action" @click="openTaskModal()">
              <Icon name="plus" :size="14" /> Aggiungi
            </button>
          </header>

          <div v-if="plant.tasks.length" class="task-list">
            <div v-for="task in plant.tasks" :key="task.id" class="task-card" :class="{ 'task-due': task.isDue }">
              <span class="task-icon" :style="{ background: `${PLANT_TYPES[task.type]?.color}18`, color: PLANT_TYPES[task.type]?.color }">
                {{ PLANT_TYPES[task.type]?.emoji }}
              </span>
              <div class="task-body">
                <div class="task-title-row">
                  <strong>{{ PLANT_TYPES[task.type]?.label }}</strong>
                  <span class="due" :class="task.isOverdue ? 'due-late' : task.isDue ? 'due-today' : 'due-ok'">
                    {{ dueLabel(task.dueInDays) }}
                  </span>
                </div>
                <p class="task-meta">
                  Ogni {{ task.intervalDays }} {{ task.intervalDays === 1 ? 'giorno' : 'giorni' }}
                  <template v-if="task.lastDoneAt"> · ultima volta {{ relativeDay(task.lastDoneAt.slice(0, 10)) }}</template>
                </p>
                <p v-if="task.notes" class="task-notes">{{ task.notes }}</p>
                <div class="task-actions">
                  <button type="button" class="btn btn-soft btn-sm" @click="openDone(task)">
                    <Icon name="check" :size="14" /> Fatto oggi
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" @click="openTaskModal(task)">Modifica</button>
                  <button type="button" class="btn-icon" aria-label="Rimuovi attività" @click="removeTask(task)">
                    <Icon name="trash" :size="15" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <EmptyState v-else icon="droplet" title="Nessuna attività" text="Aggiungi annaffiature, concimazioni o controlli." tone="sage">
            <button type="button" class="btn btn-ghost btn-sm" @click="openTaskModal()">Aggiungi attività</button>
          </EmptyState>
        </section>

        <section class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">Diario</p>
              <h2>Storia recente</h2>
            </div>
          </header>
          <div v-if="logs.length" class="timeline">
            <div v-for="log in logs.slice(0, 12)" :key="log.id" class="timeline-item">
              <span class="timeline-dot" :style="{ background: PLANT_TYPES[log.type]?.color || '#6F7F57' }" />
              <div class="timeline-body">
                <strong>{{ PLANT_TYPES[log.type]?.done || log.type }}</strong>
                <span class="timeline-date">{{ formatDateTime(log.doneAt) }}</span>
                <p v-if="log.note" class="timeline-note">{{ log.note }}</p>
                <span v-if="log.by" class="timeline-by">da {{ log.by.name }}</span>
              </div>
            </div>
          </div>
          <EmptyState v-else icon="clock" title="Ancora nessuna cura registrata" text="Quando segni un’attività come fatta, compare qui." tone="gold" />
        </section>
      </div>

      <section class="card">
        <header class="card-head">
          <div>
            <p class="eyebrow">Album verde</p>
            <h2>Foto</h2>
          </div>
        </header>
        <AttachmentUploader
          entity-type="plant"
          :entity-id="Number(id)"
          :attachments="plant.attachments"
          label="Aggiungi una foto della pianta"
          @change="onAttachments"
        />
      </section>

      <div class="danger-zone">
        <button type="button" class="btn btn-danger-ghost btn-sm" @click="removePlant">
          <Icon name="trash" :size="15" /> Elimina pianta
        </button>
      </div>
    </template>

    <BaseModal v-model="editOpen" title="Modifica pianta" size="md">
      <div class="stack">
        <div class="field">
          <label for="ep-name">Nome</label>
          <input id="ep-name" v-model="editForm.name" class="input" maxlength="80" />
        </div>
        <div class="field">
          <label for="ep-species">Specie</label>
          <input id="ep-species" v-model="editForm.species" class="input" maxlength="120" />
        </div>
        <div class="field">
          <label for="ep-loc">Dove sta</label>
          <input id="ep-loc" v-model="editForm.location" class="input" maxlength="120" />
        </div>
        <div class="field">
          <label for="ep-notes">Note</label>
          <textarea id="ep-notes" v-model="editForm.notes" class="textarea" rows="3" maxlength="5000" />
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-danger-ghost" style="margin-right: auto" @click="editOpen = false; removePlant()">Elimina</button>
        <button type="button" class="btn btn-ghost" @click="editOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="savePlant">Salva</button>
      </template>
    </BaseModal>

    <BaseModal v-model="taskOpen" :title="taskEditing ? 'Modifica attività' : 'Nuova attività'" subtitle="Ogni quanto va fatta?" size="md">
      <div class="stack">
        <div class="field">
          <label>Tipo</label>
          <div class="chip-row">
            <button
              v-for="(meta, type) in PLANT_TYPES"
              :key="type"
              type="button"
              class="chip"
              :class="{ active: taskForm.type === type }"
              @click="taskForm.type = type"
            >
              {{ meta.emoji }} {{ meta.label }}
            </button>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="tp-interval">Frequenza</label>
            <select id="tp-interval" v-model.number="taskForm.intervalDays" class="select">
              <option v-for="opt in PLANT_INTERVALS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="field">
            <label for="tp-next">Prossima volta</label>
            <input id="tp-next" v-model="taskForm.nextDueDate" class="input" type="date" />
          </div>
        </div>
        <div class="field">
          <label for="tp-notes">Note <span class="optional">(facoltative)</span></label>
          <input id="tp-notes" v-model="taskForm.notes" class="input" maxlength="500" />
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="taskOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="saveTask">Salva attività</button>
      </template>
    </BaseModal>

    <BaseModal v-model="doneOpen" :title="`${PLANT_TYPES[doneTask?.type]?.label || 'Cura'} · ${plant?.name}`" subtitle="Registra la cura nel diario." size="sm">
      <div class="stack">
        <div class="field">
          <label for="done-date">Quando</label>
          <input id="done-date" v-model="doneForm.doneAt" class="input" type="date" />
        </div>
        <div class="field">
          <label for="done-note">Nota <span class="optional">(facoltativa)</span></label>
          <input id="done-note" v-model="doneForm.note" class="input" placeholder="es. terreno ancora umido" maxlength="500" />
        </div>
        <p class="hint">La prossima data verrà calcolata in base alla frequenza.</p>
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="doneOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="submitDone">
          <span v-if="saving" class="spinner" /> Segna come fatto
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
  text-decoration: none;
}
.back-link:hover {
  color: var(--ink);
}
.plant-hero {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) 120px;
  min-height: 270px;
}
.hero-media {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--surface-2);
  min-height: 220px;
}
.hero-media.empty {
  background: linear-gradient(150deg, #e9eedd, #f8f9f1);
}
.hero-media img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-glyph {
  font-size: 82px;
  opacity: 0.9;
}
.hero-content {
  padding: 30px 28px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.hero-content h1 {
  font-size: clamp(30px, 3vw, 40px);
  margin: 6px 0 4px;
}
.species {
  font-style: italic;
  font-size: 13px;
  color: var(--muted);
}
.location {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--muted);
  margin-top: 8px;
}
.notes {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink-soft);
  margin-top: 14px;
  max-width: 48ch;
  white-space: pre-line;
}
.hero-actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
  flex-wrap: wrap;
}
.hero-stat {
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 10px;
  background: var(--surface-2);
}
.hero-stat-value {
  font-family: var(--font-serif);
  font-size: 36px;
  font-weight: 600;
  line-height: 1;
  color: var(--sage-dark);
}
.hero-stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  text-align: center;
  margin-top: 6px;
  line-height: 1.4;
}
.plant-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 18px;
  align-items: start;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-card {
  display: flex;
  gap: 12px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-2);
}
.task-card.task-due {
  background: #fdf6e8;
  border-color: #e9d6ad;
}
.task-icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  font-size: 18px;
  flex: none;
}
.task-body {
  flex: 1;
  min-width: 0;
}
.task-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.task-title-row strong {
  font-size: 14px;
}
.task-meta {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 2px;
}
.task-notes {
  font-size: 12px;
  color: var(--ink-soft);
  margin-top: 5px;
}
.task-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  flex-wrap: wrap;
}
.task-actions .btn-icon {
  margin-left: auto;
}
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}
.timeline-item {
  display: flex;
  gap: 12px;
  padding: 0 0 16px 0;
  position: relative;
}
.timeline-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 13px;
  bottom: -2px;
  width: 1px;
  background: var(--line);
}
.timeline-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-top: 4px;
  flex: none;
  box-shadow: 0 0 0 3px var(--surface);
  z-index: 1;
}
.timeline-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.timeline-body strong {
  font-size: 13px;
  font-weight: 600;
}
.timeline-date {
  font-size: 11px;
  color: var(--muted);
}
.timeline-note {
  font-size: 12px;
  color: var(--ink-soft);
  margin-top: 4px;
}
.timeline-by {
  font-size: 10.5px;
  color: var(--muted);
  margin-top: 2px;
}
.danger-zone {
  display: flex;
  justify-content: flex-end;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
@media (max-width: 900px) {
  .plant-hero {
    grid-template-columns: 1fr;
  }
  .hero-media {
    aspect-ratio: 16 / 10;
    min-height: 0;
  }
  .hero-stat {
    flex-direction: row;
    gap: 8px;
    border-left: 0;
    border-top: 1px solid var(--line);
    padding: 12px;
  }
  .hero-stat-value {
    font-size: 24px;
  }
  .hero-stat-label {
    margin-top: 0;
    text-align: left;
  }
  .plant-columns {
    grid-template-columns: 1fr;
  }
}
</style>
