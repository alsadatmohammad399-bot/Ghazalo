import type { ExtractedMenuItem } from '../types';
import { normalizeNumericText } from './productVariants';

const CUR = '(?:ج\\.?م?\\.?|جنيه|جنية|egp|le|l\\.e)';
const OFFER_HEAD = /^(?:[#*\-\s]*)(?:عروض|عرض|offers?|deals?)(?=\s|$|:)/i;

function cleanLine(raw: string): string {
  return normalizeNumericText(raw)
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/^[\s•·▪●■\-–—*#>]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function trailingPrice(line: string): { label: string; price: number } | null {
  const m = line.match(
    new RegExp(`^(.*?[^\\d\\s].*?)\\s*(?:بـ|ب|[-:–—=|]|\\()?\\s*(\\d+(?:\\.\\d+)?)\\s*${CUR}?\\s*\\)?$`, 'i')
  );
  if (!m) return null;
  const label = m[1].replace(/[-:–—=|(]+$/g, '').replace(/\s+بـ?$/, '').trim();
  const price = Number(m[2]);
  if (!label || !Number.isFinite(price)) return null;
  return { label, price };
}

export interface ParsedMenuText {
  items: ExtractedMenuItem[];
  categories: string[];
  skipped: string[];
}

/** Parses pasted menu text: category lines, "name - price" lines, offers. */
export function parseMenuText(text: string): ParsedMenuText {
  const items: ExtractedMenuItem[] = [];
  const skipped: string[] = [];
  const cats: string[] = [];
  let category = 'أصناف متنوعة';
  let inOffers = false;
  const lines = (text || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    // Category heading: ends with ":" or has no digits and is short, or marked with # / قسم
    const isMarked = /^\s*(?:#+|قسم\s*[:\-]?|category\s*[:\-]?)/i.test(rawLine);
    const hasDigit = /\d/.test(line);
    const endsColon = /[:：]$/.test(line);
    if (isMarked || endsColon || (!hasDigit && line.length <= 32 && !/\+/.test(line) && !/^عرض\s+\S+\s+\S+/.test(line))) {
      const name = line.replace(/^(?:قسم|category)\s*[:\-]?\s*/i, '').replace(/[:：]+$/, '').trim();
      if (name) {
        category = name;
        inOffers = OFFER_HEAD.test(name) && !/^عرض\s+\S+\s+\S/.test(name);
        if (!cats.includes(category)) cats.push(category);
        continue;
      }
    }

    const isOfferLine = inOffers || /^عرض(?=\s|$)/.test(line) || /\+/.test(line) && /(?:مجان|عرض)/.test(line);
    const tp = trailingPrice(line);

    if (isOfferLine) {
      // keep full text as the offer name; its price stays in the name and is read by the storefront
      const offerCat = inOffers ? category : 'العروض';
      if (!cats.includes(offerCat)) cats.push(offerCat);
      items.push({
        name: line,
        category: offerCat,
        price: 0,
        isOffer: true,
        offerLabel: 'عرض خاص',
        variants: [],
        sortOrder: items.length,
      });
      continue;
    }

    if (!tp) {
      skipped.push(line);
      continue;
    }
    if (!cats.includes(category)) cats.push(category);
    items.push({ name: tp.label, category, price: tp.price, variants: [], sortOrder: items.length });
  }
  const used = cats.filter((c) => items.some((i) => i.category === c));
  return { items, categories: used, skipped };
}
