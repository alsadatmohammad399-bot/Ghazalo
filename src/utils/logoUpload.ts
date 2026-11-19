import { FIELD_LIMITS } from '../types';

/**
 * Compresses an uploaded restaurant logo image into a clean square thumbnail data URL
 * strictly bounded under FIELD_LIMITS.LOGO_URL_MAX for safe Firestore storage.
 */
export async function compressLogoFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة ملف اللوجو'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('ملف الصورة غير صالح'));
    el.src = dataUrl;
  });

  const size = 144;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl.slice(0, FIELD_LIMITS.LOGO_URL_MAX);

  // Fill soft white backing so transparent PNGs always stay sharp on any dark/photo surface
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  const scale = Math.min(size / img.width, size / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const offsetX = (size - drawW) / 2;
  const offsetY = (size - drawH) / 2;
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

  // Try crisp WebP first, fall back to JPEG if oversized
  let result = canvas.toDataURL('image/webp', 0.82);
  if (result.length > 18000 || !result.startsWith('data:image/webp')) {
    result = canvas.toDataURL('image/jpeg', 0.8);
  }
  if (result.length > 20000) {
    result = canvas.toDataURL('image/jpeg', 0.62);
  }
  if (result.length > FIELD_LIMITS.LOGO_URL_MAX) {
    throw new Error('حجم اللوجو كبير جداً، يرجى اختيار صورة أصغر.');
  }
  return result;
}
