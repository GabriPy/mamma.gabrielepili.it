import { Router } from 'express';
import { z } from 'zod';
import { audit, db, hashPin, publicUser, verifyPin } from '../db.js';
import { createSession, destroySession, login, requireAuth, revokeUserSessions } from '../auth.js';
import { config } from '../config.js';
import { HttpError, validate } from '../lib/http.js';
import { clearUserIndex } from '../lib/serialize.js';

export const authRouter = Router();

authRouter.get('/profiles', (req, res) => {
  const users = db
    .prepare("SELECT id, name, role, color, emoji FROM users WHERE is_active = 1 ORDER BY role = 'admin' DESC, id ASC")
    .all();
  res.json({ profiles: users });
});

authRouter.post('/login', (req, res) => {
  const body = validate(
    z.object({
      userId: z.coerce.number().int().positive(),
      pin: z.string().regex(/^\d{4}$/, 'Il PIN è di 4 cifre.'),
    }),
    req.body,
  );
  const result = login(body.userId, body.pin);
  if (!result.ok) {
    audit(body.userId, 'login_failed', 'user', body.userId, { code: result.code });
    throw new HttpError(result.code === 'locked' ? 429 : 401, result.message, result.code);
  }
  createSession(res, result.user, req);
  clearUserIndex();
  audit(result.user.id, 'login', 'user', result.user.id);
  res.json({ user: publicUser(result.user) });
});

authRouter.post('/logout', (req, res) => {
  if (req.user) audit(req.user.id, 'logout', 'user', req.user.id);
  destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(row), config: { appUrl: config.appUrl, reminderHour: config.reminderHour } });
});

authRouter.patch('/me', requireAuth, (req, res) => {
  const body = validate(
    z.object({
      name: z.string().trim().min(1, 'Il nome è obbligatorio.').max(40).optional(),
      email: z.union([z.string().trim().email('Email non valida.'), z.literal('')]).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      emoji: z.string().trim().min(1).max(8).optional(),
    }),
    req.body,
  );
  const fields = [];
  const values = [];
  if (body.name !== undefined) {
    fields.push('name = ?');
    values.push(body.name);
  }
  if (body.email !== undefined) {
    fields.push('email = ?');
    values.push(body.email || null);
  }
  if (body.color !== undefined) {
    fields.push('color = ?');
    values.push(body.color);
  }
  if (body.emoji !== undefined) {
    fields.push('emoji = ?');
    values.push(body.emoji);
  }
  if (!fields.length) throw new HttpError(400, 'Nessuna modifica da salvare.');
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values, req.user.id);
  clearUserIndex();
  audit(req.user.id, 'update_profile', 'user', req.user.id);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(row) });
});

authRouter.post('/me/pin', requireAuth, (req, res) => {
  const body = validate(
    z.object({
      currentPin: z.string().regex(/^\d{4}$/, 'Inserisci il PIN attuale.'),
      newPin: z.string().regex(/^\d{4}$/, 'Il nuovo PIN deve avere 4 cifre.'),
    }),
    req.body,
  );
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPin(body.currentPin, row.pin_hash)) throw new HttpError(400, 'Il PIN attuale non è corretto.');
  if (body.currentPin === body.newPin) throw new HttpError(400, 'Il nuovo PIN è identico a quello attuale.');
  db.prepare('UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(
    hashPin(body.newPin),
    req.user.id,
  );
  revokeUserSessions(req.user.id);
  createSession(res, row, req);
  audit(req.user.id, 'change_pin', 'user', req.user.id);
  res.json({ ok: true });
});

/** Verifica disponibilità PIN (usata nel profilo per un feedback immediato). */
authRouter.post('/me/check-pin', requireAuth, (req, res) => {
  const body = validate(z.object({ pin: z.string().regex(/^\d{4}$/) }), req.body);
  const row = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(req.user.id);
  res.json({ valid: verifyPin(body.pin, row.pin_hash) });
});
