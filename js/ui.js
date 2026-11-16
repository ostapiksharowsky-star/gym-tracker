// Маленькі будівельні блоки інтерфейсу: створення елементів, іконки, шторки, сповіщення.

const PROPS = new Set([
  'value', 'disabled', 'checked', 'type', 'placeholder', 'src', 'alt', 'title', 'id', 'name',
  'max', 'min', 'selected', 'hidden', 'accept', 'href', 'download', 'textContent', 'maxLength',
]);

/** h('div', { class: 'x', onclick: fn }, child, 'текст', [діти]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c);
  }
}

const ICONS = {
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  grip: '<path d="M5 9h14M5 15h14"/>',
  pencil: '<path d="M4 20l1-4.5L16.5 4a2 2 0 013 3L8 18.5 4 20z"/>',
  left: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  right: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 016.5 6h1.2l1.2-2h6.2l1.2 2h1.2A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.500 19h-11A2.5 2.5 0 014 16.500z"/><circle cx="12" cy="12.500" r="3.2"/>',
};

export function icon(name, size = 22) {
  return h('span', {
    class: 'icon',
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`,
  });
}

// ---------- Пристрій ----------

/** Застосунок запущено з початкового екрана, а не у вкладці браузера. */
export function isStandalone() {
  return (typeof navigator !== 'undefined' && navigator.standalone === true)
    || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent || '')
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}

// ---------- Шторки ----------

/**
 * Відкриває шторку. top: true ставить її вгорі екрана (для форм із клавіатурою).
 * Повертає { close, panel }.
 */
let openSheets = 0;

export function openSheet({ title, body, top = false, onClose } = {}) {
  let closed = false;
  const backdrop = h('div', { class: 'backdrop' + (top ? ' backdrop--top' : '') });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    title ? h('div', { class: 'sheet-title' }, title) : null,
    body,
  );
  const close = (result) => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    if (--openSheets === 0) document.documentElement.classList.remove('has-sheet');
    if (onClose) onClose(result);
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.append(panel);
  document.body.append(backdrop);
  if (++openSheets === 1) document.documentElement.classList.add('has-sheet'); // сторінка під шторкою не прокручується
  return { close, panel };
}

/** Список дій. Повертає Promise зі значенням вибраного пункту або undefined. */
export function menuSheet({ title, items }) {
  return new Promise((resolve) => {
    const list = h('div', { class: 'menu' });
    const sheet = openSheet({ title, body: list, onClose: resolve });
    for (const item of items) {
      if (!item) continue;
      list.append(h('button', {
        class: 'menu-item' + (item.danger ? ' is-danger' : ''),
        type: 'button',
        onclick: () => sheet.close(item.value),
      }, item.label));
    }
    list.append(h('button', { class: 'menu-item is-muted', type: 'button', onclick: () => sheet.close() }, 'Скасувати'));
  });
}

/** Підтвердження дії. Повертає Promise<boolean>. */
export function confirmSheet({ title, text, okLabel = 'Так', danger = false }) {
  return new Promise((resolve) => {
    const body = h('div', null,
      text ? h('p', { class: 'sheet-text' }, text) : null,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn btn--soft', type: 'button', onclick: () => sheet.close(false) }, 'Скасувати'),
        h('button', { class: 'btn ' + (danger ? 'btn--danger-fill' : 'btn--primary'), type: 'button', onclick: () => sheet.close(true) }, okLabel),
      ),
    );
    const sheet = openSheet({ title, body, onClose: (r) => resolve(r === true) });
  });
}

/** Запит одного рядка тексту. Повертає Promise<string | null>. */
export function promptSheet({ title, value = '', placeholder = '', okLabel = 'Зберегти', maxLength = 40 }) {
  return new Promise((resolve) => {
    const input = h('input', {
      class: 'field', type: 'text', value, placeholder, maxLength,
      autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done',
    });
    const submit = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      sheet.close(v);
    };
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } },
      input,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn btn--soft', type: 'button', onclick: () => sheet.close(null) }, 'Скасувати'),
        h('button', { class: 'btn btn--primary', type: 'submit' }, okLabel),
      ),
    );
    const sheet = openSheet({ title, body: form, top: true, onClose: (r) => resolve(typeof r === 'string' ? r : null) });
    input.focus();
    if (value) input.select();
  });
}

// ---------- Сповіщення ----------

let toastEl = null;
let toastTimer = null;

export function toast(text, { action, onAction, duration = 2600 } = {}) {
  if (toastEl) toastEl.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, text));
  if (action) {
    el.append(h('button', {
      class: 'toast-action', type: 'button',
      onclick: () => { el.remove(); if (onAction) onAction(); },
    }, action));
  }
  document.body.append(el);
  toastEl = el;
  if (duration > 0) toastTimer = setTimeout(() => { el.remove(); if (toastEl === el) toastEl = null; }, duration);
}

/** Перемикач із кількох варіантів: options = [{ value, label }]. */
export function segmented(options, current, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'group' });
  const buttons = options.map((o) => {
    const b = h('button', {
      class: 'segmented-item' + (o.value === current ? ' is-active' : ''),
      type: 'button',
      'aria-pressed': String(o.value === current),
      onclick: () => {
        for (const x of buttons) { x.classList.remove('is-active'); x.setAttribute('aria-pressed', 'false'); }
        b.classList.add('is-active');
        b.setAttribute('aria-pressed', 'true');
        onChange(o.value);
      },
    }, o.label);
    return b;
  });
  wrap.append(...buttons);
  return wrap;
}
