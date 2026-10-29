import { Router } from 'express';
import { z } from 'zod';
import { audit, db, hashPin, publicUser } from '../db.js';
import { requireAdmin, revokeUserSessions } from '../auth.js';
import { HttpError, toId, validate } from '../lib/http.js';
import { clearUserIndex } from '../lib/serialize.js';

export const usersRouter = Router();
usersRouter.use(requireAdmin);

function activeAdmins(excludeId = 0) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?")
    .get(excludeId).n;
}

usersRouter.get('/', (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY role = 'admin' DESC, name COLLATE NOCASE").all();
  res.json({ users: rows.map((r) => ({ ...publicUser(r), lastLoginAt: r.last_login_at })) });
});

const userSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è obbligatorio.').max(40),
  email: z.union([z.string().trim().email('Email non valida.'), z.literal('')]).optional().default(''),
  role: z.enum(['admin', 'member']).optional().default('member'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6E7F55'),
  emoji: z.string().trim().min(1).max(8).optional().default('🙂'),
  pin: z.string().regex(/^\d{4}$/, 'Il PIN deve avere 4 cifre.'),
});

usersRouter.post('/', (req, res) => {
  const body = validate(userSchema, req.body);
  const exists = db.prepare('SELECT 1 FROM users WHERE name = ? COLLATE NOCASE').get(body.name);
  if (exists) throw new HttpError(409, 'Esiste già un membro con questo nome.');
  const info = db
    .prepare(
      `INSERT INTO users (name, email, pin_hash, role, color, emoji, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(body.name, body.email || null, hashPin(body.pin), body.role, body.color, body.emoji, new Date().toISOString());
  clearUserIndex();
  audit(req.user.id, 'create_user', 'user', info.lastInsertRowid, { role: body.role });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(row) });
});

usersRouter.patch('/:id', (req, res) => {
  const id = toId(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'Membro non trovato.');
  const body = validate(
    userSchema.partial().extend({ isActive: z.boolean().optional() }),
    req.body,
  );

  const nextRole = body.role ?? target.role;
  const nextActive = body.isActive === undefined ? Boolean(target.is_active) : body.isActive;
  if (target.role === 'admin' && (nextRole !== 'admin' || !nextActive) && activeAdmins(target.id) === 0) {
    throw new HttpError(400, 'Deve restare almeno un amministratore attivo.');
  }
  if (id === req.user.id && !nextActive) throw new HttpError(400, 'Non puoi disattivare il tuo profilo.');

  const fields = [];
  const values = [];
  const assignments = {
    name: body.name,
    email: body.email === undefined ? undefined : body.email || null,
    role: body.role,
    color: body.color,
    emoji: body.emoji,
    is_active: body.isActive === undefined ? undefined : body.isActive ? 1 : 0,
  };
  for (const [column, value] of Object.entries(assignments)) {
    if (value === undefined) continue;
    fields.push(`${column} = ?`);
    values.push(value);
  }
  if (body.pin) {
    fields.push('pin_hash = ?', 'failed_attempts = 0', 'locked_until = NULL');
    values.push(hashPin(body.pin));
  }
  if (!fields.length) throw new HttpError(400, 'Nessuna modifica da salvare.');
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  if (body.pin || body.role || body.isActive === false) revokeUserSessions(id);
  clearUserIndex();
  audit(req.user.id, 'update_user', 'user', id, { fields: Object.keys(body) });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ user: publicUser(row) });
});

usersRouter.delete('/:id', (req, res) => {
  const id = toId(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'Non puoi eliminare il tuo profilo.');
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'Membro non trovato.');
  if (target.role === 'admin' && activeAdmins(target.id) === 0) {
    throw new HttpError(400, 'Deve restare almeno un amministratore attivo.');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  clearUserIndex();
  audit(req.user.id, 'delete_user', 'user', id, { name: target.name });
  res.json({ ok: true });
});
