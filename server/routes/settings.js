import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { allSettings, audit, db, getSetting, setSetting } from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { config, smtpConfigured } from '../config.js';
import { HttpError, validate } from '../lib/http.js';
import { mailStatus, sendTestEmail } from '../mailer.js';
import { dirSize } from '../uploads.js';
import { processDueReminders, refreshRecurringEvents, syncDeadlineReminders, syncEventReminders, syncPlantTaskReminders } from '../reminders.js';

export const settingsRouter = Router();

const ALLOWED_KEYS = new Set([
  'household_name',
  'reminder_hour',
  'reminder_email_enabled',
  'deadline_offsets',
  'event_offset_days',
  'plant_reminders',
]);

const valuesSchema = z.object({
  household_name: z.string().trim().min(1).max(60).optional(),
  reminder_hour: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Orario non valido.').optional(),
  reminder_email_enabled: z.boolean().optional(),
  deadline_offsets: z
    .string()
    .regex(/^\d{1,2}(,\d{1,2}){0,3}$/, 'Indica da 1 a 4 giorni, separati da virgola.')
    .optional(),
  event_offset_days: z.coerce.number().int().min(0).max(30).optional(),
  plant_reminders: z.boolean().optional(),
});

function storageStats() {
  const uploads = dirSize(config.uploadsDir);
  let dbBytes = 0;
  try {
    dbBytes = fs.statSync(config.dbPath).size;
  } catch {
    dbBytes = 0;
  }
  return {
    dbBytes,
    uploadsBytes: uploads.bytes,
    uploadsFiles: uploads.files,
    attachments: db.prepare('SELECT COUNT(*) AS n FROM attachments').get().n,
  };
}

/** Impostazioni leggibili da tutti i membri (senza dettagli tecnici). */
settingsRouter.get('/public', requireAuth, (_req, res) => {
  res.json({
    householdName: getSetting('household_name', 'Casa Ghibiri'),
    reminderHour: getSetting('reminder_hour', config.reminderHour),
    emailReminders: getSetting('reminder_email_enabled', 'true') === 'true' && smtpConfigured(),
    deadlineOffsets: getSetting('deadline_offsets', '7,1'),
    eventOffsetDays: Number(getSetting('event_offset_days', '1')),
    plantReminders: getSetting('plant_reminders', 'true') === 'true',
    maxUploadMb: config.maxUploadMb,
    appUrl: config.appUrl,
  });
});

settingsRouter.get('/', requireAdmin, (_req, res) => {
  const settings = allSettings();
  const reminderQueue = db
    .prepare(
      `SELECT r.id, r.entity_type, r.entity_id, r.send_at, r.status, r.attempts, r.last_error,
        CASE r.entity_type
          WHEN 'deadline' THEN (SELECT title FROM deadlines WHERE id = r.entity_id)
          WHEN 'event' THEN (SELECT title FROM events WHERE id = r.entity_id)
          WHEN 'plant_task' THEN (SELECT p.name FROM plant_tasks t JOIN plants p ON p.id = t.plant_id WHERE t.id = r.entity_id)
        END AS label
       FROM reminders r WHERE r.status = 'pending' ORDER BY r.send_at ASC LIMIT 25`,
    )
    .all();
  const sentCount = db.prepare("SELECT COUNT(*) AS n FROM reminders WHERE status = 'sent'").get().n;
  const failedCount = db.prepare("SELECT COUNT(*) AS n FROM reminders WHERE status = 'failed'").get().n;
  const lastBackup = db
    .prepare("SELECT created_at, detail FROM audit_log WHERE action = 'export_backup' ORDER BY id DESC LIMIT 1")
    .get();
  res.json({
    settings,
    mail: mailStatus(),
    storage: storageStats(),
    reminders: reminderQueue,
    reminderStats: { sent: sentCount, failed: failedCount },
    lastBackupAt: lastBackup?.created_at || null,
    maxUploadMb: config.maxUploadMb,
    app: { version: process.env.APP_VERSION || '1.0.0', appUrl: config.appUrl, timezone: config.timezone },
  });
});

settingsRouter.patch('/', requireAdmin, (req, res) => {
  const body = validate(valuesSchema, req.body);
  const changed = [];
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    setSetting(key, typeof value === 'boolean' ? String(value) : String(value));
    changed.push(key);
  }
  if (!changed.length) throw new HttpError(400, 'Nessuna impostazione da salvare.');
  audit(req.user.id, 'update_settings', null, null, { changed });

  if (changed.some((key) => ['reminder_email_enabled', 'deadline_offsets', 'event_offset_days', 'plant_reminders', 'reminder_hour'].includes(key))) {
    for (const row of db.prepare("SELECT * FROM deadlines WHERE status = 'open'").all()) syncDeadlineReminders(row);
    for (const row of db.prepare('SELECT * FROM events').all()) syncEventReminders(row);
    for (const task of db.prepare('SELECT id FROM plant_tasks').all()) syncPlantTaskReminders(task.id);
  }
  res.json({ settings: allSettings() });
});

settingsRouter.post('/test-email', requireAdmin, async (req, res) => {
  if (!smtpConfigured()) {
    throw new HttpError(400, 'SMTP non configurato. Imposta SMTP_HOST, SMTP_USER e SMTP_PASS nel file .env.');
  }
  const body = validate(
    z.object({ to: z.union([z.string().trim().email(), z.literal(''), z.undefined()]).optional() }),
    req.body || {},
  );
  await sendTestEmail(body.to || null);
  audit(req.user.id, 'test_email', null, null, { to: body.to || 'primo indirizzo disponibile' });
  res.json({ ok: true, message: 'Email di prova inviata.' });
});

settingsRouter.post('/run-reminders', requireAdmin, async (req, res) => {
  const stats = await processDueReminders({ force: true });
  res.json({ stats, mail: mailStatus() });
});

settingsRouter.post('/resync-reminders', requireAdmin, (req, res) => {
  const deadlines = db.prepare("SELECT * FROM deadlines WHERE status = 'open'").all();
  for (const row of deadlines) syncDeadlineReminders(row);
  refreshRecurringEvents();
  audit(req.user.id, 'resync_reminders');
  res.json({ ok: true, deadlines: deadlines.length });
});
