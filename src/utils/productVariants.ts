import type { Product } from '../types';

export interface ParsedProductOption {
  raw: string;
  label: string;
  price: number;
  hasExplicitPrice: boolean;
}

const ARABIC_DIGIT_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export function normalizeNumericText(input: string): string {
  return (input || '').replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_DIGIT_MAP[ch] ?? ch);
}

const CURRENCY_WORDS = '(?:ج\\.?م\\.?|جنيه|ريال|درهم|د\\.ك|ر\\.ق|د\\.ب|egp|sar|aed|kwd|qar)';

export function parseProductVariant(rawVariant: string, fallbackPrice: number): ParsedProductOption {
  const raw = (rawVariant || '').trim();
  if (!raw) {
    return {
      raw: '',
      label: '',
      price: Number(fallbackPrice) || 0,
      hasExplicitPrice: false,
    };
  }

  const normalized = normalizeNumericText(raw).replace(/\s+/g, ' ').trim();

  // Pattern 1: "label - 1000 ج.م" | "label: 1000" | "label بـ 1000" | "label (1000)" | "label = 1000"
  const sepPattern = new RegExp(
    `^(.+?)\\s*(?:[-:–—|=]|بـ\\s*|\\()\\s*([0-9]+(?:\\.[0-9]+)?)\\s*${CURRENCY_WORDS}?\\s*\\)?$`,
    'i'
  );
  const sepMatch = normalized.match(sepPattern);
  if (sepMatch) {
    const label = sepMatch[1].replace(/[-:–—|=(]+$/g, '').trim();
    const price = Number(sepMatch[2]);
    if (label && Number.isFinite(price) && price >= 0) {
      return { raw, label, price, hasExplicitPrice: true };
    }
  }

  // Pattern 2: "label 1000 ج.م" (price with explicit currency word at the end)
  const currencyEndPattern = new RegExp(
    `^(.+?)\\s+([0-9]+(?:\\.[0-9]+)?)\\s*${CURRENCY_WORDS}$`,
    'i'
  );
  const currMatch = normalized.match(currencyEndPattern);
  if (currMatch) {
    const label = currMatch[1].trim();
    const price = Number(currMatch[2]);
    if (label && Number.isFinite(price) && price >= 0) {
      return { raw, label, price, hasExplicitPrice: true };
    }
  }

  // Pattern 3: "2 فرخة 550" (ends with trailing number >= 1 after non-empty Arabic/English word)
  const spaceNumMatch = normalized.match(/^(.+?[^\d\s].*?)\s+([0-9]+(?:\.[0-9]+)?)$/);
  if (spaceNumMatch) {
    const label = spaceNumMatch[1].trim();
    const price = Number(spaceNumMatch[2]);
    if (label && Number.isFinite(price) && price > 0) {
      return { raw, label, price, hasExplicitPrice: true };
    }
  }

  return {
    raw,
    label: raw,
    price: Number(fallbackPrice) || 0,
    hasExplicitPrice: false,
  };
}

export function getProductOptions(
  product: Pick<Product, 'price' | 'variants'>
): ParsedProductOption[] {
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const results: ParsedProductOption[] = [];

  for (const v of product.variants) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const parsed = parseProductVariant(v, product.price);
    if (!parsed.label) continue;
    const key = parsed.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(parsed);
  }
  return results;
}

export function parseVariantsInput(text: string): string[] {
  return (text || '')
    .split(/[\n،,]+/)
    .map((s) => normalizeNumericText(s).trim())
    .filter((s) => s.length > 0)
    .slice(0, 20);
}
