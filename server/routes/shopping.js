import { Router } from 'express';
import { z } from 'zod';
import { audit, db, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, cleanText, toId, validate } from '../lib/http.js';
import { shoppingItemOut } from '../lib/serialize.js';

export const shoppingRouter = Router();
shoppingRouter.use(requireAuth);

function listOr404(id) {
  const row = db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Lista non trovata.');
  return row;
}

function listsWithCounts() {
  const rows = db
    .prepare(
      `SELECT l.*,
        (SELECT COUNT(*) FROM shopping_items i WHERE i.list_id = l.id AND i.done = 0) AS pending,
        (SELECT COUNT(*) FROM shopping_items i WHERE i.list_id = l.id AND i.done = 1) AS done
       FROM shopping_lists l ORDER BY l.is_default DESC, l.created_at ASC`,
    )
    .all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    isDefault: Boolean(r.is_default),
    pending: r.pending,
    done: r.done,
  }));
}

function itemsFor(listId) {
  return db
    .prepare(
      `SELECT * FROM shopping_items WHERE list_id = ?
       ORDER BY done ASC, category COLLATE NOCASE ASC, sort_order ASC, created_at ASC`,
    )
    .all(listId)
    .map(shoppingItemOut);
}

shoppingRouter.get('/lists', (req, res) => {
  res.json({ lists: listsWithCounts() });
});

shoppingRouter.post('/lists', (req, res) => {
  const body = validate(
    z.object({
      name: z.string().trim().min(1, 'Dai un nome alla lista.').max(60),
      emoji: z.string().trim().max(8).optional().default('🛒'),
    }),
    req.body,
  );
  const info = db
    .prepare('INSERT INTO shopping_lists (name, emoji, is_default, created_by, created_at) VALUES (?, ?, 0, ?, ?)')
    .run(body.name, body.emoji, req.user.id, nowIso());
  audit(req.user.id, 'create_shopping_list', 'shopping_list', info.lastInsertRowid);
  res.status(201).json({ list: listsWithCounts().find((l) => l.id === info.lastInsertRowid) });
});

shoppingRouter.patch('/lists/:id', (req, res) => {
  const id = toId(req.params.id);
  listOr404(id);
  const body = validate(
    z.object({ name: z.string().trim().min(1).max(60).optional(), emoji: z.string().trim().max(8).optional() }),
    req.body,
  );
  if (body.name) db.prepare('UPDATE shopping_lists SET name = ? WHERE id = ?').run(body.name, id);
  if (body.emoji) db.prepare('UPDATE shopping_lists SET emoji = ? WHERE id = ?').run(body.emoji, id);
  res.json({ list: listsWithCounts().find((l) => l.id === id) });
});

shoppingRouter.delete('/lists/:id', (req, res) => {
  const id = toId(req.params.id);
  const list = listOr404(id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM shopping_lists').get().n;
  if (count <= 1) throw new HttpError(400, 'Deve restare almeno una lista.');
  db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(id);
  if (list.is_default) {
    db.prepare('UPDATE shopping_lists SET is_default = 1 WHERE id = (SELECT id FROM shopping_lists ORDER BY created_at LIMIT 1)').run();
  }
  audit(req.user.id, 'delete_shopping_list', 'shopping_list', id);
  res.json({ ok: true });
});

shoppingRouter.get('/lists/:id/items', (req, res) => {
  const id = toId(req.params.id);
  const list = listOr404(id);
  res.json({
    list: { id: list.id, name: list.name, emoji: list.emoji, isDefault: Boolean(list.is_default) },
    items: itemsFor(id),
  });
});

shoppingRouter.post('/lists/:id/items', (req, res) => {
  const id = toId(req.params.id);
  listOr404(id);
  const body = validate(
    z.object({
      name: z.string().trim().min(1, 'Scrivi cosa aggiungere.').max(120),
      quantity: z.string().trim().max(20).nullish(),
      unit: z.string().trim().max(20).nullish(),
      category: z.string().trim().max(30).optional().default('Altro'),
      note: z.string().trim().max(300).nullish(),
    }),
    req.body,
  );

  const existing = db
    .prepare(
      "SELECT * FROM shopping_items WHERE list_id = ? AND done = 0 AND lower(trim(name)) = lower(trim(?))",
    )
    .get(id, body.name);

  if (existing) {
    if (body.quantity) {
      db.prepare('UPDATE shopping_items SET quantity = COALESCE(?, quantity), unit = COALESCE(?, unit) WHERE id = ?').run(
        body.quantity,
        body.unit || null,
        existing.id,
      );
    }
    const row = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(existing.id);
    return res.json({ item: shoppingItemOut(row), merged: true });
  }

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM shopping_items WHERE list_id = ?').get(id).m;
  const info = db
    .prepare(
      `INSERT INTO shopping_items (list_id, name, quantity, unit, category, note, sort_order, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      body.name,
      cleanText(body.quantity, 20),
      cleanText(body.unit, 20),
      body.category,
      cleanText(body.note, 300),
      maxOrder + 1,
      req.user.id,
      nowIso(),
    );
  const row = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(info.lastInsertRowid);
  audit(req.user.id, 'add_shopping_item', 'shopping_item', row.id, { name: row.name });
  res.status(201).json({ item: shoppingItemOut(row), merged: false });
});

shoppingRouter.patch('/items/:id', (req, res) => {
  const id = toId(req.params.id);
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!item) throw new HttpError(404, 'Prodotto non trovato.');
  const body = validate(
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      quantity: z.string().trim().max(20).nullish(),
      unit: z.string().trim().max(20).nullish(),
      category: z.string().trim().max(30).optional(),
      note: z.string().trim().max(300).nullish(),
      done: z.boolean().optional(),
    }),
    req.body,
  );
  const done = body.done === undefined ? Boolean(item.done) : body.done;
  db.prepare(
    `UPDATE shopping_items SET name = ?, quantity = ?, unit = ?, category = ?, note = ?, done = ?, done_at = ?
     WHERE id = ?`,
  ).run(
    body.name ?? item.name,
    body.quantity === undefined ? item.quantity : cleanText(body.quantity, 20),
    body.unit === undefined ? item.unit : cleanText(body.unit, 20),
    body.category ?? item.category,
    body.note === undefined ? item.note : cleanText(body.note, 300),
    done ? 1 : 0,
    done ? item.done_at || nowIso() : null,
    id,
  );
  res.json({ item: shoppingItemOut(db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id)) });
});

shoppingRouter.delete('/items/:id', (req, res) => {
  const id = toId(req.params.id);
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!item) throw new HttpError(404, 'Prodotto non trovato.');
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id);
  res.json({ ok: true });
});

shoppingRouter.post('/lists/:id/clear-done', (req, res) => {
  const id = toId(req.params.id);
  listOr404(id);
  const info = db.prepare('DELETE FROM shopping_items WHERE list_id = ? AND done = 1').run(id);
  audit(req.user.id, 'clear_shopping_done', 'shopping_list', id, { removed: info.changes });
  res.json({ removed: info.changes, items: itemsFor(id) });
});
