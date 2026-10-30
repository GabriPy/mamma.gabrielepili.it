<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useMetaStore } from '@/stores/meta.js';
import { useUiStore } from '@/stores/ui.js';
import BrandMark from './BrandMark.vue';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';
import SearchOverlay from './SearchOverlay.vue';
import RecipeGenerator from './RecipeGenerator.vue';

const auth = useAuthStore();
const meta = useMetaStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const quickAddOpen = ref(false);
const moreOpen = ref(false);

const nav = [
  { label: 'Oggi', icon: 'home', to: '/' },
  { label: 'Spesa', icon: 'basket', to: '/spesa' },
  { label: 'Calendario', icon: 'calendar', to: '/calendario' },
  { label: 'Scadenze', icon: 'clock', to: '/scadenze' },
  { label: 'Ricette', icon: 'book', to: '/ricette' },
  { label: 'Piante', icon: 'leaf', to: '/piante' },
];

const bottomNav = [
  { label: 'Oggi', icon: 'home', to: '/' },
  { label: 'Spesa', icon: 'basket', to: '/spesa' },
  { label: 'Calendario', icon: 'calendar', to: '/calendario' },
  { label: 'Scadenze', icon: 'clock', to: '/scadenze' },
];

const quickItems = [
  { label: 'Evento', hint: 'Appuntamento in calendario', icon: 'calendar', to: '/calendario', emoji: '📅' },
  { label: 'Scadenza', hint: 'Bolletta, documento, rinnovo', icon: 'clock', to: '/scadenze', emoji: '📌' },
  { label: 'Spesa', hint: 'Qualcosa da comprare', icon: 'basket', to: '/spesa', emoji: '🛒' },
  { label: 'Ricetta', hint: 'Un piatto da ricordare', icon: 'book', to: '/ricette', emoji: '🍝' },
  { label: 'Pianta', hint: 'Una nuova pianta di casa', icon: 'leaf', to: '/piante', emoji: '🪴' },
];

const isMoreActive = computed(() => ['/ricette', '/piante', '/profilo', '/impostazioni'].some((p) => route.path.startsWith(p)));

function isActive(to) {
  if (to === '/') return route.path === '/';
  return route.path.startsWith(to);
}

function goQuick(item) {
  quickAddOpen.value = false;
  moreOpen.value = false;
  router.push({ path: item.to, query: { nuovo: '1' } });
}

function go(path) {
  moreOpen.value = false;
  router.push(path);
}

async function logout() {
  const ok = await ui.confirm({
    title: 'Uscire dalla casa?',
    message: 'Dovrai reinserire il PIN per rientrare.',
    confirmLabel: 'Esci',
  });
  if (!ok) return;
  await auth.logout();
  router.push({ name: 'login' });
}

watch([quickAddOpen, moreOpen], ([q, m]) => {
  document.body.classList.toggle('sheet-open', q || m);
});

function onShortcut(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    ui.openSearch();
  }
}

onMounted(() => {
  meta.load();
  document.addEventListener('keydown', onShortcut);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onShortcut);
  document.body.classList.remove('sheet-open');
});
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <RouterLink to="/" class="side-brand" aria-label="Ghibiri Home, vai a Oggi">
        <BrandMark :size="44" show-wordmark :subtitle="meta.householdName || 'casa di famiglia'" />
      </RouterLink>

      <button type="button" class="quick-add" @click="quickAddOpen = true">
        <span class="quick-add-icon"><Icon name="plus" :size="18" /></span>
        <span>Aggiungi</span>
        <span class="quick-add-hint">nuovo</span>
      </button>

      <nav class="side-nav" aria-label="Sezioni della casa">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: isActive(item.to) }"
        >
          <Icon :name="item.icon" :size="19" />
          <span>{{ item.label }}</span>
        </RouterLink>

        <div class="nav-divider" />

        <RouterLink
          v-if="auth.isAdmin"
          to="/impostazioni"
          class="nav-link"
          :class="{ active: route.path.startsWith('/impostazioni') }"
        >
          <Icon name="settings" :size="19" />
          <span>Impostazioni</span>
        </RouterLink>
        <RouterLink to="/profilo" class="nav-link" :class="{ active: route.path.startsWith('/profilo') }">
          <Icon name="user" :size="19" />
          <span>Profilo</span>
        </RouterLink>
      </nav>

      <div class="side-foot">
        <div class="reminder-status">
          <span class="status-dot" :class="{ on: meta.emailReminders }" />
          <span>{{ meta.emailReminders ? 'Promemoria via email attivi' : 'Promemoria email da attivare' }}</span>
        </div>
        <div class="user-chip">
          <RouterLink to="/profilo" class="user-link">
            <Avatar :name="auth.user?.name" :emoji="auth.user?.emoji" :color="auth.user?.color" :size="36" />
            <span class="user-meta">
              <span class="user-name">{{ auth.user?.name }}</span>
              <span class="user-role">{{ auth.isAdmin ? 'Amministratore' : 'Famiglia' }}</span>
            </span>
          </RouterLink>
          <button type="button" class="icon-btn" title="Esci" aria-label="Esci" @click="logout">
            <Icon name="logout" :size="17" />
          </button>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="mobile-bar">
        <RouterLink to="/" class="mobile-brand" aria-label="Ghibiri Home">
          <BrandMark :size="32" />
        </RouterLink>
        <span class="mobile-page-title">{{ route.meta.title }}</span>
        <div class="mobile-actions">
          <button type="button" class="icon-btn" aria-label="Cerca" @click="ui.openSearch()">
            <Icon name="search" :size="19" />
          </button>
          <button type="button" class="icon-btn" aria-label="Aggiungi" @click="quickAddOpen = true">
            <Icon name="plus" :size="20" />
          </button>
          <RouterLink to="/profilo" class="mobile-avatar" aria-label="Profilo">
            <Avatar :name="auth.user?.name" :emoji="auth.user?.emoji" :color="auth.user?.color" :size="30" />
          </RouterLink>
        </div>
      </header>

      <main class="content">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <nav class="bottom-nav" aria-label="Navigazione principale">
      <RouterLink
        v-for="item in bottomNav"
        :key="item.to"
        :to="item.to"
        class="bottom-link"
        :class="{ active: isActive(item.to) }"
      >
        <Icon :name="item.icon" :size="21" />
        <span>{{ item.label }}</span>
      </RouterLink>
      <button type="button" class="bottom-link" :class="{ active: isMoreActive }" @click="moreOpen = true">
        <Icon name="more" :size="21" />
        <span>Altro</span>
      </button>
    </nav>

    <SearchOverlay />
    <RecipeGenerator />

    <Teleport to="body">
      <Transition name="sheet">
        <div v-if="quickAddOpen" class="sheet-backdrop" @click.self="quickAddOpen = false">
          <div class="sheet">
            <div class="sheet-handle" />
            <header class="sheet-head">
              <div>
                <p class="eyebrow">Cosa vuoi aggiungere?</p>
                <h2>Un nuovo pezzo di casa</h2>
              </div>
              <button type="button" class="btn-icon" aria-label="Chiudi" @click="quickAddOpen = false">
                <Icon name="x" :size="18" />
              </button>
            </header>
            <div class="quick-grid">
              <button v-for="item in quickItems" :key="item.label" type="button" class="quick-card" @click="goQuick(item)">
                <span class="quick-emoji">{{ item.emoji }}</span>
                <span class="quick-text">
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.hint }}</span>
                </span>
                <Icon name="chevron-right" :size="17" />
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="sheet">
        <div v-if="moreOpen" class="sheet-backdrop" @click.self="moreOpen = false">
          <div class="sheet sheet-compact">
            <div class="sheet-handle" />
            <header class="sheet-head">
              <div>
                <p class="eyebrow">Tutta la casa</p>
                <h2>Altre stanze</h2>
              </div>
              <button type="button" class="btn-icon" aria-label="Chiudi" @click="moreOpen = false">
                <Icon name="x" :size="18" />
              </button>
            </header>
            <div class="more-list">
              <button type="button" class="more-row" @click="go('/ricette')">
                <span class="more-icon rose"><Icon name="book" :size="19" /></span>
                <span><strong>Ricette</strong><small>Il ricettario di casa</small></span>
                <Icon name="chevron-right" :size="17" />
              </button>
              <button type="button" class="more-row" @click="go('/piante')">
                <span class="more-icon sage"><Icon name="leaf" :size="19" /></span>
                <span><strong>Piante</strong><small>Cura e diario verde</small></span>
                <Icon name="chevron-right" :size="17" />
              </button>
              <button v-if="auth.isAdmin" type="button" class="more-row" @click="go('/impostazioni')">
                <span class="more-icon gold"><Icon name="settings" :size="19" /></span>
                <span><strong>Impostazioni</strong><small>Famiglia, email, backup</small></span>
                <Icon name="chevron-right" :size="17" />
              </button>
              <button type="button" class="more-row" @click="go('/profilo')">
                <span class="more-icon"><Icon name="user" :size="19" /></span>
                <span><strong>Profilo</strong><small>Il tuo PIN e i tuoi dati</small></span>
                <Icon name="chevron-right" :size="17" />
              </button>
              <button type="button" class="more-row more-exit" @click="logout">
                <span class="more-icon"><Icon name="logout" :size="19" /></span>
                <span><strong>Esci</strong><small>Chiudi la sessione</small></span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  display: flex;
  background: var(--bg);
}
.sidebar {
  width: 262px;
  flex: none;
  position: fixed;
  inset: 0 auto 0 0;
  display: flex;
  flex-direction: column;
  padding: 22px 18px 18px;
  background: linear-gradient(180deg, #f5eddf 0%, #f2e8d7 100%);
  border-right: 1px solid var(--line);
  z-index: 30;
}
.side-brand {
  display: block;
  padding: 2px 6px 0;
  text-decoration: none;
}
.quick-add {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 46px;
  padding: 0 10px 0 8px;
  border: 1px solid rgba(192, 85, 58, 0.25);
  background: var(--surface);
  border-radius: 13px;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 20px -16px rgba(120, 60, 35, 0.6);
  transition: border-color 0.15s ease, transform 0.1s ease;
}
.quick-add:hover {
  border-color: var(--primary);
}
.quick-add:active {
  transform: scale(0.99);
}
.quick-add-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--primary);
  color: #fff;
  flex: none;
}
.quick-add-hint {
  margin-left: auto;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  background: var(--surface-2);
  border-radius: 5px;
  padding: 3px 5px;
}
.side-nav {
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  flex: 1;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--ink-soft);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s ease, color 0.15s ease;
  position: relative;
}
.nav-link:hover {
  background: rgba(255, 253, 249, 0.7);
  color: var(--ink);
}
.nav-link.active {
  background: var(--surface);
  color: var(--primary-dark);
  font-weight: 600;
  box-shadow: 0 1px 0 rgba(90, 60, 35, 0.06);
}
.nav-link.active::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 3px;
  background: var(--primary);
}
.nav-divider {
  height: 1px;
  background: var(--line-strong);
  margin: 12px 10px;
  opacity: 0.6;
}
.side-foot {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reminder-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: var(--muted);
  padding: 0 6px;
  line-height: 1.35;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--line-strong);
  flex: none;
}
.status-dot.on {
  background: #6e946b;
  box-shadow: 0 0 0 3px rgba(110, 148, 107, 0.16);
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(255, 253, 249, 0.72);
  border: 1px solid var(--line);
}
.user-link {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
  text-decoration: none;
}
.user-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-role {
  font-size: 10.5px;
  color: var(--muted);
}
.main {
  flex: 1;
  margin-left: 262px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.content {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 40px 64px;
  flex: 1;
}
.mobile-bar {
  display: none;
}
.bottom-nav {
  display: none;
}
.quick-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.quick-card {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 11px 13px;
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.quick-card:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
}
.quick-emoji {
  font-size: 22px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  border-radius: 11px;
  flex: none;
}
.quick-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.quick-text strong {
  font-size: 14px;
}
.quick-text span {
  font-size: 12px;
  color: var(--muted);
}
.quick-card > .icon {
  color: var(--muted);
}
.more-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.more-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border: 0;
  background: transparent;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink);
}
.more-row:hover {
  background: var(--surface-2);
}
.more-row > span:nth-child(2) {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.more-row strong {
  font-size: 14px;
  font-weight: 600;
}
.more-row small {
  font-size: 12px;
  color: var(--muted);
}
.more-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: var(--primary-soft);
  color: var(--primary);
  flex: none;
}
.more-icon.sage {
  background: var(--sage-soft);
  color: var(--sage);
}
.more-icon.gold {
  background: var(--gold-soft);
  color: var(--gold);
}
.more-icon.rose {
  background: var(--rose-soft);
  color: var(--rose);
}
.more-exit {
  color: var(--danger);
  margin-top: 4px;
}
.more-exit .more-icon {
  background: var(--danger-soft);
  color: var(--danger);
}
.more-exit small {
  color: rgba(180, 67, 47, 0.7);
}
@media (max-width: 960px) {
  .sidebar {
    display: none;
  }
  .main {
    margin-left: 0;
    padding-bottom: calc(76px + env(safe-area-inset-bottom));
  }
  .mobile-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    position: sticky;
    top: 0;
    z-index: 40;
    height: 58px;
    padding: 0 14px;
    background: rgba(247, 241, 231, 0.88);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--line);
  }
  .mobile-brand {
    display: flex;
    text-decoration: none;
  }
  .mobile-page-title {
    font-family: var(--font-serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--ink-soft);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mobile-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .mobile-avatar {
    margin-left: 4px;
    display: flex;
  }
  .content {
    padding: 22px 18px 30px;
  }
  .bottom-nav {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    background: rgba(255, 253, 249, 0.94);
    backdrop-filter: blur(16px);
    border-top: 1px solid var(--line);
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    justify-content: space-around;
  }
  .bottom-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 6px 4px;
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    text-decoration: none;
    border-radius: 10px;
    cursor: pointer;
  }
  .bottom-link.active {
    color: var(--primary);
    background: var(--primary-soft);
  }
  .quick-grid {
    grid-template-columns: 1fr;
  }
}
@media (min-width: 961px) {
  .sheet-backdrop {
    align-items: center;
    padding: 30px;
  }
  .sheet {
    max-width: 440px;
    border-radius: 24px;
    margin: 0 auto;
  }
  .sheet-handle {
    display: none;
  }
}
</style>
