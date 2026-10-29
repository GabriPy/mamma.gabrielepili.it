import { config } from '../config.js';

const TZ = config.timezone;

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Restituisce le componenti orarie di un istante nel fuso della casa. */
export function zonedParts(date = new Date()) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function offsetMs(date = new Date()) {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** 'YYYY-MM-DD' nel fuso della casa. */
export function todayLocal(date = new Date()) {
  return localDateFormatter.format(date);
}

/** 'YYYY-MM-DDTHH:mm' -> Date (istante UTC corretto per il fuso). */
export function localToUtc(localDateTime) {
  const m = String(localDateTime).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h = '0', mi = '0'] = m;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0);
  let utc = naive - offsetMs(new Date(naive));
  // Ricalcolo per i confini dell'ora legale.
  utc = naive - offsetMs(new Date(utc));
  return new Date(utc);
}

/** Data locale 'YYYY-MM-DD' + 'HH:mm' -> istante UTC ISO. */
export function localDateTimeToIso(dateStr, timeStr = '09:00') {
  return localToUtc(`${dateStr}T${timeStr}`).toISOString();
}

/** Istante ISO -> stringa locale 'YYYY-MM-DDTHH:mm'. */
export function isoToLocalDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = zonedParts(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Istante ISO -> data locale 'YYYY-MM-DD'. */
export function isoToLocalDate(iso) {
  return isoToLocalDateTime(iso).slice(0, 10);
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

export function addYears(dateStr, years) {
  return addMonths(dateStr, years * 12);
}

export function diffDays(fromDateStr, toDateStr) {
  const a = Date.UTC(...fromDateStr.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...toDateStr.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / 86400000);
}

/** Lunedì della settimana che contiene la data. */
export function startOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (day - 1));
  return dt.toISOString().slice(0, 10);
}

/** Espande una ricorrenza fra due date locali (incluse). */
export function expandRecurrence({ startDate, recurrence, until, from, to, max = 400 }) {
  const out = [];
  if (!startDate || startDate > to) return out;
  if (!recurrence || recurrence === 'none') {
    if (startDate >= from && startDate <= to) out.push(startDate);
    return out;
  }
  if (until && startDate > until) return out;
  let cursor = startDate;
  let guard = 0;
  while (cursor < from && guard < 5000) {
    cursor = step(cursor, recurrence);
    guard += 1;
    if (until && cursor > until) return out;
  }
  while (cursor <= to && out.length < max && guard < 10000) {
    if ((!until || cursor <= until) && cursor >= from) out.push(cursor);
    cursor = step(cursor, recurrence);
    guard += 1;
  }
  return out;
}

function step(dateStr, recurrence) {
  if (recurrence === 'daily') return addDays(dateStr, 1);
  if (recurrence === 'weekly') return addDays(dateStr, 7);
  if (recurrence === 'monthly') return addMonths(dateStr, 1);
  if (recurrence === 'yearly') return addYears(dateStr, 1);
  return addDays(dateStr, 36500);
}

export function nextDateFor(dateStr, recurrence) {
  if (recurrence === 'monthly') return addMonths(dateStr, 1);
  if (recurrence === 'yearly') return addYears(dateStr, 1);
  if (recurrence === 'weekly') return addDays(dateStr, 7);
  return null;
}

const IT_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const IT_DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export function italianDate(dateStr, { weekday = false, year = true } = {}) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const base = `${d} ${IT_MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
  return weekday ? `${IT_DAYS[dt.getUTCDay()]} ${base}` : base;
}

export function italianWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return IT_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export { IT_MONTHS, IT_DAYS };
