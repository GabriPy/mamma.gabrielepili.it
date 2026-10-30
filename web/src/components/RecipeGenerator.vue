<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useMetaStore } from '@/stores/meta.js';
import { useUiStore } from '@/stores/ui.js';
import { RECIPE_CATEGORIES } from '@/utils/constants.js';
import BaseModal from './BaseModal.vue';
import Icon from './Icon.vue';

const ui = useUiStore();
const meta = useMetaStore();
const auth = useAuthStore();
const router = useRouter();

const mode = ref('new');
const seedTitle = ref('');
const form = reactive({
  prompt: '',
  servings: 4,
  maxMinutes: 45,
  category: '',
  vegetarian: false,
  avoid: '',
});
const draft = ref(null);
const generationMeta = ref(null);
const savedRecipe = ref(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
let closed = false;
let runToken = 0;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const open = computed({
  get: () => ui.generatorOpen,
  set: (value) => {
    if (value) ui.generatorOpen = true;
    else ui.closeGenerator();
  },
});

const title = computed(() => {
  if (savedRecipe.value) return 'Ricetta salvata';
  if (draft.value) return 'La tua ricetta';
  return mode.value === 'similar' ? 'Genera una simile' : 'Genera una ricetta';
});

const subtitle = computed(() => {
  if (mode.value === 'similar' && seedTitle.value) return `Ispirata a “${seedTitle.value}”.`;
  return 'Dimmi cosa hai in casa e al resto penso io.';
});

const ideas = computed(() =>
  mode.value === 'similar'
    ? ['Più veloce', 'Senza forno', 'Più leggera', 'Con meno ingredienti']
    : ['Con quello che c’è in frigo', 'Veloce per stasera', 'Vegetariana', 'Dolce della domenica'],
);

const canGenerate = computed(() => {
  if (!meta.aiEnabled || loading.value) return false;
  return mode.value === 'similar' || form.prompt.trim().length > 0;
});

const isLocal = computed(() => meta.aiLocal);

function normalizeSeed(recipe) {
  if (!recipe) return null;
  const steps = Array.isArray(recipe.steps) && recipe.steps.length
    ? recipe.steps
    : String(recipe.notes || '')
        .split('\n')
        .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
        .filter(Boolean);
  return {
    title: recipe.title,
    description: recipe.description || '',
    category: recipe.category || '',
    servings: recipe.servings || null,
    prepMinutes: recipe.prepMinutes || null,
    ingredients: (recipe.ingredients || []).map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity || '',
      unit: ingredient.unit || '',
    })),
    steps,
  };
}

function reset() {
  const seed = ui.generatorSeed;
  mode.value = seed ? 'similar' : 'new';
  seedTitle.value = seed?.title || '';
  closed = false;
  runToken += 1;
  Object.assign(form, {
    prompt: '',
    servings: seed?.servings || 4,
    maxMinutes: 45,
    category: seed?.category || '',
    vegetarian: false,
    avoid: '',
  });
  draft.value = null;
  generationMeta.value = null;
  savedRecipe.value = null;
  loading.value = false;
  saving.value = false;
  error.value = '';
}

function applyIdea(idea) {
  form.prompt = idea;
  if (idea === 'Vegetariana') form.vegetarian = true;
}

async function runGeneration(nextMode, source) {
  if (loading.value || !meta.aiEnabled) return;
  const token = ++runToken;
  loading.value = true;
  error.value = '';
  savedRecipe.value = null;
  try {
    const body = {
      mode: nextMode,
      prompt: form.prompt.trim(),
      servings: Number(form.servings) || undefined,
      maxMinutes: Number(form.maxMinutes) || undefined,
      category: form.category || undefined,
      vegetarian: form.vegetarian,
      avoid: form.avoid.trim(),
    };
    if (nextMode === 'similar' && source) body.seed = source;

    const started = await api('/api/ai/recipes/generate', { method: 'POST', body });
    const jobId = started.jobId;
    if (!jobId) throw new Error('Il server non ha avviato la generazione. Riprova.');

    for (let attempt = 0; attempt < 160; attempt += 1) {
      await delay(attempt === 0 ? 700 : 1400);
      if (closed || token !== runToken) return;
      const state = await api(`/api/ai/recipes/jobs/${jobId}`);
      if (closed || token !== runToken) return;
      if (state.status === 'done') {
        draft.value = state.result.recipe;
        generationMeta.value = state.result.meta;
        mode.value = nextMode;
        return;
      }
      if (state.status === 'error') {
        throw new Error(state.error?.message || 'Non sono riuscito a generare la ricetta.');
      }
    }
    throw new Error('La generazione sta impiegando troppo tempo. Riprova.');
  } catch (err) {
    if (token === runToken && !closed) {
      error.value = err.message || 'Non sono riuscito a generare la ricetta.';
    }
  } finally {
    if (token === runToken) loading.value = false;
  }
}

function generateInitial() {
  runGeneration(mode.value, mode.value === 'similar' ? normalizeSeed(ui.generatorSeed) : null);
}

function generateAnother() {
  if (mode.value === 'similar') {
    runGeneration('similar', normalizeSeed(ui.generatorSeed) || normalizeSeed(draft.value));
  } else {
    runGeneration('new', null);
  }
}

function generateSimilar() {
  const source = normalizeSeed(draft.value || ui.generatorSeed);
  if (!source) return;
  runGeneration('similar', source);
}

function editRequest() {
  draft.value = null;
  savedRecipe.value = null;
  error.value = '';
}

async function save() {
  if (!draft.value || saving.value || savedRecipe.value) return;
  saving.value = true;
  error.value = '';
  try {
    const notes = draft.value.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
    const fullNotes = draft.value.tips ? `${notes}\n\nConsiglio: ${draft.value.tips}` : notes;    const prompt =
      form.prompt.trim() ||
      (mode.value === 'similar' && seedTitle.value ? `Simile a: ${seedTitle.value}` : 'Ricetta generata');
    const data = await api('/api/recipes', {
      method: 'POST',
      body: {
        title: draft.value.title,
        description: draft.value.description || null,
        category: draft.value.category,
        servings: draft.value.servings,
        prepMinutes: draft.value.prepMinutes,
        notes: fullNotes.slice(0, 5000),
        ingredients: draft.value.ingredients.map((ingredient) => ({
          name: ingredient.name,
          quantity: ingredient.quantity || null,
          unit: ingredient.unit || null,
        })),
        source: 'ai',
        sourcePrompt: prompt,
      },
    });
    savedRecipe.value = data.recipe;
    ui.markRecipesChanged();
    ui.success('Ricetta aggiunta al ricettario.');
  } catch (err) {
    error.value = err.message || 'Non sono riuscito a salvare la ricetta.';
  } finally {
    saving.value = false;
  }
}

function openRecipe() {
  const id = savedRecipe.value?.id;
  ui.closeGenerator();
  if (id) router.push(`/ricette/${id}`);
}

watch(
  () => ui.generatorOpen,
  (value) => {
    if (value) {
      reset();
    } else {
      closed = true;
    }
  },
);
</script>

<template>
  <BaseModal v-model="open" :title="title" :subtitle="subtitle" size="lg">
    <div v-if="!meta.aiEnabled" class="ai-off">
      <span class="ai-off-icon"><Icon name="sparkle" :size="22" /></span>
      <h3>Generazione non configurata</h3>
      <p>
        Per generare ricette serve un modello AI. Puoi usare un modello locale (nessuna quota, tutto in casa) oppure un
        provider esterno compatibile OpenAI.
      </p>
      <RouterLink v-if="auth.isAdmin" to="/impostazioni" class="btn btn-primary btn-sm" @click="ui.closeGenerator()">
        Vai alle impostazioni
      </RouterLink>
      <p v-else class="hint">Chiedi all’amministratore della casa di attivarla dalle impostazioni.</p>
    </div>

    <div v-else-if="loading" class="generator-loading">
      <span class="thinking-orbit"><Icon name="sparkle" :size="24" /></span>
      <h3>Sto pensando a una ricetta…</h3>
      <p>
        {{ isLocal ? 'Il modello locale sta lavorando sul server: la prima generazione può richiedere fino a un minuto.' : 'Il servizio AI sta preparando ingredienti e procedimento.' }}
      </p>
      <span class="loading-dots"><i /><i /><i /></span>
    </div>

    <div v-else-if="draft" class="draft">
      <div class="draft-head">
        <div class="row row-wrap draft-badges">
          <span class="badge badge-primary">{{ draft.category }}</span>
          <span class="badge badge-sage">{{ draft.servings }} porzioni</span>
          <span class="badge badge-gold">{{ draft.prepMinutes }} min</span>
          <span v-if="savedRecipe" class="badge badge-sage"><Icon name="check" :size="11" /> nel ricettario</span>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" @click="editRequest">
          <Icon name="edit" :size="14" /> Cambia richiesta
        </button>
      </div>

      <h2 class="draft-title">{{ draft.title }}</h2>
      <p v-if="draft.description" class="draft-desc">{{ draft.description }}</p>

      <div class="draft-columns">
        <section class="draft-block">
          <h4><Icon name="basket" :size="14" /> Ingredienti</h4>
          <ul class="draft-ingredients">
            <li v-for="(ingredient, index) in draft.ingredients" :key="index">
              <span class="ingredient-qty">
                <template v-if="ingredient.quantity">{{ ingredient.quantity }}</template>
                <template v-if="ingredient.unit"> {{ ingredient.unit }}</template>
              </span>
              <span>{{ ingredient.name }}</span>
            </li>
          </ul>
        </section>
        <section class="draft-block">
          <h4><Icon name="utensils" :size="14" /> Procedimento</h4>
          <ol class="draft-steps">
            <li v-for="(step, index) in draft.steps" :key="index">{{ step }}</li>
          </ol>
        </section>
      </div>

      <p v-if="draft.tips" class="draft-tips"><Icon name="sparkle" :size="14" /> {{ draft.tips }}</p>

      <p v-if="error" class="ai-error"><Icon name="alert" :size="15" /> {{ error }}</p>
      <p v-if="error && isLocal" class="hint">
        Se è la prima generazione, il modello locale potrebbe essere ancora in caricamento: riprova tra 10–20 secondi.
      </p>

      <div class="draft-credit">
        <span>
          Generata con <strong>{{ generationMeta?.model || meta.aiModel }}</strong>
          <template v-if="generationMeta?.elapsedMs"> in {{ Math.max(1, Math.round(generationMeta.elapsedMs / 1000)) }}s</template>
          <template v-if="isLocal"> · modello locale</template>
        </span>
        <span>Controlla sempre cottura e allergie.</span>
      </div>
    </div>

    <div v-else class="generator-form">
      <div v-if="mode === 'similar'" class="seed-banner">
        <span class="seed-icon"><Icon name="book" :size="18" /></span>
        <div>
          <strong>Punto di partenza: {{ seedTitle }}</strong>
          <p>Mantengo lo spirito, cambio ingredienti o tecnica. Puoi suggerirmi una direzione qui sotto.</p>
        </div>
      </div>

      <div class="field">
        <label for="ai-prompt">
          {{ mode === 'similar' ? 'Come vuoi cambiarla?' : 'Cosa hai in casa o che voglia hai?' }}
          <span v-if="mode === 'similar'" class="optional">(facoltativo)</span>
        </label>
        <textarea
          id="ai-prompt"
          v-model="form.prompt"
          class="textarea"
          rows="3"
          maxlength="1000"
          :placeholder="mode === 'similar' ? 'es. più leggera, senza forno, con il limone…' : 'es. ho zucchine, pasta e un po’ di parmigiano; qualcosa di veloce per stasera'"
        />
      </div>

      <div class="quick-ideas">
        <button v-for="idea in ideas" :key="idea" type="button" class="chip" @click="applyIdea(idea)">
          {{ idea }}
        </button>
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="ai-servings">Porzioni</label>
          <input id="ai-servings" v-model.number="form.servings" class="input" type="number" min="1" max="12" />
        </div>
        <div class="field">
          <label for="ai-minutes">Tempo massimo <span class="optional">(minuti)</span></label>
          <input id="ai-minutes" v-model.number="form.maxMinutes" class="input" type="number" min="5" max="240" step="5" />
        </div>
        <div class="field">
          <label for="ai-category">Categoria</label>
          <select id="ai-category" v-model="form.category" class="select">
            <option value="">Qualsiasi</option>
            <option v-for="category in RECIPE_CATEGORIES" :key="category" :value="category">{{ category }}</option>
          </select>
        </div>
        <div class="field">
          <label>Vegetariana</label>
          <div class="inline-switch">
            <button type="button" class="switch" :class="{ on: form.vegetarian }" role="switch" :aria-checked="form.vegetarian" @click="form.vegetarian = !form.vegetarian" />
            <span class="hint">{{ form.vegetarian ? 'Sì, senza carne e pesce' : 'No, va bene tutto' }}</span>
          </div>
        </div>
        <div class="field full">
          <label for="ai-avoid">Allergie o ingredienti da evitare <span class="optional">(facoltativo)</span></label>
          <input id="ai-avoid" v-model="form.avoid" class="input" maxlength="200" placeholder="es. niente frutta a guscio, no lattosio" />
        </div>
      </div>

      <div class="panel-note ai-privacy">
        <Icon :name="isLocal ? 'home' : 'wifi'" :size="16" />
        <span v-if="isLocal">Il modello gira sul tuo server: ingredienti e richieste non escono di casa.</span>
        <span v-else>La richiesta viene inviata al provider AI configurato. Non includere dati personali sensibili.</span>
      </div>

      <p v-if="error" class="ai-error"><Icon name="alert" :size="15" /> {{ error }}</p>
      <p v-if="error && isLocal" class="hint">
        Se è la prima generazione, il modello locale potrebbe essere ancora in caricamento: riprova tra 10–20 secondi.
      </p>
    </div>

    <template #footer>
      <template v-if="savedRecipe">
        <button type="button" class="btn btn-ghost" @click="generateAnother">Genera un’altra</button>
        <button type="button" class="btn btn-ghost" @click="generateSimilar">Genera una simile</button>
        <button type="button" class="btn btn-ghost" @click="ui.closeGenerator()">Chiudi</button>
        <button type="button" class="btn btn-primary" @click="openRecipe">
          <Icon name="book" :size="16" /> Apri ricetta
        </button>
      </template>
      <template v-else-if="draft">
        <button type="button" class="btn btn-ghost" @click="generateAnother" :disabled="loading">Genera un’altra</button>
        <button type="button" class="btn btn-ghost" @click="generateSimilar" :disabled="loading">Genera una simile</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" />
          <Icon v-else name="plus" :size="16" /> Aggiungi al ricettario
        </button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-ghost" @click="ui.closeGenerator()">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="!canGenerate" @click="generateInitial">
          <span v-if="loading" class="spinner" />
          <Icon v-else name="sparkle" :size="16" />
          {{ mode === 'similar' ? 'Genera una simile' : 'Genera' }}
        </button>
      </template>
    </template>
  </BaseModal>
</template>

<style scoped>
.ai-off {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 18px 8px 10px;
  gap: 10px;
}
.ai-off-icon {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--primary-soft);
  color: var(--primary);
}
.ai-off h3 {
  font-size: 22px;
  margin: 4px 0 0;
}
.ai-off p {
  color: var(--muted);
  font-size: 13.5px;
  line-height: 1.6;
  max-width: 42ch;
}
.generator-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.seed-banner {
  display: flex;
  gap: 11px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.seed-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
  flex: none;
}
.seed-banner strong {
  font-size: 13px;
  display: block;
}
.seed-banner p {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
  margin-top: 2px;
}
.quick-ideas {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: -4px;
}
.inline-switch {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 44px;
}
.ai-privacy {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.ai-error {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  padding: 11px 12px;
  border-radius: 10px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12.5px;
  line-height: 1.45;
}
.generator-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 26px 16px 20px;
  gap: 8px;
}
.thinking-orbit {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--primary-soft);
  color: var(--primary);
  animation: breathe 2s ease-in-out infinite;
}
.generator-loading h3 {
  font-size: 22px;
  margin-top: 6px;
}
.generator-loading p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  max-width: 40ch;
}
.loading-dots {
  display: flex;
  gap: 5px;
  margin-top: 8px;
}
.loading-dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  opacity: 0.3;
  animation: pulse 1.2s ease-in-out infinite;
}
.loading-dots i:nth-child(2) {
  animation-delay: 0.18s;
}
.loading-dots i:nth-child(3) {
  animation-delay: 0.36s;
}
@keyframes pulse {
  0%, 100% { opacity: 0.25; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}
@keyframes breathe {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(192, 85, 58, 0.16); }
  50% { transform: scale(1.05); box-shadow: 0 0 0 12px rgba(192, 85, 58, 0); }
}
.draft {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.draft-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.draft-badges {
  gap: 6px;
}
.draft-title {
  font-size: clamp(26px, 3vw, 34px);
  line-height: 1.1;
  margin: 0;
}
.draft-desc {
  font-size: 13.5px;
  color: var(--muted);
  line-height: 1.55;
  margin: -6px 0 0;
  max-width: 60ch;
}
.draft-columns {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 18px;
  margin-top: 4px;
}
.draft-block h4 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 8px;
}
.draft-ingredients {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.draft-ingredients li {
  display: flex;
  gap: 9px;
  align-items: baseline;
  padding: 7px 0;
  border-top: 1px solid var(--line);
  font-size: 13px;
}
.draft-ingredients li:first-child {
  border-top: 0;
}
.ingredient-qty {
  min-width: 60px;
  color: var(--primary-dark);
  font-weight: 600;
  font-size: 12px;
}
.draft-steps {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-soft);
}
.draft-steps li::marker {
  color: var(--primary);
  font-weight: 700;
}
.draft-tips {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  background: var(--gold-soft);
  border: 1px solid rgba(184, 131, 58, 0.28);
  color: #7a5a25;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  margin: 0;
}
.draft-credit {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 10.5px;
  color: var(--muted);
  border-top: 1px dashed var(--line);
  padding-top: 10px;
}
.draft-credit strong {
  color: var(--ink-soft);
}
@media (max-width: 680px) {
  .draft-columns {
    grid-template-columns: 1fr;
  }
  .draft-credit {
    flex-direction: column;
    gap: 3px;
  }
}
</style>
