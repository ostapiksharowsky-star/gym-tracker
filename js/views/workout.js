// Головний екран: вкладки днів і картки вправ із підходами.

import { h, icon, openSheet, menuSheet, promptSheet, confirmSheet, toast, isIOS, isStandalone } from '../ui.js';
import * as store from '../store.js';
import {
  toDateStr, addDays, isDateStr, formatDate, formatDateShort, formatDateFull,
  parseNum, formatNum, normalizeSets, sameSets, previousLog,
  progress, formatProgress, isRecord, formatSets,
} from '../logic.js';
import { openExerciseEditor, thumb } from './editor.js';

const MAX_SETS = 20;

export function renderWorkout(app) {
  const today = toDateStr(new Date());
  const date = app.date || today;
  const days = store.days();
  if (!days.some((d) => d.id === app.dayId)) app.dayId = days.length ? days[0].id : null;
  if (!days.length) app.edit = false;
  const day = days.find((d) => d.id === app.dayId) || null;

  const root = h('div', { class: 'view view-workout' });

  // ----- Шапка: дата, режим редагування, вкладки -----
  const dateText = date === today ? `Сьогодні · ${formatDateShort(today, today)}` : formatDateFull(date);
  const header = h('header', { class: 'top' },
    h('div', { class: 'top-row' },
      h('button', {
        class: 'chip' + (date !== today ? ' chip--alert' : ''), type: 'button',
        'aria-label': 'Змінити дату', onclick: () => pickDate(app, date, today),
      }, icon('calendar', 16), dateText),
      days.length
        ? h('button', {
            class: 'text-btn', type: 'button',
            onclick: () => { app.edit = !app.edit; app.refresh(); },
          }, app.edit ? 'Готово' : 'Змінити')
        : null,
    ),
  );

  if (days.length) {
    let activeTab = null;
    const tabs = h('nav', { class: 'tabs', 'aria-label': 'Дні тренувань' },
      days.map((d) => {
        const tab = h('button', {
          class: 'tab' + (d.id === app.dayId ? ' is-active' : ''), type: 'button',
          onclick: () => {
            if (d.id === app.dayId) return;
            app.dayId = d.id;
            store.setSetting('lastDayId', d.id);
            app.refresh();
          },
        }, d.name);
        if (d.id === app.dayId) activeTab = tab;
        return tab;
      }),
      h('button', { class: 'tab tab--add', type: 'button', 'aria-label': 'Додати день', onclick: () => addDay(app) }, icon('plus', 18)),
    );
    header.append(tabs);
    if (activeTab && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const a = activeTab.getBoundingClientRect();
        const t = tabs.getBoundingClientRect();
        if (a.left < t.left || a.right > t.right) tabs.scrollLeft += a.left - t.left - 16;
      });
    }
  }
  root.append(header);

  const main = h('main', { class: 'content' });
  root.append(main);

  if (isIOS() && !isStandalone() && !installHintDismissed()) {
    main.append(h('div', { class: 'notice' },
      h('span', null, 'Спершу встанови застосунок: «Поділитись» → «На початковий екран». Дані, записані тут у Safari, у встановлений застосунок не перейдуть.'),
      h('button', { class: 'link-btn', type: 'button', onclick: () => { dismissInstallHint(); app.refresh(); } }, 'Зрозуміло'),
    ));
  }

  if (date !== today) {
    main.append(h('div', { class: 'notice' },
      h('span', null, 'Ти вносиш дані за минулу дату.'),
      h('button', { class: 'link-btn', type: 'button', onclick: () => { app.date = null; app.refresh(); } }, 'До сьогодні'),
    ));
  }

  // ----- Порожній стан: днів ще немає -----
  if (!day) {
    main.append(h('div', { class: 'empty' },
      h('div', { class: 'empty-title' }, 'Почни з дня тренувань'),
      h('p', null, 'Створи вкладку, наприклад «Груди» чи «Ноги», і додай у неї свої вправи.'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => addDay(app) }, icon('plus', 18), 'Створити день'),
    ));
    return root;
  }

  const exercises = store.exercisesOf(day.id);

  // ----- Режим редагування: керування днем і порядком вправ -----
  if (app.edit) {
    const idx = days.findIndex((d) => d.id === day.id);
    main.append(h('div', { class: 'daybar' },
      h('button', { class: 'btn btn--soft', type: 'button', onclick: () => renameDay(app, day) }, icon('pencil', 16), 'Назва'),
      h('button', {
        class: 'btn btn--soft btn--icon', type: 'button', 'aria-label': 'Зсунути день ліворуч', disabled: idx === 0,
        onclick: async () => { await store.moveDay(day.id, -1); app.refresh(); },
      }, icon('left', 18)),
      h('button', {
        class: 'btn btn--soft btn--icon', type: 'button', 'aria-label': 'Зсунути день праворуч', disabled: idx === days.length - 1,
        onclick: async () => { await store.moveDay(day.id, 1); app.refresh(); },
      }, icon('right', 18)),
      h('button', { class: 'btn btn--danger daybar-del', type: 'button', onclick: () => removeDay(app, day) }, 'Видалити день'),
    ));

    if (exercises.length) {
      const list = h('div', { class: 'reorder' },
        exercises.map((ex) => h('div', { class: 'reorder-row', dataset: { id: ex.id } },
          h('span', { class: 'handle', 'aria-hidden': 'true' }, icon('grip', 20)),
          thumb(ex, 'thumb--sm'),
          h('span', { class: 'reorder-name' }, ex.name),
          h('button', {
            class: 'icon-btn', type: 'button', 'aria-label': `Редагувати «${ex.name}»`,
            onclick: () => openExerciseEditor({ exercise: ex, onDone: app.refresh }),
          }, icon('pencil', 18)),
        )),
      );
      enableDrag(list, (ids) => store.reorderExercises(ids));
      main.append(list, h('p', { class: 'hint' }, 'Тягни за ≡, щоб змінити порядок вправ.'));
    } else {
      main.append(h('p', { class: 'hint' }, 'У цьому дні ще немає вправ.'));
    }
    return root;
  }

  // ----- Звичайний режим: картки вправ -----
  if (!exercises.length) {
    main.append(h('div', { class: 'empty' },
      h('div', { class: 'empty-title' }, 'Тут ще немає вправ'),
      h('p', null, 'Додай вправу: фото, назву, а далі записуй вагу й повтори.'),
    ));
  }
  for (const ex of exercises) main.append(exerciseCard(ex, date, today, app));
  main.append(h('button', {
    class: 'btn btn--dashed btn--block', type: 'button',
    onclick: () => openExerciseEditor({ dayId: day.id, onDone: app.refresh }),
  }, icon('plus', 18), 'Вправа'));

  return root;
}

// ---------- Підказка про встановлення ----------

const INSTALL_HINT_KEY = 'gt-install-hint-dismissed';

function installHintDismissed() {
  try { return localStorage.getItem(INSTALL_HINT_KEY) === '1'; } catch { return false; }
}

function dismissInstallHint() {
  try { localStorage.setItem(INSTALL_HINT_KEY, '1'); } catch { /* підказка просто з'явиться ще раз */ }
}

// ---------- Картка вправи ----------

const emptyRow = () => ({ weight: '', reps: '' });
const rowFromSet = (s) => ({ weight: s.weight > 0 ? formatNum(s.weight) : '', reps: String(s.reps) });
const isEmptyRow = (r) => !String(r.weight).trim() && !String(r.reps).trim();

function exerciseCard(ex, date, today, app) {
  const { unit, weightStep } = store.s.settings;
  const logs = store.logsOfExercise(ex.id);
  const log = store.logOf(ex.id, date);
  const prev = previousLog(logs, date);
  const draft = store.draftOf(ex.id, date);

  let rows;
  if (draft && draft.rows.length) rows = draft.rows.map((r) => ({ weight: r.weight, reps: r.reps }));
  else if (log) rows = log.sets.map(rowFromSet);
  else rows = Array.from({ length: prev ? Math.min(prev.sets.length, MAX_SETS) : 1 }, emptyRow);

  const card = h('article', { class: 'card' + (log ? ' is-logged' : '') });
  const rerender = () => card.replaceWith(exerciseCard(ex, date, today, app));

  /** Є зміни, яких ще не записано. */
  const isDirty = () => {
    if (!log) return rows.some((r) => !isEmptyRow(r));
    return !sameSets(normalizeSets(rows), log.sets) || rows.length !== log.sets.length;
  };

  /** Значення з минулого разу для підказки в полі. */
  const hintFor = (i, field) => {
    if (!prev || !prev.sets.length) return null;
    const s = prev.sets[Math.min(i, prev.sets.length - 1)];
    return field === 'weight' ? (s.weight > 0 ? s.weight : null) : s.reps;
  };

  // ----- Заголовок -----
  const badges = h('div', { class: 'badges' });
  if (log) {
    const earlier = logs.filter((l) => l.date < date);
    if (isRecord(log.sets, earlier)) badges.append(h('span', { class: 'badge badge--record' }, 'Рекорд'));
    const p = formatProgress(progress(log.sets, prev ? prev.sets : null), unit);
    if (p) badges.append(h('span', { class: `badge badge--${p.tone}` }, p.text));
    else badges.append(h('span', { class: 'badge badge--same' }, 'перший запис'));
  }

  card.append(h('div', { class: 'card-head' },
    thumb(ex),
    h('div', { class: 'card-title' }, h('h2', null, ex.name), badges),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Дії для «${ex.name}»`, onclick: openMenu }, icon('more', 22)),
  ));

  // ----- Підходи -----
  card.append(h('div', { class: 'set-head', 'aria-hidden': 'true' },
    h('span'), h('span', null, `Вага, ${unit}`), h('span'), h('span', null, 'Повтори'), h('span'),
  ));
  const setsEl = h('div', { class: 'sets' });
  card.append(setsEl);

  const saveBtn = h('button', { class: 'btn', type: 'button', onclick: save });
  const addBtn = h('button', { class: 'btn btn--soft', type: 'button', onclick: addSet }, icon('plus', 18), 'Підхід');
  card.append(h('div', { class: 'card-actions' }, addBtn, saveBtn));

  function updateSaveBtn() {
    const dirty = isDirty();
    if (log && !dirty) {
      saveBtn.className = 'btn btn--saved';
      saveBtn.disabled = true;
      saveBtn.replaceChildren(icon('check', 18), 'Записано');
    } else {
      saveBtn.className = 'btn btn--primary';
      saveBtn.disabled = false;
      saveBtn.replaceChildren(log ? 'Оновити' : 'Записати');
    }
    addBtn.disabled = rows.length >= MAX_SETS;
  }

  /** Після будь-якої зміни: оновити чернетку та кнопку. */
  function changed() {
    if (isDirty()) store.setDraft(ex.id, date, rows);
    else store.clearDraft(ex.id, date);
    updateSaveBtn();
  }

  function numberField(i, field) {
    const hint = hintFor(i, field);
    const input = h('input', {
      class: 'num', type: 'text', value: rows[i][field],
      placeholder: hint != null ? formatNum(hint) : '0',
      inputmode: field === 'weight' ? 'decimal' : 'numeric',
      autocomplete: 'off', enterkeyhint: 'done', maxLength: 6,
      'aria-label': `${field === 'weight' ? 'Вага' : 'Повтори'}, підхід ${i + 1}`,
      oninput: () => {
        const clean = field === 'weight' ? input.value.replace(/[^\d.,]/g, '') : input.value.replace(/\D/g, '');
        if (clean !== input.value) input.value = clean;
        rows[i][field] = clean;
        changed();
      },
      onfocus: () => { if (typeof input.select === 'function') input.select(); },
    });
    const bump = (dir) => {
      const cur = parseNum(rows[i][field]);
      const step = field === 'weight' ? weightStep : 1;
      let next;
      if (cur == null) next = hint != null ? hint : (dir > 0 ? step : 0);
      else next = Math.max(0, cur + dir * step);
      rows[i][field] = formatNum(next);
      input.value = rows[i][field];
      changed();
    };
    return h('div', { class: 'stepper' },
      h('button', { class: 'stepper-btn', type: 'button', tabindex: '-1', 'aria-label': 'Менше', onclick: () => bump(-1) }, icon('minus', 16)),
      input,
      h('button', { class: 'stepper-btn', type: 'button', tabindex: '-1', 'aria-label': 'Більше', onclick: () => bump(1) }, icon('plus', 16)),
    );
  }

  function renderRows() {
    setsEl.replaceChildren(...rows.map((_, i) => h('div', { class: 'set-row' },
      h('span', { class: 'set-n' }, String(i + 1)),
      numberField(i, 'weight'),
      h('span', { class: 'set-x', 'aria-hidden': 'true' }, '×'),
      numberField(i, 'reps'),
      h('button', {
        class: 'icon-btn icon-btn--sm', type: 'button', 'aria-label': `Прибрати підхід ${i + 1}`,
        onclick: () => {
          rows.splice(i, 1);
          if (!rows.length) rows.push(emptyRow());
          renderRows();
          changed();
        },
      }, icon('close', 16)),
    )));
  }

  function addSet() {
    if (rows.length >= MAX_SETS) return;
    const last = rows[rows.length - 1];
    rows.push(last && !isEmptyRow(last) ? { ...last } : emptyRow());
    renderRows();
    changed();
  }

  async function save() {
    const sets = normalizeSets(rows);
    if (!sets.length) {
      toast('Введи повтори хоча б для одного підходу');
      return;
    }
    saveBtn.disabled = true;
    try {
      await store.saveLog(ex.id, date, sets);
    } catch (err) {
      saveBtn.disabled = false;
      throw err;
    }
    rerender();
  }

  async function openMenu() {
    const choice = await menuSheet({
      title: ex.name,
      items: [
        { label: 'Історія вправи', value: 'history' },
        { label: 'Редагувати вправу', value: 'edit' },
        isDirty() ? { label: 'Скасувати незаписані зміни', value: 'revert' } : null,
        log ? { label: `Видалити запис за ${formatDate(date, today).toLowerCase()}`, value: 'delete', danger: true } : null,
      ],
    });
    if (choice === 'history') openExerciseHistory(ex, today);
    else if (choice === 'edit') openExerciseEditor({ exercise: ex, onDone: app.refresh });
    else if (choice === 'revert') { store.clearDraft(ex.id, date); rerender(); }
    else if (choice === 'delete') {
      const ok = await confirmSheet({ title: 'Видалити запис?', text: `${ex.name}: ${formatSets(log.sets, unit)}`, okLabel: 'Видалити', danger: true });
      if (!ok) return;
      store.clearDraft(ex.id, date);
      await store.deleteLog(ex.id, date);
      rerender();
    }
  }

  // ----- Минулий результат -----
  const prevEl = h('div', { class: 'prev' });
  if (prev) {
    prevEl.append(h('div', { class: 'prev-main' },
      h('div', { class: 'prev-label' }, `Минулого разу · ${formatDate(prev.date, today).toLowerCase()}`),
      h('div', { class: 'prev-sets' }, formatSets(prev.sets, unit)),
    ));
    if (!log) {
      prevEl.append(h('button', {
        class: 'link-btn', type: 'button',
        onclick: () => { rows = prev.sets.slice(0, MAX_SETS).map(rowFromSet); renderRows(); changed(); },
      }, 'Повторити'));
    }
  } else {
    prevEl.append(h('div', { class: 'prev-label' }, log ? 'Раніших записів немає' : 'Минулих записів ще немає'));
  }
  card.append(prevEl);

  renderRows();
  updateSaveBtn();
  return card;
}

// ---------- Історія однієї вправи ----------

function openExerciseHistory(ex, today) {
  const { unit } = store.s.settings;
  const logs = store.logsOfExercise(ex.id).reverse();
  const body = h('div', { class: 'loglist' },
    logs.length
      ? logs.map((l) => h('div', { class: 'loglist-row' },
          h('span', { class: 'loglist-date' }, formatDateShort(l.date, today)),
          h('span', { class: 'loglist-sets' }, formatSets(l.sets, unit)),
        ))
      : h('p', { class: 'sheet-text' }, 'Записів ще немає.'),
  );
  const sheet = openSheet({ title: ex.name, body });
  body.append(h('button', { class: 'btn btn--soft btn--block', type: 'button', onclick: () => sheet.close() }, 'Закрити'));
}

// ---------- Дії з днями ----------

async function addDay(app) {
  const name = await promptSheet({ title: 'Новий день', placeholder: 'Наприклад: Груди й трицепс', okLabel: 'Створити' });
  if (!name) return;
  const day = await store.addDay(name);
  app.dayId = day.id;
  await store.setSetting('lastDayId', day.id);
  app.refresh();
}

async function renameDay(app, day) {
  const name = await promptSheet({ title: 'Назва дня', value: day.name });
  if (!name || name === day.name) return;
  await store.renameDay(day.id, name);
  app.refresh();
}

async function removeDay(app, day) {
  const ok = await confirmSheet({
    title: `Видалити день «${day.name}»?`,
    text: 'Вкладка та її вправи зникнуть. Минулі записи залишаться в історії.',
    okLabel: 'Видалити',
    danger: true,
  });
  if (!ok) return;
  await store.removeDay(day.id);
  app.dayId = null;
  app.refresh();
}

// ---------- Вибір дати ----------

function pickDate(app, date, today) {
  const go = (d) => {
    app.date = d === today ? null : d;
    sheet.close();
    app.refresh();
  };
  const input = h('input', { class: 'field', type: 'date', value: date, max: today, 'aria-label': 'Дата' });
  const body = h('div', { class: 'menu' },
    h('button', { class: 'menu-item', type: 'button', onclick: () => go(today) }, 'Сьогодні'),
    h('button', { class: 'menu-item', type: 'button', onclick: () => go(addDays(today, -1)) }, 'Вчора'),
    h('button', { class: 'menu-item', type: 'button', onclick: () => go(addDays(today, -7)) }, 'Тиждень тому'),
    h('div', { class: 'date-pick' },
      input,
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => {
          const v = input.value;
          if (!isDateStr(v)) { toast('Вибери дату'); return; }
          if (v > today) { toast('Майбутню дату вибрати не можна'); return; }
          go(v);
        },
      }, 'Обрати'),
    ),
  );
  const sheet = openSheet({ title: 'Дата тренування', body });
}

// ---------- Перетягування вправ ----------

function enableDrag(list, onDone) {
  let dragging = null;

  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest ? e.target.closest('.handle') : null;
    if (!handle) return;
    dragging = handle.closest('.reorder-row');
    if (!dragging) return;
    dragging.classList.add('is-dragging');
    try { list.setPointerCapture(e.pointerId); } catch { /* без захоплення перетягування теж працює */ }
    e.preventDefault();
  });

  list.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    for (const row of list.children) {
      if (row === dragging) continue;
      const r = row.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) continue;
      const before = e.clientY < r.top + r.height / 2;
      list.insertBefore(dragging, before ? row : row.nextSibling);
      break;
    }
  });

  const finish = () => {
    if (!dragging) return;
    dragging.classList.remove('is-dragging');
    dragging = null;
    onDone([...list.children].map((c) => c.dataset.id));
  };
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
}
