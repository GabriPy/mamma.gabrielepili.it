import { db } from '../db.js';
import { diffDays, todayLocal } from './time.js';
import { mapAttachment } from './entities.js';

const userIndex = new Map();

export function userLite(id) {
  if (!id) return null;
  if (!userIndex.has(id)) {
    const u = db.prepare('SELECT id, name, color, emoji FROM users WHERE id = ?').get(id);
    userIndex.set(id, u ? { id: u.id, name: u.name, color: u.color, emoji: u.emoji } : null);
  }
  return userIndex.get(id);
}

export function clearUserIndex() {
  userIndex.clear();
}

export function eventOut(row, occurrence = null) {
  const startsAt = occurrence ? `${occurrence}T${row.all_day ? '00:00' : row.starts_at.slice(11, 16)}` : row.starts_at;
  let endsAt = row.ends_at;
  if (row.ends_at && occurrence) {
    const sameDay = row.ends_at.slice(0, 10) === row.starts_at.slice(0, 10);
    endsAt = sameDay ? `${occurrence}T${row.ends_at.slice(11, 16)}` : `${row.ends_at.slice(0, 10)}T${row.ends_at.slice(11, 16)}`;
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt,
    endsAt,
    allDay: Boolean(row.all_day),
    location: row.location,
    category: row.category,
    recurrence: row.recurrence,
    recurrenceUntil: row.recurrence_until,
    visibility: row.visibility,
    createdBy: userLite(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isRecurring: row.recurrence !== 'none',
    occurrenceKey: occurrence ? `${row.id}:${occurrence}` : String(row.id),
    baseStartsAt: row.starts_at,
    attachments: [],
  };
}

export function deadlineOut(row) {
  const today = todayLocal();
  const daysLeft = diffDays(today, row.due_date);
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    category: row.category,
    notes: row.notes,
    status: row.status,
    recurrence: row.recurrence,
    visibility: row.visibility,
    amount: row.amount,
    completedAt: row.completed_at,
    createdBy: userLite(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    daysLeft,
    isOverdue: row.status === 'open' && daysLeft < 0,
    isToday: row.status === 'open' && daysLeft === 0,
    isSoon: row.status === 'open' && daysLeft > 0 && daysLeft <= 7,
    attachments: [],
  };
}

export function shoppingItemOut(row) {
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    note: row.note,
    done: Boolean(row.done),
    doneAt: row.done_at,
    sortOrder: row.sort_order,
    createdBy: userLite(row.created_by),
    createdAt: row.created_at,
  };
}

export function recipeOut(row, { ingredients = null, attachments = [] } = {}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepMinutes: row.prep_minutes,
    category: row.category,
    notes: row.notes,
    favorite: Boolean(row.favorite),
    createdBy: userLite(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingredients: ingredients ?? undefined,
    attachments,
  };
}

export function ingredientOut(row) {
  return { id: row.id, name: row.name, quantity: row.quantity, unit: row.unit, position: row.position };
}

export function plantTaskOut(row, today = todayLocal()) {
  const dueInDays = diffDays(today, row.next_due_date);
  return {
    id: row.id,
    plantId: row.plant_id,
    type: row.type,
    intervalDays: row.interval_days,
    nextDueDate: row.next_due_date,
    lastDoneAt: row.last_done_at,
    notes: row.notes,
    dueInDays,
    isDue: dueInDays <= 0,
    isOverdue: dueInDays < 0,
  };
}

export function plantOut(row, tasks = [], attachments = []) {
  const today = todayLocal();
  const sorted = [...tasks].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  const next = sorted[0] ? plantTaskOut(sorted[0], today) : null;
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    location: row.location,
    notes: row.notes,
    createdBy: userLite(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tasks: sorted.map((t) => plantTaskOut(t, today)),
    nextTask: next,
    dueCount: sorted.filter((t) => plantTaskOut(t, today).isDue).length,
    attachments,
  };
}

export function plantLogOut(row) {
  return {
    id: row.id,
    plantId: row.plant_id,
    taskId: row.task_id,
    type: row.type,
    doneAt: row.done_at,
    note: row.note,
    by: userLite(row.created_by),
  };
}

export function attachmentRow(row) {
  return mapAttachment(row);
}
