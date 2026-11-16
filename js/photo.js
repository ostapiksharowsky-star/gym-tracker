// Готує фото вправи: зменшує до квадратної мініатюри, щоб база лишалась маленькою.

const SIZE = 320;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не вдалося прочитати зображення'));
    img.src = url;
  });
}

/**
 * Повертає dataURL мініатюри. Фото обрізається по центру до квадрата,
 * а іконки з прозорістю (PNG, WebP) вписуються повністю і зберігають прозорість.
 */
export async function fileToThumb(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('Порожнє зображення');
    const keepAlpha = /png|webp|gif|svg/i.test(file.type || '');
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (keepAlpha) {
      const scale = Math.min(SIZE / w, SIZE / h);
      const dw = w * scale;
      const dh = h * scale;
      ctx.drawImage(img, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);
      return canvas.toDataURL('image/png');
    }
    const side = Math.min(w, h);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
