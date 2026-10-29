import { Router } from 'express';
import { z } from 'zod';
import { audit, db, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, cleanText, toId, validate } from '../lib/http.js';
import { addDays, isoToLocalDate, localToUtc, todayLocal } from '../lib/time.js';
import { plantLogOut, plantOut, plantTaskOut } from '../lib/serialize.js';
import { attachToItems } from '../lib/entities.js';
import { removeEntityReminders, syncPlantTaskReminders } from '../reminders.js';
import { deleteAttachmentsFor } from '../uploads.js';

export const plantsRouter = Router();
plantsRouter.use(requireAuth);

const taskTypes = z.enum(['acqua', 'concime', 'potatura', 'rinvaso', 'controllo']);

const plantSchema = z.object({
  name: z.string().trim().min(1, 'Il nome della pianta è obbligatorio.').max(80),
  species: z.string().trim().max(120).nullish(),
  location: z.string().trim().max(120).nullish(),
  notes: z.string().max(5000).nullish(),
});

function getPlant(id) {
  const row = db.prepare('SELECT * FROM plants WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Pianta non trovata.');
  return row;
}

function tasksFor(plantId) {
  return db.prepare('SELECT * FROM plant_tasks WHERE plant_id = ? ORDER BY next_due_date ASC').all(plantId);
}

function plantPayload(row) {
  const [withAttachments] = attachToItems([row], 'plant');
  return plantOut(withAttachments, tasksFor(row.id), withAttachments.attachments);
}

plantsRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM plants ORDER BY name COLLATE NOCASE').all();
  const tasks = db.prepare('SELECT * FROM plant_tasks').all();
  const byPlant = new Map();
  for (const task of tasks) {
    if (!byPlant.has(task.plant_id)) byPlant.set(task.plant_id, []);
    byPlant.get(task.plant_id).push(task);
  }
  const withAttachments = attachToItems(rows, 'plant');
  const items = withAttachments.map((row) => plantOut(row, byPlant.get(row.id) || [], row.attachments));
  items.sort((a, b) => {
    if (a.dueCount !== b.dueCount) return b.dueCount - a.dueCount;
    const aNext = a.nextTask?.nextDueDate || '9999-12-31';
    const bNext = b.nextTask?.nextDueDate || '9999-12-31';
    return aNext.localeCompare(bNext) || a.name.localeCompare(b.name, 'it');
  });
  res.json({ plants: items, today: todayLocal() });
});

plantsRouter.get('/:id', (req, res) => {
  const row = getPlant(toId(req.params.id));
  const logs = db
    .prepare('SELECT * FROM plant_logs WHERE plant_id = ? ORDER BY done_at DESC LIMIT 40')
    .all(row.id)
    .map(plantLogOut);
  res.json({ plant: plantPayload(row), logs });
});

plantsRouter.post('/', (req, res) => {
  const body = validate(
    plantSchema.extend({
      tasks: z
        .array(
          z.object({
            type: taskTypes,
            intervalDays: z.coerce.number().int().min(1).max(365).default(7),
            nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          }),
        )
        .max(6)
        .optional()
        .default([]),
    }),
    req.body,
  );
  const now = nowIso();
  const create = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO plants (name, species, location, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(body.name, cleanText(body.species, 120), cleanText(body.location, 120), cleanText(body.notes, 5000), req.user.id, now, now);
    const insertTask = db.prepare(
      'INSERT INTO plant_tasks (plant_id, type, interval_days, next_due_date, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const task of body.tasks) {
      const next = task.nextDueDate || todayLocal();
      insertTask.run(info.lastInsertRowid, task.type, task.intervalDays, next, now);
    }
    return info.lastInsertRowid;
  });
  const id = create();
  for (const task of tasksFor(id)) syncPlantTaskReminders(task.id);
  audit(req.user.id, 'create_plant', 'plant', id, { name: body.name });
  res.status(201).json({ plant: plantPayload(getPlant(id)) });
});

plantsRouter.patch('/:id', (req, res) => {
  const id = toId(req.params.id);
  const existing = getPlant(id);
  const body = validate(plantSchema.partial(), req.body);
  db.prepare('UPDATE plants SET name = ?, species = ?, location = ?, notes = ?, updated_at = ? WHERE id = ?').run(
    body.name ?? existing.name,
    body.species === undefined ? existing.species : cleanText(body.species, 120),
    body.location === undefined ? existing.location : cleanText(body.location, 120),
    body.notes === undefined ? existing.notes : cleanText(body.notes, 5000),
    nowIso(),
    id,
  );
  audit(req.user.id, 'update_plant', 'plant', id);
  res.json({ plant: plantPayload(getPlant(id)) });
});

plantsRouter.delete('/:id', (req, res) => {
  const id = toId(req.params.id);
  getPlant(id);
  const taskIds = db.prepare('SELECT id FROM plant_tasks WHERE plant_id = ?').all(id).map((t) => t.id);
  db.prepare('DELETE FROM plants WHERE id = ?').run(id);
  for (const taskId of taskIds) removeEntityReminders('plant_task', taskId);
  deleteAttachmentsFor('plant', id);
  audit(req.user.id, 'delete_plant', 'plant', id);
  res.json({ ok: true });
});

plantsRouter.post('/:id/tasks', (req, res) => {
  const id = toId(req.params.id);
  getPlant(id);
  const body = validate(
    z.object({
      type: taskTypes,
      intervalDays: z.coerce.number().int().min(1).max(365),
      nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().trim().max(500).nullish(),
    }),
    req.body,
  );
  const info = db
    .prepare('INSERT INTO plant_tasks (plant_id, type, interval_days, next_due_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, body.type, body.intervalDays, body.nextDueDate || todayLocal(), cleanText(body.notes, 500), nowIso());
  syncPlantTaskReminders(info.lastInsertRowid);
  audit(req.user.id, 'create_plant_task', 'plant_task', info.lastInsertRowid);
  res.status(201).json({ plant: plantPayload(getPlant(id)) });
});

plantsRouter.patch('/tasks/:taskId', (req, res) => {
  const taskId = toId(req.params.taskId);
  const task = db.prepare('SELECT * FROM plant_tasks WHERE id = ?').get(taskId);
  if (!task) throw new HttpError(404, 'Attività non trovata.');
  const body = validate(
    z.object({
      type: taskTypes.optional(),
      intervalDays: z.coerce.number().int().min(1).max(365).optional(),
      nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().trim().max(500).nullish(),
    }),
    req.body,
  );
  db.prepare('UPDATE plant_tasks SET type = ?, interval_days = ?, next_due_date = ?, notes = ? WHERE id = ?').run(
    body.type ?? task.type,
    body.intervalDays ?? task.interval_days,
    body.nextDueDate ?? task.next_due_date,
    body.notes === undefined ? task.notes : cleanText(body.notes, 500),
    taskId,
  );
  syncPlantTaskReminders(taskId);
  res.json({ plant: plantPayload(getPlant(task.plant_id)) });
});

plantsRouter.delete('/tasks/:taskId', (req, res) => {
  const taskId = toId(req.params.taskId);
  const task = db.prepare('SELECT * FROM plant_tasks WHERE id = ?').get(taskId);
  if (!task) throw new HttpError(404, 'Attività non trovata.');
  db.prepare('DELETE FROM plant_tasks WHERE id = ?').run(taskId);
  removeEntityReminders('plant_task', taskId);
  res.json({ plant: plantPayload(getPlant(task.plant_id)) });
});

plantsRouter.post('/:id/tasks/:taskId/done', (req, res) => {
  const id = toId(req.params.id);
  const taskId = toId(req.params.taskId);
  getPlant(id);
  const task = db.prepare('SELECT * FROM plant_tasks WHERE id = ? AND plant_id = ?').get(taskId, id);
  if (!task) throw new HttpError(404, 'Attività non trovata.');
  const body = validate(
    z.object({
      doneAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).optional(),
      note: z.string().trim().max(500).nullish(),
    }),
    req.body || {},
  );
  const doneAt = body.doneAt || nowIso();
  const doneAtIso = doneAt.length === 10 ? localToUtc(`${doneAt}T12:00`).toISOString() : localToUtc(doneAt).toISOString();
  const doneDate = isoToLocalDate(doneAtIso);
  const nextDue = addDays(doneDate, task.interval_days);

  const run = db.transaction(() => {
    db.prepare('UPDATE plant_tasks SET last_done_at = ?, next_due_date = ? WHERE id = ?').run(doneAtIso, nextDue, taskId);
    db.prepare('INSERT INTO plant_logs (plant_id, task_id, type, done_at, note, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      taskId,
      task.type,
      doneAtIso,
      cleanText(body.note, 500),
      req.user.id,
    );
  });
  run();
  syncPlantTaskReminders(taskId);
  audit(req.user.id, 'plant_task_done', 'plant_task', taskId, { type: task.type });
  const updatedTask = db.prepare('SELECT * FROM plant_tasks WHERE id = ?').get(taskId);
  res.json({ task: plantTaskOut(updatedTask), plant: plantPayload(getPlant(id)) });
});
