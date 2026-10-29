export const EVENT_CATEGORIES = [
  { value: 'Casa', emoji: '🏠' },
  { value: 'Famiglia', emoji: '👨‍👩‍👧' },
  { value: 'Salute', emoji: '🩺' },
  { value: 'Lavoro', emoji: '💼' },
  { value: 'Scuola', emoji: '🎒' },
  { value: 'Altro', emoji: '✨' },
];

export const DEADLINE_CATEGORIES = [
  { value: 'Bollette', emoji: '💡' },
  { value: 'Documenti', emoji: '📄' },
  { value: 'Veicoli', emoji: '🚗' },
  { value: 'Casa', emoji: '🏠' },
  { value: 'Salute', emoji: '🩺' },
  { value: 'Appuntamenti', emoji: '📅' },
  { value: 'Altro', emoji: '✨' },
];

export const RECIPE_CATEGORIES = ['Primi', 'Secondi', 'Contorni', 'Dolci', 'Colazioni', 'Conserve', 'Altro'];

export const SHOPPING_CATEGORIES = [
  { value: 'Freschi', emoji: '🥬' },
  { value: 'Frigo', emoji: '🧊' },
  { value: 'Dispensa', emoji: '🥫' },
  { value: 'Casa', emoji: '🧺' },
  { value: 'Igiene', emoji: '🧼' },
  { value: 'Altro', emoji: '✨' },
];

export const PLANT_TYPES = {
  acqua: { label: 'Annaffiare', done: 'Annaffiata', emoji: '💧', color: '#4C7E8C' },
  concime: { label: 'Concimare', done: 'Concimata', emoji: '🌱', color: '#8A7A3F' },
  potatura: { label: 'Potare', done: 'Potata', emoji: '✂️', color: '#8C5A4C' },
  rinvaso: { label: 'Rinvasare', done: 'Rinvasata', emoji: '🪴', color: '#A4693C' },
  controllo: { label: 'Controllare', done: 'Controllata', emoji: '🔍', color: '#6E7F55' },
};

export const PLANT_INTERVALS = [
  { label: 'Ogni 2 giorni', value: 2 },
  { label: 'Ogni 3 giorni', value: 3 },
  { label: 'Ogni settimana', value: 7 },
  { label: 'Ogni 10 giorni', value: 10 },
  { label: 'Ogni 2 settimane', value: 14 },
  { label: 'Ogni mese', value: 30 },
  { label: 'Ogni 2 mesi', value: 60 },
];

export const UNITS = ['', 'pz', 'g', 'kg', 'ml', 'L', 'bt', 'conf', 'rotoli', 'cucchiai', 'q.b.'];

export const USER_COLORS = ['#C0553A', '#6F7F57', '#B07A3C', '#7A6A9B', '#4C7E8C', '#A35A6B', '#8A6A4E', '#3F6B57'];

export const USER_EMOJIS = ['👩', '🧔', '👨', '👵', '👴', '🧑', '👧', '👦', '🐶', '🐱', '🌻', '🍋'];

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Una sola volta' },
  { value: 'daily', label: 'Ogni giorno' },
  { value: 'weekly', label: 'Ogni settimana' },
  { value: 'monthly', label: 'Ogni mese' },
  { value: 'yearly', label: 'Ogni anno' },
];

export const DEADLINE_RECURRENCE = [
  { value: 'none', label: 'Una sola volta' },
  { value: 'monthly', label: 'Ogni mese' },
  { value: 'yearly', label: 'Ogni anno' },
];

export function categoryEmoji(category, list = DEADLINE_CATEGORIES) {
  return list.find((c) => c.value === category)?.emoji || '✨';
}
