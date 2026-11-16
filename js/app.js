// Запуск застосунку: завантаження даних, перемикання екранів, тема, офлайн-режим.

import * as db from './db.js';
import * as store from './store.js';
import { h, icon, toast } from './ui.js';
import { toDateStr, contrastOn } from './logic.js';
import { renderWorkout } from './views/workout.js';
import { renderHistory } from './views/history.js';
import { renderSettings } from './views/settings.js';

// Під час випуску нової версії зміни це число тут і VERSION у sw.js.
const VERSION = '1.0.0';

const VIEWS = {
  workout: { label: 'Тренування', icon: 'dumbbell', render: renderWorkout },
  history: { label: 'Історія', icon: 'calendar', render: renderHistory },
  settings: { label: 'Налаштування', icon: 'sliders', render: renderSettings },
};

const root = document.getElementById('app');
const host = h('div', { class: 'view-host' });
const navButtons = {};
const nav = h('nav', { class: 'nav', 'aria-label': 'Розділи' },
  h('div', { class: 'nav-inner' }, Object.entries(VIEWS).map(([key, v]) => {
    const b = h('button', { class: 'nav-item', type: 'button', onclick: () => app.go(key) }, icon(v.icon, 24), h('span', null, v.label));
    navButtons[key] = b;
    return b;
  })),
);

let renderedOn = null; // дата, за якої екран малювали востаннє

const freshHistory = () => ({ year: null, month: null, selected: null });

export const app = {
  version: VERSION,
  view: 'workout',
  dayId: null,   // відкрита вкладка дня
  date: null,    // null = сьогодні, інакше 'YYYY-MM-DD' для внесення минулих даних
  edit: false,   // режим редагування дня
  hist: freshHistory(),

  refresh() {
    renderedOn = toDateStr(new Date());
    host.replaceChildren(VIEWS[app.view].render(app));
    for (const [key, b] of Object.entries(navButtons)) {
      const active = key === app.view;
      b.classList.toggle('is-active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  },

  go(view, patch) {
    const changed = view !== app.view;
    if (patch) Object.assign(app, patch);
    if (changed && view !== 'workout') app.edit = false;
    app.view = view;
    app.refresh();
    if (changed && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
  },

  applyTheme() {
    const { theme, accent } = store.s.settings;
    const el = document.documentElement;
    if (theme === 'light' || theme === 'dark') el.dataset.theme = theme;
    else delete el.dataset.theme;
    if (accent === 'mono') {
      el.dataset.accent = 'mono';
      el.style.removeProperty('--accent');
      el.style.removeProperty('--on-accent');
    } else {
      delete el.dataset.accent;
      el.style.setProperty('--accent', accent);
      el.style.setProperty('--on-accent', contrastOn(accent));
    }
    try {
      localStorage.setItem('gt-theme', theme);
      localStorage.setItem('gt-accent', accent);
    } catch { /* сховище недоступне: тема просто застосується трохи пізніше */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(el).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  },

  /** Після імпорту чи стирання: скинути вибір і перемалювати все. */
  resetAfterDataChange() {
    app.dayId = store.s.settings.lastDayId;
    app.date = null;
    app.edit = false;
    app.hist = freshHistory();
    app.applyTheme();
    app.refresh();
  },
};

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !location.search.includes('sw=1')) return; // під час розробки кеш лише заважає

  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => toast('Доступна нова версія', {
      action: 'Оновити', duration: 0, onAction: () => worker.postMessage('skipWaiting'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60 * 60 * 1000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    });
  }).catch((err) => console.warn('Офлайн-режим не ввімкнено', err));
}

async function boot() {
  try {
    await store.load(db);
  } catch (err) {
    console.error(err);
    root.replaceChildren(h('div', { class: 'empty' },
      h('div', { class: 'empty-title' }, 'Не вдалося відкрити сховище даних'),
      h('p', null, 'Перевір, що браузер не в приватному режимі й має вільне місце, а потім онови сторінку.'),
    ));
    return;
  }

  app.dayId = store.s.settings.lastDayId;
  app.applyTheme();
  root.replaceChildren(host, nav);
  app.refresh();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
    else if (renderedOn !== toDateStr(new Date())) app.refresh(); // настав новий день
  });
  window.addEventListener('pagehide', () => { store.flush(); });
  window.addEventListener('unhandledrejection', (e) => {
    console.error(e.reason);
    toast('Щось пішло не так. Спробуй ще раз.');
  });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  registerServiceWorker();
}

boot();
