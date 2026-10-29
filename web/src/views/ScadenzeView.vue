<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useMetaStore } from '@/stores/meta.js';
import { useUiStore } from '@/stores/ui.js';
import { dueLabel, formatDate, todayString } from '@/utils/format.js';
import { DEADLINE_CATEGORIES, DEADLINE_RECURRENCE, categoryEmoji } from '@/utils/constants.js';
import PageHeader from '@/components/PageHeader.vue';
import BaseModal from '@/components/BaseModal.vue';
import AttachmentUploader from '@/components/AttachmentUploader.vue';
import EmptyState from '@/components/EmptyState.vue';
import Icon from '@/components/Icon.vue';

const ui = useUiStore();
const meta = useMetaStore();
const route = useRoute();
const router = useRouter();

const deadlines = ref([]);
const loading = ref(true);
const filter = ref('open');
const modalOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const busyId = ref('');
const uploaderRef = ref(null);
const formError = ref('');

const form = reactive({
  title: '',
  dueDate: todayString(),
  category: 'Casa',
  amount: '',
  recurrence: 'none',
  visibility: 'shared',
  notes: '',
  attachments: [],
});

const tabs = computed(() => [
  { id: 'open', label: 'Da fare', count: deadlines.value.filter((d) => d.status === 'open').length },
  { id: 'overdue', label: 'In ritardo', count: deadlines.value.filter((d) => d.status === 'open' && d.daysLeft < 0).length },
  { id: 'week', label: 'Questa settimana', count: deadlines.value.filter((d) => d.status === 'open' && d.daysLeft >= 0 && d.daysLeft <= 7).length },
  { id: 'done', label: 'Completate', count: deadlines.value.filter((d) => d.status === 'done').length },
]);

const filtered = computed(() => {
  const open = deadlines.value.filter((d) => d.status === 'open');
  if (filter.value === 'overdue') return open.filter((d) => d.daysLeft < 0);
  if (filter.value === 'week') return open.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7);
  if (filter.value === 'done') return deadlines.value.filter((d) => d.status === 'done');
  return open;
});

const groups = computed(() => {
  const result = [];
  if (filter.value === 'done') {
    if (filtered.value.length) result.push({ id: 'done', title: 'Completate', items: filtered.value });
    return result;
  }
  const overdue = filtered.value.filter((d) => d.daysLeft < 0);
  const today = filtered.value.filter((d) => d.daysLeft === 0);
  const week = filtered.value.filter((d) => d.daysLeft > 0 && d.daysLeft <= 7);
  const later = filtered.value.filter((d) => d.daysLeft > 7);
  if (overdue.length) result.push({ id: 'overdue', title: 'In ritardo', tone: 'late', items: overdue });
  if (today.length) result.push({ id: 'today', title: 'Oggi', tone: 'today', items: today });
  if (week.length) result.push({ id: 'week', title: 'Prossimi 7 giorni', items: week });
  if (later.length) result.push({ id: 'later', title: 'Più avanti', items: later });
  return result;
});

const subtitle = computed(() => {
  const open = deadlines.value.filter((d) => d.status === 'open');
  const late = open.filter((d) => d.daysLeft < 0).length;
  if (!open.length) return 'Nessuna scadenza aperta: tutto in ordine.';
  return `${open.length} aperte${late ? ` · ${late} in ritardo` : ''}`;
});

const reminderText = computed(() => {
  const offsets = String(meta.deadlineOffsets || '7,1')
    .split(',')
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (!meta.emailReminders) return 'Promemoria email non attivi: li trovi comunque qui e in Oggi.';
  const labels = offsets.map((n) => (n === 0 ? 'il giorno stesso' : n === 1 ? 'il giorno prima' : `${n} giorni prima`));
  return `Ti avviseremo via email ${labels.join(' e ')} alle ${meta.reminderHour}.`;
});

async function load() {
  loading.value = true;
  try {
    const data = await api('/api/deadlines?filter=all');
    deadlines.value = data.deadlines;
  } catch (err) {
    ui.error(err.message);
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    title: '',
    dueDate: todayString(),
    category: 'Casa',
    amount: '',
    recurrence: 'none',
    visibility: 'shared',
    notes: '',
    attachments: [],
  });
  formError.value = '';
}

function openNew() {
  editing.value = null;
  resetForm();
  modalOpen.value = true;
}

function openEdit(deadline) {
  editing.value = deadline;
  Object.assign(form, {
    title: deadline.title,
    dueDate: deadline.dueDate,
    category: deadline.category,
    amount: deadline.amount ?? '',
    recurrence: deadline.recurrence,
    visibility: deadline.visibility,
    notes: deadline.notes || '',
    attachments: deadline.attachments || [],
  });
  formError.value = '';
  modalOpen.value = true;
}

async function save() {
  if (!form.title.trim()) {
    formError.value = 'Dai un nome alla scadenza.';
    return;
  }
  if (!form.dueDate) {
    formError.value = 'Scegli la data di scadenza.';
    return;
  }
  saving.value = true;
  formError.value = '';
  const payload = {
    title: form.title.trim(),
    dueDate: form.dueDate,
    category: form.category,
    amount: form.amount === '' ? null : Number(form.amount),
    recurrence: form.recurrence,
    visibility: form.visibility,
    notes: form.notes.trim() || null,
  };
  try {
    if (editing.value) {
      await api(`/api/deadlines/${editing.value.id}`, { method: 'PATCH', body: payload });
      ui.success('Scadenza aggiornata.');
      modalOpen.value = false;
      await load();
    } else {
      const data = await api('/api/deadlines', { method: 'POST', body: payload });
      if (uploaderRef.value?.hasPending) await uploaderRef.value.flush(data.deadline.id);
      ui.success('Scadenza aggiunta.');
      modalOpen.value = false;
      await load();
    }
  } catch (err) {
    formError.value = err.message;
    ui.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function complete(deadline) {
  busyId.value = deadline.id;
  try {
    const result = await api(`/api/deadlines/${deadline.id}/complete`, { method: 'POST', body: { done: true } });
    if (result.repeated) ui.success(`Fatto! Prossima scadenza: ${formatDate(result.deadline.dueDate, { short: true })}.`);
    else ui.success('Scadenza completata.');
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyId.value = '';
  }
}

async function reopen(deadline) {
  busyId.value = deadline.id;
  try {
    await api(`/api/deadlines/${deadline.id}`, { method: 'PATCH', body: { status: 'open' } });
    ui.success('Scadenza riaperta.');
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyId.value = '';
  }
}

async function remove() {
  const ok = await ui.confirm({
    title: 'Eliminare la scadenza?',
    message: `“${editing.value?.title}” verrà eliminata insieme ai suoi promemoria.`,
    confirmLabel: 'Elimina',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/deadlines/${editing.value.id}`, { method: 'DELETE' });
    modalOpen.value = false;
    ui.success('Scadenza eliminata.');
    await load();
  } catch (err) {
    ui.error(err.message);
  }
}

function dueClass(deadline) {
  if (deadline.status === 'done') return 'due-ok';
  if (deadline.daysLeft < 0) return 'due-late';
  if (deadline.daysLeft === 0) return 'due-today';
  if (deadline.daysLeft <= 7) return 'due-soon';
  return 'due-ok';
}

function openFromQuery() {
  const id = Number(route.query.scadenza);
  if (id) {
    const found = deadlines.value.find((d) => d.id === id);
    if (found) openEdit(found);
  }
  if (route.query.nuovo === '1') openNew();
}

watch(
  () => route.query,
  () => openFromQuery(),
);

onMounted(async () => {
  await load();
  await nextTick();
  openFromQuery();
});
</script>

<template>
  <div class="page-stack deadlines-page">
    <PageHeader eyebrow="Casa" title="Scadenze" :subtitle="subtitle">
      <template #actions>
        <button type="button" class="btn btn-primary" @click="openNew">
          <Icon name="plus" :size="17" /> Nuova scadenza
        </button>
      </template>
    </PageHeader>

    <div class="tabs">
      <button v-for="tab in tabs" :key="tab.id" type="button" class="tab" :class="{ active: filter === tab.id }" @click="filter = tab.id">
        {{ tab.label }}
        <span v-if="tab.count" class="tab-count">{{ tab.count }}</span>
      </button>
    </div>

    <div v-if="loading" class="loading-line"><span class="spinner" /> Carico le scadenze…</div>

    <template v-else-if="groups.length">
      <section v-for="group in groups" :key="group.id" class="deadline-group">
        <header class="group-title" :class="group.tone">
          <span class="group-line" />
          <h2>{{ group.title }}</h2>
          <span class="group-line" />
        </header>
        <div class="card card-flush deadline-card">
          <div v-for="deadline in group.items" :key="deadline.id" class="deadline-row" :class="{ done: deadline.status === 'done' }">
            <button
              v-if="deadline.status === 'open'"
              type="button"
              class="check-btn"
              :disabled="busyId === deadline.id"
              :aria-label="`Segna come fatta: ${deadline.title}`"
              @click="complete(deadline)"
            >
              <Icon name="check" :size="13" />
            </button>
            <button
              v-else
              type="button"
              class="check-btn done"
              :disabled="busyId === deadline.id"
              :aria-label="`Riapri: ${deadline.title}`"
              @click="reopen(deadline)"
            >
              <Icon name="check" :size="13" />
            </button>

            <button type="button" class="deadline-main" @click="openEdit(deadline)">
              <span class="deadline-title">
                {{ deadline.title }}
                <span v-if="deadline.visibility === 'private'" class="badge badge-private"><Icon name="lock" :size="10" /> privata</span>
                <Icon v-if="deadline.recurrence !== 'none'" name="refresh" :size="12" class="recurring-icon" />
              </span>
              <span class="deadline-sub">
                <span class="category-chip">
                  {{ categoryEmoji(deadline.category, DEADLINE_CATEGORIES) }} {{ deadline.category }}
                </span>
                <span v-if="deadline.attachments?.length" class="attachment-count">
                  <Icon name="paperclip" :size="12" /> {{ deadline.attachments.length }}
                </span>
                <span v-if="deadline.amount" class="amount">{{ Number(deadline.amount).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) }}</span>
              </span>
            </button>

            <div class="deadline-end">
              <span class="deadline-date">{{ formatDate(deadline.dueDate, { short: true }) }}</span>
              <span class="due" :class="dueClass(deadline)">
                {{ deadline.status === 'done' ? 'fatta' : dueLabel(deadline.daysLeft) }}
              </span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <EmptyState
      v-else
      :icon="filter === 'done' ? 'check' : 'shield'"
      :title="filter === 'done' ? 'Nessuna scadenza completata' : 'Niente in scadenza'"
      :text="filter === 'done' ? 'Quando completi una scadenza la trovi qui.' : 'Tutto sotto controllo. Aggiungi una scadenza per non dimenticarla.'"
      tone="gold"
    >
      <button v-if="filter !== 'done'" type="button" class="btn btn-primary" @click="openNew">
        <Icon name="plus" :size="16" /> Aggiungi scadenza
      </button>
    </EmptyState>

    <BaseModal
      v-model="modalOpen"
      :title="editing ? 'Modifica scadenza' : 'Nuova scadenza'"
      :subtitle="editing ? 'Aggiorna date, importo o promemoria.' : 'Bolletta, documento, rinnovo: mettiamola al sicuro.'"
      size="lg"
    >
      <form class="stack" @submit.prevent="save">
        <div class="field">
          <label for="sc-title">Cosa scade</label>
          <input id="sc-title" v-model="form.title" class="input" placeholder="es. Bolletta della luce" maxlength="160" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="sc-date">Data di scadenza</label>
            <input id="sc-date" v-model="form.dueDate" class="input" type="date" />
          </div>
          <div class="field">
            <label for="sc-amount">Importo <span class="optional">(facoltativo)</span></label>
            <input id="sc-amount" v-model="form.amount" class="input" type="number" min="0" step="0.01" placeholder="es. 68,40" />
          </div>
        </div>

        <div class="field">
          <label>Categoria</label>
          <div class="chip-row">
            <button
              v-for="cat in DEADLINE_CATEGORIES"
              :key="cat.value"
              type="button"
              class="chip"
              :class="{ active: form.category === cat.value }"
              @click="form.category = cat.value"
            >
              {{ cat.emoji }} {{ cat.value }}
            </button>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="sc-recur">Ripetizione</label>
            <select id="sc-recur" v-model="form.recurrence" class="select">
              <option v-for="opt in DEADLINE_RECURRENCE" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <span v-if="form.recurrence !== 'none'" class="hint">Quando la completi, la data avanza automaticamente.</span>
          </div>
          <div class="field">
            <label>Visibilità</label>
            <div class="visibility-options">
              <button type="button" class="visibility-option" :class="{ active: form.visibility === 'shared' }" @click="form.visibility = 'shared'">
                <Icon name="users" :size="16" /><span><strong>Condivisa</strong><small>Tutta la famiglia</small></span>
              </button>
              <button type="button" class="visibility-option" :class="{ active: form.visibility === 'private' }" @click="form.visibility = 'private'">
                <Icon name="lock" :size="16" /><span><strong>Privata</strong><small>Solo io</small></span>
              </button>
            </div>
          </div>
        </div>

        <div class="field">
          <label for="sc-notes">Note <span class="optional">(facoltative)</span></label>
          <textarea id="sc-notes" v-model="form.notes" class="textarea" rows="3" maxlength="5000" placeholder="es. pagare entro il 15, codice cliente…" />
        </div>

        <div class="panel-note reminder-note">
          <Icon name="bell" :size="16" />
          <span>{{ reminderText }}</span>
        </div>

        <div class="field">
          <label>Foto e allegati</label>
          <AttachmentUploader
            ref="uploaderRef"
            entity-type="deadline"
            :entity-id="editing?.id || null"
            :attachments="form.attachments"
            label="Allega bolletta, PDF o foto"
            @change="(list) => (form.attachments = list)"
          />
        </div>

        <p v-if="formError" class="error-text">{{ formError }}</p>

        <div v-if="editing" class="modal-actions-inline">
          <button type="button" class="btn btn-danger-ghost btn-sm" @click="remove">
            <Icon name="trash" :size="15" /> Elimina scadenza
          </button>
        </div>
      </form>

      <template #footer>
        <button type="button" class="btn btn-ghost" @click="modalOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" />
          {{ editing ? 'Salva modifiche' : 'Aggiungi scadenza' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.deadlines-page {
  max-width: 940px;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 6px 0 10px;
}
.group-title h2 {
  font-family: var(--font-sans);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  white-space: nowrap;
}
.group-title.late h2 {
  color: var(--danger);
}
.group-title.today h2 {
  color: #8a6125;
}
.group-line {
  flex: 1;
  height: 1px;
  background: var(--line);
}
.group-title.late .group-line {
  background: rgba(180, 67, 47, 0.22);
}
.group-title.today .group-line {
  background: rgba(184, 131, 58, 0.26);
}
.deadline-card {
  background: var(--surface);
}
.deadline-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-top: 1px solid var(--line);
}
.deadline-row:first-child {
  border-top: 0;
}
.deadline-row:hover {
  background: var(--surface-2);
}
.deadline-main {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0;
}
.deadline-title {
  font-size: 14.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  line-height: 1.35;
}
.recurring-icon {
  color: var(--blue);
}
.deadline-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--muted);
}
.attachment-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.deadline-end {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: none;
}
.deadline-date {
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
}
.deadline-row.done .deadline-title {
  color: var(--muted);
  text-decoration: line-through;
}
.deadline-row.done {
  background: #fbf7f0;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.visibility-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.visibility-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink-soft);
}
.visibility-option.active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-dark);
}
.visibility-option span {
  display: flex;
  flex-direction: column;
}
.visibility-option strong {
  font-size: 12px;
}
.visibility-option small {
  font-size: 10.5px;
  opacity: 0.8;
}
.reminder-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  background: var(--gold-soft);
  border-color: rgba(184, 131, 58, 0.3);
  color: #7a5a25;
  font-size: 12px;
}
.modal-actions-inline {
  border-top: 1px solid var(--line);
  padding-top: 14px;
  display: flex;
}
@media (max-width: 640px) {
  .deadline-row {
    padding: 12px;
    gap: 10px;
  }
  .deadline-date {
    display: none;
  }
  .deadline-end {
    align-items: flex-end;
  }
  .visibility-options {
    grid-template-columns: 1fr;
  }
}
</style>
