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
  compressedBytes?: number;
  width?: number;
  height?: number;
  previewUrl?: string;
  isPdf?: boolean;
  isSheet?: boolean;
  status: 'pending' | 'scanning' | 'done' | 'error';
  errorMessage?: string;
  extractedCount?: number;
  payload: PreparedAiFilePayload;
}

const MAX_BASE64_CHARS = 420_000; // ~315 KB binary for ultra-fast mobile upload & Gemini Vision parsing
const MAX_PDF_BYTES = 3_100_000;

const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
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

function encodeCanvasToJpegBudget(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): { dataUrl: string; width: number; height: number } | null {
  const steps: Array<{ maxDim: number; quality: number }> = [
    { maxDim: 1120, quality: 0.74 },
    { maxDim: 980, quality: 0.65 },
    { maxDim: 860, quality: 0.58 },
  ];

  let lastResult: { dataUrl: string; width: number; height: number } | null = null;

  for (const step of steps) {
    const scale =
      srcWidth > step.maxDim || srcHeight > step.maxDim
        ? Math.min(step.maxDim / srcWidth, step.maxDim / srcHeight)
        : 1;
    const width = Math.max(1, Math.round(srcWidth * scale));
    const height = Math.max(1, Math.round(srcHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);

    const outUrl = canvas.toDataURL('image/jpeg', step.quality);
    lastResult = { dataUrl: outUrl, width, height };
    const commaIdx = outUrl.indexOf(',');
    const base64Len = commaIdx >= 0 ? outUrl.length - commaIdx - 1 : outUrl.length;
    if (base64Len <= MAX_BASE64_CHARS) {
      return lastResult;
    }
  }

  return lastResult;
}

async function compressImageFile(
  file: File
): Promise<{ dataUrl: string; mimeType: string; width?: number; height?: number }> {
  // 1. Decode via fast ObjectURL + Image element first (low memory overhead for high-MP camera photos)
  const objectUrl = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : '';
  try {
    if (objectUrl) {
      const fromObjectUrl = await new Promise<{
        dataUrl: string;
        mimeType: string;
        width: number;
        height: number;
      } | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const encoded = encodeCanvasToJpegBudget(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
          resolve(encoded ? { ...encoded, mimeType: 'image/jpeg' } : null);
        };
        img.onerror = () => resolve(null);
        img.src = objectUrl;
      });
      if (fromObjectUrl) return fromObjectUrl;
    }
  } finally {
    if (objectUrl && URL.revokeObjectURL) {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // 2. Fallback via createImageBitmap when supported (handles orientation/EXIF well)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const encoded = encodeCanvasToJpegBudget(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      if (encoded) return { ...encoded, mimeType: 'image/jpeg' };
    } catch {
      // ignore bitmap decode error and fall back below
    }
  }

  // 3. Last-resort direct FileReader fallback for smaller standard files
  const rawDataUrl = await readAsDataUrl(file);
  const fallbackMime = inferImageMime(file, rawDataUrl);
  const commaIdx = rawDataUrl.indexOf(',');
  const rawBase64Len = commaIdx >= 0 ? rawDataUrl.length - commaIdx - 1 : rawDataUrl.length;
  if (rawBase64Len > MAX_BASE64_CHARS * 2.2) {
    throw new Error(
      `صيغة الصورة ${file.name} غير مدعومة مباشرة وحجمها كبير. يرجى حفظها كصورة JPG أو PNG ثم إعادة الرفع.`
    );
  }
  return { dataUrl: rawDataUrl, mimeType: fallbackMime };
}

export function formatFileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(
        `حجم ملف PDF (${formatFileSizeLabel(file.size)}) أكبر من الحد المسموح (3 MB). يرجى ضغط الملف أو رفع صفحات المنيو كصور.`
      );
    }
    const dataUrl = await readAsDataUrl(file);
    const commaIdx = dataUrl.indexOf(',');
    const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    return {
      id,
      name: file.name,
      sizeBytes: file.size,
      compressedBytes: Math.round((base64Data.length * 3) / 4),
      isPdf: true,
      status: 'pending',
      payload: {
        fileName: file.name,
        mimeType: 'application/pdf',
        base64Data,
      },
    };
  }

  const { dataUrl, mimeType, width, height } = await compressImageFile(file);
  const commaIdx = dataUrl.indexOf(',');
  const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  if (!base64Data) {
    throw new Error(`الملف ${file.name} فارغ أو تالف`);
  }

  return {
    id,
    name: file.name,
    sizeBytes: file.size,
    compressedBytes: Math.round((base64Data.length * 3) / 4),
    width,
    height,
    previewUrl: dataUrl,
    status: 'pending',
    payload: {
      fileName: file.name,
      mimeType,
      base64Data,
    },
  };
}
