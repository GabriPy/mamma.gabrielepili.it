import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { db } from './db.js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const now = new Date();
    const rel = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const dir = path.join(config.uploadsDir, rel);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = EXT_BY_MIME[file.mimetype] || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const err = new Error('Tipo di file non supportato. Carica immagini, PDF o documenti Word.');
      err.code = 'unsupported_file';
      cb(err);
      return;
    }
    cb(null, true);
  },
});

export function storedRelativePath(file) {
  return path.relative(config.uploadsDir, file.path).split(path.sep).join('/');
}

export function absolutePath(storedName) {
  const resolved = path.resolve(config.uploadsDir, storedName);
  if (!resolved.startsWith(path.resolve(config.uploadsDir) + path.sep)) {
    throw new Error('Percorso file non valido');
  }
  return resolved;
}

export function deleteFile(storedName) {
  try {
    fs.unlinkSync(absolutePath(storedName));
  } catch {
    /* file già assente */
  }
}

export function deleteAttachmentsFor(entityType, entityId) {
  const rows = db.prepare('SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ?').all(entityType, entityId);
  for (const row of rows) deleteFile(row.stored_name);
  db.prepare('DELETE FROM attachments WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId);
}

export function dirSize(dir) {
  let total = 0;
  let count = 0;
  if (!fs.existsSync(dir)) return { bytes: 0, files: 0 };
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = dirSize(full);
      total += sub.bytes;
      count += sub.files;
    } else {
      total += fs.statSync(full).size;
      count += 1;
    }
  }
  return { bytes: total, files: count };
}
