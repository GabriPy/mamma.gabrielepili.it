import crypto from 'node:crypto';
import { db, nowIso, publicUser, verifyPin } from './db.js';
import { config } from './config.js';

const SESSION_MS = config.sessionDays * 86400000;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function cookieOptions(req, maxAgeMs = SESSION_MS) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Secure se il sito è configurato in HTTPS oppure se la richiesta arriva
    // già in HTTPS (es. dietro Cloudflare Tunnel con X-Forwarded-Proto).
    secure: config.cookieSecure || Boolean(req?.secure),
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function createSession(res, user, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MS);
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hashToken(token),
    user.id,
    now.toISOString(),
    expires.toISOString(),
    now.toISOString(),
    req.ip || null,
    String(req.get('user-agent') || '').slice(0, 250),
  );
  res.cookie(config.cookieName, token, cookieOptions(req));
  db.prepare('UPDATE users SET last_login_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(
    now.toISOString(),
    user.id,
  );
  // Pulizia sessioni scadute, economica e sufficiente.
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());
  return token;
}

export function destroySession(req, res) {
  const token = req.cookies?.[config.cookieName];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  res.clearCookie(config.cookieName, { ...cookieOptions(req, 0), maxAge: undefined });
}

export function revokeUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function authMiddleware(req, _res, next) {
  const token = req.cookies?.[config.cookieName];
  if (token) {
    const row = db
      .prepare(
        `SELECT s.token_hash, s.expires_at, s.last_seen_at, u.*
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(hashToken(token));
    if (row && row.is_active && new Date(row.expires_at) > new Date()) {
      req.user = publicUser(row);
      req.sessionTokenHash = row.token_hash;
      const lastSeen = new Date(row.last_seen_at).getTime();
      if (Date.now() - lastSeen > 3600000) {
        db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(nowIso(), row.token_hash);
      }
    } else if (row) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sessione scaduta. Accedi di nuovo.', code: 'auth_required' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sessione scaduta. Accedi di nuovo.', code: 'auth_required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Azione riservata all’amministratore.', code: 'forbidden' });
  next();
}

export function login(userId, pin) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
  if (!user || !user.is_active) return { ok: false, code: 'invalid', message: 'Profilo non disponibile.' };

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.max(1, Math.ceil((new Date(user.locked_until) - new Date()) / 60000));
    return { ok: false, code: 'locked', message: `Troppi tentativi. Riprova fra ${mins} minuti.` };
  }

  const pinOk = /^\d{4}$/.test(String(pin)) && verifyPin(pin, user.pin_hash);
  if (!pinOk) {
    const failed = user.failed_attempts + 1;
    const lockedUntil = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(failed, lockedUntil, user.id);
    return {
      ok: false,
      code: lockedUntil ? 'locked' : 'invalid',
      message: lockedUntil
        ? `Troppi tentativi. Riprova fra ${LOCK_MINUTES} minuti.`
        : 'PIN non corretto. Riprova.',
      failedAttempts: failed,
    };
  }

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
  return { ok: true, user };
}
