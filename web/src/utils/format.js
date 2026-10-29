const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

export function parseDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toDateString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayString() {
  return toDateString(new Date());
}

export function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function diffDays(fromStr, toStr) {
  const a = parseDate(fromStr);
  const b = parseDate(toStr);
  return Math.round((b - a) / 86400000);
}

export function formatDate(dateStr, { weekday = false, year = false, short = false } = {}) {
  const d = parseDate(dateStr);
  if (!d) return '';
  const month = short ? MONTHS_SHORT[d.getMonth()] : MONTHS[d.getMonth()];
  const base = `${d.getDate()} ${month}${year ? ` ${d.getFullYear()}` : ''}`;
  return weekday ? `${WEEKDAYS[d.getDay()]} ${base}` : base;
}

export function formatLongDate(dateStr) {
  return formatDate(dateStr, { weekday: true, year: true });
}

export function formatMonth(year, monthIndex) {
  return `${MONTHS[monthIndex]} ${year}`;
}

export function weekdayName(dateStr) {
  const d = parseDate(dateStr);
  return d ? WEEKDAYS[d.getDay()] : '';
}

export function weekdayShort(dateStr) {
  const d = parseDate(dateStr);
  return d ? WEEKDAYS_SHORT[d.getDay()] : '';
}

export function relativeDay(dateStr) {
  const days = diffDays(todayString(), dateStr);
  if (days === 0) return 'oggi';
  if (days === 1) return 'domani';
  if (days === 2) return 'dopodomani';
  if (days === -1) return 'ieri';
  if (days > 0 && days < 7) return `fra ${days} giorni`;
  if (days > 0) return `fra ${days} giorni`;
  if (days > -7) return `${Math.abs(days)} giorni fa`;
  return `${Math.abs(days)} giorni fa`;
}

export function dueLabel(days) {
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'giorno' : 'giorni'} in ritardo`;
  if (days === 0) return 'oggi';
  if (days === 1) return 'domani';
  return `fra ${days} giorni`;
}

export function formatTime(localDateTime) {
  if (!localDateTime) return '';
  return String(localDateTime).slice(11, 16);
}

export function formatDateTime(localDateTime) {
  if (!localDateTime) return '';
  const date = String(localDateTime).slice(0, 10);
  const time = formatTime(localDateTime);
  return `${formatDate(date, { weekday: true, short: true })}${time ? ` · ${time}` : ''}`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return 'Buonanotte';
  if (hour < 13) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

export function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function plural(count, singular, pluralWord) {
  return count === 1 ? singular : pluralWord;
}

export function monthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunedì = 0
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) {
    const d = new Date(year, monthIndex, -startOffset + i + 1);
    cells.push({ date: toDateString(d), outside: true, day: d.getDate() });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, monthIndex, day);
    cells.push({ date: toDateString(d), outside: false, day, isToday: toDateString(d) === todayString() });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = parseDate(cells[cells.length - 1].date);
    last.setDate(last.getDate() + 1);
    cells.push({ date: toDateString(last), outside: true, day: last.getDate() });
  }
  return cells.slice(0, 42);
}

export { MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_SHORT, WEEKDAY_INITIALS };
