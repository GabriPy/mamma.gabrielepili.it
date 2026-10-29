export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notifyExpired() {
  window.dispatchEvent(new CustomEvent('gh:auth-expired'));
}

async function parseResponse(res, path) {
  const type = res.headers.get('content-type') || '';
  let payload = null;
  if (res.status !== 204) {
    try {
      payload = type.includes('application/json') ? await res.json() : await res.text();
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/profiles')) notifyExpired();
    const message = (payload && payload.error) || 'Qualcosa non ha funzionato. Riprova.';
    throw new ApiError(message, res.status, payload?.code, payload?.details);
  }
  return payload;
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  return parseResponse(res, path);
}

export async function uploadFile(file, entityType, entityId) {
  const form = new FormData();
  form.append('file', file);
  form.append('entityType', entityType);
  form.append('entityId', String(entityId));
  const res = await fetch('/api/attachments', { method: 'POST', body: form, credentials: 'same-origin' });
  return parseResponse(res, '/api/attachments');
}

export async function downloadFile(path, fallbackName = 'download') {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    let message = 'Download non riuscito.';
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}
