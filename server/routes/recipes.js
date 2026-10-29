import { Router } from 'express';
import { z } from 'zod';
import { audit, db, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, cleanText, toId, validate } from '../lib/http.js';
import { ingredientOut, recipeOut } from '../lib/serialize.js';
import { attachToItems } from '../lib/entities.js';
import { deleteAttachmentsFor } from '../uploads.js';

export const recipesRouter = Router();
recipesRouter.use(requireAuth);

const ingredientSchema = z.object({
  name: z.string().trim().min(1, 'Ingrediente senza nome.').max(120),
  quantity: z.string().trim().max(20).nullish(),
  unit: z.string().trim().max(20).nullish(),
});

const recipeSchema = z.object({
  title: z.string().trim().min(1, 'Il titolo è obbligatorio.').max(160),
  description: z.string().max(2000).nullish(),
  servings: z.union([z.coerce.number().int().min(1).max(50), z.literal(''), z.null()]).optional(),
  prepMinutes: z.union([z.coerce.number().int().min(0).max(1440), z.literal(''), z.null()]).optional(),
  category: z.string().trim().max(40).optional().default('Primi'),
  notes: z.string().max(5000).nullish(),
  ingredients: z.array(ingredientSchema).max(60).optional().default([]),
});

function ingredientsFor(recipeId) {
  return db
    .prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position ASC, id ASC')
    .all(recipeId)
    .map(ingredientOut);
}

function getRecipe(id) {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Ricetta non trovata.');
  return row;
}

function picturesFor(recipeIds) {
  if (!recipeIds.length) return new Map();
  const placeholders = recipeIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM attachments WHERE entity_type = 'recipe' AND entity_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(...recipeIds);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.entity_id)) map.set(row.entity_id, []);
    map.get(row.entity_id).push(row);
  }
  return map;
}

recipesRouter.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  const favorite = req.query.favorite === '1';
  const rows = db.prepare('SELECT * FROM recipes ORDER BY favorite DESC, title COLLATE NOCASE ASC').all();
  const counts = new Map(
    db.prepare('SELECT recipe_id, COUNT(*) AS n FROM recipe_ingredients GROUP BY recipe_id').all().map((r) => [r.recipe_id, r.n]),
  );
  const pictures = picturesFor(rows.map((r) => r.id));
  let items = rows
    .filter((r) => (!q ? true : r.title.toLowerCase().includes(q)))
    .filter((r) => (!category ? true : r.category === category))
    .filter((r) => (!favorite ? true : Boolean(r.favorite)))
    .map((r) => {
      const pics = (pictures.get(r.id) || []).filter((a) => String(a.mime).startsWith('image/'));
      return {
        ...recipeOut(r, {
          attachments: pics.map((a) => ({
            id: a.id,
            entityType: 'recipe',
            entityId: a.entity_id,
            name: a.original_name,
            mime: a.mime,
            size: a.size,
            isImage: true,
            url: `/api/attachments/${a.id}/file`,
            createdAt: a.created_at,
          })),
        }),
        ingredientCount: counts.get(r.id) || 0,
      };
    });
  res.json({ recipes: items, categories: [...new Set(rows.map((r) => r.category))] });
});

recipesRouter.get('/:id', (req, res) => {
  const row = getRecipe(toId(req.params.id));
  const [withAttachments] = attachToItems([row], 'recipe');
  res.json({ recipe: recipeOut(withAttachments, { ingredients: ingredientsFor(row.id) }) });
});

recipesRouter.post('/', (req, res) => {
  const body = validate(recipeSchema, req.body);
  const now = nowIso();
  const create = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO recipes (title, description, servings, prep_minutes, category, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.title,
        cleanText(body.description, 2000),
        body.servings === '' || body.servings === null || body.servings === undefined ? null : body.servings,
        body.prepMinutes === '' || body.prepMinutes === null || body.prepMinutes === undefined ? null : body.prepMinutes,
        body.category,
        cleanText(body.notes, 5000),
        req.user.id,
        now,
        now,
      );
    const insertIngredient = db.prepare(
      'INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, position) VALUES (?, ?, ?, ?, ?)',
    );
    body.ingredients.forEach((ing, index) => {
      insertIngredient.run(info.lastInsertRowid, ing.name, cleanText(ing.quantity, 20), cleanText(ing.unit, 20), index);
    });
    return info.lastInsertRowid;
  });
  const id = create();
  audit(req.user.id, 'create_recipe', 'recipe', id, { title: body.title });
  const row = getRecipe(id);
  res.status(201).json({ recipe: recipeOut(row, { ingredients: ingredientsFor(id), attachments: [] }) });
});

recipesRouter.patch('/:id', (req, res) => {
  const id = toId(req.params.id);
  const existing = getRecipe(id);
  const body = validate(recipeSchema.partial(), req.body);
  const update = db.transaction(() => {
    db.prepare(
      `UPDATE recipes SET title = ?, description = ?, servings = ?, prep_minutes = ?, category = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      body.title ?? existing.title,
      body.description === undefined ? existing.description : cleanText(body.description, 2000),
      body.servings === undefined
        ? existing.servings
        : body.servings === '' || body.servings === null
          ? null
          : body.servings,
      body.prepMinutes === undefined
        ? existing.prep_minutes
        : body.prepMinutes === '' || body.prepMinutes === null
          ? null
          : body.prepMinutes,
      body.category ?? existing.category,
      body.notes === undefined ? existing.notes : cleanText(body.notes, 5000),
      nowIso(),
      id,
    );
    if (body.ingredients) {
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
      const insertIngredient = db.prepare(
        'INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, position) VALUES (?, ?, ?, ?, ?)',
      );
      body.ingredients.forEach((ing, index) => {
        insertIngredient.run(id, ing.name, cleanText(ing.quantity, 20), cleanText(ing.unit, 20), index);
      });
    }
  });
  update();
  audit(req.user.id, 'update_recipe', 'recipe', id);
  const row = getRecipe(id);
  res.json({ recipe: recipeOut(row, { ingredients: ingredientsFor(id) }) });
});

recipesRouter.post('/:id/favorite', (req, res) => {
  const id = toId(req.params.id);
  const row = getRecipe(id);
  const next = row.favorite ? 0 : 1;
  db.prepare('UPDATE recipes SET favorite = ? WHERE id = ?').run(next, id);
  res.json({ favorite: Boolean(next) });
});

recipesRouter.delete('/:id', (req, res) => {
  const id = toId(req.params.id);
  getRecipe(id);
  db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
  deleteAttachmentsFor('recipe', id);
  audit(req.user.id, 'delete_recipe', 'recipe', id);
  res.json({ ok: true });
});

recipesRouter.post('/:id/to-shopping', (req, res) => {
  const id = toId(req.params.id);
  const recipe = getRecipe(id);
  const body = validate(z.object({ listId: z.coerce.number().int().positive().optional() }), req.body || {});
  const list = body.listId
    ? db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(body.listId)
    : db.prepare('SELECT * FROM shopping_lists ORDER BY is_default DESC, created_at ASC LIMIT 1').get();
  if (!list) throw new HttpError(400, 'Crea prima una lista della spesa.');

  const ingredients = ingredientsFor(id);
  if (!ingredients.length) throw new HttpError(400, 'Questa ricetta non ha ingredienti.');

  const added = [];
  const skipped = [];
  const insert = db.prepare(
    `INSERT INTO shopping_items (list_id, name, quantity, unit, category, note, sort_order, created_by, created_at)
     VALUES (?, ?, ?, ?, 'Dispensa', ?, ?, ?, ?)`,
  );
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM shopping_items WHERE list_id = ?').get(list.id).m;

  const run = db.transaction(() => {
    let order = maxOrder;
    for (const ing of ingredients) {
      const existing = db
        .prepare("SELECT id FROM shopping_items WHERE list_id = ? AND done = 0 AND lower(trim(name)) = lower(trim(?))")
        .get(list.id, ing.name);
      if (existing) {
        skipped.push(ing);
        continue;
      }
      order += 1;
      insert.run(
        list.id,
        ing.name,
        ing.quantity || null,
        ing.unit || null,
        `Da ${recipe.title}`,
        order,
        req.user.id,
        nowIso(),
      );
      added.push(ing);
    }
  });
  run();
  audit(req.user.id, 'recipe_to_shopping', 'recipe', id, { listId: list.id, added: added.length, skipped: skipped.length });
  res.json({ added, skipped, list: { id: list.id, name: list.name } });
});
