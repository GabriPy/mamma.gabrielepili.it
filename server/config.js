import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));

fs.mkdirSync(DATA_DIR, { recursive: true });

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseTrustProxy(value) {
  if (value === undefined || value === '') return 1;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const secureCookies = bool(process.env.COOKIE_SECURE, appUrl.startsWith('https://'));

export const config = {
  root: ROOT,
  dataDir: DATA_DIR,
  dbPath: path.join(DATA_DIR, 'ghibiri.db'),
  uploadsDir: path.join(DATA_DIR, 'uploads'),
  tmpDir: path.join(DATA_DIR, 'tmp'),
  publicDir: path.join(ROOT, 'dist'),
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  appUrl,
  env: process.env.NODE_ENV || 'development',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  timezone: process.env.TZ || 'Europe/Rome',
  sessionDays: int(process.env.SESSION_DAYS, 30),
  cookieName: 'gh_sess',
  cookieSecure: secureCookies,
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 15),
  maxAttachmentsPerItem: int(process.env.MAX_ATTACHMENTS, 12),
  reminderHour: process.env.REMINDER_HOUR || '09:00',
  ai: {
    baseUrl: (process.env.AI_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 45000),
    maxTokens: int(process.env.AI_MAX_TOKENS, 1600),
    temperature: Number(process.env.AI_TEMPERATURE || 0.85),
    jsonMode: ['off', 'object', 'schema'].includes(String(process.env.AI_JSON_MODE || '').toLowerCase())
      ? String(process.env.AI_JSON_MODE).toLowerCase()
      : 'object',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Ghibiri Home <no-reply@ghibiri.it>',
    replyTo: process.env.MAIL_REPLY_TO || '',
  },
  seed: {
    adminPin: process.env.ADMIN_PIN || '',
    adminName: process.env.ADMIN_NAME || 'Gabriele',
    adminEmail: process.env.ADMIN_EMAIL || '',
    mammaPin: process.env.MAMMA_PIN || '',
    mammaName: process.env.MAMMA_NAME || 'Mamma',
    mammaEmail: process.env.MAMMA_EMAIL || '',
    demo: bool(process.env.SEED_DEMO, false),
  },
};

export function smtpConfigured() {
  return Boolean(config.smtp.host);
}

export function aiConfigured() {
  return Boolean(config.ai.baseUrl && config.ai.model);
}

fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(config.tmpDir, { recursive: true });
