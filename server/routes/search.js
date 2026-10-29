import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { italianDate } from '../lib/time.js';

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [], query: q });
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const results = [];

  for (const row of db
    .prepare(
      `SELECT id, title, starts_at FROM events
       WHERE (visibility = 'shared' OR created_by = ?) AND title LIKE ? COLLATE NOCASE
       ORDER BY starts_at DESC LIMIT 5`,
    )
    .all(req.user.id, like)) {
    results.push({
      type: 'event',
      id: row.id,
      title: row.title,
      subtitle: italianDate(row.starts_at.slice(0, 10)),
      url: `/calendario?evento=${row.id}`,
      icon: 'calendar',
    });
  }

  for (const row of db
    .prepare(
      `SELECT id, title, due_date, status FROM deadlines
       WHERE (visibility = 'shared' OR created_by = ?) AND title LIKE ? COLLATE NOCASE
       ORDER BY due_date ASC LIMIT 5`,
    )
    .all(req.user.id, like)) {
    results.push({
      type: 'deadline',
      id: row.id,
      title: row.title,
      subtitle: `${italianDate(row.due_date)}${row.status === 'done' ? ' · completata' : ''}`,
      url: `/scadenze?scadenza=${row.id}`,
      icon: 'clock',
    });
  }

  for (const row of db
    .prepare("SELECT id, title, category FROM recipes WHERE title LIKE ? COLLATE NOCASE ORDER BY title LIMIT 5")
    .all(like)) {
    results.push({
      type: 'recipe',
      id: row.id,
      title: row.title,
      subtitle: row.category,
      url: `/ricette/${row.id}`,
      icon: 'book',
    });
  }

  for (const row of db
    .prepare('SELECT id, name, location FROM plants WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 5')
    .all(like)) {
    results.push({
      type: 'plant',
      id: row.id,
      title: row.name,
      subtitle: row.location || 'Pianta di casa',
      url: `/piante/${row.id}`,
      icon: 'leaf',
    });
  }

  for (const row of db
    .prepare(
      `SELECT i.id, i.name, i.list_id, l.name AS list_name FROM shopping_items i
       JOIN shopping_lists l ON l.id = i.list_id
       WHERE i.done = 0 AND i.name LIKE ? COLLATE NOCASE LIMIT 5`,
    )
    .all(like)) {
    results.push({
      type: 'shopping',
      id: row.id,
      title: row.name,
      subtitle: row.list_name,
      url: `/spesa?lista=${row.list_id}`,
      icon: 'basket',
    });
  }

  res.json({ results, query: q });
});
