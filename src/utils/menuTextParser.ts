import type { ExtractedMenuItem } from '../types';
import { normalizeNumericText } from './productVariants';

const CUR = '(?:ج\\.?م?\\.?|جنيه|جنية|egp|le|l\\.e)';
const OFFER_HEAD = /^(?:[#*\-\s]*)(?:عروض|عرض|offers?|deals?)(?=\s|$|:)/i;

const FRACTIONS: Record<string, string> = { '½': 'نص ', '¼': 'ربع ', '¾': 'تلات تربع ', '⅓': 'تلت ' };

/** Drop emoji/decorations, expand ½ ¼, split glued numbers ("عيش900" -> "عيش 900"). */
function prepLine(raw: string): string {
  let t = normalizeNumericText(raw)
    .replace(/[\u200e\u200f\u202a-\u202e\ufe0f\u20e3]/g, '')
    .replace(/[½¼¾⅓]/g, (c) => FRACTIONS[c])
    .replace(/&/g, '+');
  // keep letters, marks, digits, space and a few punctuation marks only
  t = t.replace(/[^\p{L}\p{M}\p{N}\s+:\-–—=|().,،/×%]/gu, ' ');
  t = t.replace(/(\p{L})(\d)/gu, '$1 $2').replace(/(\d)(\p{L})/gu, '$1 $2');
  return t.replace(/\s+/g, ' ').trim();
}

function cleanLine(raw: string): string {
  return prepLine(raw).replace(/^[\s\-–—*#>•·]+/, '').trim();
}

const OLD_RE = /\s*(?:بدل(?:ا|اً)?(?:\s+من)?|بدلا\s+من|بدلاً\s+من)\s*(\d+(?:\.\d+)?)\s*$/;
const TRAY_RE = /^(?:صنية|صينية|بوكس|باكج|وجبة\s+عائلية)(?=\s|$)/;

function isBlockHeading(line: string): boolean {
  if (/[:：]$/.test(line)) return true;
  return TRAY_RE.test(line) && !/\d/.test(line);
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

function stripNumPrefix(t: string): string {
  return t.replace(/^\d+\s*[.)\-]?\s+(?=\D)/, '').replace(/[:：]+$/, '').trim();
}

interface Block { title: string; lines: string[]; colon: boolean }

function priceOfBlock(lines: string[]): { price: number; originalPrice?: number; clean: string[] } {
  let price = 0;
  let originalPrice: number | undefined;
  const clean: string[] = [];
  for (const l of lines) {
    let line = l;
    const pair = line.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:ج\.?م?\.?|جنيه)?\s*(?:بدل(?:ا|اً)?|بدلا|بدلاً)(?:\s+من)?\s*(\d+(?:\.\d+)?)\s*(?:ج\.?م?\.?|جنيه)?\s*$/);
    if (pair) {
      price = Number(pair[1]);
      originalPrice = Number(pair[2]);
      line = line.slice(0, pair.index).trim();
      if (line) clean.push(line);
      continue;
    }
    if (/^\d+(?:\.\d+)?\s*(?:ج\.?م?\.?|جنيه)?$/.test(line)) {
      if (!price) price = Number(line.replace(/\D*$/, '').replace(/[^\d.]/g, ''));
      continue;
    }
    // number at end of an item line, or in the middle after words ("مطبوخ 230 بطريقة ...")
    const m = line.match(/^(.*\D)\s+(\d{2,6}(?:\.\d+)?)\s*(?:ج\.?م?\.?|جنيه)?(?:\s+(.*))?$/);
    if (m && !price && Number(m[2]) >= 20 && !/\+\s*$/.test(m[1])) {
      price = Number(m[2]);
      line = [m[1], m[3]].filter(Boolean).join(' ').trim();
    }
    if (line) clean.push(line);
  }
  return { price, originalPrice, clean };
}

function looksLikeOfferBlock(b: Block): boolean {
  if (b.lines.length > 0 && b.lines.every((l) => /^عرض(?=\s)/.test(l))) return false;
  if (TRAY_RE.test(b.title) && b.lines.length > 0) return true;
  if (b.lines.some((l) => OLD_RE.test(l) || /بدل(?:ا|اً)?\s/.test(l))) return true;
  if (b.lines.some((l) => /[:\-–—=]\s*\d+(?:\.\d+)?\s*(?:ج\.?م?\.?|جنيه)?$/.test(l))) return false;
  const priced = b.lines.filter((l) => /^(.*\D)\s+\d{2,6}\s*(?:ج\.?م?\.?|جنيه)?$/.test(l) || /\sبـ?\s*\d+\s*(?:ج\.?م?\.?|جنيه)?$/.test(l));
  const bodyLines = b.lines.filter((l) => !/^\d+(?:\.\d+)?$/.test(l));
  return bodyLines.length >= 2 && priced.length <= 1;
}

/** Parses pasted menu text: category lines, "name - price" lines, offers and tier/tray blocks. */
export function parseMenuText(text: string): ParsedMenuText {
  const items: ExtractedMenuItem[] = [];
  const skipped: string[] = [];
  const cats: string[] = [];
  const addCat = (c: string) => { if (!cats.includes(c)) cats.push(c); };
  let category = 'أصناف متنوعة';
  let inOffers = false;

  const flushBlock = (b: Block | null) => {
    if (!b) return;
    if (looksLikeOfferBlock(b)) {
      const { price, originalPrice, clean } = priceOfBlock(b.lines);
      const name = stripNumPrefix(b.title);
      addCat('العروض');
      items.push({
        name,
        category: 'العروض',
        price,
        description: clean.map((c) => c.replace(/^\+\s*/, '')).join('\n'),
        isOffer: true,
        offerLabel: 'عرض خاص',
        ...(originalPrice && originalPrice > price ? { originalPrice } : {}),
        variants: [],
        sortOrder: items.length,
      });
      return;
    }
    category = stripNumPrefix(b.title) || category;
    inOffers = OFFER_HEAD.test(category) && !/^عرض\s+\S+\s+\S/.test(category);
    addCat(category);
    for (const l of b.lines) parseItemLine(l);
  };

  const parseItemLine = (line: string) => {
    const isOfferLine = inOffers || /^عرض(?=\s|$)/.test(line) || (/\+/.test(line) && /(?:مجان|عرض)/.test(line));
    const tp = trailingPrice(line);
    if (isOfferLine) {
      const offerCat = inOffers ? category : 'العروض';
      addCat(offerCat);
      items.push({ name: line, category: offerCat, price: 0, isOffer: true, offerLabel: 'عرض خاص', variants: [], sortOrder: items.length });
      return;
    }
    if (!tp) { skipped.push(line); return; }
    addCat(category);
    items.push({ name: tp.label, category, price: tp.price, variants: [], sortOrder: items.length });
  };

  let block: Block | null = null;
  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const isMarked = /^\s*(?:#+|قسم\s*[:\-]?|category\s*[:\-]?)/i.test(rawLine);
    const heading = isBlockHeading(line) || isMarked;
    if (heading) {
      flushBlock(block);
      block = { title: line.replace(/^(?:قسم|category)\s*[:\-]?\s*/i, ''), lines: [], colon: /[:：]$/.test(line) };
      continue;
    }
    if (block) {
      const pricedItems = block.lines.filter((l) => /\d/.test(l) && (trailingPrice(l) || /^عرض(?=\s)/.test(l))).length;
      const plain = !/\d/.test(line) && line.length <= 32 && !/\+/.test(line) && !/^عرض\s+\S+\s+\S/.test(line);
      if (pricedItems >= 1 && plain && block.lines.every((l) => /^عرض(?=\s)/.test(l) || (/\d/.test(l) && trailingPrice(l)))) {
        flushBlock(block);
        block = { title: line, lines: [], colon: false };
        continue;
      }
      block.lines.push(line);
      continue;
    }
    // outside any block: old single-line behaviour (plain category line or item line)
    const hasDigit = /\d/.test(line);
    if (!hasDigit && line.length <= 32 && !/\+/.test(line) && !/^عرض\s+\S+\s+\S/.test(line)) {
      category = line;
      inOffers = OFFER_HEAD.test(line);
      addCat(category);
      continue;
    }
    parseItemLine(line);
  }
  flushBlock(block);
  const used = cats.filter((c) => items.some((i) => i.category === c));
  return { items, categories: used, skipped };
}
