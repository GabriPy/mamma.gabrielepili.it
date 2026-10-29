<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api, downloadFile } from '@/api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useMetaStore } from '@/stores/meta.js';
import { useUiStore } from '@/stores/ui.js';
import { formatBytes, formatDate } from '@/utils/format.js';
import { USER_COLORS, USER_EMOJIS } from '@/utils/constants.js';
import PageHeader from '@/components/PageHeader.vue';
import BaseModal from '@/components/BaseModal.vue';
import Avatar from '@/components/Avatar.vue';
import Icon from '@/components/Icon.vue';

const ui = useUiStore();
const auth = useAuthStore();
const meta = useMetaStore();

const tab = ref('casa');
const loading = ref(true);
const data = ref(null);
const users = ref([]);
const savingSettings = ref(false);
const testing = ref(false);
const exporting = ref(false);
const running = ref(false);
const resyncing = ref(false);

const userModal = ref(false);
const userEditing = ref(null);
const userForm = reactive({
  name: '',
  email: '',
  role: 'member',
  pin: '',
  color: USER_COLORS[1],
  emoji: '🙂',
  isActive: true,
});
const userError = ref('');
const savingUser = ref(false);

const settingsForm = reactive({
  household_name: 'Casa Ghibiri',
  reminder_hour: '09:00',
  reminder_email_enabled: true,
  deadline_offsets: '7,1',
  event_offset_days: 1,
  plant_reminders: true,
});

const offsetOptions = [
  { value: 7, label: '7 giorni prima' },
  { value: 3, label: '3 giorni prima' },
  { value: 1, label: 'Il giorno prima' },
  { value: 0, label: 'Il giorno stesso' },
];

const offsets = computed(() =>
  String(settingsForm.deadline_offsets || '')
    .split(',')
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v)),
);

const emailConfigured = computed(() => Boolean(data.value?.mail?.configured));
const pendingReminders = computed(() => data.value?.reminders || []);

const tabs = [
  { id: 'casa', label: 'Casa', icon: 'home' },
  { id: 'famiglia', label: 'Famiglia', icon: 'users' },
  { id: 'email', label: 'Email e promemoria', icon: 'mail' },
  { id: 'backup', label: 'Backup', icon: 'database' },
];

function formatInstant(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function toggleOffset(value) {
  const set = new Set(offsets.value);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  settingsForm.deadline_offsets = [...set].sort((a, b) => b - a).join(',');
}

async function load() {
  loading.value = true;
  try {
    const [settingsData, usersData] = await Promise.all([api('/api/settings'), api('/api/users')]);
    data.value = settingsData;
    users.value = usersData.users;
    Object.assign(settingsForm, {
      household_name: settingsData.settings.household_name || 'Casa Ghibiri',
      reminder_hour: settingsData.settings.reminder_hour || '09:00',
      reminder_email_enabled: settingsData.settings.reminder_email_enabled === 'true',
      deadline_offsets: settingsData.settings.deadline_offsets || '7,1',
      event_offset_days: Number(settingsData.settings.event_offset_days || 1),
      plant_reminders: settingsData.settings.plant_reminders === 'true',
    });
  } catch (err) {
    ui.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  savingSettings.value = true;
  try {
    await api('/api/settings', {
      method: 'PATCH',
      body: {
        household_name: settingsForm.household_name,
        reminder_hour: settingsForm.reminder_hour,
        reminder_email_enabled: settingsForm.reminder_email_enabled,
        deadline_offsets: settingsForm.deadline_offsets,
        event_offset_days: Number(settingsForm.event_offset_days),
        plant_reminders: settingsForm.plant_reminders,
      },
    });
    ui.success('Impostazioni salvate.');
    await load();
    await meta.load(true);
  } catch (err) {
    ui.error(err.message);
  } finally {
    savingSettings.value = false;
  }
}

async function testEmail() {
  testing.value = true;
  try {
    await api('/api/settings/test-email', { method: 'POST', body: {} });
    ui.success('Email di prova inviata: controlla la casella.');
  } catch (err) {
    ui.error(err.message);
  } finally {
    testing.value = false;
  }
}

async function checkReminders() {
  running.value = true;
  try {
    const result = await api('/api/settings/run-reminders', { method: 'POST' });
    const stats = result.stats || {};
    ui.success(`Controllo completato: ${stats.sent || 0} inviati, ${stats.failed || 0} falliti, ${stats.cancelled || 0} annullati.`);
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    running.value = false;
  }
}

async function resyncReminders() {
  resyncing.value = true;
  try {
    await api('/api/settings/resync-reminders', { method: 'POST' });
    ui.success('Promemoria rigenerati.');
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    resyncing.value = false;
  }
}

async function exportBackup() {
  exporting.value = true;
  try {
    const filename = await downloadFile('/api/backup/export', 'ghibiri-home-backup.zip');
    ui.success(`Backup creato: ${filename}`);
    await load();
  } catch (err) {
    ui.error(err.message);
  } finally {
    exporting.value = false;
  }
}

async function exportJson() {
  try {
    await downloadFile('/api/backup/export/json', 'ghibiri-home-dati.json');
    ui.success('Dati esportati in JSON.');
  } catch (err) {
    ui.error(err.message);
  }
}

function openNewUser() {
  userEditing.value = null;
  Object.assign(userForm, {
    name: '',
    email: '',
    role: 'member',
    pin: '',
    color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
    emoji: '🙂',
    isActive: true,
  });
  userError.value = '';
  userModal.value = true;
}

function openEditUser(user) {
  userEditing.value = user;
  Object.assign(userForm, {
    name: user.name,
    email: user.email || '',
    role: user.role,
    pin: '',
    color: user.color,
    emoji: user.emoji,
    isActive: user.isActive,
  });
  userError.value = '';
  userModal.value = true;
}

async function saveUser() {
  if (!userForm.name.trim()) {
    userError.value = 'Il nome è obbligatorio.';
    return;
  }
  if (!userEditing.value && !/^\d{4}$/.test(userForm.pin)) {
    userError.value = 'Scegli un PIN di 4 cifre.';
    return;
  }
  if (userForm.pin && !/^\d{4}$/.test(userForm.pin)) {
    userError.value = 'Il PIN deve avere 4 cifre.';
    return;
  }
  savingUser.value = true;
  userError.value = '';
  try {
    if (userEditing.value) {
      const body = {
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        role: userForm.role,
        color: userForm.color,
        emoji: userForm.emoji,
        isActive: userForm.isActive,
      };
      if (userForm.pin) body.pin = userForm.pin;
      await api(`/api/users/${userEditing.value.id}`, { method: 'PATCH', body });
      ui.success('Membro aggiornato.');
    } else {
      await api('/api/users', {
        method: 'POST',
        body: {
          name: userForm.name.trim(),
          email: userForm.email.trim(),
          role: userForm.role,
          pin: userForm.pin,
          color: userForm.color,
          emoji: userForm.emoji,
        },
      });
      ui.success('Nuovo membro aggiunto alla casa.');
    }
    userModal.value = false;
    await load();
    await auth.loadProfiles();
  } catch (err) {
    userError.value = err.message;
  } finally {
    savingUser.value = false;
  }
}

async function deleteUser() {
  const ok = await ui.confirm({
    title: 'Eliminare il membro?',
    message: `${userEditing.value.name} non potrà più accedere. I contenuti restano nella casa.`,
    confirmLabel: 'Elimina',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/users/${userEditing.value.id}`, { method: 'DELETE' });
    userModal.value = false;
    ui.success('Membro eliminato.');
    await load();
  } catch (err) {
    ui.error(err.message);
  }
}

onMounted(load);
</script>

<template>
  <div class="page-stack settings-page">
    <PageHeader eyebrow="Amministrazione" title="Impostazioni" subtitle="La casa, le persone, le email e i backup." />

    <div class="tabs">
      <button v-for="t in tabs" :key="t.id" type="button" class="tab" :class="{ active: tab === t.id }" @click="tab = t.id">
        <Icon :name="t.icon" :size="15" /> {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="loading-line"><span class="spinner" /> Carico le impostazioni…</div>

    <template v-else-if="data">
      <section v-if="tab === 'casa'" class="page-stack">
        <div class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">Identità</p>
              <h2>La casa</h2>
              <p class="card-note">Il nome che compare nell’app e nelle email.</p>
            </div>
          </header>
          <div class="field">
            <label for="house-name">Nome della casa</label>
            <input id="house-name" v-model="settingsForm.household_name" class="input" maxlength="60" />
          </div>
        </div>

        <div class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">Promemoria</p>
              <h2>Quando avvisare</h2>
              <p class="card-note">Le email partono nel fuso orario Europe/Rome.</p>
            </div>
            <span class="switch" :class="{ on: settingsForm.reminder_email_enabled }" role="switch" :aria-checked="settingsForm.reminder_email_enabled" @click="settingsForm.reminder_email_enabled = !settingsForm.reminder_email_enabled" />
          </header>

          <div class="settings-grid">
            <div class="field">
              <label for="rem-hour">Ora dei promemoria</label>
              <input id="rem-hour" v-model="settingsForm.reminder_hour" class="input" type="time" />
              <span class="hint">Es. 09:00 per la mattina.</span>
            </div>
            <div class="field">
              <label for="ev-offset">Eventi: quanti giorni prima</label>
              <select id="ev-offset" v-model.number="settingsForm.event_offset_days" class="select">
                <option :value="0">Il giorno stesso</option>
                <option :value="1">1 giorno prima</option>
                <option :value="2">2 giorni prima</option>
                <option :value="3">3 giorni prima</option>
                <option :value="7">1 settimana prima</option>
              </select>
            </div>
          </div>

          <div class="field" style="margin-top: 16px">
            <label>Scadenze: quanti giorni prima</label>
            <div class="offset-row">
              <button
                v-for="opt in offsetOptions"
                :key="opt.value"
                type="button"
                class="chip"
                :class="{ active: offsets.includes(opt.value) }"
                @click="toggleOffset(opt.value)"
              >
                <Icon :name="offsets.includes(opt.value) ? 'check' : 'plus'" :size="12" />
                {{ opt.label }}
              </button>
            </div>
            <span class="hint">Puoi sceglierne più di uno. Il giorno stesso arriva alle {{ settingsForm.reminder_hour }}.</span>
          </div>

          <div class="switch-row" style="margin-top: 10px">
            <div>
              <strong class="strong">Promemoria per le piante</strong>
              <p class="hint">Un’email il giorno in cui una pianta va annaffiata o curata.</p>
            </div>
            <button type="button" class="switch" :class="{ on: settingsForm.plant_reminders }" role="switch" :aria-checked="settingsForm.plant_reminders" @click="settingsForm.plant_reminders = !settingsForm.plant_reminders" />
          </div>

          <div class="settings-foot">
            <span v-if="!emailConfigured" class="badge badge-danger"><Icon name="alert" :size="11" /> SMTP non configurato</span>
            <button type="button" class="btn btn-primary" :disabled="savingSettings" @click="saveSettings">
              <span v-if="savingSettings" class="spinner" /> Salva impostazioni
            </button>
          </div>
        </div>
      </section>

      <section v-if="tab === 'famiglia'" class="page-stack">
        <div class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">Persone</p>
              <h2>La famiglia</h2>
              <p class="card-note">Ognuno entra con il proprio PIN. I dati condivisi sono di tutti, quelli privati solo di chi li crea.</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm" @click="openNewUser">
              <Icon name="plus" :size="15" /> Aggiungi
            </button>
          </header>

          <div class="user-list">
            <div v-for="user in users" :key="user.id" class="user-row">
              <Avatar :name="user.name" :emoji="user.emoji" :color="user.color" :size="46" />
              <div class="user-info">
                <div class="user-name-row">
                  <strong>{{ user.name }}</strong>
                  <span v-if="user.id === auth.user?.id" class="badge badge-sage">sei tu</span>
                  <span class="badge" :class="user.role === 'admin' ? 'badge-primary' : 'badge-blue'">
                    {{ user.role === 'admin' ? 'Amministratore' : 'Famiglia' }}
                  </span>
                  <span v-if="!user.isActive" class="badge badge-danger">disattivato</span>
                </div>
                <p class="user-sub">
                  <span v-if="user.email">{{ user.email }}</span>
                  <span v-else class="muted">nessuna email</span>
                  <span class="dot-sep">·</span>
                  <span class="muted">{{ user.lastLoginAt ? `ultimo accesso ${formatDate(user.lastLoginAt.slice(0, 10))}` : 'mai entrato' }}</span>
                </p>
              </div>
              <div class="user-actions">
                <button type="button" class="btn btn-ghost btn-sm" @click="openEditUser(user)">
                  <Icon name="edit" :size="14" /> Modifica
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-note">
          <Icon name="shield" :size="16" /> Il PIN è personale e viene salvato solo come hash. Se qualcuno lo dimentica, reimpostalo da qui.
        </div>
      </section>

      <section v-if="tab === 'email'" class="page-stack">
        <div class="card" :class="emailConfigured ? 'card-sage' : 'card-gold'">
          <header class="card-head">
            <div>
              <p class="eyebrow">Posta in uscita</p>
              <h2>{{ emailConfigured ? 'Email configurate' : 'Email da configurare' }}</h2>
              <p class="card-note">
                {{ emailConfigured ? `Server: ${data.mail.host} · da ${data.mail.from}` : 'Senza SMTP i promemoria restano in coda e non partono.' }}
              </p>
            </div>
            <span class="badge" :class="emailConfigured ? 'badge-sage' : 'badge-gold'">
              {{ emailConfigured ? 'attivo' : 'da attivare' }}
            </span>
          </header>

          <div class="mail-stats">
            <div class="mail-stat">
              <strong>{{ data.mail.recipients }}</strong>
              <span>destinatari con email</span>
            </div>
            <div class="mail-stat">
              <strong>{{ data.reminderStats.sent }}</strong>
              <span>promemoria inviati</span>
            </div>
            <div class="mail-stat">
              <strong>{{ data.reminderStats.failed }}</strong>
              <span>falliti</span>
            </div>
          </div>

          <div v-if="!emailConfigured" class="panel-note" style="margin-top: 14px">
            <p class="strong" style="margin-bottom: 6px">Come attivarle</p>
            <p>Nel file <code>.env</code> del server imposta <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> e <code>MAIL_FROM</code>, poi riavvia il container. Con Gmail serve una password per le app.</p>
          </div>

          <div class="settings-foot">
            <button type="button" class="btn btn-ghost" :disabled="!emailConfigured || testing" @click="testEmail">
              <span v-if="testing" class="spinner" />
              <Icon v-else name="mail" :size="16" /> Invia email di prova
            </button>
            <button type="button" class="btn btn-primary" :disabled="running" @click="checkReminders">
              <span v-if="running" class="spinner" />
              <Icon v-else name="refresh" :size="16" /> Controlla ora
            </button>
          </div>
          <p v-if="data.mail.lastError" class="error-text" style="margin-top: 10px">Ultimo errore SMTP: {{ data.mail.lastError }}</p>
        </div>

        <div class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">In coda</p>
              <h2>Prossimi promemoria</h2>
              <p class="card-note">Generati automaticamente quando crei scadenze, eventi e attività delle piante.</p>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="resyncing" @click="resyncReminders">
              <Icon name="refresh" :size="14" /> Rigenera
            </button>
          </header>

          <div v-if="pendingReminders.length" class="reminder-list">
            <div v-for="reminder in pendingReminders" :key="reminder.id" class="reminder-row">
              <span class="reminder-when">{{ formatInstant(reminder.send_at) }}</span>
              <span class="reminder-label">{{ reminder.label || 'Elemento eliminato' }}</span>
              <span class="badge badge-blue">{{ reminder.entity_type === 'plant_task' ? 'pianta' : reminder.entity_type === 'event' ? 'evento' : 'scadenza' }}</span>
            </div>
          </div>
          <p v-else class="muted small">Nessun promemoria in coda.</p>
        </div>
      </section>

      <section v-if="tab === 'backup'" class="page-stack">
        <div class="card card-terracotta">
          <header class="card-head">
            <div>
              <p class="eyebrow">I tuoi dati</p>
              <h2>Esporta un backup</h2>
              <p class="card-note">Nessun backup automatico: quando vuoi, scarichi tutto in un archivio.</p>
            </div>
          </header>
          <p class="backup-text">
            L’archivio contiene il database completo, tutte le foto e gli allegati, una copia leggibile dei dati e le istruzioni per il ripristino. Conservalo su un disco diverso dal server.
          </p>
          <div class="backup-actions">
            <button type="button" class="btn btn-primary btn-lg" :disabled="exporting" @click="exportBackup">
              <span v-if="exporting" class="spinner" />
              <Icon v-else name="download" :size="18" /> Esporta backup (.zip)
            </button>
            <button type="button" class="btn btn-ghost" @click="exportJson">
              <Icon name="file" :size="16" /> Solo dati (.json)
            </button>
          </div>
          <p class="hint" style="margin-top: 12px">
            Ultimo backup: {{ data.lastBackupAt ? formatInstant(data.lastBackupAt) : 'mai eseguito' }}.
          </p>
        </div>

        <div class="card">
          <header class="card-head">
            <div>
              <p class="eyebrow">Spazio</p>
              <h2>Occupazione</h2>
            </div>
          </header>
          <div class="storage-grid">
            <div class="storage-item">
              <span class="storage-icon"><Icon name="database" :size="18" /></span>
              <div><strong>{{ formatBytes(data.storage.dbBytes) }}</strong><span>database</span></div>
            </div>
            <div class="storage-item">
              <span class="storage-icon"><Icon name="image" :size="18" /></span>
              <div><strong>{{ formatBytes(data.storage.uploadsBytes) }}</strong><span>foto e allegati ({{ data.storage.uploadsFiles }})</span></div>
            </div>
            <div class="storage-item">
              <span class="storage-icon"><Icon name="paperclip" :size="18" /></span>
              <div><strong>{{ data.storage.attachments }}</strong><span>allegati totali</span></div>
            </div>
          </div>
          <p class="hint" style="margin-top: 14px">Limite per file: {{ data.maxUploadMb }} MB. Il backup NON include le email o le impostazioni SMTP, che restano nel file .env.</p>
        </div>

        <div class="panel-note">
          <p class="strong" style="margin-bottom: 6px">Ripristino</p>
          <p>Ferma il container, sostituisci <code>data/ghibiri.db</code> e la cartella <code>data/uploads</code> con quelli dell’archivio, riavvia. Le istruzioni complete sono dentro il file <code>LEGGIMI.txt</code> del backup.</p>
        </div>
      </section>
    </template>

    <BaseModal v-model="userModal" :title="userEditing ? 'Modifica membro' : 'Nuovo membro'" subtitle="PIN personale di 4 cifre." size="md">
      <div class="stack">
        <div class="form-grid">
          <div class="field">
            <label for="u-name">Nome</label>
            <input id="u-name" v-model="userForm.name" class="input" maxlength="40" placeholder="es. Mamma" />
          </div>
          <div class="field">
            <label for="u-email">Email</label>
            <input id="u-email" v-model="userForm.email" class="input" type="email" placeholder="nome@email.it" />
            <span class="hint">Dove riceve i promemoria.</span>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="u-role">Ruolo</label>
            <select id="u-role" v-model="userForm.role" class="select">
              <option value="member">Famiglia</option>
              <option value="admin">Amministratore</option>
            </select>
          </div>
          <div class="field">
            <label for="u-pin">{{ userEditing ? 'Nuovo PIN (facoltativo)' : 'PIN di 4 cifre' }}</label>
            <input id="u-pin" v-model="userForm.pin" class="input" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="new-password" />
            <span v-if="userEditing" class="hint">Lascia vuoto per non cambiarlo.</span>
          </div>
        </div>

        <div class="field">
          <label>Colore</label>
          <div class="color-row">
            <button v-for="color in USER_COLORS" :key="color" type="button" class="color-dot" :class="{ active: userForm.color === color }" :style="{ background: color }" :aria-label="`Colore ${color}`" @click="userForm.color = color" />
          </div>
        </div>

        <div class="field">
          <label>Icona</label>
          <div class="emoji-row">
            <button v-for="emoji in USER_EMOJIS" :key="emoji" type="button" class="emoji-btn" :class="{ active: userForm.emoji === emoji }" @click="userForm.emoji = emoji">{{ emoji }}</button>
          </div>
        </div>

        <div v-if="userEditing" class="switch-row">
          <div><strong class="strong">Profilo attivo</strong><p class="hint">Se disattivato, non può più accedere.</p></div>
          <button type="button" class="switch" :class="{ on: userForm.isActive }" role="switch" :aria-checked="userForm.isActive" @click="userForm.isActive = !userForm.isActive" />
        </div>

        <p v-if="userError" class="error-text">{{ userError }}</p>
      </div>

      <template #footer>
        <button v-if="userEditing && userEditing.id !== auth.user?.id" type="button" class="btn btn-danger-ghost" style="margin-right: auto" @click="deleteUser">Elimina</button>
        <button type="button" class="btn btn-ghost" @click="userModal = false">Annulla</button>
        <button type="button" class="btn btn-primary" :disabled="savingUser" @click="saveUser">
          <span v-if="savingUser" class="spinner" /> Salva
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 940px;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.offset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.settings-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.user-list {
  display: flex;
  flex-direction: column;
}
.user-row {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 0;
  border-top: 1px solid var(--line);
}
.user-row:first-child {
  border-top: 0;
}
.user-info {
  flex: 1;
  min-width: 0;
}
.user-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.user-name-row strong {
  font-size: 14.5px;
}
.user-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--ink-soft);
  margin-top: 3px;
  flex-wrap: wrap;
}
.dot-sep {
  color: var(--line-strong);
}
.mail-stats {
  display: flex;
  gap: 26px;
  flex-wrap: wrap;
}
.mail-stat {
  display: flex;
  flex-direction: column;
}
.mail-stat strong {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 600;
  line-height: 1.1;
}
.mail-stat span {
  font-size: 11px;
  color: var(--muted);
}
.reminder-list {
  display: flex;
  flex-direction: column;
}
.reminder-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
  font-size: 12.5px;
}
.reminder-row:first-child {
  border-top: 0;
}
.reminder-when {
  width: 150px;
  flex: none;
  color: var(--muted);
  font-size: 11.5px;
}
.reminder-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.backup-text {
  font-size: 13.5px;
  color: var(--ink-soft);
  line-height: 1.65;
  max-width: 62ch;
}
.backup-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
}
.storage-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.storage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px;
  background: var(--surface-2);
  border-radius: 12px;
}
.storage-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--surface);
  color: var(--muted);
  display: grid;
  place-items: center;
  flex: none;
}
.storage-item div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.storage-item strong {
  font-size: 15px;
}
.storage-item span {
  font-size: 10.5px;
  color: var(--muted);
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
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 18px;
  cursor: pointer;
}
.emoji-btn.active {
  border-color: var(--primary);
  background: var(--primary-soft);
}
@media (max-width: 720px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .storage-grid {
    grid-template-columns: 1fr;
  }
  .reminder-row {
    flex-wrap: wrap;
    gap: 6px;
  }
  .reminder-when {
    width: auto;
  }
  .settings-foot .btn {
    flex: 1;
  }
  .user-row {
    flex-wrap: wrap;
  }
  .user-actions {
    width: 100%;
    padding-left: 59px;
  }
}
</style>
