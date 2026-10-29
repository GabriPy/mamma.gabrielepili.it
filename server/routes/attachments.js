import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { audit, db, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { HttpError, toId, validate } from '../lib/http.js';
import { canAccessEntity, getEntity, mapAttachment, ENTITIES } from '../lib/entities.js';
import { absolutePath, deleteFile, storedRelativePath, upload } from '../uploads.js';

export const attachmentsRouter = Router();

const metaSchema = z.object({
  entityType: z.enum(['event', 'deadline', 'recipe', 'plant']),
  entityId: z.coerce.number().int().positive(),
});

attachmentsRouter.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Nessun file ricevuto.');
  let meta;
  try {
    meta = validate(metaSchema, req.body);
    const entity = getEntity(meta.entityType, meta.entityId);
    if (!entity || !canAccessEntity(meta.entityType, entity, req.user)) {
      throw new HttpError(404, 'Elemento non trovato.');
    }
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM attachments WHERE entity_type = ? AND entity_id = ?')
      .get(meta.entityType, meta.entityId).n;
    if (count >= config.maxAttachmentsPerItem) {
      throw new HttpError(400, `Puoi allegare al massimo ${config.maxAttachmentsPerItem} file.`);
    }

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
    const info = db
      .prepare(
        `INSERT INTO attachments (entity_type, entity_id, original_name, stored_name, mime, size, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        meta.entityType,
        meta.entityId,
        originalName || req.file.filename,
        storedRelativePath(req.file),
        req.file.mimetype,
        req.file.size,
        req.user.id,
        nowIso(),
      );
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(info.lastInsertRowid);
    audit(req.user.id, 'upload_attachment', meta.entityType, meta.entityId, { name: originalName, size: req.file.size });
    res.status(201).json({ attachment: mapAttachment(row) });
  } catch (err) {
    // Se la validazione fallisce, il file già scritto va rimosso.
    if (req.file) deleteFile(storedRelativePath(req.file));
    throw err;
  }
});

attachmentsRouter.get('/:id/file', requireAuth, (req, res) => {
  const id = toId(req.params.id);
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Allegato non trovato.');
  const entity = getEntity(row.entity_type, row.entity_id);
  if (!entity || !canAccessEntity(row.entity_type, entity, req.user)) {
    throw new HttpError(404, 'Allegato non trovato.');
  }
  const filePath = absolutePath(row.stored_name);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'File non disponibile.');
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'private, max-age=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  const isImage = String(row.mime).startsWith('image/');
  const disposition = req.query.download === '1' || !isImage ? 'attachment' : 'inline';
  const asciiName = row.original_name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
  );
  fs.createReadStream(filePath).pipe(res);
});

attachmentsRouter.delete('/:id', requireAuth, (req, res) => {
  const id = toId(req.params.id);
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Allegato non trovato.');
  const entity = getEntity(row.entity_type, row.entity_id);
  if (!entity || !canAccessEntity(row.entity_type, entity, req.user)) throw new HttpError(404, 'Allegato non trovato.');
  if (row.created_by !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Solo chi ha caricato il file può eliminarlo.');
  }
  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  deleteFile(row.stored_name);
  audit(req.user.id, 'delete_attachment', row.entity_type, row.entity_id, { name: row.original_name });
  res.json({ ok: true });
});

/** Info pubbliche del modulo, utili all'interfaccia. */
attachmentsRouter.get('/meta', requireAuth, (_req, res) => {
  res.json({
    maxFileMb: config.maxUploadMb,
    maxPerItem: config.maxAttachmentsPerItem,
    entityTypes: Object.keys(ENTITIES),
  });
});
