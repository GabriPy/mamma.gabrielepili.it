import { Router } from 'express';
import { z } from 'zod';
import { audit, db, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, cleanText, toId, validate } from '../lib/http.js';
import { deadlineOut } from '../lib/serialize.js';
import { attachToItems } from '../lib/entities.js';
import { nextDateFor, todayLocal } from '../lib/time.js';
import { removeEntityReminders, syncDeadlineReminders } from '../reminders.js';
import { deleteAttachmentsFor } from '../uploads.js';

export const deadlinesRouter = Router();
deadlinesRouter.use(requireAuth);

const schema = z.object({
  title: z.string().trim().min(1, 'Il titolo è obbligatorio.').max(160),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida.'),
  category: z.string().trim().max(40).optional().default('Casa'),
  notes: z.string().max(5000).nullish(),
  recurrence: z.enum(['none', 'monthly', 'yearly']).optional().default('none'),
  visibility: z.enum(['shared', 'private']).optional().default('shared'),
  amount: z.union([z.number().nonnegative().max(1000000), z.literal(''), z.null()]).optional(),
});

function canManage(row, user) {
  return row.visibility === 'shared' || row.created_by === user.id;
}

function getDeadline(id, user) {
  const row = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Scadenza non trovata.');
  if (!canManage(row, user)) throw new HttpError(403, 'Questa scadenza è privata.');
  return row;
}

deadlinesRouter.get('/', (req, res) => {
  const filter = String(req.query.filter || 'open');
  const rows = db
    .prepare(
      `SELECT * FROM deadlines
       WHERE (visibility = 'shared' OR created_by = ?)
       ORDER BY (status = 'done') ASC, due_date ASC, id DESC`,
    )
    .all(req.user.id);
  let items = attachToItems(rows, 'deadline').map(deadlineOut);
  if (filter === 'open') items = items.filter((d) => d.status === 'open');
  else if (filter === 'done') items = items.filter((d) => d.status === 'done');
  else if (filter === 'overdue') items = items.filter((d) => d.status === 'open' && d.daysLeft < 0);
  res.json({ deadlines: items, today: todayLocal() });
});

deadlinesRouter.post('/', (req, res) => {
  const body = validate(schema, req.body);
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO deadlines (title, due_date, category, notes, recurrence, visibility, amount, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      body.title,
      body.dueDate,
      body.category,
      cleanText(body.notes, 5000),
      body.recurrence,
      body.visibility,
      body.amount === '' || body.amount === null || body.amount === undefined ? null : body.amount,
      req.user.id,
      now,
      now,
    );
  const row = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(info.lastInsertRowid);
  syncDeadlineReminders(row);
  audit(req.user.id, 'create_deadline', 'deadline', row.id, { title: row.title });
  res.status(201).json({ deadline: deadlineOut(row) });
});

deadlinesRouter.patch('/:id', (req, res) => {
  const id = toId(req.params.id);
  const existing = getDeadline(id, req.user);
  const body = validate(schema.partial().extend({ status: z.enum(['open', 'done']).optional() }), req.body);
  const next = {
    title: body.title ?? existing.title,
    dueDate: body.dueDate ?? existing.due_date,
    category: body.category ?? existing.category,
    notes: body.notes === undefined ? existing.notes : cleanText(body.notes, 5000),
    recurrence: body.recurrence ?? existing.recurrence,
    visibility: body.visibility ?? existing.visibility,
    amount:
      body.amount === undefined
        ? existing.amount
        : body.amount === '' || body.amount === null
          ? null
          : body.amount,
    status: body.status ?? existing.status,
  };
  db.prepare(
    `UPDATE deadlines SET title = ?, due_date = ?, category = ?, notes = ?, recurrence = ?, visibility = ?, amount = ?,
       status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
  ).run(
    next.title,
    next.dueDate,
    next.category,
    next.notes,
    next.recurrence,
    next.visibility,
    next.amount,
    next.status,
    next.status === 'done' ? existing.completed_at || nowIso() : null,
    nowIso(),
    id,
  );
  const row = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
  syncDeadlineReminders(row);
  audit(req.user.id, 'update_deadline', 'deadline', id);
  res.json({ deadline: deadlineOut(row) });
});

deadlinesRouter.post('/:id/complete', (req, res) => {
  const id = toId(req.params.id);
  const existing = getDeadline(id, req.user);
  const body = validate(z.object({ done: z.boolean().optional().default(true) }), req.body || {});

  if (!body.done) {
    db.prepare("UPDATE deadlines SET status = 'open', completed_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), id);
    const row = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
    syncDeadlineReminders(row);
    return res.json({ deadline: deadlineOut(row), repeated: false });
  }

  if (existing.recurrence !== 'none') {
    let nextDate = nextDateFor(existing.due_date, existing.recurrence);
    const today = todayLocal();
    let guard = 0;
    while (nextDate && nextDate < today && guard < 36) {
      nextDate = nextDateFor(nextDate, existing.recurrence);
      guard += 1;
    }
    db.prepare("UPDATE deadlines SET due_date = ?, completed_at = ?, updated_at = ? WHERE id = ?").run(
      nextDate,
      nowIso(),
      nowIso(),
      id,
    );
    const row = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
    syncDeadlineReminders(row);
    audit(req.user.id, 'complete_recurring_deadline', 'deadline', id, { next: nextDate });
    return res.json({ deadline: deadlineOut(row), repeated: true });
  }

  db.prepare("UPDATE deadlines SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), id);
  removeEntityReminders('deadline', id);
  const row = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
  audit(req.user.id, 'complete_deadline', 'deadline', id);
  res.json({ deadline: deadlineOut(row), repeated: false });
});

deadlinesRouter.delete('/:id', (req, res) => {
  const id = toId(req.params.id);
  getDeadline(id, req.user);
  db.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
  removeEntityReminders('deadline', id);
  deleteAttachmentsFor('deadline', id);
  audit(req.user.id, 'delete_deadline', 'deadline', id);
  res.json({ ok: true });
});
