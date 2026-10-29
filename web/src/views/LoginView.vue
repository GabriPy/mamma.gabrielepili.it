<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useMetaStore } from '@/stores/meta.js';
import { useUiStore } from '@/stores/ui.js';
import BrandMark from '@/components/BrandMark.vue';
import Avatar from '@/components/Avatar.vue';
import PinPad from '@/components/PinPad.vue';
import Icon from '@/components/Icon.vue';

const auth = useAuthStore();
const meta = useMetaStore();
const ui = useUiStore();
const router = useRouter();
const route = useRoute();

const selected = ref(null);
const pin = ref('');
const error = ref('');
const busy = ref(false);
const shake = ref(false);

const profiles = computed(() => auth.profiles);

function choose(profile) {
  selected.value = profile;
  pin.value = '';
  error.value = '';
  window.localStorage.setItem('gh:last-profile', String(profile.id));
}

function back() {
  selected.value = null;
  pin.value = '';
  error.value = '';
}

function fail(message) {
  error.value = message;
  shake.value = true;
  setTimeout(() => {
    shake.value = false;
    pin.value = '';
  }, 650);
}

async function submit(value) {
  if (busy.value || !selected.value) return;
  if (value.length !== 4) return;
  busy.value = true;
  error.value = '';
  try {
    await auth.login(selected.value.id, value);
    await meta.load(true);
    ui.success(`Bentornato, ${auth.user.name}.`);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(redirect.startsWith('/') ? redirect : '/');
  } catch (err) {
    fail(err.message || 'PIN non corretto.');
  } finally {
    busy.value = false;
  }
}

function onKeydown(event) {
  if (!selected.value) return;
  if (/^\d$/.test(event.key)) {
    if (pin.value.length < 4) {
      pin.value += event.key;
      if (pin.value.length === 4) submit(pin.value);
    }
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    pin.value = pin.value.slice(0, -1);
  }
}

onMounted(async () => {
  await auth.loadProfiles();
  const last = Number(window.localStorage.getItem('gh:last-profile'));
  const match = auth.profiles.find((p) => p.id === last);
  if (match) selected.value = match;
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="login">
    <aside class="login-art">
      <div class="art-glow art-glow-1" />
      <div class="art-glow art-glow-2" />
      <header class="art-top">
        <BrandMark :size="46" show-wordmark subtitle="casa di famiglia" class="art-brand" />
      </header>

      <div class="art-copy">
        <p class="art-eyebrow">Benvenuta a casa</p>
        <h1>La casa di famiglia,<br /><em>in un posto solo.</em></h1>
        <p class="art-lead">
          Spesa, scadenze, appuntamenti, ricette e piante. Un diario semplice e privato, pensato per noi.
        </p>

        <ul class="art-list">
          <li><span class="art-ico"><Icon name="calendar" :size="17" /></span> Cosa c’è da fare oggi, a colpo d’occhio</li>
          <li><span class="art-ico"><Icon name="bell" :size="17" /></span> Promemoria gentili via email, prima che sia tardi</li>
          <li><span class="art-ico"><Icon name="leaf" :size="17" /></span> Le piante di casa, con la loro piccola agenda</li>
        </ul>
      </div>

      <footer class="art-foot">
        <div class="art-note">
          <span class="art-quote-mark">“</span>
          <p>Le cose importanti non si dimenticano:<br />semplicemente hanno un posto dove stare.</p>
        </div>
        <div class="art-meta">
          <span>Privato</span><span class="dot" /><span>Solo famiglia</span><span class="dot" /><span>Backup tuo</span>
        </div>
      </footer>
    </aside>

    <main class="login-main">
      <div class="mobile-brand-row">
        <BrandMark :size="40" show-wordmark subtitle="casa di famiglia" />
      </div>

      <div class="login-card" :class="{ shake }">
        <template v-if="!selected">
          <div class="login-head">
            <p class="eyebrow">Accesso</p>
            <h2>Chi sei?</h2>
            <p class="login-sub">Scegli il tuo profilo per entrare in casa.</p>
          </div>

          <div v-if="profiles.length" class="profiles">
            <button
              v-for="profile in profiles"
              :key="profile.id"
              type="button"
              class="profile"
              @click="choose(profile)"
            >
              <Avatar :name="profile.name" :emoji="profile.emoji" :color="profile.color" :size="62" />
              <span class="profile-name">{{ profile.name }}</span>
              <span class="profile-role">{{ profile.role === 'admin' ? 'Amministratore' : 'Famiglia' }}</span>
            </button>
          </div>
          <div v-else class="login-empty">
            <Icon name="users" :size="22" />
            <p>Nessun profilo configurato. Avvia il servizio con <code>ADMIN_PIN</code> per creare l’amministratore.</p>
          </div>

          <p class="login-help">
            <Icon name="lock" :size="13" /> L’accesso è protetto da un PIN personale di 4 cifre.
          </p>
        </template>

        <template v-else>
          <button type="button" class="back-link" @click="back">
            <Icon name="arrow-left" :size="15" /> Cambia profilo
          </button>

          <div class="login-head pin-head">
            <Avatar :name="selected.name" :emoji="selected.emoji" :color="selected.color" :size="64" />
            <h2>Ciao, {{ selected.name }}</h2>
            <p class="login-sub">Inserisci il tuo PIN di 4 cifre.</p>
          </div>

          <div class="pin-dots" :class="{ filled: pin.length > 0, error }" aria-hidden="true">
            <span v-for="i in 4" :key="i" class="pin-dot" :class="{ on: pin.length >= i }" />
          </div>

          <p class="pin-error" :class="{ visible: error }" role="alert">{{ error || '​' }}</p>

          <PinPad v-model="pin" :disabled="busy" :error="Boolean(error)" @complete="submit" />

          <div class="pin-loading">
            <span v-if="busy" class="spinner" />
            <span v-else> </span>
          </div>

          <p class="login-help">
            <Icon name="lock" :size="13" /> PIN dimenticato? Chiedi all’amministratore di reimpostarlo dalle Impostazioni.
          </p>
        </template>
      </div>

      <p class="login-foot">Ghibiri Home · un posto tranquillo per le cose di casa</p>
    </main>
  </div>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(380px, 44%) 1fr;
  background: var(--bg);
}
.login-art {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 85% 10%, rgba(255, 214, 180, 0.22) 0%, transparent 55%),
    linear-gradient(158deg, #b64e35 0%, #9c3f2a 55%, #83331f 100%);
  color: #fdf4e7;
  padding: 38px 44px 34px;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.art-glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.art-glow-1 {
  width: 460px;
  height: 460px;
  right: -190px;
  top: -130px;
  background: radial-gradient(circle, rgba(255, 226, 194, 0.16) 0%, transparent 68%);
}
.art-glow-2 {
  width: 320px;
  height: 320px;
  left: -160px;
  bottom: 12%;
  background: radial-gradient(circle, rgba(255, 226, 194, 0.1) 0%, transparent 70%);
}
.art-top {
  position: relative;
  z-index: 1;
}
.art-brand :deep(.brand-name) {
  color: #fdf4e7;
}
.art-brand :deep(.brand-sub) {
  color: rgba(253, 244, 231, 0.62);
}
.art-copy {
  position: relative;
  z-index: 1;
  margin: auto 0;
  max-width: 440px;
  padding: 34px 0 30px;
}
.art-eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.19em;
  text-transform: uppercase;
  color: rgba(253, 244, 231, 0.66);
  margin: 0 0 16px;
}
.art-copy h1 {
  font-family: var(--font-serif);
  font-size: clamp(32px, 3.4vw, 46px);
  line-height: 1.08;
  font-weight: 500;
  letter-spacing: -0.025em;
  color: #fdf4e7;
  margin: 0;
}
.art-copy h1 em {
  font-style: italic;
  color: #f5cfae;
}
.art-lead {
  margin: 20px 0 0;
  font-size: 14.5px;
  line-height: 1.65;
  color: rgba(253, 244, 231, 0.78);
  max-width: 36ch;
}
.art-list {
  list-style: none;
  margin: 30px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.art-list li {
  display: flex;
  align-items: center;
  gap: 11px;
  font-size: 13px;
  color: rgba(253, 244, 231, 0.86);
}
.art-ico {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: rgba(253, 244, 231, 0.12);
  border: 1px solid rgba(253, 244, 231, 0.14);
  color: #f7d9bd;
  flex: none;
}
.art-foot {
  position: relative;
  z-index: 1;
}
.art-note {
  position: relative;
  border-left: 2px solid rgba(253, 244, 231, 0.28);
  padding: 4px 0 4px 16px;
  margin-bottom: 22px;
  max-width: 330px;
}
.art-quote-mark {
  position: absolute;
  left: 12px;
  top: -16px;
  font-family: var(--font-serif);
  font-size: 46px;
  color: rgba(253, 244, 231, 0.16);
  line-height: 1;
}
.art-note p {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 14.5px;
  line-height: 1.55;
  color: rgba(253, 244, 231, 0.72);
  margin: 0;
}
.art-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(253, 244, 231, 0.45);
}
.art-meta .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}
.login-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px 28px;
  min-height: 100dvh;
  position: relative;
}
.mobile-brand-row {
  display: none;
}
.login-card {
  width: min(400px, 100%);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 32px 30px 26px;
  box-shadow: 0 40px 90px -50px rgba(70, 46, 22, 0.55);
}
.login-head .eyebrow {
  margin-bottom: 10px;
}
.login-head h2 {
  font-size: 30px;
  line-height: 1.1;
}
.login-sub {
  margin-top: 7px;
  font-size: 13.5px;
  color: var(--muted);
  line-height: 1.5;
}
.profiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-top: 22px;
}
.profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 10px 13px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: 18px;
  cursor: pointer;
  font: inherit;
  color: var(--ink);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}
.profile:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
  transform: translateY(-1px);
}
.profile-name {
  font-size: 14px;
  font-weight: 600;
  margin-top: 5px;
}
.profile-role {
  font-size: 10.5px;
  color: var(--muted);
}
.login-empty {
  margin-top: 22px;
  padding: 18px;
  border: 1px dashed var(--line-strong);
  border-radius: 14px;
  color: var(--muted);
  font-size: 12.5px;
  display: flex;
  gap: 10px;
  line-height: 1.5;
}
.login-empty code {
  font-size: 11px;
  background: var(--surface-2);
  padding: 1px 4px;
  border-radius: 4px;
}
.login-help {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 18px;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.45;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
  margin-bottom: 12px;
}
.back-link:hover {
  color: var(--ink);
}
.pin-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}
.pin-head h2 {
  font-size: 26px;
  margin-top: 4px;
}
.pin-head .login-sub {
  margin-top: 0;
}
.pin-dots {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin: 24px 0 6px;
}
.pin-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid var(--line-strong);
  background: transparent;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.pin-dot.on {
  background: var(--primary);
  border-color: var(--primary);
  transform: scale(1.08);
}
.pin-dots.error .pin-dot {
  border-color: var(--danger);
}
.pin-error {
  min-height: 18px;
  margin: 0 0 12px;
  text-align: center;
  font-size: 12px;
  color: var(--danger);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.pin-error.visible {
  opacity: 1;
}
.pin-loading {
  height: 20px;
  display: grid;
  place-items: center;
  margin-top: 10px;
}
.login-foot {
  margin-top: 22px;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.shake {
  animation: shake 0.42s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
@keyframes shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(3px); }
  30%, 50%, 70% { transform: translateX(-6px); }
  40%, 60% { transform: translateX(6px); }
}
@media (max-width: 900px) {
  .login {
    grid-template-columns: 1fr;
  }
  .login-art {
    display: none;
  }
  .login-main {
    padding: 24px 18px 30px;
    justify-content: flex-start;
    padding-top: 30px;
  }
  .mobile-brand-row {
    display: flex;
    justify-content: center;
    margin-bottom: 26px;
  }
  .login-card {
    padding: 26px 22px 22px;
    border-radius: 24px;
  }
  .login-card.mobile-grow {
    flex: 1;
  }
  .profiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .login-foot {
    margin-top: auto;
    padding-top: 22px;
  }
}
@media (max-width: 380px) {
  .login-card {
    padding: 22px 18px 18px;
  }
  .profiles {
    gap: 8px;
  }
}
</style>
