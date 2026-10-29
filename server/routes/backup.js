import fs from 'node:fs';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { Router } from 'express';
import { config } from '../config.js';
import { audit, db } from '../db.js';
import { requireAdmin } from '../auth.js';
import { dirSize } from '../uploads.js';
import { todayLocal } from '../lib/time.js';

export const backupRouter = Router();
backupRouter.use(requireAdmin);

function dumpData() {
  const tables = [
    'users',
    'events',
    'deadlines',
    'shopping_lists',
    'shopping_items',
    'recipes',
    'recipe_ingredients',
    'plants',
    'plant_tasks',
    'plant_logs',
    'attachments',
    'settings',
  ];
  const data = {};
  for (const table of tables) {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  data.users = data.users.map(({ pin_hash: _pin, ...rest }) => rest);
  data.attachments = data.attachments.map((row) => ({ ...row, stored_name: `uploads/${row.stored_name}` }));
  return {
    app: 'Ghibiri Home',
    version: process.env.APP_VERSION || '1.0.0',
    exportedAt: new Date().toISOString(),
    timezone: config.timezone,
    tables: data,
  };
}

function manifest() {
  const counts = {};
  for (const table of ['users', 'events', 'deadlines', 'shopping_items', 'recipes', 'plants', 'attachments']) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  }
  return {
    app: 'Ghibiri Home',
    version: process.env.APP_VERSION || '1.0.0',
    generatedAt: new Date().toISOString(),
    timezone: config.timezone,
    counts,
    storage: dirSize(config.uploadsDir),
    schema: db.pragma('user_version', { simple: true }),
    note: 'Il file database/ghibiri.db è uno snapshot consistente creato con SQLite backup API.',
  };
}

function readme() {
  return `GHIBIRI HOME — BACKUP
=====================

Questo archivio contiene tutto ciò che serve per riportare la casa esattamente
com'era: database, foto/allegati e una copia leggibile dei dati.

Contenuto
---------
database/ghibiri.db     Database SQLite completo (snapshot consistente)
uploads/                Foto e allegati, organizzati per anno/mese
dati.json               Esportazione leggibile di tutte le tabelle
manifest.json           Conteggi, versione e data del backup
LEGGIMI.txt             Questo file

COME RIPRISTINARE (Docker Compose)
----------------------------------
1. Ferma il servizio:
     docker compose down

2. Metti al sicuro i dati attuali (non cancellarli subito):
     mv data data.vecchia

3. Ricrea la cartella e scompatta il backup:
     mkdir -p data
     unzip ghibiri-home-backup-XXXX.zip -d /tmp/ghibiri-restore
     cp /tmp/ghibiri-restore/database/ghibiri.db data/ghibiri.db
     cp -R /tmp/ghibiri-restore/uploads data/uploads

4. Se il database attuale aveva file -wal o -shm, non copiarli:
   il backup è già completo e consistente.

5. Permessi corretti per l'utente del container (uid 1000):
     sudo chown -R 1000:1000 data

6. Riavvia:
     docker compose up -d

7. Apri il sito, accedi con il PIN e controlla:
   - le scadenze e gli eventi
   - la lista della spesa
   - almeno una foto allegata

Note
----
- Le password/PIN non sono inclusi in dati.json (solo nel database cifrato con hash).
- Conserva almeno una copia di questo archivio fuori dal server.
- Il backup non è automatico: viene creato quando premi "Esporta backup".
`;
}

function stamp() {
  const now = new Date();
  const local = todayLocal(now);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${local}-${hh}${mm}`;
}

backupRouter.get('/export', async (req, res) => {
  const tmpFile = path.join(config.tmpDir, `backup-${Date.now()}-${process.pid}.db`);
  await db.backup(tmpFile);

  const filename = `ghibiri-home-backup-${stamp()}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const cleanup = () => {
    fs.promises.unlink(tmpFile).catch(() => {});
  };
  res.on('close', cleanup);
  archive.on('warning', (err) => console.warn('[backup] avviso:', err.message));
  archive.on('error', (err) => {
    console.error('[backup] errore:', err.message);
    cleanup();
    if (!res.headersSent) res.status(500).json({ error: 'Creazione del backup non riuscita.' });
    else res.destroy(err);
  });
  archive.pipe(res);

  archive.file(tmpFile, { name: 'database/ghibiri.db' });
  archive.directory(config.uploadsDir, 'uploads');
  archive.append(JSON.stringify(dumpData(), null, 2), { name: 'dati.json' });
  archive.append(JSON.stringify(manifest(), null, 2), { name: 'manifest.json' });
  archive.append(readme(), { name: 'LEGGIMI.txt' });

  audit(req.user.id, 'export_backup', null, null, { filename });
  await archive.finalize();
});

backupRouter.get('/export/json', requireAdmin, (req, res) => {
  const payload = dumpData();
  const filename = `ghibiri-home-dati-${stamp()}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(payload, null, 2));
});

backupRouter.get('/info', (req, res) => {
  const last = db.prepare("SELECT created_at, detail FROM audit_log WHERE action = 'export_backup' ORDER BY id DESC LIMIT 1").get();
  res.json({
    storage: dirSize(config.uploadsDir),
    lastExportAt: last?.created_at || null,
    maxUploadMb: config.maxUploadMb,
  });
});
