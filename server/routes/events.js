import { Router } from 'express';
import { z } from 'zod';
import { audit, db, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, cleanText, toId, validate } from '../lib/http.js';
import { addDays, expandRecurrence, todayLocal } from '../lib/time.js';
import { attachToItems } from '../lib/entities.js';
import { eventOut } from '../lib/serialize.js';
import { syncEventReminders, removeEntityReminders } from '../reminders.js';
import { deleteAttachmentsFor } from '../uploads.js';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

const dateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Data o orario non validi.')
  .transform((value) => (value.length === 10 ? `${value}T00:00` : value));

const baseSchema = z.object({
  title: z.string().trim().min(1, 'Il titolo è obbligatorio.').max(160),
  description: z.string().max(5000).nullish(),
  startsAt: dateTime,
  endsAt: z.union([dateTime, z.literal(''), z.null()]).optional(),
  allDay: z.boolean().optional().default(false),
  location: z.string().max(160).nullish(),
  category: z.string().trim().max(40).optional().default('Casa'),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).optional().default('none'),
  recurrenceUntil: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
  visibility: z.enum(['shared', 'private']).optional().default('shared'),
});

function canManage(row, user) {
  return row.visibility === 'shared' || row.created_by === user.id;
}

function getEvent(id, user) {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Evento non trovato.');
  if (!canManage(row, user)) throw new HttpError(403, 'Questo evento è privato.');
  return row;
}

function normalize(data, existing = null) {
  const startsAt = data.startsAt ?? existing?.starts_at;
  const endsAt = data.endsAt === '' ? null : data.endsAt ?? existing?.ends_at ?? null;
  if (endsAt && endsAt < startsAt) throw new HttpError(400, 'La fine deve essere successiva all’inizio.');
  const recurrence = data.recurrence ?? existing?.recurrence ?? 'none';
  const recurrenceUntil = recurrence === 'none' ? null : data.recurrenceUntil ?? existing?.recurrence_until ?? null;
  return {
    title: data.title ?? existing?.title,
    description: data.description === undefined ? existing?.description ?? null : cleanText(data.description, 5000),
    startsAt,
    endsAt,
    allDay: (data.allDay ?? Boolean(existing?.all_day)) ? 1 : 0,
    location: data.location === undefined ? existing?.location ?? null : cleanText(data.location, 160),
    category: data.category ?? existing?.category ?? 'Casa',
    recurrence,
    recurrenceUntil,
    visibility: data.visibility ?? existing?.visibility ?? 'shared',
  };
}

eventsRouter.get('/', (req, res) => {
  const from = String(req.query.from || todayLocal()).slice(0, 10);
  const to = String(req.query.to || addDays(from, 30)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new HttpError(400, 'Intervallo di date non valido.');
  }
  if (to < from) throw new HttpError(400, 'Intervallo di date non valido.');
  if (to > addDays(from, 400)) throw new HttpError(400, 'Intervallo troppo ampio.');

  const rows = db
    .prepare(
      `SELECT * FROM events
       WHERE (visibility = 'shared' OR created_by = ?)
         AND substr(starts_at, 1, 10) <= ?
         AND (recurrence <> 'none' OR substr(starts_at, 1, 10) >= ?)
       ORDER BY starts_at ASC`,
    )
    .all(req.user.id, to, from);

  const withAttachments = attachToItems(rows, 'event');
  const items = [];
  for (const row of withAttachments) {
    const startDate = row.starts_at.slice(0, 10);
    if (row.recurrence === 'none') {
      if (startDate >= from && startDate <= to) items.push(eventOut(row));
      continue;
    }
    const occurrences = expandRecurrence({
      startDate,
      recurrence: row.recurrence,
      until: row.recurrence_until,
      from,
      to,
      max: 120,
    });
    for (const occurrence of occurrences) items.push(eventOut(row, occurrence));
  }
  items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  res.json({ events: items, range: { from, to } });
});

eventsRouter.get('/:id', (req, res) => {
  const row = getEvent(toId(req.params.id), req.user);
  const [withAttachments] = attachToItems([row], 'event');
  res.json({ event: eventOut(withAttachments) });
});

eventsRouter.post('/', (req, res) => {
  const body = validate(baseSchema, req.body);
  const data = normalize(body);
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO events (title, description, starts_at, ends_at, all_day, location, category, recurrence, recurrence_until, visibility, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.title,
      data.description,
      data.startsAt,
      data.endsAt,
      data.allDay,
      data.location,
      data.category,
      data.recurrence,
      data.recurrenceUntil,
      data.visibility,
      req.user.id,
      now,
      now,
    );
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  syncEventReminders(row);
  audit(req.user.id, 'create_event', 'event', row.id, { title: row.title });
  res.status(201).json({ event: eventOut(row) });
});

eventsRouter.patch('/:id', (req, res) => {
  const id = toId(req.params.id);
  const existing = getEvent(id, req.user);
  const body = validate(baseSchema.partial(), req.body);
  const data = normalize(body, existing);
  db.prepare(
    `UPDATE events SET title = ?, description = ?, starts_at = ?, ends_at = ?, all_day = ?, location = ?, category = ?,
       recurrence = ?, recurrence_until = ?, visibility = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    data.title,
    data.description,
    data.startsAt,
    data.endsAt,
    data.allDay,
    data.location,
    data.category,
    data.recurrence,
    data.recurrenceUntil,
    data.visibility,
    nowIso(),
    id,
  );
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  syncEventReminders(row);
  audit(req.user.id, 'update_event', 'event', id);
  res.json({ event: eventOut(row) });
});

eventsRouter.delete('/:id', (req, res) => {
  const id = toId(req.params.id);
  getEvent(id, req.user);
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  removeEntityReminders('event', id);
  deleteAttachmentsFor('event', id);
  audit(req.user.id, 'delete_event', 'event', id);
  res.json({ ok: true });
});
