<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useUiStore } from '@/stores/ui.js';
import { RECIPE_CATEGORIES } from '@/utils/constants.js';
import PageHeader from '@/components/PageHeader.vue';
import BaseModal from '@/components/BaseModal.vue';
import AttachmentUploader from '@/components/AttachmentUploader.vue';
import EmptyState from '@/components/EmptyState.vue';
import Icon from '@/components/Icon.vue';

const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const recipes = ref([]);
const loading = ref(true);
const search = ref('');
const category = ref('');
const favoritesOnly = ref(false);
const modalOpen = ref(false);
const saving = ref(false);
const formError = ref('');
const uploaderRef = ref(null);

const form = reactive({
  title: '',
  description: '',
  category: 'Primi',
  servings: 4,
  prepMinutes: '',
  notes: '',
  ingredients: [{ name: '', quantity: '', unit: '' }],
  attachments: [],
});

const CATEGORY_STYLE = {
  Primi: { emoji: '🍝', bg: 'linear-gradient(150deg,#f7e3d4,#fdf6ec)', color: '#A94E2F' },
  Secondi: { emoji: '🍲', bg: 'linear-gradient(150deg,#f4e0d8,#fdf4ec)', color: '#9C4A38' },
  Contorni: { emoji: '🥗', bg: 'linear-gradient(150deg,#e6edda,#f8faf2)', color: '#5C7047' },
  Dolci: { emoji: '🍰', bg: 'linear-gradient(150deg,#f8e4e6,#fdf6f2)', color: '#9C5262' },
  Colazioni: { emoji: '🥐', bg: 'linear-gradient(150deg,#f7ecd6,#fdf9ef)', color: '#8A6528' },
  Conserve: { emoji: '🫙', bg: 'linear-gradient(150deg,#efe6d6,#fbf7ee)', color: '#7A6547' },
  Altro: { emoji: '🍽️', bg: 'linear-gradient(150deg,#eee8dd,#faf7f0)', color: '#6B5F4F' },
};

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return recipes.value
    .filter((r) => (category.value ? r.category === category.value : true))
    .filter((r) => (favoritesOnly.value ? r.favorite : true))
    .filter((r) => (term ? r.title.toLowerCase().includes(term) : true));
});

const categories = computed(() => {
  const counts = new Map();
  for (const recipe of recipes.value) counts.set(recipe.category, (counts.get(recipe.category) || 0) + 1);
  return RECIPE_CATEGORIES.filter((c) => counts.has(c)).map((c) => ({ name: c, count: counts.get(c) }));
});

function styleFor(cat) {
  return CATEGORY_STYLE[cat] || CATEGORY_STYLE.Altro;
}

function resetForm() {
  Object.assign(form, {
    title: '',
    description: '',
    category: 'Primi',
    servings: 4,
    prepMinutes: '',
    notes: '',
    ingredients: [{ name: '', quantity: '', unit: '' }],
    attachments: [],
  });
  formError.value = '';
}

function openNew() {
  resetForm();
  modalOpen.value = true;
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
  const ingredients = form.ingredients.filter((i) => i.name.trim());
  saving.value = true;
  formError.value = '';
  try {
    const data = await api('/api/recipes', {
      method: 'POST',
      body: {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        servings: form.servings || null,
        prepMinutes: form.prepMinutes === '' ? null : Number(form.prepMinutes),
        notes: form.notes.trim() || null,
        ingredients: ingredients.map((i) => ({
          name: i.name.trim(),
          quantity: i.quantity.trim() || null,
          unit: i.unit || null,
        })),
      },
    });
    if (uploaderRef.value?.hasPending) await uploaderRef.value.flush(data.recipe.id);
    ui.success('Ricetta salvata nel ricettario.');
    modalOpen.value = false;
    router.push(`/ricette/${data.recipe.id}`);
  } catch (err) {
    formError.value = err.message;
    ui.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function toggleFavorite(recipe) {
  try {
    const data = await api(`/api/recipes/${recipe.id}/favorite`, { method: 'POST' });
    recipe.favorite = data.favorite;
    ui.toast(data.favorite ? 'Aggiunta ai preferiti.' : 'Rimossa dai preferiti.', 'success', 1800);
  } catch (err) {
    ui.error(err.message);
  }
}

function surprise() {
  if (!recipes.value.length) return;
  const pool = favoritesOnly.value ? recipes.value.filter((r) => r.favorite) : recipes.value;
  const list = pool.length ? pool : recipes.value;
  const recipe = list[Math.floor(Math.random() * list.length)];
  router.push(`/ricette/${recipe.id}`);
}

onMounted(async () => {
  try {
    const data = await api('/api/recipes');
    recipes.value = data.recipes;
  } catch (err) {
    ui.error(err.message);
  } finally {
    loading.value = false;
  }
  if (route.query.nuovo === '1') openNew();
});
</script>

<template>
  <div class="page-stack">
    <PageHeader eyebrow="Cucina" title="Ricettario" :subtitle="`${recipes.length} ricette di casa, da rifare insieme.`">
      <template #actions>
        <button type="button" class="btn btn-ghost" :disabled="!recipes.length" @click="surprise">
          <Icon name="sparkle" :size="16" /> Sorprendimi
        </button>
        <button type="button" class="btn btn-primary" @click="openNew">
          <Icon name="plus" :size="17" /> Nuova ricetta
        </button>
      </template>
    </PageHeader>

    <div class="recipe-toolbar">
      <div class="search-field">
        <Icon name="search" :size="17" />
        <input v-model="search" type="search" placeholder="Cerca una ricetta…" aria-label="Cerca una ricetta" />
      </div>
      <div class="chips-scroll">
        <button type="button" class="chip" :class="{ active: !category && !favoritesOnly }" @click="category = ''; favoritesOnly = false">Tutte</button>
        <button type="button" class="chip chip-rose" :class="{ active: favoritesOnly }" @click="favoritesOnly = !favoritesOnly">
          <Icon name="heart" :size="12" :filled="favoritesOnly" /> Preferite
        </button>
        <button
          v-for="cat in categories"
          :key="cat.name"
          type="button"
          class="chip"
          :class="{ active: category === cat.name }"
          @click="category = category === cat.name ? '' : cat.name"
        >
          {{ styleFor(cat.name).emoji }} {{ cat.name }}
          <span class="chip-count">{{ cat.count }}</span>
        </button>
      </div>
    </div>

    <div v-if="loading" class="recipe-grid">
      <div v-for="i in 4" :key="i" class="recipe-card skeleton-card">
        <div class="shimmer skeleton-media" />
        <div class="skeleton-body">
          <div class="shimmer" style="width: 70%; height: 18px" />
          <div class="shimmer" style="width: 45%; height: 12px" />
        </div>
      </div>
    </div>

    <div v-else-if="filtered.length" class="recipe-grid">
      <article
        v-for="recipe in filtered"
        :key="recipe.id"
        class="recipe-card"
        tabindex="0"
        role="link"
        @click="router.push(`/ricette/${recipe.id}`)"
        @keydown.enter="router.push(`/ricette/${recipe.id}`)"
      >
        <div class="recipe-media" :style="{ background: styleFor(recipe.category).bg }">
          <img v-if="recipe.attachments?.[0]" :src="recipe.attachments[0].url" :alt="recipe.title" loading="lazy" />
          <span v-else class="recipe-emoji" aria-hidden="true">{{ styleFor(recipe.category).emoji }}</span>
          <button
            type="button"
            class="favorite-btn"
            :class="{ on: recipe.favorite }"
            :aria-label="recipe.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'"
            @click.stop="toggleFavorite(recipe)"
          >
            <Icon name="heart" :size="17" :filled="recipe.favorite" />
          </button>
          <span class="recipe-cat">{{ recipe.category }}</span>
        </div>
        <div class="recipe-body">
          <h2>{{ recipe.title }}</h2>
          <p v-if="recipe.description" class="recipe-sub">{{ recipe.description }}</p>
          <div class="recipe-meta">
            <span v-if="recipe.servings"><Icon name="users" :size="13" /> {{ recipe.servings }}</span>
            <span v-if="recipe.prepMinutes"><Icon name="clock" :size="13" /> {{ recipe.prepMinutes }} min</span>
            <span><Icon name="list" :size="13" /> {{ recipe.ingredientCount }} ingr.</span>
          </div>
        </div>
      </article>
    </div>

    <EmptyState
      v-else
      icon="book"
      title="Il ricettario è ancora vuoto"
      text="Aggiungi il primo piatto di casa: ingredienti, procedimento e una bella foto."
      tone="rose"
    >
      <button type="button" class="btn btn-primary" @click="openNew">
        <Icon name="plus" :size="16" /> Aggiungi la prima ricetta
      </button>
    </EmptyState>

    <BaseModal v-model="modalOpen" title="Nuova ricetta" subtitle="Scrivi gli ingredienti: potrai mandarli alla spesa con un tocco." size="lg">
      <form class="stack" @submit.prevent="save">
        <div class="form-grid">
          <div class="field full">
            <label for="rc-title">Nome della ricetta</label>
            <input id="rc-title" v-model="form.title" class="input" placeholder="es. Pasta al pomodoro" maxlength="160" />
          </div>
          <div class="field">
            <label for="rc-cat">Categoria</label>
            <select id="rc-cat" v-model="form.category" class="select">
              <option v-for="cat in RECIPE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>
          <div class="field">
            <label for="rc-serv">Porzioni</label>
            <input id="rc-serv" v-model.number="form.servings" class="input" type="number" min="1" max="50" />
          </div>
          <div class="field">
            <label for="rc-prep">Tempo <span class="optional">(minuti)</span></label>
            <input id="rc-prep" v-model="form.prepMinutes" class="input" type="number" min="0" max="1440" placeholder="es. 30" />
          </div>
          <div class="field full">
            <label for="rc-desc">Descrizione breve <span class="optional">(facoltativa)</span></label>
            <input id="rc-desc" v-model="form.description" class="input" placeholder="Perché è speciale?" maxlength="2000" />
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
              <button type="button" class="btn-icon" aria-label="Rimuovi ingrediente" @click="removeIngredient(index)">
                <Icon name="x" :size="15" />
              </button>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm add-ing" @click="addIngredient">
            <Icon name="plus" :size="14" /> Aggiungi ingrediente
          </button>
        </div>

        <div class="field">
          <label for="rc-notes">Procedimento e note</label>
          <textarea id="rc-notes" v-model="form.notes" class="textarea" rows="5" maxlength="5000" placeholder="1. Metti l’acqua sul fuoco…" />
        </div>

        <div class="field">
          <label>Foto della ricetta</label>
          <AttachmentUploader
            ref="uploaderRef"
            entity-type="recipe"
            :entity-id="null"
            :attachments="form.attachments"
            label="Aggiungi una foto del piatto"
            @change="(list) => (form.attachments = list)"
          />
        </div>

        <p v-if="formError" class="error-text">{{ formError }}</p>
      </form>

      <template #footer>
        <button type="button" class="btn btn-ghost" @click="modalOpen = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" />
          Salva ricetta
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.recipe-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search-field {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 44px;
  padding: 0 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--muted);
  max-width: 420px;
}
.search-field input {
  flex: 1;
  border: 0;
  background: transparent;
  outline: none;
  font: inherit;
  font-size: 14px;
  color: var(--ink);
  min-width: 0;
}
.chips-scroll {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.chip-count {
  font-size: 10px;
  color: var(--muted);
  background: var(--surface-3);
  border-radius: 99px;
  padding: 0 5px;
}
.chip.active .chip-count {
  background: rgba(255, 253, 249, 0.75);
  color: var(--primary-dark);
}
.recipe-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.recipe-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  display: flex;
  flex-direction: column;
}
.recipe-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lift);
  border-color: var(--line-strong);
}
.recipe-media {
  position: relative;
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.recipe-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s ease;
}
.recipe-card:hover .recipe-media img {
  transform: scale(1.035);
}
.recipe-emoji {
  font-size: 52px;
  filter: saturate(0.9);
  opacity: 0.9;
}
.favorite-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 33px;
  height: 33px;
  border-radius: 50%;
  border: 0;
  background: rgba(255, 253, 249, 0.85);
  backdrop-filter: blur(4px);
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.favorite-btn.on {
  color: var(--primary);
  background: #fff;
}
.recipe-cat {
  position: absolute;
  left: 10px;
  bottom: 10px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  background: rgba(255, 253, 249, 0.9);
  color: var(--ink-soft);
  padding: 3px 7px;
  border-radius: 5px;
}
.recipe-body {
  padding: 15px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}
.recipe-body h2 {
  font-size: 19px;
  line-height: 1.2;
}
.recipe-sub {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.recipe-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 8px;
  font-size: 11px;
  color: var(--muted);
}
.recipe-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.skeleton-card {
  pointer-events: none;
}
.skeleton-media {
  aspect-ratio: 4 / 3;
  border-radius: 0;
}
.skeleton-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
@media (max-width: 960px) {
  .recipe-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .recipe-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .recipe-media {
    aspect-ratio: 16 / 10;
  }
  .recipe-body h2 {
    font-size: 20px;
  }
  .ing-unit {
    width: 72px;
  }
  .ing-qty {
    width: 62px;
  }
}
</style>
