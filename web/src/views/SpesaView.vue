<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useUiStore } from '@/stores/ui.js';
import { SHOPPING_CATEGORIES, UNITS, categoryEmoji } from '@/utils/constants.js';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icon from '@/components/Icon.vue';

const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const lists = ref([]);
const list = ref(null);
const items = ref([]);
const loading = ref(true);
const adding = ref(false);
const busyId = ref('');
const showDetails = ref(false);
const nameInput = ref(null);

const form = reactive({ name: '', quantity: '', unit: '', category: 'Altro' });
const editing = ref(null);
const editForm = reactive({ name: '', quantity: '', unit: '', category: 'Altro', note: '' });
const newListOpen = ref(false);
const newList = reactive({ name: '', emoji: '🛒' });
const listMenuOpen = ref(false);
const renameOpen = ref(false);
const renameValue = ref('');

const pending = computed(() => items.value.filter((i) => !i.done));
const doneItems = computed(() => items.value.filter((i) => i.done));
const progress = computed(() => {
  const total = items.value.length;
  if (!total) return 0;
  return Math.round((doneItems.value.length / total) * 100);
});
const grouped = computed(() => {
  const order = SHOPPING_CATEGORIES.map((c) => c.value);
  const map = new Map();
  for (const item of pending.value) {
    const key = item.category || 'Altro';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([category, group]) => ({ category, items: group }));
});
const activeListId = computed(() => list.value?.id || null);
const editFormVisible = computed({
  get: () => Boolean(editing.value),
  set: (value) => {
    if (!value) editing.value = null;
  },
});

async function loadLists() {
  const data = await api('/api/shopping/lists');
  lists.value = data.lists;
  if (!lists.value.length) {
    list.value = null;
    return;
  }
  const wanted = Number(route.query.lista);
  const next = lists.value.find((l) => l.id === wanted) || lists.value.find((l) => l.id === list.value?.id) || lists.value.find((l) => l.isDefault) || lists.value[0];
  list.value = next;
  await loadItems();
}

async function loadItems() {
  if (!list.value) {
    items.value = [];
    return;
  }
  const data = await api(`/api/shopping/lists/${list.value.id}/items`);
  items.value = data.items;
  list.value = { ...list.value, ...data.list };
}

async function refresh() {
  await loadLists();
}

async function selectList(id) {
  const found = lists.value.find((l) => l.id === id);
  if (!found) return;
  list.value = found;
  router.replace({ query: { ...route.query, lista: String(id) } });
  await loadItems();
}

async function addItem() {
  const name = form.name.trim();
  if (!name || !activeListId.value || adding.value) return;
  adding.value = true;
  try {
    const result = await api(`/api/shopping/lists/${activeListId.value}/items`, {
      method: 'POST',
      body: {
        name,
        quantity: form.quantity.trim() || null,
        unit: form.unit || null,
        category: form.category,
      },
    });
    form.name = '';
    form.quantity = '';
    form.unit = '';
    if (result.merged) ui.info('Era già in lista: aggiornata la quantità.');
    else ui.success('Aggiunto alla spesa.');
    await refresh();
    await nextTick();
    nameInput.value?.focus();
  } catch (err) {
    ui.error(err.message);
  } finally {
    adding.value = false;
  }
}

async function toggle(item) {
  busyId.value = item.id;
  try {
    await api(`/api/shopping/items/${item.id}`, { method: 'PATCH', body: { done: !item.done } });
    item.done = !item.done;
    item.doneAt = item.done ? new Date().toISOString() : null;
    if (item.done) ui.toast(`Preso: ${item.name}.`, 'success', 1800);
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyId.value = '';
  }
}

function openEdit(item) {
  editing.value = item;
  Object.assign(editForm, {
    name: item.name,
    quantity: item.quantity || '',
    unit: item.unit || '',
    category: item.category || 'Altro',
    note: item.note || '',
  });
}

async function saveEdit() {
  if (!editForm.name.trim()) return;
  busyId.value = editing.value.id;
  try {
    await api(`/api/shopping/items/${editing.value.id}`, {
      method: 'PATCH',
      body: {
        name: editForm.name.trim(),
        quantity: editForm.quantity.trim() || null,
        unit: editForm.unit || null,
        category: editForm.category,
        note: editForm.note.trim() || null,
      },
    });
    editing.value = null;
    ui.success('Prodotto aggiornato.');
    await loadItems();
  } catch (err) {
    ui.error(err.message);
  } finally {
    busyId.value = '';
  }
}

async function removeItem(item) {
  const ok = await ui.confirm({
    title: 'Togliere dalla lista?',
    message: `“${item.name}” verrà rimosso dalla spesa.`,
    confirmLabel: 'Rimuovi',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/shopping/items/${item.id}`, { method: 'DELETE' });
    items.value = items.value.filter((i) => i.id !== item.id);
    ui.success('Rimosso dalla lista.');
  } catch (err) {
    ui.error(err.message);
  }
}

async function clearDone() {
  const ok = await ui.confirm({
    title: 'Svuotare i completati?',
    message: `Verranno eliminati ${doneItems.value.length} prodotti già presi.`,
    confirmLabel: 'Svuota',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/shopping/lists/${activeListId.value}/clear-done`, { method: 'POST' });
    ui.success('Lista ripulita.');
    await refresh();
  } catch (err) {
    ui.error(err.message);
  }
}

function openNewList() {
  newList.name = '';
  newList.emoji = '🛒';
  newListOpen.value = true;
}

async function createList() {
  if (!newList.name.trim()) return;
  try {
    const data = await api('/api/shopping/lists', {
      method: 'POST',
      body: { name: newList.name.trim(), emoji: newList.emoji || '🛒' },
    });
    newListOpen.value = false;
    await loadLists();
    await selectList(data.list.id);
    ui.success('Lista creata.');
  } catch (err) {
    ui.error(err.message);
  }
}

async function renameList() {
  if (!renameValue.value.trim()) return;
  try {
    await api(`/api/shopping/lists/${activeListId.value}`, {
      method: 'PATCH',
      body: { name: renameValue.value.trim() },
    });
    renameOpen.value = false;
    ui.success('Lista rinominata.');
    await refresh();
  } catch (err) {
    ui.error(err.message);
  }
}

async function deleteList() {
  const ok = await ui.confirm({
    title: 'Eliminare questa lista?',
    message: `“${list.value.name}” e tutti i suoi prodotti verranno eliminati.`,
    confirmLabel: 'Elimina',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/shopping/lists/${activeListId.value}`, { method: 'DELETE' });
    list.value = null;
    ui.success('Lista eliminata.');
    await loadLists();
  } catch (err) {
    ui.error(err.message);
  }
}

watch(
  () => route.query.lista,
  (value) => {
    const id = Number(value);
    if (id && lists.value.some((l) => l.id === id) && id !== activeListId.value) selectList(id);
  },
);

watch(
  () => route.query.nuovo,
  async (value) => {
    if (value === '1') {
      await nextTick();
      nameInput.value?.focus();
    }
  },
);

onMounted(async () => {
  try {
    await loadLists();
  } catch (err) {
    ui.error(err.message);
  } finally {
    loading.value = false;
  }
  if (route.query.nuovo === '1') {
    await nextTick();
    nameInput.value?.focus();
  }
});
</script>

<template>
  <div class="page-stack shopping-page">
    <PageHeader
      eyebrow="Casa"
      title="Lista della spesa"
      :subtitle="list ? `${pending.length} da comprare · ${doneItems.length} già presi` : 'Una lista condivisa, sempre aggiornata.'"
    >
      <template #actions>
        <button type="button" class="btn btn-ghost" @click="openNewList">
          <Icon name="plus" :size="16" /> Nuova lista
        </button>
        <button v-if="doneItems.length" type="button" class="btn btn-primary" @click="clearDone">
          <Icon name="check" :size="16" /> Svuota completati
        </button>
      </template>
    </PageHeader>

    <div v-if="loading" class="loading-line"><span class="spinner" /> Preparo la lista…</div>

    <template v-else-if="list">
      <div class="list-switcher">
        <button
          v-for="l in lists"
          :key="l.id"
          type="button"
          class="list-pill"
          :class="{ active: l.id === activeListId }"
          @click="selectList(l.id)"
        >
          <span class="list-pill-emoji">{{ l.emoji }}</span>
          <span class="list-pill-name">{{ l.name }}</span>
          <span class="list-pill-count">{{ l.pending }}</span>
        </button>
        <button type="button" class="list-pill list-pill-options" aria-label="Opzioni lista" @click="listMenuOpen = true">
          <Icon name="more" :size="18" />
        </button>
      </div>

      <section class="card add-card">
        <form class="add-form" @submit.prevent="addItem">
          <div class="add-main">
            <span class="add-icon"><Icon name="basket" :size="18" /></span>
            <input
              ref="nameInput"
              v-model="form.name"
              class="add-input"
              type="text"
              placeholder="Cosa manca in casa?"
              aria-label="Nome del prodotto"
              maxlength="120"
              autocomplete="off"
            />
            <button type="submit" class="btn btn-primary add-submit" :disabled="!form.name.trim() || adding">
              <span v-if="adding" class="spinner" />
              <template v-else><Icon name="plus" :size="17" /><span class="add-submit-label">Aggiungi</span></template>
            </button>
          </div>
          <div class="add-extra">
            <button type="button" class="add-details-toggle" @click="showDetails = !showDetails">
              <Icon :name="showDetails ? 'chevron-down' : 'chevron-right'" :size="13" />
              Quantità, reparto e note
            </button>
            <div v-if="showDetails" class="add-details">
              <div class="input-row">
                <input v-model="form.quantity" class="input input-sm" type="text" placeholder="Quantità" maxlength="20" aria-label="Quantità" style="flex: 1" />
                <select v-model="form.unit" class="select input-sm" aria-label="Unità">
                  <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit || '—' }}</option>
                </select>
              </div>
              <div class="category-picker">
                <button
                  v-for="cat in SHOPPING_CATEGORIES"
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
          </div>
        </form>
        <div v-if="items.length" class="add-progress">
          <div class="progress"><div class="progress-bar" :style="{ width: `${progress}%` }" /></div>
          <span class="tiny muted">{{ progress }}% della spesa è pronta</span>
        </div>
      </section>

      <section v-if="pending.length" class="card card-flush">
        <div v-for="group in grouped" :key="group.category" class="category-group">
          <header class="group-head">
            <span class="group-emoji">{{ categoryEmoji(group.category, SHOPPING_CATEGORIES) }}</span>
            <h3>{{ group.category }}</h3>
            <span class="group-count">{{ group.items.length }}</span>
          </header>
          <div class="shopping-list">
            <div v-for="item in group.items" :key="item.id" class="shopping-row">
              <button
                type="button"
                class="check-btn"
                :disabled="busyId === item.id"
                :aria-label="`Segna come preso: ${item.name}`"
                @click="toggle(item)"
              >
                <Icon name="check" :size="13" />
              </button>
              <button type="button" class="shopping-main" @click="openEdit(item)">
                <span class="shopping-name">{{ item.name }}</span>
                <span v-if="item.quantity || item.note" class="shopping-note">
                  <template v-if="item.quantity">{{ item.quantity }} {{ item.unit }}</template>
                  <template v-if="item.note"><template v-if="item.quantity"> · </template>{{ item.note }}</template>
                </span>
              </button>
              <span v-if="item.createdBy" class="tiny muted shopping-by">{{ item.createdBy.name }}</span>
              <button type="button" class="btn-icon row-delete" aria-label="Rimuovi" @click="removeItem(item)">
                <Icon name="trash" :size="16" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <EmptyState
        v-else-if="!items.length"
        icon="basket"
        title="La lista è vuota"
        text="Scrivi qui sopra la prima cosa che manca: ci pensiamo noi a tenerla in ordine."
        tone="sage"
      />

      <section v-if="doneItems.length" class="card done-card">
        <header class="card-head">
          <div>
            <p class="eyebrow">Nel carrello</p>
            <h2>Già presi <span class="done-count">{{ doneItems.length }}</span></h2>
          </div>
          <button type="button" class="card-action" @click="clearDone">Svuota</button>
        </header>
        <div class="done-list">
          <div v-for="item in doneItems" :key="item.id" class="shopping-row done">
            <button type="button" class="check-btn done" :aria-label="`Rimetti in lista: ${item.name}`" @click="toggle(item)">
              <Icon name="check" :size="13" />
            </button>
            <button type="button" class="shopping-main" @click="openEdit(item)">
              <span class="shopping-name line-through">{{ item.name }}</span>
              <span v-if="item.quantity" class="shopping-note">{{ item.quantity }} {{ item.unit }}</span>
            </button>
            <button type="button" class="btn-icon row-delete" aria-label="Rimuovi" @click="removeItem(item)">
              <Icon name="trash" :size="16" />
            </button>
          </div>
        </div>
      </section>
    </template>

    <EmptyState v-else icon="basket" title="Nessuna lista" text="Crea la prima lista della spesa per iniziare." tone="sage">
      <button type="button" class="btn btn-primary" @click="openNewList">Crea una lista</button>
    </EmptyState>

    <BaseModal v-model="editFormVisible" title="Modifica prodotto" subtitle="Sistemiamo quantità e reparto." size="sm">
      <div class="stack">
        <div class="field">
          <label for="edit-name">Prodotto</label>
          <input id="edit-name" v-model="editForm.name" class="input" maxlength="120" />
        </div>
        <div class="input-row">
          <div class="field" style="flex: 1">
            <label for="edit-qty">Quantità</label>
            <input id="edit-qty" v-model="editForm.quantity" class="input" placeholder="es. 500" maxlength="20" />
          </div>
          <div class="field" style="width: 100px">
            <label for="edit-unit">Unità</label>
            <select id="edit-unit" v-model="editForm.unit" class="select">
              <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit || '—' }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="edit-cat">Reparto</label>
          <select id="edit-cat" v-model="editForm.category" class="select">
            <option v-for="cat in SHOPPING_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.emoji }} {{ cat.value }}</option>
          </select>
        </div>
        <div class="field">
          <label for="edit-note">Nota <span class="optional">(facoltativa)</span></label>
          <input id="edit-note" v-model="editForm.note" class="input" maxlength="300" placeholder="es. senza lattosio" />
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="editing = null">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="!editForm.name.trim()" @click="saveEdit">Salva</button>
      </template>
    </BaseModal>

    <BaseModal v-model="newListOpen" title="Nuova lista" subtitle="Per la spesa settimanale, per una festa, per il mare." size="sm">
      <div class="stack">
        <div class="field">
          <label for="new-list-name">Nome</label>
          <input id="new-list-name" v-model="newList.name" class="input" placeholder="es. Spesa della settimana" maxlength="60" @keyup.enter="createList" />
        </div>
        <div class="field">
          <label>Icona</label>
          <div class="emoji-row">
            <button v-for="emoji in ['🛒', '🥕', '🍕', '🏖️', '🎉', '🧺']" :key="emoji" type="button" class="emoji-btn" :class="{ active: newList.emoji === emoji }" @click="newList.emoji = emoji">
              {{ emoji }}
            </button>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="newListOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="!newList.name.trim()" @click="createList">Crea lista</button>
      </template>
    </BaseModal>

    <BaseModal v-model="listMenuOpen" :title="list?.name || 'Lista'" subtitle="Gestisci questa lista." size="sm">
      <div class="list-menu">
        <button type="button" class="menu-action" @click="listMenuOpen = false; renameValue = list?.name || ''; renameOpen = true">
          <Icon name="edit" :size="18" /> Rinomina lista
        </button>
        <button type="button" class="menu-action danger" @click="listMenuOpen = false; deleteList()">
          <Icon name="trash" :size="18" /> Elimina lista
        </button>
      </div>
    </BaseModal>

    <BaseModal v-model="renameOpen" title="Rinomina lista" size="sm">
      <div class="field">
        <label for="rename-list">Nome</label>
        <input id="rename-list" v-model="renameValue" class="input" maxlength="60" @keyup.enter="renameList" />
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="renameOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="!renameValue.trim()" @click="renameList">Salva</button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.shopping-page {
  max-width: 900px;
}
.list-switcher {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}
.list-switcher::-webkit-scrollbar {
  display: none;
}
.list-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 38px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-soft);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex: none;
}
.list-pill.active {
  background: var(--primary-soft);
  border-color: rgba(192, 85, 58, 0.35);
  color: var(--primary-dark);
  font-weight: 600;
}
.list-pill-emoji {
  font-size: 14px;
}
.list-pill-count {
  font-size: 10.5px;
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: 99px;
  color: var(--muted);
}
.list-pill.active .list-pill-count {
  background: rgba(255, 253, 249, 0.8);
  color: var(--primary-dark);
}
.list-pill-options {
  padding: 0 10px;
  color: var(--muted);
}
.add-card {
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(150deg, #fffaf3 0%, #fffdf9 60%);
  border-color: var(--line);
}
.add-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.add-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: var(--primary);
  background: var(--primary-soft);
  border-radius: 10px;
  flex: none;
}
.add-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: 0;
  background: transparent;
  font-size: 15px;
  color: var(--ink);
  outline: none;
}
.add-input::placeholder {
  color: #b3a48f;
}
.add-submit {
  flex: none;
  border-radius: 11px;
}
.add-extra {
  padding-left: 46px;
}
.add-details-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px 0;
  cursor: pointer;
}
.add-details-toggle:hover {
  color: var(--ink-soft);
}
.add-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0 4px;
}
.category-picker {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.category-picker .chip {
  height: 29px;
  font-size: 11.5px;
  padding: 0 10px;
}
.add-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
}
.add-progress .progress {
  flex: 1;
}
.category-group {
  padding: 16px 18px 6px;
  border-top: 1px solid var(--line);
}
.category-group:first-child {
  border-top: 0;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 4px;
}
.group-head h3 {
  font-family: var(--font-sans);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.group-emoji {
  font-size: 13px;
}
.group-count {
  font-size: 10px;
  color: var(--muted);
  background: var(--surface-2);
  border-radius: 99px;
  padding: 1px 6px;
}
.shopping-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 0;
}
.shopping-row + .shopping-row {
  border-top: 1px solid rgba(232, 221, 204, 0.65);
}
.shopping-main {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.shopping-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
}
.shopping-note {
  font-size: 11.5px;
  color: var(--muted);
}
.shopping-by {
  display: none;
}
.shopping-row:hover .shopping-by {
  display: inline;
}
.row-delete {
  color: var(--muted);
  opacity: 0;
}
.shopping-row:hover .row-delete {
  opacity: 1;
}
.done-card {
  background: var(--surface-2);
  box-shadow: none;
}
.done-count {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted);
  background: var(--surface-3);
  border-radius: 99px;
  padding: 2px 8px;
  margin-left: 4px;
  vertical-align: middle;
}
.done-list {
  display: flex;
  flex-direction: column;
}
.shopping-row.done .shopping-name {
  color: var(--muted);
}
.emoji-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.emoji-btn {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 19px;
  cursor: pointer;
}
.emoji-btn.active {
  border-color: var(--primary);
  background: var(--primary-soft);
}
.list-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.menu-action {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  font: inherit;
  font-size: 14px;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}
.menu-action:hover {
  background: var(--surface-2);
}
.menu-action.danger {
  color: var(--danger);
}
.menu-action.danger:hover {
  background: var(--danger-soft);
}
@media (max-width: 640px) {
  .add-submit-label {
    display: none;
  }
  .add-submit {
    width: 44px;
    padding: 0;
  }
  .add-extra {
    padding-left: 0;
  }
  .row-delete {
    opacity: 1;
  }
  .shopping-by {
    display: none !important;
  }
}
</style>
