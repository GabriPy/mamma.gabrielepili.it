import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  color TEXT NOT NULL DEFAULT '#C4623F',
  emoji TEXT NOT NULL DEFAULT '🙂',
  is_active INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  category TEXT NOT NULL DEFAULT 'Casa',
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly','yearly')),
  recurrence_until TEXT,
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared','private')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Casa',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','monthly','yearly')),
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared','private')),
  amount REAL,
  completed_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines(due_date, status);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🛒',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  category TEXT NOT NULL DEFAULT 'Altro',
  note TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_items(list_id, done);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  servings INTEGER,
  prep_minutes INTEGER,
  category TEXT NOT NULL DEFAULT 'Primi',
  notes TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients ON recipe_ingredients(recipe_id);

CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  species TEXT,
  location TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plant_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'acqua' CHECK (type IN ('acqua','concime','potatura','rinvaso','controllo')),
  interval_days INTEGER NOT NULL DEFAULT 7,
  next_due_date TEXT NOT NULL,
  last_done_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plant_tasks_due ON plant_tasks(next_due_date);

CREATE TABLE IF NOT EXISTS plant_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES plant_tasks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  done_at TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_plant_logs_plant ON plant_logs(plant_id, done_at);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event','deadline','recipe','plant')),
  entity_id INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event','deadline','plant_task')),
  entity_id INTEGER NOT NULL,
  send_at TEXT NOT NULL,
  occurrence_at TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  last_error TEXT,
  source TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, send_at);
CREATE INDEX IF NOT EXISTS idx_reminders_entity ON reminders(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`;

db.exec(SCHEMA);
db.pragma('user_version = 1');

export const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- password PIN

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPin(pin, stored) {
  try {
    const [scheme, N, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64url');
    const actual = crypto.scryptSync(String(pin), Buffer.from(salt, 'base64url'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export const isFourDigitPin = (pin) => /^\d{4}$/.test(String(pin ?? ''));

// ------------------------------------------------------------------- settings

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, String(value));
}

export function allSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function audit(userId, action, entityType = null, entityId = null, detail = null) {
  try {
    db.prepare(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(userId ?? null, action, entityType, entityId, detail ? JSON.stringify(detail) : null, nowIso());
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

// --------------------------------------------------------------------- setup

const DEFAULT_SETTINGS = {
  household_name: 'Casa Ghibiri',
  reminder_hour: config.reminderHour,
  reminder_email_enabled: 'true',
  deadline_offsets: '7,1',
  event_offset_days: '1',
  plant_reminders: 'true',
};

export function seed() {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);

  const listCount = db.prepare('SELECT COUNT(*) AS n FROM shopping_lists').get().n;
  if (listCount === 0) {
    db.prepare('INSERT INTO shopping_lists (name, emoji, is_default, created_at) VALUES (?, ?, 1, ?)').run(
      'Spesa di casa',
      '🛒',
      nowIso(),
    );
  }

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    const adminPin = isFourDigitPin(config.seed.adminPin) ? config.seed.adminPin : String(crypto.randomInt(1000, 10000));
    const now = nowIso();
    db.prepare(
      `INSERT INTO users (name, email, pin_hash, role, color, emoji, created_at)
       VALUES (?, ?, ?, 'admin', '#C4623F', '🧔', ?)`,
    ).run(config.seed.adminName.trim() || 'Admin', config.seed.adminEmail.trim() || null, hashPin(adminPin), now);

    console.log('──────────────────────────────────────────────');
    console.log(`  Primo avvio: utente amministratore "${config.seed.adminName}" creato.`);
    if (!isFourDigitPin(config.seed.adminPin)) {
      console.log(`  PIN ADMIN GENERATO (cambialo dalle impostazioni): ${adminPin}`);
    }
    console.log('──────────────────────────────────────────────');

    if (isFourDigitPin(config.seed.mammaPin)) {
      db.prepare(
        `INSERT INTO users (name, email, pin_hash, role, color, emoji, created_at)
         VALUES (?, ?, ?, 'member', '#6E7F55', '👩', ?)`,
      ).run(
        config.seed.mammaName.trim() || 'Mamma',
        config.seed.mammaEmail.trim() || null,
        hashPin(config.seed.mammaPin),
        now,
      );
      console.log(`  Utente "${config.seed.mammaName}" creato con PIN da configurazione.`);
    }
  }

}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    role: row.role,
    color: row.color,
    emoji: row.emoji,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}
