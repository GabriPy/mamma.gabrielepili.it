<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useUiStore } from '@/stores/ui.js';
import { PLANT_INTERVALS, PLANT_TYPES } from '@/utils/constants.js';
import { dueLabel } from '@/utils/format.js';
import PageHeader from '@/components/PageHeader.vue';
import BaseModal from '@/components/BaseModal.vue';
import AttachmentUploader from '@/components/AttachmentUploader.vue';
import EmptyState from '@/components/EmptyState.vue';
import Icon from '@/components/Icon.vue';

const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const plants = ref([]);
const loading = ref(true);
const modalOpen = ref(false);
const saving = ref(false);
const formError = ref('');
const busyId = ref('');
const uploaderRef = ref(null);

const form = reactive({
  name: '',
  species: '',
  location: '',
  notes: '',
  watering: true,
  waterInterval: 7,
  fertilizing: false,
  fertilizerInterval: 30,
  attachments: [],
});

const dueCount = computed(() => plants.value.filter((p) => p.dueCount > 0).length);

function resetForm() {
  Object.assign(form, {
    name: '',
    species: '',
    location: '',
    notes: '',
    watering: true,
    waterInterval: 7,
    fertilizing: false,
    fertilizerInterval: 30,
    attachments: [],
  });
  formError.value = '';
}

function openNew() {
  resetForm();
  modalOpen.value = true;
}

async function save() {
  if (!form.name.trim()) {
    formError.value = 'Come si chiama la pianta?';
    return;
  }
  const tasks = [];
  if (form.watering) tasks.push({ type: 'acqua', intervalDays: form.waterInterval });
  if (form.fertilizing) tasks.push({ type: 'concime', intervalDays: form.fertilizerInterval });
  saving.value = true;
  formError.value = '';
  try {
    const data = await api('/api/plants', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        species: form.species.trim() || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        tasks,
      },
    });
    if (uploaderRef.value?.hasPending) await uploaderRef.value.flush(data.plant.id);
    ui.success('Pianta aggiunta alla casa.');
    modalOpen.value = false;
    router.push(`/piante/${data.plant.id}`);
  } catch (err) {
    formError.value = err.message;
    ui.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function quickDone(plant) {
  const task = plant.nextTask;
  if (!task) return;
  busyId.value = task.id;
  try {
    await api(`/api/plants/${plant.id}/tasks/${task.id}/done`, { method: 'POST', body: {} });
    ui.success(`${PLANT_TYPES[task.type]?.done || 'Fatto'}: ${plant.name}.`);
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyId.value = '';
  }
}

async function load() {
  loading.value = true;
  try {
    const data = await api('/api/plants');
    plants.value = data.plants;
  } catch (err) {
    ui.error(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await load();
  if (route.query.nuovo === '1') openNew();
});
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="Verde di casa"
      title="Le piante"
      :subtitle="plants.length ? `${plants.length} piante · ${dueCount} da curare oggi` : 'Un piccolo diario verde, senza ansia.'"
    >
      <template #actions>
        <button type="button" class="btn btn-primary" @click="openNew">
          <Icon name="plus" :size="17" /> Nuova pianta
        </button>
      </template>
    </PageHeader>

    <div v-if="loading" class="plant-grid">
      <div v-for="i in 3" :key="i" class="plant-card skeleton">
        <div class="shimmer" style="height: 170px" />
        <div style="padding: 16px; display: flex; flex-direction: column; gap: 8px">
          <div class="shimmer" style="width: 55%; height: 18px" />
          <div class="shimmer" style="width: 35%; height: 12px" />
        </div>
      </div>
    </div>

    <div v-else-if="plants.length" class="plant-grid">
      <article
        v-for="plant in plants"
        :key="plant.id"
        class="plant-card"
        tabindex="0"
        role="link"
        @click="router.push(`/piante/${plant.id}`)"
        @keydown.enter="router.push(`/piante/${plant.id}`)"
      >
        <div class="plant-media" :class="{ empty: !plant.attachments?.[0] }">
          <img v-if="plant.attachments?.[0]" :src="plant.attachments[0].url" :alt="plant.name" loading="lazy" />
          <span v-else class="plant-glyph" aria-hidden="true">🪴</span>
          <span v-if="plant.dueCount" class="plant-alert">
            <Icon name="droplet" :size="12" /> {{ plant.dueCount }} da curare
          </span>
        </div>
        <div class="plant-body">
          <div class="plant-head">
            <div>
              <h2>{{ plant.name }}</h2>
              <p v-if="plant.species" class="plant-species">{{ plant.species }}</p>
            </div>
            <Icon name="chevron-right" :size="17" class="muted" />
          </div>
          <p v-if="plant.location" class="plant-location"><Icon name="pin" :size="12" /> {{ plant.location }}</p>

          <div v-if="plant.nextTask" class="next-task" :class="{ due: plant.nextTask.isDue }">
            <span class="task-emoji">{{ PLANT_TYPES[plant.nextTask.type]?.emoji }}</span>
            <span class="task-text">
              <strong>{{ PLANT_TYPES[plant.nextTask.type]?.label }}</strong>
              <small>{{ dueLabel(plant.nextTask.dueInDays) }}</small>
            </span>
            <button
              v-if="plant.nextTask.isDue"
              type="button"
              class="btn btn-soft btn-sm task-btn"
              :disabled="busyId === plant.nextTask.id"
              @click.stop="quickDone(plant)"
            >
              Fatto
            </button>
          </div>
          <p v-else class="plant-location">Nessuna attività programmata</p>
        </div>
      </article>
    </div>

    <EmptyState
      v-else
      icon="leaf"
      title="Nessuna pianta, per ora"
      text="Aggiungi la prima pianta e scegli ogni quanto annaffiarla: al resto pensiamo noi."
      tone="sage"
    >
      <button type="button" class="btn btn-primary" @click="openNew">
        <Icon name="plus" :size="16" /> Aggiungi una pianta
      </button>
    </EmptyState>

    <BaseModal v-model="modalOpen" title="Nuova pianta" subtitle="Bastano il nome e ogni quanto va annaffiata." size="lg">
      <form class="stack" @submit.prevent="save">
        <div class="form-grid">
          <div class="field">
            <label for="pl-name">Nome</label>
            <input id="pl-name" v-model="form.name" class="input" placeholder="es. Monstera" maxlength="80" />
          </div>
          <div class="field">
            <label for="pl-species">Specie <span class="optional">(facoltativa)</span></label>
            <input id="pl-species" v-model="form.species" class="input" placeholder="es. Monstera deliciosa" maxlength="120" />
          </div>
          <div class="field full">
            <label for="pl-loc">Dove sta</label>
            <input id="pl-loc" v-model="form.location" class="input" placeholder="es. Soggiorno, vicino alla finestra" maxlength="120" />
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Cura</div>
          <div class="task-option">
            <button type="button" class="switch" :class="{ on: form.watering }" role="switch" :aria-checked="form.watering" @click="form.watering = !form.watering" />
            <span class="task-option-text">
              <strong>💧 Annaffiare</strong>
              <small>La cura più importante</small>
            </span>
            <select v-if="form.watering" v-model.number="form.waterInterval" class="select input-sm interval-select" aria-label="Ogni quanto annaffiare">
              <option v-for="opt in PLANT_INTERVALS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="task-option">
            <button type="button" class="switch" :class="{ on: form.fertilizing }" role="switch" :aria-checked="form.fertilizing" @click="form.fertilizing = !form.fertilizing" />
            <span class="task-option-text">
              <strong>🌱 Concimare</strong>
              <small>Nutrire la pianta</small>
            </span>
            <select v-if="form.fertilizing" v-model.number="form.fertilizerInterval" class="select input-sm interval-select" aria-label="Ogni quanto concimare">
              <option v-for="opt in [14, 30, 45, 60, 90]" :key="opt" :value="opt">Ogni {{ opt }} giorni</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label for="pl-notes">Note <span class="optional">(facoltative)</span></label>
          <textarea id="pl-notes" v-model="form.notes" class="textarea" rows="3" maxlength="5000" placeholder="es. ruotare il vaso, teme il freddo…" />
        </div>

        <div class="field">
          <label>Foto della pianta</label>
          <AttachmentUploader
            ref="uploaderRef"
            entity-type="plant"
            :entity-id="null"
            :attachments="form.attachments"
            label="Aggiungi una foto"
            @change="(list) => (form.attachments = list)"
          />
        </div>

        <p v-if="formError" class="error-text">{{ formError }}</p>
      </form>

      <template #footer>
        <button type="button" class="btn btn-ghost" @click="modalOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" /> Aggiungi pianta
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.plant-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.plant-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  display: flex;
  flex-direction: column;
}
.plant-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lift);
  border-color: var(--line-strong);
}
.plant-media {
  position: relative;
  aspect-ratio: 16 / 10;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.plant-media.empty {
  background: linear-gradient(150deg, #eef1e4 0%, #f8f9f1 70%);
}
.plant-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  inset: 0;
  transition: transform 0.5s ease;
}
.plant-card:hover .plant-media img {
  transform: scale(1.035);
}
.plant-glyph {
  font-size: 54px;
  opacity: 0.9;
}
.plant-alert {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--gold-soft);
  color: #8a6125;
  padding: 4px 7px;
  border-radius: 6px;
  backdrop-filter: blur(6px);
}
.plant-body {
  padding: 15px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
}
.plant-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.plant-head h2 {
  font-size: 20px;
  line-height: 1.15;
}
.plant-species {
  font-size: 11.5px;
  color: var(--muted);
  font-style: italic;
  margin-top: 2px;
}
.plant-location {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--muted);
}
.next-task {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.task-emoji {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  border-radius: 8px;
  font-size: 14px;
  flex: none;
}
.task-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.task-text strong {
  font-size: 12.5px;
  font-weight: 600;
}
.task-text small {
  font-size: 11px;
  color: var(--muted);
}
.next-task.due .task-text small {
  color: var(--primary-dark);
  font-weight: 600;
}
.task-btn {
  flex: none;
}
.skeleton {
  pointer-events: none;
}
.task-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.task-option:first-of-type {
  border-top: 0;
}
.task-option-text {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.task-option-text strong {
  font-size: 13.5px;
  font-weight: 600;
}
.task-option-text small {
  font-size: 11.5px;
  color: var(--muted);
}
.interval-select {
  width: 150px;
  flex: none;
}
@media (max-width: 960px) {
  .plant-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .plant-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .plant-media {
    aspect-ratio: 16 / 9;
  }
  .interval-select {
    width: 132px;
  }
}
</style>
