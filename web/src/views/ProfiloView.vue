<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useMetaStore } from '@/stores/meta.js';
import { useUiStore } from '@/stores/ui.js';
import { USER_COLORS, USER_EMOJIS } from '@/utils/constants.js';
import PageHeader from '@/components/PageHeader.vue';
import Avatar from '@/components/Avatar.vue';
import Icon from '@/components/Icon.vue';

const auth = useAuthStore();
const meta = useMetaStore();
const ui = useUiStore();
const router = useRouter();

const saving = ref(false);
const savingPin = ref(false);
const pinError = ref('');
const profileError = ref('');

const form = reactive({
  name: '',
  email: '',
  color: '#C0553A',
  emoji: '🙂',
});

const pinForm = reactive({ currentPin: '', newPin: '', confirmPin: '' });

function fill() {
  Object.assign(form, {
    name: auth.user?.name || '',
    email: auth.user?.email || '',
    color: auth.user?.color || '#C0553A',
    emoji: auth.user?.emoji || '🙂',
  });
}

async function saveProfile() {
  if (!form.name.trim()) {
    profileError.value = 'Il nome non può essere vuoto.';
    return;
  }
  saving.value = true;
  profileError.value = '';
  try {
    await auth.updateProfile({
      name: form.name.trim(),
      email: form.email.trim(),
      color: form.color,
      emoji: form.emoji,
    });
    ui.success('Profilo aggiornato.');
  } catch (err) {
    profileError.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function changePin() {
  pinError.value = '';
  if (!/^\d{4}$/.test(pinForm.currentPin)) {
    pinError.value = 'Inserisci il PIN attuale di 4 cifre.';
    return;
  }
  if (!/^\d{4}$/.test(pinForm.newPin)) {
    pinError.value = 'Il nuovo PIN deve avere 4 cifre.';
    return;
  }
  if (pinForm.newPin !== pinForm.confirmPin) {
    pinError.value = 'I due PIN nuovi non coincidono.';
    return;
  }
  if (pinForm.newPin === pinForm.currentPin) {
    pinError.value = 'Scegli un PIN diverso da quello attuale.';
    return;
  }
  savingPin.value = true;
  try {
    await api('/api/auth/me/pin', {
      method: 'POST',
      body: { currentPin: pinForm.currentPin, newPin: pinForm.newPin },
    });
    pinForm.currentPin = '';
    pinForm.newPin = '';
    pinForm.confirmPin = '';
    ui.success('PIN aggiornato. Le altre sessioni sono state chiuse.');
  } catch (err) {
    pinError.value = err.message;
  } finally {
    savingPin.value = false;
  }
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

onMounted(async () => {
  if (!auth.user) await auth.refresh();
  fill();
  meta.load();
});
</script>

<template>
  <div class="page-stack profile-page">
    <PageHeader eyebrow="Il tuo spazio" title="Profilo" subtitle="Come ti vedono gli altri e come entri in casa." />

    <section class="card profile-hero">
      <Avatar :name="form.name" :emoji="form.emoji" :color="form.color" :size="76" :ring="true" />
      <div class="profile-id">
        <h2>{{ form.name || auth.user?.name }}</h2>
        <p class="muted small">
          {{ auth.isAdmin ? 'Amministratore della casa' : 'Membro della famiglia' }}
          <template v-if="auth.user?.email"> · {{ auth.user.email }}</template>
        </p>
        <p class="tiny muted">{{ meta.householdName }}</p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" @click="logout">
        <Icon name="logout" :size="15" /> Esci
      </button>
    </section>

    <section class="card">
      <header class="card-head">
        <div>
          <p class="eyebrow">Dati personali</p>
          <h2>Come ti chiami</h2>
        </div>
      </header>
      <div class="stack">
        <div class="form-grid">
          <div class="field">
            <label for="p-name">Nome</label>
            <input id="p-name" v-model="form.name" class="input" maxlength="40" />
          </div>
          <div class="field">
            <label for="p-email">Email</label>
            <input id="p-email" v-model="form.email" class="input" type="email" placeholder="nome@email.it" />
            <span class="hint">Serve per ricevere i promemoria.</span>
          </div>
        </div>

        <div class="field">
          <label>Colore</label>
          <div class="color-row">
            <button v-for="color in USER_COLORS" :key="color" type="button" class="color-dot" :class="{ active: form.color === color }" :style="{ background: color }" :aria-label="`Colore ${color}`" @click="form.color = color" />
          </div>
        </div>

        <div class="field">
          <label>Icona</label>
          <div class="emoji-row">
            <button v-for="emoji in USER_EMOJIS" :key="emoji" type="button" class="emoji-btn" :class="{ active: form.emoji === emoji }" @click="form.emoji = emoji">{{ emoji }}</button>
          </div>
        </div>

        <p v-if="profileError" class="error-text">{{ profileError }}</p>

        <div class="form-foot">
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveProfile">
            <span v-if="saving" class="spinner" /> Salva profilo
          </button>
        </div>
      </div>
    </section>

    <section class="card">
      <header class="card-head">
        <div>
          <p class="eyebrow">Sicurezza</p>
          <h2>Cambia il PIN</h2>
          <p class="card-note">4 cifre, facili da ricordare ma solo tue.</p>
        </div>
        <span class="pin-lock"><Icon name="lock" :size="18" /></span>
      </header>

      <div class="form-grid">
        <div class="field">
          <label for="pin-current">PIN attuale</label>
          <input id="pin-current" v-model="pinForm.currentPin" class="input pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="••••" />
        </div>
        <div class="field">
          <label for="pin-new">Nuovo PIN</label>
          <input id="pin-new" v-model="pinForm.newPin" class="input pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••" />
        </div>
        <div class="field">
          <label for="pin-confirm">Ripeti il nuovo PIN</label>
          <input id="pin-confirm" v-model="pinForm.confirmPin" class="input pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••" />
        </div>
      </div>

      <p v-if="pinError" class="error-text" style="margin-top: 10px">{{ pinError }}</p>

      <div class="form-foot">
        <span class="hint">Dopo il cambio, gli altri dispositivi dovranno rientrare.</span>
        <button type="button" class="btn btn-primary" :disabled="savingPin" @click="changePin">
          <span v-if="savingPin" class="spinner" /> Aggiorna PIN
        </button>
      </div>
    </section>

    <section class="card card-soft">
      <div class="app-info">
        <div>
          <p class="eyebrow">Ghibiri Home</p>
          <p class="small muted">La casa di famiglia, organizzata. Dati privati, sul tuo server.</p>
        </div>
        <span class="badge badge-sage"><Icon name="shield" :size="11" /> solo famiglia</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 780px;
}
.profile-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.profile-id {
  flex: 1;
  min-width: 0;
}
.profile-id h2 {
  font-size: 28px;
  line-height: 1.1;
}
.profile-id p {
  margin-top: 4px;
}
.color-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.color-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  box-shadow: inset 0 0 0 2px var(--surface);
}
.color-dot.active {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.emoji-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.emoji-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 19px;
  cursor: pointer;
}
.emoji-btn.active {
  border-color: var(--primary);
  background: var(--primary-soft);
}
.form-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.pin-lock {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--muted);
  display: grid;
  place-items: center;
}
.pin-input {
  letter-spacing: 0.4em;
  font-size: 18px;
  text-align: center;
}
.app-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
@media (max-width: 640px) {
  .form-foot .btn {
    width: 100%;
  }
  .profile-hero {
    gap: 14px;
  }
}
</style>
