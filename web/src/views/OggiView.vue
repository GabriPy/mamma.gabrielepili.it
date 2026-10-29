<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useUiStore } from '@/stores/ui.js';
import { capitalize, formatDate, formatLongDate, formatTime, greeting, relativeDay, todayString } from '@/utils/format.js';
import { PLANT_TYPES } from '@/utils/constants.js';
import PageHeader from '@/components/PageHeader.vue';
import Icon from '@/components/Icon.vue';
import EmptyState from '@/components/EmptyState.vue';

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();

const data = ref(null);
const recipes = ref([]);
const loading = ref(true);
const busyKey = ref('');
const quickItem = ref('');
const addingItem = ref(false);
const quickInput = ref(null);

const CAT_COLORS = {
  Casa: '#C0553A',
  Famiglia: '#6F7F57',
  Salute: '#A85B6B',
  Lavoro: '#4C7E8C',
  Scuola: '#B8833A',
  Altro: '#8B7B67',
};

const today = computed(() => data.value?.today || todayString());
const firstName = computed(() => (auth.user?.name || '').split(' ')[0]);

const subtitle = computed(() => {
  if (!data.value) return '';
  const parts = [];
  const events = data.value.events.today.length;
  const deadlines = data.value.deadlines.today + data.value.deadlines.overdue;
  const plants = data.value.plants.count;
  if (events) parts.push(`${events} ${events === 1 ? 'appuntamento' : 'appuntamenti'}`);
  if (deadlines) parts.push(`${deadlines} ${deadlines === 1 ? 'scadenza' : 'scadenze'} da tenere d’occhio`);
  if (plants) parts.push(`${plants} ${plants === 1 ? 'pianta' : 'piante'} da curare`);
  if (!parts.length) return 'Nessun impegno urgente: prenditi il tuo tempo.';
  return `Oggi in casa: ${parts.join(', ')}.`;
});

const recipeOfDay = computed(() => {
  if (!recipes.value.length) return null;
  const day = Number(today.value.replaceAll('-', '')) || 0;
  return recipes.value[day % recipes.value.length];
});

const shoppingProgress = computed(() => {
  if (!data.value?.shopping) return 0;
  const total = data.value.shopping.pending + (data.value.shopping.done || 0);
  if (!total) return 0;
  return Math.round(((data.value.shopping.done || 0) / total) * 100);
});

async function load() {
  loading.value = true;
  try {
    const [dashboard, recipeData] = await Promise.all([
      api('/api/dashboard'),
      api('/api/recipes').catch(() => ({ recipes: [] })),
    ]);
    data.value = dashboard;
    recipes.value = recipeData.recipes || [];
  } catch (err) {
    ui.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function completeDeadline(deadline) {
  busyKey.value = `deadline-${deadline.id}`;
  try {
    const result = await api(`/api/deadlines/${deadline.id}/complete`, { method: 'POST', body: { done: true } });
    if (result.repeated) {
      ui.success(`Fatto! Prossima scadenza: ${formatDate(result.deadline.dueDate, { short: true })}.`);
    } else {
      ui.success('Scadenza completata.');
    }
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyKey.value = '';
  }
}

async function markTaken(item) {
  busyKey.value = `item-${item.id}`;
  try {
    await api(`/api/shopping/items/${item.id}`, { method: 'PATCH', body: { done: true } });
    ui.success(`Preso: ${item.name}.`);
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyKey.value = '';
  }
}

async function addQuickItem() {
  const name = quickItem.value.trim();
  if (!name || !data.value?.shopping.list) return;
  addingItem.value = true;
  try {
    await api(`/api/shopping/lists/${data.value.shopping.list.id}/items`, {
      method: 'POST',
      body: { name },
    });
    quickItem.value = '';
    ui.success('Aggiunto alla spesa.');
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    addingItem.value = false;
  }
}

async function donePlant(task) {
  busyKey.value = `plant-${task.id}`;
  try {
    await api(`/api/plants/${task.plantId}/tasks/${task.id}/done`, { method: 'POST', body: {} });
    ui.success(`${PLANT_TYPES[task.type]?.done || 'Fatto'}: ${task.plantName}.`);
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyKey.value = '';
  }
}

async function recipeToShopping(recipe) {
  busyKey.value = `recipe-${recipe.id}`;
  try {
    const result = await api(`/api/recipes/${recipe.id}/to-shopping`, { method: 'POST', body: {} });
    ui.success(
      result.added.length
        ? `${result.added.length} ingredienti aggiunti alla spesa.`
        : 'Gli ingredienti erano già in lista.',
    );
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyKey.value = '';
  }
}

function openDay() {
  router.push({ path: '/calendario', query: { giorno: today.value } });
}

onMounted(load);
</script>

<template>
  <div class="page-stack">
    <PageHeader
      :eyebrow="capitalize(formatLongDate(today))"
      :title="`${greeting()}, ${firstName}`"
      :subtitle="subtitle"
    >
      <template #actions>
        <button type="button" class="btn btn-ghost" @click="router.push({ path: '/calendario', query: { nuovo: '1' } })">
          <Icon name="calendar" :size="17" /> Nuovo evento
        </button>
        <button type="button" class="btn btn-primary" @click="router.push({ path: '/scadenze', query: { nuovo: '1' } })">
          <Icon name="plus" :size="17" /> Nuova scadenza
        </button>
      </template>
    </PageHeader>

    <div v-if="loading && !data" class="stat-grid">
      <div v-for="i in 4" :key="i" class="stat-card">
        <div class="shimmer" style="width: 34px; height: 34px; border-radius: 10px" />
        <div class="shimmer" style="width: 40px; height: 22px" />
        <div class="shimmer" style="width: 70%; height: 11px" />
      </div>
    </div>

    <template v-else-if="data">
      <div class="stat-grid">
        <RouterLink to="/spesa" class="stat-card">
          <div class="stat-top">
            <span class="stat-icon primary"><Icon name="basket" :size="18" /></span>
            <Icon name="arrow-right" :size="16" class="muted" />
          </div>
          <span class="stat-value">{{ data.counts.shoppingPending }}</span>
          <span class="stat-label">cose da comprare</span>
        </RouterLink>
        <RouterLink to="/scadenze" class="stat-card">
          <div class="stat-top">
            <span class="stat-icon gold"><Icon name="clock" :size="18" /></span>
            <Icon name="arrow-right" :size="16" class="muted" />
          </div>
          <span class="stat-value">{{ data.counts.deadlinesOpen }}</span>
          <span class="stat-label">scadenze aperte</span>
        </RouterLink>
        <RouterLink to="/piante" class="stat-card">
          <div class="stat-top">
            <span class="stat-icon"><Icon name="leaf" :size="18" /></span>
            <Icon name="arrow-right" :size="16" class="muted" />
          </div>
          <span class="stat-value">{{ data.plants.count }}</span>
          <span class="stat-label">piante da curare</span>
        </RouterLink>
        <RouterLink to="/ricette" class="stat-card">
          <div class="stat-top">
            <span class="stat-icon rose"><Icon name="book" :size="18" /></span>
            <Icon name="arrow-right" :size="16" class="muted" />
          </div>
          <span class="stat-value">{{ data.counts.recipes }}</span>
          <span class="stat-label">ricette in casa</span>
        </RouterLink>
      </div>

      <div class="split">
        <div class="page-stack">
          <section class="card">
            <header class="card-head">
              <div>
                <p class="eyebrow">Agenda</p>
                <h2>Oggi</h2>
              </div>
              <RouterLink :to="{ path: '/calendario', query: { giorno: today } }" class="card-action">
                Apri il calendario <Icon name="arrow-right" :size="14" />
              </RouterLink>
            </header>

            <div v-if="data.events.today.length" class="agenda">
              <button
                v-for="event in data.events.today"
                :key="event.occurrenceKey"
                type="button"
                class="agenda-item"
                @click="openDay"
              >
                <span class="agenda-time">{{ event.allDay ? 'Tutto il giorno' : formatTime(event.startsAt) }}</span>
                <span class="agenda-bar" :style="{ background: CAT_COLORS[event.category] || '#8B7B67' }" />
                <span class="agenda-body">
                  <span class="agenda-title">{{ event.title }}</span>
                  <span class="agenda-sub">
                    <span class="category-chip">
                      <span class="cat-dot" :style="{ background: CAT_COLORS[event.category] || '#8B7B67' }" />
                      {{ event.category }}
                    </span>
                    <template v-if="event.location"> · {{ event.location }}</template>
                  </span>
                </span>
                <Icon name="chevron-right" :size="16" class="muted" />
              </button>
            </div>
            <EmptyState
              v-else
              icon="sun"
              title="Nessun appuntamento oggi"
              text="La giornata è libera. Puoi aggiungere un evento o goderti la calma."
              tone="gold"
            >
              <button type="button" class="btn btn-ghost btn-sm" @click="router.push({ path: '/calendario', query: { nuovo: '1' } })">
                <Icon name="plus" :size="15" /> Aggiungi evento
              </button>
            </EmptyState>

            <template v-if="data.events.upcoming.length">
              <hr class="divider" />
              <p class="eyebrow" style="margin-bottom: 8px">Prossimi giorni</p>
              <div class="list">
                <button
                  v-for="event in data.events.upcoming.slice(0, 3)"
                  :key="event.occurrenceKey"
                  type="button"
                  class="list-item upcoming-row"
                  @click="router.push({ path: '/calendario', query: { giorno: event.startsAt.slice(0, 10) } })"
                >
                  <span class="date-chip">
                    <strong>{{ formatDate(event.startsAt.slice(0, 10), { short: true }).split(' ')[0] }}</strong>
                    <span>{{ formatDate(event.startsAt.slice(0, 10), { short: true }).split(' ')[1] }}</span>
                  </span>
                  <span class="list-main">
                    <span class="list-title">{{ event.title }}</span>
                    <span class="list-sub">
                      {{ relativeDay(event.startsAt.slice(0, 10)) }}<template v-if="!event.allDay"> · {{ formatTime(event.startsAt) }}</template>
                    </span>
                  </span>
                  <Icon name="chevron-right" :size="16" class="muted" />
                </button>
              </div>
            </template>
          </section>

          <section class="card">
            <header class="card-head">
              <div>
                <p class="eyebrow">Da non dimenticare</p>
                <h2>Scadenze in arrivo</h2>
              </div>
              <RouterLink to="/scadenze" class="card-action">
                Tutte <Icon name="arrow-right" :size="14" />
              </RouterLink>
            </header>

            <div v-if="data.deadlines.items.length" class="list">
              <div v-for="deadline in data.deadlines.items" :key="deadline.id" class="list-item">
                <button
                  type="button"
                  class="check-btn"
                  :class="{ done: deadline.status === 'done' }"
                  :disabled="busyKey === `deadline-${deadline.id}`"
                  :aria-label="`Segna come fatta: ${deadline.title}`"
                  @click="completeDeadline(deadline)"
                >
                  <Icon name="check" :size="13" />
                </button>
                <button type="button" class="list-main deadline-link" @click="router.push({ path: '/scadenze', query: { scadenza: deadline.id } })">
                  <span class="list-title">
                    {{ deadline.title }}
                    <span v-if="deadline.visibility === 'private'" class="badge badge-private"><Icon name="lock" :size="10" /> privata</span>
                  </span>
                  <span class="list-sub">
                    {{ formatDate(deadline.dueDate, { short: true }) }}
                    <template v-if="deadline.category"> · {{ deadline.category }}</template>
                  </span>
                </button>
                <span
                  class="due"
                  :class="deadline.daysLeft < 0 ? 'due-late' : deadline.daysLeft === 0 ? 'due-today' : deadline.daysLeft <= 7 ? 'due-soon' : 'due-ok'"
                >
                  {{ deadline.daysLeft < 0 ? `${Math.abs(deadline.daysLeft)}g fa` : deadline.daysLeft === 0 ? 'oggi' : deadline.daysLeft === 1 ? 'domani' : `fra ${deadline.daysLeft}g` }}
                </span>
              </div>
            </div>
            <EmptyState v-else icon="shield" title="Tutto sotto controllo" text="Nessuna scadenza aperta. Un buon momento per aggiungerne una." tone="sage">
              <button type="button" class="btn btn-ghost btn-sm" @click="router.push({ path: '/scadenze', query: { nuovo: '1' } })">
                <Icon name="plus" :size="15" /> Aggiungi scadenza
              </button>
            </EmptyState>
          </section>
        </div>

        <div class="page-stack">
          <section class="card card-terracotta shopping-card">
            <header class="card-head">
              <div>
                <p class="eyebrow">Spesa di casa</p>
                <h2>{{ data.shopping.list?.name || 'Lista della spesa' }}</h2>
              </div>
              <RouterLink to="/spesa" class="card-action">
                Apri <Icon name="arrow-right" :size="14" />
              </RouterLink>
            </header>

            <div class="shopping-progress">
              <div class="progress"><div class="progress-bar" :style="{ width: `${shoppingProgress}%` }" /></div>
              <span class="tiny muted">{{ data.shopping.pending }} da comprare</span>
            </div>

            <div v-if="data.shopping.preview.length" class="shopping-preview">
              <button
                v-for="item in data.shopping.preview"
                :key="item.id"
                type="button"
                class="preview-item"
                :disabled="busyKey === `item-${item.id}`"
                @click="markTaken(item)"
              >
                <span class="check-btn"><Icon name="check" :size="12" /></span>
                <span class="preview-name">{{ item.name }}</span>
                <span v-if="item.quantity" class="preview-qty">{{ item.quantity }} {{ item.unit }}</span>
              </button>
            </div>
            <p v-else class="tiny muted" style="margin: 12px 0">La lista è vuota: che bello.</p>

            <form class="quick-add-item" @submit.prevent="addQuickItem">
              <input
                ref="quickInput"
                v-model="quickItem"
                class="input input-sm"
                type="text"
                placeholder="Aggiungi qualcosa…"
                aria-label="Aggiungi alla spesa"
                maxlength="120"
              />
              <button type="submit" class="add-btn" :disabled="!quickItem.trim() || addingItem" aria-label="Aggiungi">
                <span v-if="addingItem" class="spinner" />
                <Icon v-else name="plus" :size="18" />
              </button>
            </form>
          </section>

          <section class="card card-sage">
            <header class="card-head">
              <div>
                <p class="eyebrow">Verde di casa</p>
                <h2>Piante</h2>
              </div>
              <RouterLink to="/piante" class="card-action">
                Tutte <Icon name="arrow-right" :size="14" />
              </RouterLink>
            </header>

            <div v-if="data.plants.due.length" class="plant-list">
              <div v-for="task in data.plants.due" :key="task.id" class="plant-due">
                <span class="plant-emoji">{{ PLANT_TYPES[task.type]?.emoji || '🌿' }}</span>
                <div class="plant-text">
                  <strong>{{ task.plantName }}</strong>
                  <span>{{ PLANT_TYPES[task.type]?.label || 'Cura' }} · {{ task.dueInDays < 0 ? `${Math.abs(task.dueInDays)}g fa` : task.dueInDays === 0 ? 'oggi' : `fra ${task.dueInDays}g` }}</span>
                </div>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :disabled="busyKey === `plant-${task.id}`"
                  @click="donePlant(task)"
                >
                  Fatto
                </button>
              </div>
            </div>
            <p v-else class="tiny muted" style="margin: 8px 0">Tutte le piante sono in ordine.</p>

            <RouterLink to="/piante" class="plant-link">
              <Icon name="leaf" :size="15" /> Vai al diario delle piante
            </RouterLink>
          </section>

          <section v-if="recipeOfDay" class="card card-gold recipe-suggestion">
            <p class="eyebrow">Dalla cucina</p>
            <h2>{{ recipeOfDay.title }}</h2>
            <p class="recipe-desc">{{ recipeOfDay.description || 'Una ricetta di casa da riscoprire.' }}</p>
            <div class="row row-wrap recipe-meta">
              <span class="badge badge-gold">{{ recipeOfDay.category }}</span>
              <span v-if="recipeOfDay.prepMinutes" class="tiny muted"><Icon name="clock" :size="12" /> {{ recipeOfDay.prepMinutes }} min</span>
              <span v-if="recipeOfDay.servings" class="tiny muted"><Icon name="users" :size="12" /> {{ recipeOfDay.servings }} porzioni</span>
            </div>
            <div class="row recipe-actions">
              <RouterLink :to="`/ricette/${recipeOfDay.id}`" class="btn btn-ghost btn-sm">Apri ricetta</RouterLink>
              <button type="button" class="btn btn-soft btn-sm" :disabled="busyKey === `recipe-${recipeOfDay.id}`" @click="recipeToShopping(recipeOfDay)">
                <Icon name="basket" :size="14" /> Alla spesa
              </button>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.agenda {
  display: flex;
  flex-direction: column;
}
.agenda-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 6px 10px 0;
  border: 0;
  border-top: 1px solid var(--line);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink);
  border-radius: 8px;
}
.agenda-item:first-child {
  border-top: 0;
}
.agenda-item:hover {
  background: var(--surface-2);
}
.agenda-time {
  width: 68px;
  flex: none;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--primary-dark);
  letter-spacing: 0.01em;
}
.agenda-bar {
  width: 3px;
  height: 30px;
  border-radius: 3px;
  flex: none;
}
.agenda-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.agenda-title {
  font-size: 14.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agenda-sub {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  flex-wrap: wrap;
}
.cat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.upcoming-row {
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink);
  width: 100%;
  border-radius: 8px;
}
.upcoming-row:hover {
  background: var(--surface-2);
}
.date-chip {
  width: 42px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  flex: none;
  line-height: 1;
}
.date-chip strong {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
}
.date-chip span {
  font-size: 9.5px;
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 3px;
  letter-spacing: 0.06em;
}
.deadline-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink);
  display: flex;
  flex-direction: column;
  padding: 0;
}
.shopping-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.shopping-preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;
}
.preview-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink);
  border-radius: 8px;
}
.preview-item:hover {
  background: rgba(255, 253, 249, 0.7);
}
.preview-item .check-btn {
  width: 21px;
  height: 21px;
}
.preview-name {
  font-size: 13.5px;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-qty {
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
}
.quick-add-item {
  display: flex;
  gap: 8px;
  align-items: center;
}
.quick-add-item .input {
  background: rgba(255, 253, 249, 0.85);
}
.add-btn {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 10px;
  border: 0;
  background: var(--primary);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.add-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.add-btn:not(:disabled):hover {
  background: var(--primary-dark);
}
.plant-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.plant-due {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-top: 1px solid rgba(111, 127, 87, 0.16);
}
.plant-due:first-child {
  border-top: 0;
}
.plant-emoji {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: rgba(255, 253, 249, 0.7);
  font-size: 16px;
  flex: none;
}
.plant-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.plant-text strong {
  font-size: 13.5px;
  font-weight: 600;
}
.plant-text span {
  font-size: 11.5px;
  color: var(--muted);
}
.plant-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sage-dark);
  text-decoration: none;
}
.plant-link:hover {
  text-decoration: underline;
}
.recipe-suggestion h2 {
  font-size: 23px;
  margin: 8px 0 6px;
}
.recipe-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.recipe-meta {
  margin-top: 12px;
  gap: 10px;
}
.recipe-meta .tiny {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.recipe-actions {
  margin-top: 16px;
  gap: 8px;
}
.recipe-actions .btn {
  flex: 1;
}
@media (max-width: 720px) {
  .shopping-card {
    order: -1;
  }
}
</style>
