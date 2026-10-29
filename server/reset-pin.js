import crypto from 'node:crypto';
import { db, hashPin, isFourDigitPin } from './db.js';

const [, , identifier, pinArg] = process.argv;

if (!identifier) {
  console.log('Uso: node server/reset-pin.js <nome-utente-o-id> [nuovo-pin-di-4-cifre]');
  console.log('Esempio: node server/reset-pin.js Mamma 1234');
  process.exit(1);
}

const user = /^\d+$/.test(identifier)
  ? db.prepare('SELECT * FROM users WHERE id = ?').get(Number(identifier))
  : db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(identifier);

if (!user) {
  console.error(`Utente "${identifier}" non trovato. Utenti disponibili:`);
  for (const row of db.prepare('SELECT id, name, role FROM users ORDER BY id').all()) {
    console.error(`  ${row.id} — ${row.name} (${row.role})`);
  }
  process.exit(1);
}

const pin = isFourDigitPin(pinArg) ? pinArg : String(crypto.randomInt(1000, 10000));

const update = db.transaction(() => {
  db.prepare('UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, is_active = 1 WHERE id = ?').run(
    hashPin(pin),
    user.id,
  );
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
});
update();

console.log('──────────────────────────────────────────────');
console.log(`  PIN reimpostato per ${user.name} (${user.role})`);
console.log(`  Nuovo PIN: ${pin}`);
console.log('  Le sessioni attive sono state chiuse.');
console.log('──────────────────────────────────────────────');
