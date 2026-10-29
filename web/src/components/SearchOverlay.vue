<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useUiStore } from '@/stores/ui.js';
import Icon from './Icon.vue';

const ui = useUiStore();
const router = useRouter();

const query = ref('');
const results = ref([]);
const loading = ref(false);
const activeIndex = ref(0);
const inputRef = ref(null);
let timer = null;
let controller = null;

const hasQuery = computed(() => query.value.trim().length >= 2);

watch(
  () => ui.searchOpen,
  async (open) => {
    if (open) {
      query.value = '';
      results.value = [];
      activeIndex.value = 0;
      await nextTick();
      inputRef.value?.focus();
    }
  },
);

watch(query, (value) => {
  clearTimeout(timer);
  controller?.abort();
  const term = value.trim();
  if (term.length < 2) {
    results.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  timer = setTimeout(async () => {
    controller = new AbortController();
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
      results.value = data.results || [];
      activeIndex.value = 0;
    } catch (err) {
      if (err.name !== 'AbortError') ui.error(err.message);
    } finally {
      loading.value = false;
    }
  }, 200);
});

function close() {
  ui.closeSearch();
}

function go(item) {
  if (!item) return;
  close();
  router.push(item.url);
}

function onKeydown(event) {
  if (!ui.searchOpen) return;
  if (event.key === 'Escape') {
    close();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (results.value.length) activeIndex.value = (activeIndex.value + 1) % results.value.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (results.value.length) activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    go(results.value[activeIndex.value]);
  }
}

watch(
  () => ui.searchOpen,
  (open) => {
    if (open) document.addEventListener('keydown', onKeydown);
    else document.removeEventListener('keydown', onKeydown);
  },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  clearTimeout(timer);
  controller?.abort();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="ui.searchOpen" class="search-backdrop" @click.self="close">
        <div class="search-panel" role="dialog" aria-modal="true" aria-label="Cerca in casa">
          <div class="search-bar">
            <Icon name="search" :size="19" />
            <input
              ref="inputRef"
              v-model="query"
              type="search"
              placeholder="Cerca un evento, una scadenza, una ricetta…"
              aria-label="Cerca"
              autocomplete="off"
            />
            <button type="button" class="search-esc" @click="close">Esc</button>
          </div>
          <div class="search-body">
            <div v-if="loading" class="search-hint"><span class="spinner" /> Cerco in tutta la casa…</div>
            <div v-else-if="!hasQuery" class="search-hint">
              <p>Cerca in tutta la casa: appuntamenti, scadenze, ricette, piante e spesa.</p>
              <div class="search-tips">
                <span class="kbd">↑</span><span class="kbd">↓</span> per muoversi <span class="kbd">Invio</span> per aprire
              </div>
            </div>
            <div v-else-if="!results.length" class="search-hint">
              <p>Nessun risultato per “{{ query }}”.</p>
            </div>
            <ul v-else class="search-results">
              <li v-for="(item, index) in results" :key="`${item.type}-${item.id}`">
                <button
                  type="button"
                  class="search-result"
                  :class="{ active: index === activeIndex }"
                  @mouseenter="activeIndex = index"
                  @click="go(item)"
                >
                  <span class="search-result-icon"><Icon :name="item.icon" :size="18" /></span>
                  <span class="search-result-text">
                    <span class="search-result-title">{{ item.title }}</span>
                    <span class="search-result-sub">{{ item.subtitle }}</span>
                  </span>
                  <Icon name="arrow-right" :size="16" class="search-result-arrow" />
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 130;
  background: rgba(38, 28, 18, 0.4);
  backdrop-filter: blur(3px);
  padding: 10vh 18px 18px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.search-panel {
  width: min(600px, 100%);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 34px 90px -30px rgba(40, 26, 12, 0.6);
  overflow: hidden;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}
.search-bar input {
  flex: 1;
  border: 0;
  background: transparent;
  outline: none;
  font: inherit;
  font-size: 16px;
  color: var(--ink);
  min-width: 0;
}
.search-bar input::placeholder {
  color: var(--muted);
}
.search-esc {
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--muted);
  border-radius: 7px;
  font-size: 10.5px;
  font-weight: 600;
  padding: 4px 7px;
  cursor: pointer;
}
.search-body {
  max-height: min(56vh, 480px);
  overflow-y: auto;
  padding: 8px;
}
.search-hint {
  padding: 26px 18px;
  color: var(--muted);
  font-size: 13.5px;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.search-hint p {
  margin: 0;
}
.search-tips {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.kbd {
  border: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: 5px;
  padding: 2px 5px;
  font-size: 10.5px;
}
.search-results {
  list-style: none;
  margin: 0;
  padding: 0;
}
.search-result {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--ink);
}
.search-result.active {
  background: var(--surface-2);
}
.search-result-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--primary-soft);
  color: var(--primary);
  flex: none;
}
.search-result-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.search-result-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search-result-sub {
  font-size: 12.5px;
  color: var(--muted);
}
.search-result-arrow {
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.search-result.active .search-result-arrow {
  opacity: 1;
}
@media (max-width: 640px) {
  .search-backdrop {
    padding: 0;
  }
  .search-panel {
    width: 100%;
    min-height: 100dvh;
    border-radius: 0;
    border: 0;
  }
  .search-body {
    max-height: calc(100dvh - 70px);
  }
}
</style>
