import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { addDays, expandRecurrence, todayLocal } from '../lib/time.js';
import { attachToItems } from '../lib/entities.js';
import { deadlineOut, eventOut, plantTaskOut, shoppingItemOut } from '../lib/serialize.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/', (req, res) => {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : todayLocal();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);

  // Eventi della settimana, con espansione delle ricorrenze.
  const eventRows = db
    .prepare(
      `SELECT * FROM events
       WHERE (visibility = 'shared' OR created_by = ?)
         AND substr(starts_at, 1, 10) <= ?
         AND (recurrence <> 'none' OR substr(starts_at, 1, 10) >= ?)`,
    )
    .all(req.user.id, weekEnd, today);
  const eventRowsWithAttachments = attachToItems(eventRows, 'event');
  const events = [];
  for (const row of eventRowsWithAttachments) {
    const startDate = row.starts_at.slice(0, 10);
    const occurrences =
      row.recurrence === 'none'
        ? startDate >= today && startDate <= weekEnd
          ? [startDate]
          : []
        : expandRecurrence({ startDate, recurrence: row.recurrence, until: row.recurrence_until, from: today, to: weekEnd, max: 30 });
    for (const occurrence of occurrences) events.push(eventOut(row, occurrence));
  }
  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const eventsToday = events.filter((e) => e.startsAt.slice(0, 10) === today);
  const eventsUpcoming = events.filter((e) => e.startsAt.slice(0, 10) > today).slice(0, 6);

  // Scadenze aperte.
  const deadlineRows = attachToItems(
    db
      .prepare("SELECT * FROM deadlines WHERE status = 'open' AND (visibility = 'shared' OR created_by = ?)")
      .all(req.user.id),
    'deadline',
  ).map(deadlineOut);
  deadlineRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const deadlines = {
    items: deadlineRows.slice(0, 6),
    overdue: deadlineRows.filter((d) => d.daysLeft < 0).length,
    today: deadlineRows.filter((d) => d.daysLeft === 0).length,
    week: deadlineRows.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7).length,
    total: deadlineRows.length,
  };

  // Lista della spesa predefinita.
  const list = db
    .prepare('SELECT * FROM shopping_lists ORDER BY is_default DESC, created_at ASC LIMIT 1')
    .get();
  let shopping = { list: null, pending: 0, preview: [] };
  if (list) {
    const items = db
      .prepare(
        `SELECT * FROM shopping_items WHERE list_id = ? AND done = 0
         ORDER BY category COLLATE NOCASE, sort_order ASC, created_at ASC LIMIT 5`,
      )
      .all(list.id);
    const pending = db.prepare('SELECT COUNT(*) AS n FROM shopping_items WHERE list_id = ? AND done = 0').get(list.id).n;
    const done = db.prepare('SELECT COUNT(*) AS n FROM shopping_items WHERE list_id = ? AND done = 1').get(list.id).n;
    shopping = {
      list: { id: list.id, name: list.name, emoji: list.emoji },
      pending,
      done,
      preview: items.map(shoppingItemOut),
    };
  }

  // Piante che chiedono attenzione entro 2 giorni.
  const plantTasks = db
    .prepare(
      `SELECT t.*, p.name AS plant_name, p.location AS plant_location
       FROM plant_tasks t JOIN plants p ON p.id = t.plant_id
       WHERE t.next_due_date <= ? ORDER BY t.next_due_date ASC LIMIT 6`,
    )
    .all(addDays(today, 2))
    .map((row) => ({
      ...plantTaskOut(row, today),
      plantName: row.plant_name,
      plantLocation: row.plant_location,
    }));

  const counts = {
    recipes: db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n,
    plants: db.prepare('SELECT COUNT(*) AS n FROM plants').get().n,
    plantsDue: db.prepare('SELECT COUNT(*) AS n FROM plant_tasks WHERE next_due_date <= ?').get(today).n,
    deadlinesOpen: deadlineRows.length,
    eventsWeek: events.length,
    shoppingPending: shopping.pending,
  };

  // Prossime attività delle piante (per il diario in home).
  const plantWeek = db
    .prepare(
      `SELECT t.*, p.name AS plant_name FROM plant_tasks t JOIN plants p ON p.id = t.plant_id
       WHERE t.next_due_date <= ? ORDER BY t.next_due_date ASC LIMIT 4`,
    )
    .all(addDays(today, 7))
    .map((row) => ({ ...plantTaskOut(row, today), plantName: row.plant_name }));

  res.json({
    today,
    tomorrow,
    events: { today: eventsToday, upcoming: eventsUpcoming },
    deadlines,
    shopping,
    plants: { due: plantTasks, week: plantWeek, count: counts.plantsDue },
    counts,
    generatedAt: new Date().toISOString(),
  });
});
