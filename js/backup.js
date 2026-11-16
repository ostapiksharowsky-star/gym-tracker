// Резервна копія: усі дані одним JSON-файлом.

import * as store from './store.js';
import { toDateStr, validateBackup } from './logic.js';

/**
 * Зберігає копію у файл. На телефоні відкриває системне «Поділитись»
 * (звідти «Зберегти у Файли»), на комп'ютері завантажує файл.
 * Повертає true, якщо копію передано, і false, якщо користувач скасував.
 */
export async function exportBackup() {
  const json = JSON.stringify(store.exportData());
  const name = `zal-backup-${toDateStr(new Date())}.json`;
  const touch = (navigator.maxTouchPoints || 0) > 0;
  let shared = false;

  if (touch && typeof File === 'function' && navigator.canShare) {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        shared = true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false;
        // Інша помилка: пробуємо звичайне завантаження нижче.
      }
    }
  }

  if (!shared) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  await store.setSetting('lastBackup', new Date().toISOString());
  return true;
}

/** Читає та перевіряє файл копії. Повертає { ok, data } або { ok: false, error }. */
export async function readBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: 'Файл не вдалося прочитати: це не JSON.' };
  }
  const check = validateBackup(data);
  return check.ok ? { ok: true, data } : check;
}
