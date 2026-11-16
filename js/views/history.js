// Історія: місячний календар і записи вибраного дня.

import { h, icon, menuSheet, confirmSheet } from '../ui.js';
import * as store from '../store.js';
import { toDateStr, fromDateStr, monthGrid, formatDateFull, formatSets, MONTHS_NOM, WEEKDAYS } from '../logic.js';
import { thumb } from './editor.js';

export function renderHistory(app) {
  const today = toDateStr(new Date());
  const hist = app.hist;
  if (!hist.selected || hist.selected > today) hist.selected = today;
  if (hist.year == null) {
    const d = fromDateStr(hist.selected);
    hist.year = d.getFullYear();
    hist.month = d.getMonth();
  }
  const now = fromDateStr(today);
  const isCurrentMonth = hist.year === now.getFullYear() && hist.month === now.getMonth();
  const logDates = store.logDates();

  const shift = (delta) => {
    const d = new Date(hist.year, hist.month + delta, 1);
    hist.year = d.getFullYear();
    hist.month = d.getMonth();
    app.refresh();
  };

  const root = h('div', { class: 'view view-history' });

  root.append(h('header', { class: 'top top--plain' },
    h('div', { class: 'cal-nav' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Попередній місяць', onclick: () => shift(-1) }, icon('left', 22)),
      h('h1', { class: 'cal-title' }, `${MONTHS_NOM[hist.month]} ${hist.year}`),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Наступний місяць', disabled: isCurrentMonth, onclick: () => shift(1) }, icon('right', 22)),
    ),
  ));

  const main = h('main', { class: 'content' });
  root.append(main);

  // ----- Календар -----
  const cells = monthGrid(hist.year, hist.month);
  let trained = 0;
  const grid = h('div', { class: 'cal-grid' },
    WEEKDAYS.map((w) => h('div', { class: 'cal-wd', 'aria-hidden': 'true' }, w)),
    cells.map((date) => {
      if (!date) return h('div', { class: 'cal-cell is-empty' });
      const has = logDates.has(date);
      if (has) trained++;
      const cls = ['cal-cell'];
      if (has) cls.push('has-log');
      if (date === today) cls.push('is-today');
      if (date === hist.selected) cls.push('is-selected');
      return h('button', {
        class: cls.join(' '), type: 'button', disabled: date > today,
        'aria-label': formatDateFull(date) + (has ? ', є записи' : ''),
        'aria-pressed': String(date === hist.selected),
        onclick: () => { hist.selected = date; app.refresh(); },
      }, String(Number(date.slice(8))));
    }),
  );
  main.append(grid, h('p', { class: 'hint cal-summary' }, trained ? `Днів із тренуваннями цього місяця: ${trained}` : 'Цього місяця записів немає'));

  // ----- Записи вибраного дня -----
  const { unit } = store.s.settings;
  const logs = store.logsOn(hist.selected);
  const entries = logs.map((log) => {
    const ex = store.exerciseById(log.exerciseId);
    const day = ex ? store.dayById(ex.dayId) : null;
    const live = !!(ex && !ex.archived && day && !day.archived);
    return { log, ex, day, live };
  }).sort((a, b) =>
    ((a.day && a.day.order) ?? 0) - ((b.day && b.day.order) ?? 0)
    || ((a.ex && a.ex.order) ?? 0) - ((b.ex && b.ex.order) ?? 0));

  main.append(h('h2', { class: 'section-title' }, formatDateFull(hist.selected)));

  if (!entries.length) {
    main.append(h('p', { class: 'hint' }, 'За цей день записів немає.'));
  } else {
    main.append(h('div', { class: 'entries' }, entries.map(({ log, ex, day, live }) => h('button', {
      class: 'entry', type: 'button',
      onclick: () => entryMenu(app, { log, ex, live, unit }),
    },
      thumb(ex, 'thumb--sm'),
      h('span', { class: 'entry-main' },
        h('span', { class: 'entry-name' }, ex ? ex.name : 'Видалена вправа'),
        h('span', { class: 'entry-sets' }, formatSets(log.sets, unit)),
      ),
      h('span', { class: 'entry-day' }, live ? day.name : 'видалено'),
    ))));
  }

  main.append(h('button', {
    class: 'btn btn--dashed btn--block', type: 'button',
    onclick: () => app.go('workout', { date: hist.selected === today ? null : hist.selected }),
  }, icon('plus', 18), entries.length ? 'Додати ще запис за цей день' : 'Додати запис за цей день'));

  return root;
}

async function entryMenu(app, { log, ex, live, unit }) {
  const today = toDateStr(new Date());
  const choice = await menuSheet({
    title: ex ? ex.name : 'Видалена вправа',
    items: [
      live ? { label: 'Відкрити й виправити', value: 'open' } : null,
      { label: 'Видалити запис', value: 'delete', danger: true },
    ],
  });
  if (choice === 'open') {
    app.go('workout', { date: log.date === today ? null : log.date, dayId: ex.dayId, edit: false });
  } else if (choice === 'delete') {
    const ok = await confirmSheet({
      title: 'Видалити запис?',
      text: `${ex ? ex.name : 'Вправа'}: ${formatSets(log.sets, unit)}`,
      okLabel: 'Видалити',
      danger: true,
    });
    if (!ok) return;
    store.clearDraft(log.exerciseId, log.date);
    await store.deleteLog(log.exerciseId, log.date);
    app.refresh();
  }
}
