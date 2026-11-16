// Стан застосунку в пам'яті + запис змін у базу. Екрани читають звідси й викликають ці функції.

import { uid, sortByOrder } from './logic.js';

export const DEFAULT_SETTINGS = {
  theme: 'auto',        // 'auto' | 'light' | 'dark'
  accent: '#ff5c00',    // hex або 'mono'
  unit: 'кг',           // підпис одиниці ваги
  weightStep: 2.5,      // крок кнопок +/− для ваги
  lastBackup: null,     // ISO-час останнього експорту
  lastDayId: null,      // остання відкрита вкладка
};

const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
const DRAFT_DELAY = 300;
const PHOTO_RE = /^data:image\/(png|jpeg|webp|gif);base64,/;

let be = null; // сховище (js/db.js або підміна в тестах)
const draftTimers = new Map();

export const s = {
  days: [],
  exercises: [],
  logs: new Map(),
  drafts: new Map(),
  settings: { ...DEFAULT_SETTINGS },
};

export const keyOf = (exerciseId, date) => `${exerciseId}|${date}`;

export async function load(backend) {
  be = backend;
  const [days, exercises, logs, drafts, settings] = await Promise.all(
    ['days', 'exercises', 'logs', 'drafts', 'settings'].map((name) => be.getAll(name)),
  );
  s.days = days;
  s.exercises = exercises;
  s.logs = new Map(logs.map((l) => [l.id, l]));
  s.settings = { ...DEFAULT_SETTINGS };
  for (const row of settings) s.settings[row.key] = row.value;

  s.drafts = new Map();
  const now = Date.now();
  const stale = [];
  for (const d of drafts) {
    if (now - (d.updatedAt || 0) > DRAFT_TTL || !exerciseById(d.exerciseId)) stale.push(d.id);
    else s.drafts.set(d.id, d);
  }
  if (stale.length) await be.batch(stale.map((id) => ({ store: 'drafts', del: id })));
}

// ---------- Читання ----------

export const days = () => sortByOrder(s.days.filter((d) => !d.archived));
export const dayById = (id) => s.days.find((d) => d.id === id) || null;
export const exercisesOf = (dayId) => sortByOrder(s.exercises.filter((e) => e.dayId === dayId && !e.archived));
export const exerciseById = (id) => s.exercises.find((e) => e.id === id) || null;
export const logOf = (exerciseId, date) => s.logs.get(keyOf(exerciseId, date)) || null;
export const draftOf = (exerciseId, date) => s.drafts.get(keyOf(exerciseId, date)) || null;

/** Усі записи вправи, від найстарішого до найновішого. */
export function logsOfExercise(exerciseId) {
  const out = [];
  for (const l of s.logs.values()) if (l.exerciseId === exerciseId) out.push(l);
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function logsOn(date) {
  const out = [];
  for (const l of s.logs.values()) if (l.date === date) out.push(l);
  return out;
}

export function logDates() {
  const set = new Set();
  for (const l of s.logs.values()) set.add(l.date);
  return set;
}

// ---------- Допоміжне ----------

const nextOrder = (items) => items.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;

function replaceIn(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

const removeFrom = (list, id) => {
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
};

const hasLogs = (exerciseId) => {
  for (const l of s.logs.values()) if (l.exerciseId === exerciseId) return true;
  return false;
};

function dropDraftsInMemory(exerciseId) {
  const ids = [];
  for (const d of s.drafts.values()) if (d.exerciseId === exerciseId) ids.push(d.id);
  for (const id of ids) {
    s.drafts.delete(id);
    clearTimeout(draftTimers.get(id));
    draftTimers.delete(id);
  }
  return ids;
}

// ---------- Дні ----------

export async function addDay(name) {
  const day = { id: uid(), name: name.trim(), order: nextOrder(s.days), archived: false };
  await be.put('days', day);
  s.days.push(day);
  return day;
}

export async function renameDay(id, name) {
  const cur = dayById(id);
  if (!cur) return;
  const day = { ...cur, name: name.trim() };
  await be.put('days', day);
  replaceIn(s.days, day);
}

/** Зсуває день ліворуч (dir = -1) або праворуч (dir = 1) серед вкладок. */
export async function moveDay(id, dir) {
  const list = days();
  const i = list.findIndex((d) => d.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const updated = list.map((d, order) => ({ ...d, order }));
  await be.batch(updated.map((d) => ({ store: 'days', put: d })));
  for (const d of updated) replaceIn(s.days, d);
}

/** Видаляє день. Вправи з історією архівуються, щоб минулі записи не зникли. */
export async function removeDay(id) {
  const day = dayById(id);
  if (!day) return;
  const ops = [];
  const archived = [];
  const deleted = [];
  for (const ex of s.exercises.filter((e) => e.dayId === id)) {
    if (hasLogs(ex.id)) {
      const upd = { ...ex, archived: true };
      archived.push(upd);
      ops.push({ store: 'exercises', put: upd });
    } else {
      deleted.push(ex.id);
      ops.push({ store: 'exercises', del: ex.id });
    }
  }
  const draftIds = [...archived.map((e) => e.id), ...deleted].flatMap(dropDraftsInMemory);
  for (const d of draftIds) ops.push({ store: 'drafts', del: d });
  const keepDay = archived.length > 0;
  ops.push(keepDay ? { store: 'days', put: { ...day, archived: true } } : { store: 'days', del: id });
  await be.batch(ops);
  for (const ex of archived) replaceIn(s.exercises, ex);
  for (const exId of deleted) removeFrom(s.exercises, exId);
  if (keepDay) replaceIn(s.days, { ...day, archived: true });
  else removeFrom(s.days, id);
}

// ---------- Вправи ----------

export async function addExercise({ dayId, name, photo = null }) {
  const ex = {
    id: uid(),
    dayId,
    name: name.trim(),
    photo,
    order: nextOrder(s.exercises.filter((e) => e.dayId === dayId)),
    archived: false,
  };
  await be.put('exercises', ex);
  s.exercises.push(ex);
  return ex;
}

export async function updateExercise(id, patch) {
  const cur = exerciseById(id);
  if (!cur) return;
  const ex = { ...cur, ...patch };
  if (typeof ex.name === 'string') ex.name = ex.name.trim();
  if (patch.dayId && patch.dayId !== cur.dayId) {
    ex.order = nextOrder(s.exercises.filter((e) => e.dayId === patch.dayId));
  }
  await be.put('exercises', ex);
  replaceIn(s.exercises, ex);
}

/** Видаляє вправу. Якщо в неї є записи, вона лише ховається, а історія лишається. */
export async function removeExercise(id) {
  const ex = exerciseById(id);
  if (!ex) return;
  const keep = hasLogs(id);
  const ops = dropDraftsInMemory(id).map((d) => ({ store: 'drafts', del: d }));
  ops.push(keep ? { store: 'exercises', put: { ...ex, archived: true } } : { store: 'exercises', del: id });
  await be.batch(ops);
  if (keep) replaceIn(s.exercises, { ...ex, archived: true });
  else removeFrom(s.exercises, id);
}

export async function reorderExercises(ids) {
  const updated = [];
  ids.forEach((id, order) => {
    const ex = exerciseById(id);
    if (ex && ex.order !== order) updated.push({ ...ex, order });
  });
  if (!updated.length) return;
  await be.batch(updated.map((ex) => ({ store: 'exercises', put: ex })));
  for (const ex of updated) replaceIn(s.exercises, ex);
}

// ---------- Записи ----------

export async function saveLog(exerciseId, date, sets) {
  const id = keyOf(exerciseId, date);
  const log = { id, exerciseId, date, sets, updatedAt: Date.now() };
  clearTimeout(draftTimers.get(id));
  draftTimers.delete(id);
  await be.batch([{ store: 'logs', put: log }, { store: 'drafts', del: id }]);
  s.logs.set(id, log);
  s.drafts.delete(id);
  return log;
}

export async function deleteLog(exerciseId, date) {
  const id = keyOf(exerciseId, date);
  const ops = [{ store: 'logs', del: id }];
  // Прибираємо заархівовану вправу (і її день), коли зникає останній запис.
  const ex = exerciseById(exerciseId);
  let dropExercise = false;
  let dropDay = false;
  if (ex && ex.archived) {
    let others = 0;
    for (const l of s.logs.values()) if (l.exerciseId === exerciseId && l.id !== id) others++;
    if (!others) {
      dropExercise = true;
      ops.push({ store: 'exercises', del: ex.id });
      const day = dayById(ex.dayId);
      if (day && day.archived && !s.exercises.some((e) => e.dayId === day.id && e.id !== ex.id)) {
        dropDay = true;
        ops.push({ store: 'days', del: day.id });
      }
    }
  }
  await be.batch(ops);
  s.logs.delete(id);
  if (dropDay) removeFrom(s.days, ex.dayId);
  if (dropExercise) removeFrom(s.exercises, ex.id);
}

// ---------- Чернетки (незаписані підходи) ----------

function persistDraft(id) {
  draftTimers.delete(id);
  const draft = s.drafts.get(id);
  const job = draft ? be.put('drafts', draft) : be.del('drafts', id);
  return job.catch((err) => console.warn('Чернетку не збережено', err));
}

function scheduleDraft(id) {
  clearTimeout(draftTimers.get(id));
  draftTimers.set(id, setTimeout(() => persistDraft(id), DRAFT_DELAY));
}

/** Запам'ятовує введене одразу в пам'яті, а в базу пише з невеликою затримкою. */
export function setDraft(exerciseId, date, rows) {
  const id = keyOf(exerciseId, date);
  s.drafts.set(id, { id, exerciseId, date, rows: rows.map((r) => ({ weight: r.weight, reps: r.reps })), updatedAt: Date.now() });
  scheduleDraft(id);
}

export function clearDraft(exerciseId, date) {
  const id = keyOf(exerciseId, date);
  if (!s.drafts.has(id) && !draftTimers.has(id)) return;
  s.drafts.delete(id);
  scheduleDraft(id);
}

/** Негайно дописує всі відкладені чернетки (перед згортанням застосунку). */
export function flush() {
  const ids = [...draftTimers.keys()];
  for (const id of ids) clearTimeout(draftTimers.get(id));
  return Promise.all(ids.map(persistDraft));
}

// ---------- Налаштування ----------

export async function setSetting(key, value) {
  await be.put('settings', { key, value });
  s.settings[key] = value;
}

// ---------- Резервна копія ----------

export function exportData() {
  return {
    app: 'gym-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    days: s.days,
    exercises: s.exercises,
    logs: [...s.logs.values()],
    settings: { ...s.settings },
  };
}

/** Замінює всі дані вмістом резервної копії (її вже перевірено validateBackup). */
export async function importData(d) {
  const daysIn = d.days.map((x, i) => ({ id: x.id, name: x.name, order: Number.isFinite(x.order) ? x.order : i, archived: !!x.archived }));
  const dayIds = new Set(daysIn.map((x) => x.id));
  const exercisesIn = d.exercises
    .filter((x) => dayIds.has(x.dayId))
    .map((x, i) => ({
      id: x.id,
      dayId: x.dayId,
      name: x.name,
      photo: typeof x.photo === 'string' && PHOTO_RE.test(x.photo) ? x.photo : null,
      order: Number.isFinite(x.order) ? x.order : i,
      archived: !!x.archived,
    }));
  const exIds = new Set(exercisesIn.map((x) => x.id));
  const logsIn = new Map();
  for (const x of d.logs) {
    if (!exIds.has(x.exerciseId)) continue;
    const id = keyOf(x.exerciseId, x.date);
    logsIn.set(id, {
      id,
      exerciseId: x.exerciseId,
      date: x.date,
      sets: x.sets.map((st) => ({ weight: st.weight, reps: st.reps })),
      updatedAt: Number.isFinite(x.updatedAt) ? x.updatedAt : Date.now(),
    });
  }
  const settingsIn = { ...DEFAULT_SETTINGS };
  const src = d.settings || {};
  if (['auto', 'light', 'dark'].includes(src.theme)) settingsIn.theme = src.theme;
  if (src.accent === 'mono' || /^#[0-9a-f]{6}$/i.test(src.accent || '')) settingsIn.accent = src.accent;
  if (typeof src.unit === 'string' && src.unit.length > 0 && src.unit.length <= 6) settingsIn.unit = src.unit;
  if (Number.isFinite(src.weightStep) && src.weightStep > 0) settingsIn.weightStep = src.weightStep;
  if (typeof src.lastBackup === 'string') settingsIn.lastBackup = src.lastBackup;
  if (typeof src.lastDayId === 'string' && dayIds.has(src.lastDayId)) settingsIn.lastDayId = src.lastDayId;
  await flush();
  await be.replaceAll({
    days: daysIn,
    exercises: exercisesIn,
    logs: [...logsIn.values()],
    drafts: [],
    settings: Object.entries(settingsIn).map(([key, value]) => ({ key, value })),
  });
  await load(be);
}

export async function wipe() {
  await flush();
  await be.replaceAll({});
  await load(be);
}
