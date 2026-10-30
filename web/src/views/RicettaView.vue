<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useMetaStore } from '@/stores/meta.js';
import { useUiStore } from '@/stores/ui.js';
import { RECIPE_CATEGORIES } from '@/utils/constants.js';
import BaseModal from '@/components/BaseModal.vue';
import AttachmentUploader from '@/components/AttachmentUploader.vue';
import EmptyState from '@/components/EmptyState.vue';
import Icon from '@/components/Icon.vue';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const ui = useUiStore();
const meta = useMetaStore();

const recipe = ref(null);
const loading = ref(true);
const editOpen = ref(false);
const saving = ref(false);
const busy = ref(false);
const formError = ref('');

const form = reactive({
  title: '',
  description: '',
  category: 'Primi',
  servings: 4,
  prepMinutes: '',
  notes: '',
  ingredients: [],
});

const CATEGORY_EMOJI = {
  Primi: '🍝',
  Secondi: '🍲',
  Contorni: '🥗',
  Dolci: '🍰',
  Colazioni: '🥐',
  Conserve: '🫙',
  Altro: '🍽️',
};

const heroImage = computed(() => recipe.value?.attachments?.find((a) => a.isImage) || null);

async function load() {
  loading.value = true;
  try {
    const data = await api(`/api/recipes/${props.id}`);
    recipe.value = data.recipe;
  } catch (err) {
    ui.error(err.message);
    if (err.status === 404) router.replace('/ricette');
  } finally {
    loading.value = false;
  }
}

function openEdit() {
  Object.assign(form, {
    title: recipe.value.title,
    description: recipe.value.description || '',
    category: recipe.value.category,
    servings: recipe.value.servings || 4,
    prepMinutes: recipe.value.prepMinutes ?? '',
    notes: recipe.value.notes || '',
    ingredients: recipe.value.ingredients.length
      ? recipe.value.ingredients.map((i) => ({ name: i.name, quantity: i.quantity || '', unit: i.unit || '' }))
      : [{ name: '', quantity: '', unit: '' }],
  });
  formError.value = '';
  editOpen.value = true;
}

function addIngredient() {
  form.ingredients.push({ name: '', quantity: '', unit: '' });
}

function removeIngredient(index) {
  if (form.ingredients.length === 1) return;
  form.ingredients.splice(index, 1);
}

async function save() {
  if (!form.title.trim()) {
    formError.value = 'Dai un nome alla ricetta.';
    return;
  }
  saving.value = true;
  try {
    await api(`/api/recipes/${props.id}`, {
      method: 'PATCH',
      body: {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        servings: form.servings || null,
        prepMinutes: form.prepMinutes === '' ? null : Number(form.prepMinutes),
        notes: form.notes.trim() || null,
        ingredients: form.ingredients
          .filter((i) => i.name.trim())
          .map((i) => ({ name: i.name.trim(), quantity: i.quantity.trim() || null, unit: i.unit || null })),
      },
    });
    editOpen.value = false;
    ui.success('Ricetta aggiornata.');
    await load();
  } catch (err) {
    formError.value = err.message;
    ui.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function toggleFavorite() {
  try {
    const data = await api(`/api/recipes/${props.id}/favorite`, { method: 'POST' });
    recipe.value.favorite = data.favorite;
  } catch (err) {
    ui.error(err.message);
  }
}

async function addToShopping() {
  busy.value = true;
  try {
    const result = await api(`/api/recipes/${props.id}/to-shopping`, { method: 'POST', body: {} });
    if (result.added.length) {
      ui.success(`${result.added.length} ingredienti aggiunti a “${result.list.name}”.`);
    } else {
      ui.info('Gli ingredienti erano già tutti in lista.');
    }
  } catch (err) {
    ui.error(err.message);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  const ok = await ui.confirm({
    title: 'Eliminare la ricetta?',
    message: `“${recipe.value.title}” e i suoi allegati verranno eliminati.`,
    confirmLabel: 'Elimina',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/recipes/${props.id}`, { method: 'DELETE' });
    ui.success('Ricetta eliminata.');
    router.push('/ricette');
  } catch (err) {
    ui.error(err.message);
  }
}

function onAttachments(list) {
  recipe.value.attachments = list;
}

function procedureLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^consiglio:/i.test(line));
}

const tipText = computed(() =>
  String(recipe.value?.notes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^consiglio:/i.test(line))
    .map((line) => line.replace(/^consiglio:\s*/i, ''))
    .join(' '),
);

onMounted(load);
</script>

<template>
  <div class="page-stack">
    <div class="detail-top">
      <RouterLink to="/ricette" class="back-link">
        <Icon name="arrow-left" :size="16" /> Ricettario
      </RouterLink>
      <div v-if="recipe" class="detail-actions">
        <button type="button" class="btn btn-ghost btn-sm" :class="{ 'fav-on': recipe.favorite }" @click="toggleFavorite">
          <Icon name="heart" :size="15" :filled="recipe.favorite" />
          {{ recipe.favorite ? 'Preferita' : 'Preferiti' }}
        </button>
        <button v-if="meta.aiEnabled" type="button" class="btn btn-ghost btn-sm" @click="ui.openGenerator(recipe)">
          <Icon name="sparkle" :size="15" /> Genera una simile
        </button>
        <button type="button" class="btn btn-ghost btn-sm" @click="openEdit">
          <Icon name="edit" :size="15" /> Modifica
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-line"><span class="spinner" /> Preparo la ricetta…</div>

    <template v-else-if="recipe">
      <section class="recipe-hero card card-flush">
        <div class="hero-media" :class="{ empty: !heroImage }">
          <img v-if="heroImage" :src="heroImage.url" :alt="recipe.title" />
          <span v-else class="hero-emoji">{{ CATEGORY_EMOJI[recipe.category] || '🍽️' }}</span>
          <button type="button" class="hero-fav" :class="{ on: recipe.favorite }" :aria-label="recipe.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'" @click="toggleFavorite">
            <Icon name="heart" :size="19" :filled="recipe.favorite" />
          </button>
        </div>
        <div class="hero-content">
          <p class="eyebrow">
            {{ recipe.category }}
            <span v-if="recipe.source === 'ai'" class="badge badge-rose hero-ai"><Icon name="sparkle" :size="10" /> generata con AI</span>
          </p>
          <h1>{{ recipe.title }}</h1>
          <p v-if="recipe.description" class="hero-desc">{{ recipe.description }}</p>

          <div class="hero-meta">
            <span v-if="recipe.servings" class="meta-box">
              <Icon name="users" :size="17" />
              <span><strong>{{ recipe.servings }}</strong><small>porzioni</small></span>
            </span>
            <span v-if="recipe.prepMinutes" class="meta-box">
              <Icon name="clock" :size="17" />
              <span><strong>{{ recipe.prepMinutes }}′</strong><small>tempo</small></span>
            </span>
            <span class="meta-box">
              <Icon name="list" :size="17" />
              <span><strong>{{ recipe.ingredients.length }}</strong><small>ingredienti</small></span>
            </span>
          </div>

          <div class="hero-actions">
            <button type="button" class="btn btn-primary" :disabled="busy" @click="addToShopping">
              <span v-if="busy" class="spinner" />
              <Icon v-else name="basket" :size="17" />
              Aggiungi ingredienti alla spesa
            </button>
            <RouterLink to="/spesa" class="btn btn-ghost">Vai alla spesa</RouterLink>
          </div>

          <p class="hero-by" v-if="recipe.createdBy">
            Ricetta di {{ recipe.createdBy.name }}
          </p>
        </div>
      </section>

      <div class="recipe-columns">
        <section class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">Ingredienti</p>
              <h2>Per {{ recipe.servings || '—' }} porzioni</h2>
            </div>
          </header>
          <ul v-if="recipe.ingredients.length" class="ing-list">
            <li v-for="ing in recipe.ingredients" :key="ing.id">
              <span class="ing-qty">
                <template v-if="ing.quantity">{{ ing.quantity }}</template>
                <template v-if="ing.unit"> {{ ing.unit }}</template>
              </span>
              <span class="ing-name">{{ ing.name }}</span>
            </li>
          </ul>
          <EmptyState v-else icon="list" title="Ingredienti da scrivere" text="Modifica la ricetta per aggiungerli." tone="sage" />
        </section>

        <section class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">In cucina</p>
              <h2>Procedimento</h2>
            </div>
          </header>
          <div v-if="procedureLines(recipe.notes).length" class="procedure">
            <p v-for="(line, index) in procedureLines(recipe.notes)" :key="index" class="step">
              <span class="step-num">{{ index + 1 }}</span>
              <span>{{ line.replace(/^\d+[.)]\s*/, '') }}</span>
            </p>
          </div>
          <p v-else class="muted small">Nessun procedimento ancora scritto.</p>
          <p v-if="tipText" class="recipe-tip"><Icon name="sparkle" :size="15" /> {{ tipText }}</p>
        </section>
      </div>

      <section class="card">
        <header class="card-head">
          <div>
            <p class="eyebrow">Album di cucina</p>
            <h2>Foto e allegati</h2>
          </div>
          <span class="muted small">{{ recipe.attachments.length }} elementi</span>
        </header>
        <AttachmentUploader
          entity-type="recipe"
          :entity-id="Number(id)"
          :attachments="recipe.attachments"
          label="Aggiungi una foto o un file"
          @change="onAttachments"
        />
      </section>

      <div class="danger-zone">
        <button type="button" class="btn btn-danger-ghost btn-sm" @click="remove">
          <Icon name="trash" :size="15" /> Elimina ricetta
        </button>
      </div>
    </template>

    <BaseModal v-model="editOpen" title="Modifica ricetta" subtitle="Aggiorna ingredienti e procedimento." size="lg">
      <form class="stack" @submit.prevent="save">
        <div class="form-grid">
          <div class="field full">
            <label for="er-title">Nome</label>
            <input id="er-title" v-model="form.title" class="input" maxlength="160" />
          </div>
          <div class="field">
            <label for="er-cat">Categoria</label>
            <select id="er-cat" v-model="form.category" class="select">
              <option v-for="cat in RECIPE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>
          <div class="field">
            <label for="er-serv">Porzioni</label>
            <input id="er-serv" v-model.number="form.servings" class="input" type="number" min="1" max="50" />
          </div>
          <div class="field">
            <label for="er-prep">Tempo (minuti)</label>
            <input id="er-prep" v-model="form.prepMinutes" class="input" type="number" min="0" max="1440" />
          </div>
          <div class="field full">
            <label for="er-desc">Descrizione</label>
            <input id="er-desc" v-model="form.description" class="input" maxlength="2000" />
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Ingredienti</div>
          <div class="ingredients-editor">
            <div v-for="(ing, index) in form.ingredients" :key="index" class="ingredient-row">
              <input v-model="ing.name" class="input input-sm ing-name" placeholder="Ingrediente" maxlength="120" />
              <input v-model="ing.quantity" class="input input-sm ing-qty" placeholder="Q.tà" maxlength="20" />
              <select v-model="ing.unit" class="select input-sm ing-unit">
                <option value="">—</option>
                <option v-for="unit in ['g', 'kg', 'ml', 'L', 'pz', 'bt', 'conf', 'cucchiai', 'q.b.']" :key="unit" :value="unit">{{ unit }}</option>
              </select>
              <button type="button" class="btn-icon" aria-label="Rimuovi" @click="removeIngredient(index)">
                <Icon name="x" :size="15" />
              </button>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm add-ing" @click="addIngredient">
            <Icon name="plus" :size="14" /> Aggiungi ingrediente
          </button>
        </div>

        <div class="field">
          <label for="er-notes">Procedimento</label>
          <textarea id="er-notes" v-model="form.notes" class="textarea" rows="6" maxlength="5000" />
        </div>

        <p v-if="formError" class="error-text">{{ formError }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="editOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" /> Salva
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
  flex-wrap: wrap;
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
.detail-actions {
  display: flex;
  gap: 6px;
}
.fav-on {
  color: var(--primary);
  border-color: rgba(192, 85, 58, 0.3);
  background: var(--primary-soft);
}
.recipe-hero {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  min-height: 330px;
}
.hero-media {
  position: relative;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  overflow: hidden;
  min-height: 260px;
}
.hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  inset: 0;
}
.hero-media.empty {
  background: linear-gradient(150deg, #f6e2d8, #fbf5ec);
}
.hero-emoji {
  font-size: 96px;
  opacity: 0.9;
}
.hero-fav {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 0;
  background: rgba(255, 253, 249, 0.86);
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.hero-fav.on {
  color: var(--primary);
  background: #fff;
}
.hero-content {
  padding: 32px 30px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.hero-content h1 {
  font-size: clamp(30px, 3.2vw, 42px);
  line-height: 1.06;
  margin: 8px 0 10px;
}
.hero-ai {
  margin-left: 7px;
  vertical-align: middle;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 600;
}
.hero-desc {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.6;
  max-width: 46ch;
}
.hero-meta {
  display: flex;
  gap: 18px;
  margin-top: 20px;
  flex-wrap: wrap;
}
.meta-box {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-soft);
}
.meta-box > span {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.meta-box strong {
  font-size: 15px;
  font-weight: 600;
}
.meta-box small {
  font-size: 10.5px;
  color: var(--muted);
}
.hero-actions {
  display: flex;
  gap: 8px;
  margin-top: 24px;
  flex-wrap: wrap;
}
.hero-actions .btn-primary {
  flex: 1;
  min-width: 220px;
}
.hero-by {
  margin-top: 16px;
  font-size: 11px;
  color: var(--muted);
}
.recipe-columns {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 18px;
  align-items: start;
}
.ing-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ing-list li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
  font-size: 13.5px;
}
.ing-list li:first-child {
  border-top: 0;
}
.ing-qty {
  min-width: 62px;
  font-weight: 600;
  color: var(--primary-dark);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
.ing-name {
  flex: 1;
}
.procedure {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.step {
  display: flex;
  gap: 12px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink-soft);
  margin: 0;
}
.step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--primary);
  flex: none;
  margin-top: 1px;
}
.recipe-tip {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 16px;
  padding: 11px 12px;
  border-radius: 10px;
  background: var(--gold-soft);
  border: 1px solid rgba(184, 131, 58, 0.28);
  color: #7a5a25;
  font-size: 12.5px;
  line-height: 1.5;
}
.danger-zone {
  display: flex;
  justify-content: flex-end;
}
.ingredients-editor {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.ingredient-row {
  display: flex;
  gap: 7px;
  align-items: center;
}
.ing-name {
  flex: 1;
  min-width: 0;
}
.ing-qty {
  width: 76px;
  flex: none;
}
.ing-unit {
  width: 88px;
  flex: none;
}
.add-ing {
  margin-top: 9px;
}
@media (max-width: 900px) {
  .recipe-hero {
    grid-template-columns: 1fr;
  }
  .hero-media {
    aspect-ratio: 16 / 10;
    min-height: 0;
  }
  .hero-content {
    padding: 24px 20px;
  }
  .recipe-columns {
    grid-template-columns: 1fr;
  }
  .ing-qty {
    width: 62px;
  }
  .ing-unit {
    width: 72px;
  }
}
</style>
