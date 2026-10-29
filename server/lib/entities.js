import { db } from '../db.js';

export const ENTITIES = {
  event: { table: 'events', title: 'title', module: 'calendario', label: 'Evento' },
  deadline: { table: 'deadlines', title: 'title', module: 'scadenze', label: 'Scadenza' },
  recipe: { table: 'recipes', title: 'title', module: 'ricette', label: 'Ricetta' },
  plant: { table: 'plants', title: 'name', module: 'piante', label: 'Pianta' },
};

export function getEntity(entityType, entityId) {
  const meta = ENTITIES[entityType];
  if (!meta) return null;
  return db.prepare(`SELECT * FROM ${meta.table} WHERE id = ?`).get(entityId) || null;
}

/** I dati privati sono visibili solo a chi li ha creati. */
export function canAccessEntity(entityType, row, user) {
  if (!row || !user) return false;
  if (!('visibility' in row) || row.visibility !== 'private') return true;
  return row.created_by === user.id;
}

export function assertEntity(entityType, entityId, user) {
  const row = getEntity(entityType, entityId);
  if (!row) return null;
  if (!canAccessEntity(entityType, row, user)) return null;
  return row;
}

export function entityTitle(entityType, row) {
  const meta = ENTITIES[entityType];
  return meta ? row[meta.title] : 'Elemento';
}

export function attachmentsFor(entityType, entityIds) {
  if (!entityIds.length) return [];
  const placeholders = entityIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT id, entity_type, entity_id, original_name, mime, size, created_at
       FROM attachments WHERE entity_type = ? AND entity_id IN (${placeholders})
       ORDER BY created_at ASC`,
    )
    .all(entityType, ...entityIds);
}

export function attachToItems(items, entityType) {
  const rows = attachmentsFor(entityType, items.map((i) => i.id));
  const byEntity = new Map();
  for (const row of rows) {
    if (!byEntity.has(row.entity_id)) byEntity.set(row.entity_id, []);
    byEntity.get(row.entity_id).push(mapAttachment(row));
  }
  return items.map((item) => ({ ...item, attachments: byEntity.get(item.id) || [] }));
}

export function mapAttachment(row) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    name: row.original_name,
    mime: row.mime,
    size: row.size,
    isImage: String(row.mime).startsWith('image/'),
    url: `/api/attachments/${row.id}/file`,
    createdAt: row.created_at,
  };
}

export function isPrivate(row) {
  return row && row.visibility === 'private';
}
