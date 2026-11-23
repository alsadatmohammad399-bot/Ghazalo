import { normalizeStoreSlug, type Product, type Shop } from '../types';

export function getStoreSlug(shopOrSlug: string | Partial<Shop>): string {
  if (typeof shopOrSlug === 'string') {
    return (
      normalizeStoreSlug(shopOrSlug) ||
      shopOrSlug.trim().replace(/^\/+|\/+$/g, '') ||
      'mtgry-algdyd'
    );
  }
  const candidates = [
    shopOrSlug.storeSlug,
    shopOrSlug.nameEn,
    shopOrSlug.nameAr,
    shopOrSlug.id,
  ];
  for (const val of candidates) {
    if (val) {
      const norm = normalizeStoreSlug(val);
      if (norm) return norm;
    }
  }
  return shopOrSlug.id || 'mtgry-algdyd';
}

export function getAbsoluteMenuUrl(
  shopOrSlug: string | Partial<Shop>,
  tableLabel?: string
): string {
  const slug = getStoreSlug(shopOrSlug);
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  const baseUrl = `${origin}/menu/${slug}`;
  if (tableLabel && tableLabel.trim()) {
    return `${baseUrl}?table=${encodeURIComponent(tableLabel.trim())}`;
  }
  return baseUrl;
}

export function getWhatsAppShareUrl(menuUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(menuUrl)}`;
}

export async function copyMenuLink(menuUrl: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(menuUrl);
      return true;
    } catch {
      // fall through to textarea execCommand fallback
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = menuUrl;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, menuUrl.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function syncPublicStoreSnapshot(
  shop: Shop,
  products?: Product[]
): Promise<boolean> {
  try {
    const res = await fetch('/api/public-stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop,
        products,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPublicStoreSnapshot(
  slug: string
): Promise<{ shop: Shop; products: Product[]; updatedAt?: number } | null> {
  try {
    const res = await fetch(`/api/public-stores/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      found?: boolean;
      shop?: Shop;
      products?: Product[];
      updatedAt?: number;
    };
    if (data.ok && data.found && data.shop) {
      return {
        shop: data.shop,
        products: Array.isArray(data.products) ? data.products : [],
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}
