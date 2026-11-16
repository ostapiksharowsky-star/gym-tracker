// Чисті функції без доступу до DOM чи сховища: дати, підходи, прогрес, календар.

export const MONTHS_NOM = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
export const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
export const MONTHS_SHORT = ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Дати (усе в локальному часі, формат 'YYYY-MM-DD') ----------

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function isDateStr(s) {
  return typeof s === 'string' && DATE_RE.test(s) && toDateStr(fromDateStr(s)) === s;
}

export function addDays(s, n) {
  const d = fromDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Індекс дня тижня, де 0 = понеділок. */
export function weekdayIndex(s) {
  return (fromDateStr(s).getDay() + 6) % 7;
}

/** «Сьогодні», «Вчора» або «9 лист.» (з роком, якщо він інший). */
export function formatDate(s, today) {
  if (s === today) return 'Сьогодні';
  if (s === addDays(today, -1)) return 'Вчора';
  return formatDateShort(s, today);
}

/** «9 лист.» або «9 лист. 2025», якщо рік відрізняється від поточного. */
export function formatDateShort(s, today) {
  const d = fromDateStr(s);
  const sameYear = today && d.getFullYear() === fromDateStr(today).getFullYear();
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}`;
}

/** «Пн, 9 листопада 2026». */
export function formatDateFull(s) {
  const d = fromDateStr(s);
  return `${WEEKDAYS[weekdayIndex(s)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Клітинки місяця для календаря: тижні з понеділка, порожні клітинки = null. */
export function monthGrid(year, month) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(`${year}-${pad2(month + 1)}-${pad2(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

// ---------- Числа ----------

/** Розбирає введене число (кома або крапка). Повертає null для порожнього чи некоректного. */
export function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '' || s === '.' || !/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Число для показу: до двох знаків, десяткова кома. */
export function formatNum(n) {
  return String(round2(n)).replace('.', ',');
}

// ---------- Підходи ----------

/** Перетворює рядки вводу на підходи. Рядки без повторів відкидаються, порожня вага = 0. */
export function normalizeSets(rows) {
  const out = [];
  for (const r of rows || []) {
    const reps = parseNum(r.reps);
    if (reps == null || Math.round(reps) < 1) continue;
    out.push({ weight: round2(parseNum(r.weight) ?? 0), reps: Math.round(reps) });
  }
  return out;
}

/** Порівняння підходів: спершу вага, потім повтори. */
export function cmpSet(a, b) {
  return a.weight - b.weight || a.reps - b.reps;
}

export function bestSet(sets) {
  let best = null;
  for (const s of sets || []) if (!best || cmpSet(s, best) > 0) best = s;
  return best;
}

export function sameSets(a, b) {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.weight === b[i].weight && s.reps === b[i].reps);
}

/** «60×10 · 60×8 · 65×6 кг»; підхід без ваги показується лише повторами. */
export function formatSets(sets, unit) {
  if (!sets || !sets.length) return '—';
  const text = sets.map((s) => (s.weight > 0 ? `${formatNum(s.weight)}×${s.reps}` : `${s.reps}`)).join(' · ');
  if (!sets.some((s) => s.weight > 0)) return `${text} повт.`;
  return unit ? `${text} ${unit}` : text;
}

// ---------- Прогрес ----------

/** Найновіший запис із датою, ранішою за вказану. */
export function previousLog(logs, date) {
  let prev = null;
  for (const l of logs || []) {
    if (l.date < date && (!prev || l.date > prev.date)) prev = l;
  }
  return prev;
}

/**
 * Різниця між найкращими підходами: спершу вага, за рівної ваги повтори.
 * Повертає null, якщо порівнювати нема з чим.
 */
export function progress(curSets, prevSets) {
  const a = bestSet(curSets);
  const b = bestSet(prevSets);
  if (!a || !b) return null;
  const dw = round2(a.weight - b.weight);
  if (dw !== 0) return { type: 'weight', delta: dw };
  const dr = a.reps - b.reps;
  if (dr !== 0) return { type: 'reps', delta: dr };
  return { type: 'same', delta: 0 };
}

export function formatProgress(p, unit) {
  if (!p) return null;
  if (p.type === 'same') return { text: 'як минулого разу', tone: 'same' };
  const sign = p.delta > 0 ? '+' : '−';
  const abs = Math.abs(p.delta);
  const text = p.type === 'weight' ? `${sign}${formatNum(abs)} ${unit}` : `${sign}${abs} повт.`;
  return { text, tone: p.delta > 0 ? 'up' : 'down' };
}

/** Рекорд: найкращий підхід кращий за всі попередні записи (і попередні записи існують). */
export function isRecord(curSets, earlierLogs) {
  const cur = bestSet(curSets);
  if (!cur) return false;
  let hadEarlier = false;
  for (const l of earlierLogs || []) {
    const b = bestSet(l.sets);
    if (!b) continue;
    hadEarlier = true;
    if (cmpSet(cur, b) <= 0) return false;
  }
  return hadEarlier;
}

// ---------- Різне ----------

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function sortByOrder(arr) {
  return [...arr].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Чорний чи білий текст краще читається на кольорі hex. */
export function contrastOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const lin = (i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  return L > 0.179 ? '#000000' : '#ffffff';
}

/** Перевіряє структуру файлу резервної копії. */
export function validateBackup(d) {
  const fail = (error) => ({ ok: false, error });
  if (!d || typeof d !== 'object' || d.app !== 'gym-tracker') return fail('Це не файл резервної копії цього застосунку.');
  for (const key of ['days', 'exercises', 'logs']) {
    if (!Array.isArray(d[key])) return fail(`У файлі бракує розділу «${key}».`);
  }
  const str = (v) => typeof v === 'string' && v.length > 0;
  if (!d.days.every((x) => x && str(x.id) && typeof x.name === 'string')) return fail('Пошкоджені дані днів.');
  if (!d.exercises.every((x) => x && str(x.id) && str(x.dayId) && typeof x.name === 'string')) return fail('Пошкоджені дані вправ.');
  const okSet = (s) => s && Number.isFinite(s.weight) && s.weight >= 0 && Number.isInteger(s.reps) && s.reps > 0;
  if (!d.logs.every((x) => x && str(x.exerciseId) && isDateStr(x.date) && Array.isArray(x.sets) && x.sets.every(okSet))) {
    return fail('Пошкоджені записи тренувань.');
  }
  if (d.settings != null && typeof d.settings !== 'object') return fail('Пошкоджені налаштування.');
  return { ok: true };
}
