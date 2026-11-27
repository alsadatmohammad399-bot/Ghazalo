import type { Product } from '../types';
import { normalizeNumericText } from './productVariants';
import { resolveDishPhotoClient } from './dishPhotoResolver';

export interface OfferItem {
  qty: number;
  label: string;
  unitPrice?: number;
}

export type EnrichedProduct = Product & { offerItems?: OfferItem[] };

const norm = (s: string) =>
  normalizeNumericText(s || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ٰ]/g, '')
    .replace(/\bال/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const PRICE_RE = /\s*بـ?\s*(\d+(?:\.\d+)?)\s*(?:ج\.?م?\.?|جنيه|جنية)?\s*$/;

function splitPrices(name: string): { body: string; prices: { label: string; price: number }[] } {
  const clean = normalizeNumericText(name).replace(/\s+/g, ' ').trim();
  const parts = clean.split(/\s+أو\s+/);
  const prices: { label: string; price: number }[] = [];
  const bodies: string[] = [];
  for (const part of parts) {
    const m = part.match(PRICE_RE);
    if (m) {
      const label = part.slice(0, m.index).trim();
      prices.push({ label, price: Number(m[1]) });
      bodies.push(label);
    } else {
      bodies.push(part);
    }
  }
  return { body: bodies[0] || clean, prices };
}

function stripOfferWord(body: string): string {
  const m = body.match(/^عرض\s+(\S+)\s+(.+)$/);
  if (m && (/[+\d]/.test(m[2]) || m[2].split(' ').length >= 2)) return m[2];
  return body.replace(/^عرض\s+/, '');
}

export function enrichOfferProducts<T extends Product>(products: T[]): (T & { offerItems?: OfferItem[] })[] {
  const menu = products.filter((p) => !p.isOffer && Number(p.price) > 0);
  const menuByName = new Map<string, T>();
  for (const p of menu) {
    const k = norm(p.name);
    if (!menuByName.has(k)) menuByName.set(k, p);
  }
  return products.map((p) => {
    if (!p.isOffer || Number(p.price) > 0) return p;
    const { body, prices } = splitPrices(p.name);
    const itemsText = stripOfferWord(body);
    const items: OfferItem[] = itemsText
      .split(/\s*\+\s*/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const qm = t.match(/^(\d+)\s+(.+)$/);
        const qty = qm ? Number(qm[1]) : 1;
        const label = qm ? qm[2] : t;
        const hit = menuByName.get(norm(label));
        return { qty, label, unitPrice: hit ? Number(hit.price) : undefined };
      });
    const out: any = { ...p, offerItems: items };
    if (prices.length === 1) {
      out.price = prices[0].price;
    } else if (prices.length > 1) {
      out.price = prices[0].price;
      out.variants = prices.map((x) => `${stripOfferWord(x.label)} - ${x.price}`);
      out.offerItems = undefined;
    }
    const auto = !p.imageUrl || String(p.imageUrl).startsWith('/src/assets/images/dish_');
    if (auto && items.length > 0) {
      const hit = menuByName.get(norm(items[0].label));
      if (hit) out.imageUrl = hit.imageUrl || resolveDishPhotoClient(hit.name, hit.category);
    }
    return out;
  });
}
