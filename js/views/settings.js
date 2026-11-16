// Налаштування: вигляд, одиниці, резервна копія, встановлення.

import { h, segmented, confirmSheet, toast, isStandalone } from '../ui.js';
import * as store from '../store.js';
import { exportBackup, readBackup } from '../backup.js';
import { toDateStr, formatDate } from '../logic.js';

const ACCENTS = [
  { value: '#ff5c00', name: 'Помаранчевий' },
  { value: '#e5484d', name: 'Червоний' },
  { value: '#3b82f6', name: 'Синій' },
  { value: '#22a559', name: 'Зелений' },
  { value: '#8b5cf6', name: 'Фіолетовий' },
  { value: '#b4e600', name: 'Лайм' },
  { value: 'mono', name: 'Чорно-білий' },
];

const section = (title, ...children) => h('section', { class: 'settings-section' }, h('h2', { class: 'section-title' }, title), children);

export function renderSettings(app) {
  const st = store.s.settings;
  const today = toDateStr(new Date());
  const root = h('div', { class: 'view view-settings' });
  root.append(h('header', { class: 'top top--plain' }, h('h1', { class: 'page-title' }, 'Налаштування')));
  const main = h('main', { class: 'content' });
  root.append(main);

  const set = async (key, value) => {
    await store.setSetting(key, value);
    app.applyTheme();
  };

  // ----- Вигляд -----
  const isPreset = ACCENTS.some((a) => a.value === st.accent);
  const colorInput = h('input', {
    class: 'swatch-input', type: 'color', value: /^#[0-9a-f]{6}$/i.test(st.accent) ? st.accent : '#ff5c00',
    'aria-label': 'Власний колір',
    onchange: async () => { await set('accent', colorInput.value); app.refresh(); },
  });
  main.append(section('Вигляд',
    h('div', { class: 'setting' }, h('div', { class: 'setting-label' }, 'Тема'),
      segmented([{ value: 'auto', label: 'Авто' }, { value: 'light', label: 'Світла' }, { value: 'dark', label: 'Темна' }], st.theme, (v) => set('theme', v))),
    h('div', { class: 'setting' }, h('div', { class: 'setting-label' }, 'Колір акценту'),
      h('div', { class: 'swatches' },
        ACCENTS.map((a) => h('button', {
          class: 'swatch' + (a.value === 'mono' ? ' swatch--mono' : '') + (st.accent === a.value ? ' is-active' : ''),
          type: 'button', 'aria-label': a.name, 'aria-pressed': String(st.accent === a.value),
          style: a.value === 'mono' ? null : `background:${a.value}`,
          onclick: async () => { await set('accent', a.value); app.refresh(); },
        })),
        h('label', { class: 'swatch swatch--custom' + (!isPreset ? ' is-active' : ''), title: 'Власний колір' }, colorInput),
      )),
  ));

  // ----- Тренування -----
  main.append(section('Тренування',
    h('div', { class: 'setting' }, h('div', { class: 'setting-label' }, 'Одиниці ваги'),
      segmented([{ value: 'кг', label: 'кг' }, { value: 'lb', label: 'lb' }], st.unit, (v) => set('unit', v)),
      h('p', { class: 'hint' }, 'Змінюється лише підпис: уже записані числа не перераховуються.')),
    h('div', { class: 'setting' }, h('div', { class: 'setting-label' }, 'Крок кнопок +/− для ваги'),
      segmented([0.5, 1, 1.25, 2.5, 5].map((v) => ({ value: v, label: String(v).replace('.', ',') })), st.weightStep, (v) => set('weightStep', v))),
  ));

  // ----- Резервна копія -----
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const res = await readBackup(file);
    if (!res.ok) { toast(res.error, { duration: 4000 }); return; }
    const d = res.data;
    const ok = await confirmSheet({
      title: 'Відновити з копії?',
      text: `У файлі: днів ${d.days.filter((x) => !x.archived).length}, вправ ${d.exercises.filter((x) => !x.archived).length}, записів ${d.logs.length}. Усі поточні дані на цьому пристрої буде замінено.`,
      okLabel: 'Замінити дані',
      danger: true,
    });
    if (!ok) return;
    await store.importData(d);
    app.resetAfterDataChange();
    toast('Дані відновлено');
  });

  const backupInfo = st.lastBackup
    ? `Остання копія: ${formatDate(toDateStr(new Date(st.lastBackup)), today).toLowerCase()}.`
    : 'Копію ще не робили.';
  main.append(section('Резервна копія',
    h('p', { class: 'hint' }, `Дані зберігаються лише на цьому пристрої. Час від часу зберігай копію у «Файли» чи iCloud. ${backupInfo}`),
    h('div', { class: 'row-actions' },
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const done = await exportBackup();
          if (done) { toast('Копію збережено'); app.refresh(); }
        },
      }, 'Зберегти копію'),
      h('button', { class: 'btn btn--soft', type: 'button', onclick: () => fileInput.click() }, 'Відновити з файлу'),
    ),
    fileInput,
  ));

  // ----- Пристрій -----
  const standalone = isStandalone();
  const storageLine = h('p', { class: 'hint' }, '');
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => {
      storageLine.textContent = p ? 'Сховище позначене як постійне: система не очищатиме його сама.' : '';
    }).catch(() => {});
  }
  const exCount = store.s.exercises.filter((e) => !e.archived).length;
  main.append(section('Пристрій',
    standalone
      ? h('p', { class: 'hint' }, 'Застосунок встановлено на початковий екран.')
      : h('p', { class: 'hint' }, 'Щоб користуватись як програмою і без інтернету: відкрий цю сторінку в Safari, натисни «Поділитись», а потім «На початковий екран». Записуй тренування вже у встановленому застосунку, бо в нього власне сховище даних.'),
    storageLine,
    h('p', { class: 'hint' }, `Зараз збережено: днів ${store.days().length}, вправ ${exCount}, записів ${store.s.logs.size}.`),
  ));

  // ----- Небезпечна зона -----
  main.append(section('Скидання',
    h('button', {
      class: 'btn btn--danger btn--block', type: 'button',
      onclick: async () => {
        const ok = await confirmSheet({
          title: 'Стерти всі дані?',
          text: 'Дні, вправи, фото й усі записи буде видалено з цього пристрою. Скасувати це неможливо, тож спершу збережи копію.',
          okLabel: 'Стерти все',
          danger: true,
        });
        if (!ok) return;
        await store.wipe();
        app.resetAfterDataChange();
        toast('Усі дані стерто');
      },
    }, 'Стерти всі дані'),
  ));

  main.append(h('p', { class: 'hint version' }, `Зал · версія ${app.version}`));
  return root;
}
