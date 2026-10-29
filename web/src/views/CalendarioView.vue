<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useUiStore } from '@/stores/ui.js';
import {
  capitalize,
  formatDate,
  formatLongDate,
  formatMonth,
  formatTime,
  monthGrid,
  todayString,
  WEEKDAY_INITIALS,
} from '@/utils/format.js';
import { EVENT_CATEGORIES, RECURRENCE_OPTIONS } from '@/utils/constants.js';
import PageHeader from '@/components/PageHeader.vue';
import BaseModal from '@/components/BaseModal.vue';
import AttachmentUploader from '@/components/AttachmentUploader.vue';
import EmptyState from '@/components/EmptyState.vue';
import Icon from '@/components/Icon.vue';

const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const today = todayString();
const selectedDate = ref(today);
const cursor = ref(new Date(new Date(`${today}T12:00:00`).getFullYear(), new Date(`${today}T12:00:00`).getMonth(), 1));
const events = ref([]);
const loading = ref(true);
const saving = ref(false);
const modalOpen = ref(false);
const editing = ref(null);
const uploaderRef = ref(null);
const formError = ref('');
const showRecurrenceUntil = ref(false);

const CAT_COLORS = {
  Casa: '#C0553A',
  Famiglia: '#6F7F57',
  Salute: '#A85B6B',
  Lavoro: '#4C7E8C',
  Scuola: '#B8833A',
  Altro: '#8B7B67',
};

const form = reactive({
  title: '',
  description: '',
  date: today,
  allDay: false,
  startTime: '09:00',
  endTime: '10:00',
  location: '',
  category: 'Casa',
  recurrence: 'none',
  recurrenceUntil: '',
  visibility: 'shared',
  attachments: [],
});

const cells = computed(() => monthGrid(cursor.value.getFullYear(), cursor.value.getMonth()));
const gridStart = computed(() => cells.value[0]?.date || today);
const gridEnd = computed(() => cells.value[cells.value.length - 1]?.date || today);
const monthLabel = computed(() => formatMonth(cursor.value.getFullYear(), cursor.value.getMonth()));
const monthEventCount = computed(
  () => events.value.filter((e) => e.startsAt.slice(0, 7) === `${cursor.value.getFullYear()}-${String(cursor.value.getMonth() + 1).padStart(2, '0')}`).length,
);

const eventsByDay = computed(() => {
  const map = new Map();
  for (const event of events.value) {
    const day = event.startsAt.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(event);
  }
  return map;
});

const selectedEvents = computed(() => eventsByDay.value.get(selectedDate.value) || []);
const selectedIsToday = computed(() => selectedDate.value === today);

async function load() {
  loading.value = true;
  try {
    const data = await api(`/api/events?from=${gridStart.value}&to=${gridEnd.value}`);
    events.value = data.events;
  } catch (err) {
    ui.error(err.message);
  } finally {
    loading.value = false;
  }
}

function shiftMonth(delta) {
  const next = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1);
  cursor.value = next;
  const isCurrentMonth = next.getFullYear() === new Date(`${today}T12:00:00`).getFullYear() && next.getMonth() === new Date(`${today}T12:00:00`).getMonth();
  selectedDate.value = isCurrentMonth ? today : `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
}

function goToday() {
  const now = new Date(`${today}T12:00:00`);
  cursor.value = new Date(now.getFullYear(), now.getMonth(), 1);
  selectedDate.value = today;
}

function pickDay(cell) {
  selectedDate.value = cell.date;
  if (cell.outside) {
    const d = new Date(`${cell.date}T12:00:00`);
    cursor.value = new Date(d.getFullYear(), d.getMonth(), 1);
  }
}

function resetForm(date = selectedDate.value) {
  Object.assign(form, {
    title: '',
    description: '',
    date,
    allDay: false,
    startTime: '09:00',
    endTime: '10:00',
    location: '',
    category: 'Casa',
    recurrence: 'none',
    recurrenceUntil: '',
    visibility: 'shared',
    attachments: [],
  });
  formError.value = '';
  showRecurrenceUntil.value = false;
}

function openNew(date = selectedDate.value) {
  editing.value = null;
  resetForm(date);
  modalOpen.value = true;
}

function openEdit(event) {
  editing.value = event;
  const start = event.startsAt;
  Object.assign(form, {
    title: event.title,
    description: event.description || '',
    date: start.slice(0, 10),
    allDay: event.allDay,
    startTime: formatTime(start) || '09:00',
    endTime: event.endsAt ? formatTime(event.endsAt) : '',
    location: event.location || '',
    category: event.category || 'Casa',
    recurrence: event.recurrence || 'none',
    recurrenceUntil: event.recurrenceUntil || '',
    visibility: event.visibility || 'shared',
    attachments: event.attachments || [],
  });
  formError.value = '';
  showRecurrenceUntil.value = Boolean(event.recurrenceUntil);
  modalOpen.value = true;
}

function buildPayload() {
  if (!form.title.trim()) {
    formError.value = 'Dai un titolo all’evento.';
    return null;
  }
  if (!form.date) {
    formError.value = 'Scegli una data.';
    return null;
  }
  let startsAt = `${form.date}T${form.allDay ? '00:00' : form.startTime || '09:00'}`;
  let endsAt = null;
  if (!form.allDay && form.endTime) {
    let endDate = form.date;
    if (form.endTime < (form.startTime || '09:00')) {
      const d = new Date(`${form.date}T12:00:00`);
      d.setDate(d.getDate() + 1);
      endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    endsAt = `${endDate}T${form.endTime}`;
  }
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    startsAt,
    endsAt,
    allDay: form.allDay,
    location: form.location.trim() || null,
    category: form.category,
    recurrence: form.recurrence,
    recurrenceUntil: form.recurrence === 'none' ? null : form.recurrenceUntil || null,
    visibility: form.visibility,
  };
}

async function save() {
  const payload = buildPayload();
  if (!payload || saving.value) return;
  saving.value = true;
  formError.value = '';
  try {
    if (editing.value) {
      await api(`/api/events/${editing.value.id}`, { method: 'PATCH', body: payload });
      ui.success('Evento aggiornato.');
      modalOpen.value = false;
      await load();
    } else {
      const data = await api('/api/events', { method: 'POST', body: payload });
      const event = data.event;
      if (uploaderRef.value?.hasPending) {
        await uploaderRef.value.flush(event.id);
      }
      ui.success('Evento aggiunto al calendario.');
      modalOpen.value = false;
      selectedDate.value = payload.startsAt.slice(0, 10);
      const d = new Date(`${selectedDate.value}T12:00:00`);
      cursor.value = new Date(d.getFullYear(), d.getMonth(), 1);
      await load();
    }
  } catch (err) {
    formError.value = err.message;
    ui.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function remove() {
  const ok = await ui.confirm({
    title: 'Eliminare l’evento?',
    message: editing.value?.isRecurring
      ? 'È un evento ricorrente: verranno eliminate tutte le occorrenze.'
      : `“${form.title}” verrà eliminato dal calendario.`,
    confirmLabel: 'Elimina',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/events/${editing.value.id}`, { method: 'DELETE' });
    modalOpen.value = false;
    ui.success('Evento eliminato.');
    await load();
  } catch (err) {
    ui.error(err.message);
  }
}

function handleAttachments(list) {
  form.attachments = list;
}

watch([gridStart, gridEnd], load);

watch(
  () => route.query.giorno,
  (value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      selectedDate.value = value;
      const d = new Date(`${value}T12:00:00`);
      cursor.value = new Date(d.getFullYear(), d.getMonth(), 1);
    }
  },
);

watch(
  () => route.query.nuovo,
  (value) => {
    if (value === '1') {
      openNew(selectedDate.value);
      router.replace({ query: { giorno: selectedDate.value } });
    }
  },
);

onMounted(async () => {
  if (typeof route.query.giorno === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.giorno)) {
    selectedDate.value = route.query.giorno;
    const d = new Date(`${selectedDate.value}T12:00:00`);
    cursor.value = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  await load();
  if (route.query.nuovo === '1') {
    await nextTick();
    openNew(selectedDate.value);
    router.replace({ query: { giorno: selectedDate.value } });
  }
});
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="Casa"
      title="Calendario"
      :subtitle="`${capitalize(monthLabel)} · ${monthEventCount} ${monthEventCount === 1 ? 'appuntamento' : 'appuntamenti'}`"
    >
      <template #actions>
        <div class="month-nav">
          <button type="button" class="btn-icon" aria-label="Mese precedente" @click="shiftMonth(-1)">
            <Icon name="chevron-left" :size="18" />
          </button>
          <button type="button" class="btn btn-ghost btn-sm" @click="goToday">Oggi</button>
          <button type="button" class="btn-icon" aria-label="Mese successivo" @click="shiftMonth(1)">
            <Icon name="chevron-right" :size="18" />
          </button>
        </div>
        <button type="button" class="btn btn-primary" @click="openNew()">
          <Icon name="plus" :size="17" /> Nuovo evento
        </button>
      </template>
    </PageHeader>

    <div class="calendar-layout">
      <section class="card cal-card">
        <div class="weekday-row">
          <span v-for="day in WEEKDAY_INITIALS" :key="day">{{ day }}</span>
        </div>
        <div class="calendar-grid">
          <div
            v-for="cell in cells"
            :key="cell.date"
            class="day"
            :class="{
              outside: cell.outside,
              selected: cell.date === selectedDate,
              today: cell.date === today,
              weekend: [0, 6].includes(new Date(`${cell.date}T12:00:00`).getDay()),
            }"
            role="button"
            tabindex="0"
            :aria-label="formatLongDate(cell.date)"
            @click="pickDay(cell)"
            @keydown.enter="pickDay(cell)"
          >
            <span class="day-num">{{ cell.day }}</span>
            <div class="day-events">
              <button
                v-for="event in (eventsByDay.get(cell.date) || []).slice(0, 2)"
                :key="event.occurrenceKey"
                type="button"
                class="event-chip"
                :style="{ '--cat': CAT_COLORS[event.category] || '#8B7B67', background: `${CAT_COLORS[event.category] || '#8B7B67'}20`, color: CAT_COLORS[event.category] || '#8B7B67' }"
                @click.stop="openEdit(event)"
              >
                <template v-if="!event.allDay">{{ formatTime(event.startsAt) }}</template>
                <template v-else>Tutto il giorno</template>
                · {{ event.title }}
              </button>
              <span v-if="(eventsByDay.get(cell.date) || []).length > 2" class="more-chip">
                +{{ (eventsByDay.get(cell.date) || []).length - 2 }}
              </span>
              <span class="day-dots">
                <span
                  v-for="event in (eventsByDay.get(cell.date) || []).slice(0, 4)"
                  :key="`dot-${event.occurrenceKey}`"
                  class="day-dot"
                  :style="{ background: CAT_COLORS[event.category] || '#8B7B67' }"
                />
              </span>
            </div>
          </div>
        </div>
      </section>

      <aside class="day-panel">
        <div class="card day-panel-card">
          <header class="day-panel-head">
            <div>
              <p class="eyebrow">{{ selectedIsToday ? 'Oggi' : 'Giorno scelto' }}</p>
              <h2>{{ capitalize(formatDate(selectedDate, { weekday: true, year: true })) }}</h2>
            </div>
            <button type="button" class="btn-icon" aria-label="Aggiungi evento" @click="openNew(selectedDate)">
              <Icon name="plus" :size="18" />
            </button>
          </header>

          <div v-if="loading" class="loading-line"><span class="spinner" /> Carico…</div>
          <div v-else-if="selectedEvents.length" class="day-list">
            <button v-for="event in selectedEvents" :key="event.occurrenceKey" type="button" class="day-event" @click="openEdit(event)">
              <span class="day-event-time">{{ event.allDay ? 'Tutto il giorno' : formatTime(event.startsAt) }}</span>
              <span class="day-event-bar" :style="{ background: CAT_COLORS[event.category] || '#8B7B67' }" />
              <span class="day-event-body">
                <span class="day-event-title">{{ event.title }}</span>
                <span class="day-event-meta">
                  {{ event.category }}
                  <template v-if="event.location"> · {{ event.location }}</template>
                  <template v-if="event.attachments?.length"> · <Icon name="paperclip" :size="11" /> {{ event.attachments.length }}</template>
                </span>
                <span v-if="event.recurrence !== 'none'" class="badge badge-blue recurring-badge">
                  <Icon name="refresh" :size="10" /> ricorrente
                </span>
              </span>
            </button>
          </div>
          <EmptyState
            v-else
            icon="sun"
            title="Giornata libera"
            text="Nessun appuntamento in questo giorno."
            tone="gold"
          >
            <button type="button" class="btn btn-ghost btn-sm" @click="openNew(selectedDate)">
              <Icon name="plus" :size="15" /> Aggiungi evento
            </button>
          </EmptyState>
        </div>

        <div class="card legend-card">
          <p class="eyebrow">Legenda</p>
          <div class="legend">
            <span v-for="cat in EVENT_CATEGORIES" :key="cat.value" class="legend-item">
              <span class="legend-dot" :style="{ background: CAT_COLORS[cat.value] }" />{{ cat.emoji }} {{ cat.value }}
            </span>
          </div>
        </div>
      </aside>
    </div>

    <BaseModal
      v-model="modalOpen"
      :title="editing ? 'Modifica evento' : 'Nuovo evento'"
      :subtitle="editing?.isRecurring ? 'Evento ricorrente: le modifiche valgono per tutta la serie.' : 'Un appuntamento per la famiglia.'"
      size="lg"
    >
      <form class="stack" @submit.prevent="save">
        <div class="field">
          <label for="ev-title">Titolo</label>
          <input id="ev-title" v-model="form.title" class="input" placeholder="es. Cena da nonna" maxlength="160" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="ev-date">Data</label>
            <input id="ev-date" v-model="form.date" class="input" type="date" />
          </div>
          <div class="field">
            <label>Tutto il giorno</label>
            <div class="inline-switch">
              <button type="button" class="switch" :class="{ on: form.allDay }" role="switch" :aria-checked="form.allDay" @click="form.allDay = !form.allDay" />
              <span class="hint">{{ form.allDay ? 'Senza orario' : 'Con orario' }}</span>
            </div>
          </div>
          <template v-if="!form.allDay">
            <div class="field">
              <label for="ev-start">Inizio</label>
              <input id="ev-start" v-model="form.startTime" class="input" type="time" />
            </div>
            <div class="field">
              <label for="ev-end">Fine <span class="optional">(facoltativa)</span></label>
              <input id="ev-end" v-model="form.endTime" class="input" type="time" />
            </div>
          </template>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="ev-place">Luogo <span class="optional">(facoltativo)</span></label>
            <input id="ev-place" v-model="form.location" class="input" placeholder="es. Casa della nonna" maxlength="160" />
          </div>
          <div class="field">
            <label for="ev-recur">Ripetizione</label>
            <select id="ev-recur" v-model="form.recurrence" class="select" @change="showRecurrenceUntil = form.recurrence !== 'none'">
              <option v-for="opt in RECURRENCE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>

        <div v-if="form.recurrence !== 'none'" class="field">
          <label for="ev-until">Ripeti fino al <span class="optional">(facoltativo)</span></label>
          <input id="ev-until" v-model="form.recurrenceUntil" class="input" type="date" />
        </div>

        <div class="field">
          <label>Categoria</label>
          <div class="chip-row">
            <button
              v-for="cat in EVENT_CATEGORIES"
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

        <div class="field">
          <label for="ev-desc">Note <span class="optional">(facoltative)</span></label>
          <textarea id="ev-desc" v-model="form.description" class="textarea" rows="3" maxlength="5000" placeholder="Cosa serve sapere?" />
        </div>

        <div class="field">
          <label>Chi lo vede</label>
          <div class="visibility-options">
            <button type="button" class="visibility-option" :class="{ active: form.visibility === 'shared' }" @click="form.visibility = 'shared'">
              <Icon name="users" :size="17" />
              <span><strong>Condiviso</strong><small>Tutta la famiglia</small></span>
            </button>
            <button type="button" class="visibility-option" :class="{ active: form.visibility === 'private' }" @click="form.visibility = 'private'">
              <Icon name="lock" :size="17" />
              <span><strong>Privato</strong><small>Solo io</small></span>
            </button>
          </div>
        </div>

        <div class="field">
          <label>Foto e allegati</label>
          <AttachmentUploader
            ref="uploaderRef"
            entity-type="event"
            :entity-id="editing?.id || null"
            :attachments="form.attachments"
            label="Aggiungi una foto o un allegato"
            @change="handleAttachments"
          />
        </div>

        <p v-if="formError" class="error-text">{{ formError }}</p>

        <div v-if="editing" class="modal-actions-inline">
          <button type="button" class="btn btn-danger-ghost btn-sm" @click="remove">
            <Icon name="trash" :size="15" /> Elimina evento
          </button>
        </div>
      </form>

      <template #footer>
        <button type="button" class="btn btn-ghost" @click="modalOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" />
          {{ editing ? 'Salva modifiche' : 'Aggiungi evento' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.month-nav {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 3px;
}
.calendar-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 22px;
  align-items: start;
}
.cal-card {
  padding: 16px 16px 10px;
}
.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0;
  padding: 0 0 8px;
}
.weekday-row span {
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--muted);
  text-transform: uppercase;
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-top: 1px solid var(--line);
  border-left: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}
.day {
  min-height: 104px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: 5px 6px 4px;
  cursor: pointer;
  position: relative;
  transition: background 0.12s ease;
  background: var(--surface);
  min-width: 0;
}
.day:hover {
  background: var(--surface-2);
}
.day.outside {
  background: #fbf7f0;
  color: var(--muted);
}
.day.outside .day-num {
  opacity: 0.5;
}
.day.weekend .day-num {
  color: var(--primary-dark);
}
.day.outside.weekend .day-num {
  color: var(--muted);
}
.day.selected {
  background: var(--primary-soft);
}
.day.today .day-num {
  background: var(--primary);
  color: #fff;
}
.day-num {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-soft);
}
.day-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}
.event-chip {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  font: inherit;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.25;
  padding: 2px 4px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.event-chip:hover {
  filter: brightness(0.97);
}
.more-chip {
  font-size: 9.5px;
  color: var(--muted);
  padding-left: 3px;
  font-weight: 600;
}
.day-dots {
  display: none;
}
.day-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 24px;
}
.day-panel-card {
  padding: 20px;
}
.day-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.day-panel-head h2 {
  font-size: 20px;
  margin-top: 4px;
  line-height: 1.2;
}
.day-list {
  display: flex;
  flex-direction: column;
}
.day-event {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 0;
  border: 0;
  border-top: 1px solid var(--line);
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
}
.day-event:first-child {
  border-top: 0;
}
.day-event-time {
  width: 62px;
  flex: none;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--primary-dark);
  padding-top: 2px;
}
.day-event-bar {
  width: 3px;
  border-radius: 2px;
  align-self: stretch;
  flex: none;
}
.day-event-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.day-event-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}
.day-event-meta {
  font-size: 11.5px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
}
.recurring-badge {
  align-self: flex-start;
  margin-top: 3px;
}
.legend-card {
  padding: 16px 20px;
  background: transparent;
  box-shadow: none;
  border-style: dashed;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 10px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}
.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.inline-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
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
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 11px;
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
  font-size: 12.5px;
}
.visibility-option small {
  font-size: 11px;
  opacity: 0.8;
}
.modal-actions-inline {
  border-top: 1px solid var(--line);
  padding-top: 14px;
  display: flex;
}
@media (max-width: 1100px) {
  .calendar-layout {
    grid-template-columns: 1fr;
  }
  .day-panel {
    position: static;
  }
  .legend-card {
    display: none;
  }
}
@media (max-width: 720px) {
  .cal-card {
    padding: 10px 8px 6px;
  }
  .day {
    min-height: 46px;
    padding: 3px 4px;
  }
  .day-num {
    width: 20px;
    height: 20px;
    font-size: 10.5px;
  }
  .event-chip,
  .more-chip {
    display: none;
  }
  .day-dots {
    display: flex;
    gap: 2px;
    margin-top: 3px;
    flex-wrap: wrap;
  }
  .day-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
  }
  .weekday-row span {
    font-size: 9px;
  }
  .day-panel-card {
    padding: 18px;
  }
  .month-nav {
    flex: 1;
    justify-content: space-between;
  }
}
</style>
