export class HttpError extends Error {
  constructor(status, message, code = 'error', details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validate(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, issues[0]?.message || 'Dati non validi.', 'validation', issues);
  }
  return parsed.data;
}

export function toId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, 'Identificativo non valido.', 'bad_id');
  return id;
}

export function notFound(message = 'Elemento non trovato.') {
  return new HttpError(404, message, 'not_found');
}

export function forbidden(message = 'Non hai i permessi per questa azione.') {
  return new HttpError(403, message, 'forbidden');
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

export function cleanText(value, maxLength = 5000) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export function isoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
