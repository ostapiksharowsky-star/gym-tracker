// Шторка створення та редагування вправи: фото, назва, день.

import { h, icon, openSheet, confirmSheet, toast } from '../ui.js';
import * as store from '../store.js';
import { fileToThumb } from '../photo.js';

/** Мініатюра вправи: фото або перша літера назви. */
export function thumb(ex, extraClass = '') {
  const cls = 'thumb' + (extraClass ? ' ' + extraClass : '');
  if (ex && ex.photo) return h('div', { class: cls }, h('img', { src: ex.photo, alt: '' }));
  const letter = ((ex && ex.name) || '').trim().charAt(0).toUpperCase() || '•';
  return h('div', { class: cls + ' thumb--letter' }, letter);
}

/**
 * exercise: наявна вправа (редагування) або null (нова в дні dayId).
 * onDone викликається після збереження чи видалення.
 */
export function openExerciseEditor({ exercise = null, dayId, onDone }) {
  const isNew = !exercise;
  let photo = exercise ? exercise.photo : null;
  let busy = false;

  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const preview = h('button', { class: 'photo-pick', type: 'button', 'aria-label': 'Вибрати фото', onclick: () => fileInput.click() });
  const removeBtn = h('button', { class: 'link-btn', type: 'button', onclick: () => { photo = null; drawPreview(); } }, 'Прибрати фото');

  function drawPreview() {
    preview.replaceChildren(photo ? h('img', { src: photo, alt: '' }) : icon('camera', 28));
    removeBtn.hidden = !photo;
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      photo = await fileToThumb(file);
      drawPreview();
    } catch {
      toast('Не вдалося обробити це фото');
    }
  });

  const nameInput = h('input', {
    class: 'field', type: 'text', value: exercise ? exercise.name : '', placeholder: 'Назва вправи', maxLength: 60,
    autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done', 'aria-label': 'Назва вправи',
  });

  const days = store.days();
  const daySelect = !isNew && days.length > 1
    ? h('select', { class: 'field', 'aria-label': 'День' },
        days.map((d) => h('option', { value: d.id, selected: d.id === exercise.dayId }, d.name)))
    : null;

  async function save() {
    if (busy) return;
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); toast('Введи назву вправи'); return; }
    busy = true;
    try {
      if (isNew) await store.addExercise({ dayId, name, photo });
      else await store.updateExercise(exercise.id, { name, photo, dayId: daySelect ? daySelect.value : exercise.dayId });
      sheet.close();
      onDone();
    } finally {
      busy = false;
    }
  }

  async function remove() {
    const ok = await confirmSheet({
      title: `Видалити «${exercise.name}»?`,
      text: 'Вправа зникне з дня. Її минулі записи залишаться в історії.',
      okLabel: 'Видалити',
      danger: true,
    });
    if (!ok) return;
    await store.removeExercise(exercise.id);
    sheet.close();
    onDone();
  }

  const form = h('form', { class: 'editor', onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div', { class: 'editor-photo' }, preview, h('div', { class: 'editor-photo-side' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => fileInput.click() }, 'Вибрати фото'),
      removeBtn,
    )),
    fileInput,
    nameInput,
    daySelect ? h('label', { class: 'field-label' }, 'День', daySelect) : null,
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn btn--soft', type: 'button', onclick: () => sheet.close() }, 'Скасувати'),
      h('button', { class: 'btn btn--primary', type: 'submit' }, isNew ? 'Додати' : 'Зберегти'),
    ),
    !isNew ? h('button', { class: 'btn btn--danger btn--block', type: 'button', onclick: remove }, 'Видалити вправу') : null,
  );

  drawPreview();
  const sheet = openSheet({ title: isNew ? 'Нова вправа' : 'Вправа', body: form, top: true });
  if (isNew) nameInput.focus();
}
