import * as XLSX from 'xlsx';

export interface PreparedAiFilePayload {
  fileName: string;
  mimeType?: string;
  base64Data?: string;
  textContent?: string;
}

export interface QueuedMenuFile {
  id: string;
  name: string;
  sizeBytes: number;
  previewUrl?: string;
  isPdf?: boolean;
  isSheet?: boolean;
  status: 'pending' | 'scanning' | 'done' | 'error';
  errorMessage?: string;
  extractedCount?: number;
  payload: PreparedAiFilePayload;
}

const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function inferImageMime(file: File, dataUrl: string): string {
  const prefixMatch = dataUrl.match(/^data:([^;]+);/i);
  const dataMime = prefixMatch ? prefixMatch[1].toLowerCase() : '';
  if (SUPPORTED_IMAGE_MIMES.has(dataMime)) {
    return dataMime === 'image/jpg' ? 'image/jpeg' : dataMime;
  }
  const fileMime = (file.type || '').toLowerCase();
  if (SUPPORTED_IMAGE_MIMES.has(fileMime)) {
    return fileMime === 'image/jpg' ? 'image/jpeg' : fileMime;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`تعذر قراءة الملف: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function compressImageFile(
  file: File,
  rawDataUrl: string,
  maxDim = 1400,
  quality = 0.78
): Promise<{ dataUrl: string; mimeType: string }> {
  const fallbackMime = inferImageMime(file, rawDataUrl);

  // Try Image element decode first
  const fromImgElement = await new Promise<{ dataUrl: string; mimeType: string } | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const targetScale =
        img.width > maxDim || img.height > maxDim
          ? Math.min(maxDim / img.width, maxDim / img.height)
          : 1;
      const width = Math.max(1, Math.round(img.width * targetScale));
      const height = Math.max(1, Math.round(img.height * targetScale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const outUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl: outUrl, mimeType: 'image/jpeg' });
    };
    img.onerror = () => resolve(null);
    img.src = rawDataUrl;
  });

  if (fromImgElement) return fromImgElement;

  // Fallback via createImageBitmap when supported
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const targetScale =
        bitmap.width > maxDim || bitmap.height > maxDim
          ? Math.min(maxDim / bitmap.width, maxDim / bitmap.height)
          : 1;
      const width = Math.max(1, Math.round(bitmap.width * targetScale));
      const height = Math.max(1, Math.round(bitmap.height * targetScale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        const outUrl = canvas.toDataURL('image/jpeg', quality);
        bitmap.close();
        return { dataUrl: outUrl, mimeType: 'image/jpeg' };
      }
      bitmap.close();
    } catch {
      // ignore bitmap decode error and fall back below
    }
  }

  return { dataUrl: rawDataUrl, mimeType: fallbackMime };
}

export async function prepareMenuFileForAi(file: File): Promise<QueuedMenuFile> {
  const lowerName = file.name.toLowerCase();
  const id = `menu-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array' });
    const allSheetsText = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return `--- ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}`;
    }).join('\n');

    return {
      id,
      name: file.name,
      sizeBytes: file.size,
      isSheet: true,
      status: 'pending',
      payload: {
        fileName: file.name,
        textContent: allSheetsText,
      },
    };
  }

  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    const dataUrl = await readAsDataUrl(file);
    const commaIdx = dataUrl.indexOf(',');
    const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    return {
      id,
      name: file.name,
      sizeBytes: file.size,
      isPdf: true,
      status: 'pending',
      payload: {
        fileName: file.name,
        mimeType: 'application/pdf',
        base64Data,
      },
    };
  }

  const rawDataUrl = await readAsDataUrl(file);
  const { dataUrl, mimeType } = await compressImageFile(file, rawDataUrl);
  const commaIdx = dataUrl.indexOf(',');
  const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  if (!base64Data) {
    throw new Error(`الملف ${file.name} فارغ أو تالف`);
  }

  return {
    id,
    name: file.name,
    sizeBytes: file.size,
    previewUrl: dataUrl,
    status: 'pending',
    payload: {
      fileName: file.name,
      mimeType,
      base64Data,
    },
  };
}
