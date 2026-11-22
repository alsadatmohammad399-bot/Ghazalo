import { normalizeStoreSlug, type Product, type Shop } from '../types';
import { resolveDishPhotoClient } from '../utils/dishPhotoResolver';
import { DEMO_STORES as RAW_DEMO_STORES } from './demoStores.js';

export interface DemoStoreItemSeed {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
}

export interface DemoStoreEntry {
  slug: string;
  name: string;
  nameEn: string;
  category: string;
  logoEmoji: string;
  phone: string;
  city: string;
  address: string;
  bio: string;
  whatsapp: string;
  isDemo: boolean;
  items: DemoStoreItemSeed[];
}

export const DEMO_STORES: DemoStoreEntry[] = RAW_DEMO_STORES.map((entry) => ({
  slug: entry.slug,
  name: entry.name,
  nameEn: entry.nameEn || entry.name,
  category: entry.category || 'عام',
  logoEmoji: entry.logoEmoji || '🍽️',
  phone: entry.phone || '01015861991',
  city: entry.city || 'القاهرة',
  address: entry.address || '',
  bio: entry.bio || 'أشهى المأكولات والمشروبات الطازجة يومياً.',
  whatsapp: entry.phone ? `2${entry.phone.replace(/^0/, '')}` : '201015861991',
  isDemo: entry.isDemo !== false,
  items: entry.items.map((it) => ({
    id: it.id,
    name: it.name,
    category: it.category || entry.category || 'أطباق رئيسية',
    price: Number(it.price) || 0,
    description: it.description || '',
  })),
}));

export const DEFAULT_DEMO_MENU_ITEMS: DemoStoreItemSeed[] =
  DEMO_STORES.find((s) => s.slug === 'mtgry-algdyd')?.items || DEMO_STORES[0].items;

const SLUG_ALIASES: Record<string, string> = {
  'kebda-masr': 'kebda-msr',
  'mtamy-algdyd': 'mtgry-algdyd',
};

export function mapSeedItemsToProducts(
  shopId: string,
  items: DemoStoreItemSeed[]
): Product[] {
  return items.map((item, idx) => ({
    id: `${shopId}-${item.id}-${idx + 1}`,
    shopId,
    shopOwnerId: `owner-${shopId}`,
    name: item.name,
    category: item.category,
    price: item.price,
    description: item.description || '',
    imageUrl: resolveDishPhotoClient(item.name, item.category),
    barcode: '',
    available: true,
    variants: [],
    sortOrder: idx,
    isOffer: false,
  }));
}

export function buildShopFromDemoEntry(
  entry: DemoStoreEntry,
  overrideSlug?: string
): { shop: Shop; products: Product[] } {
  const slug = overrideSlug || entry.slug;
  const now = Date.now();
  const shop: Shop = {
    id: slug,
    ownerId: `demo-owner-${slug}`,
    storeSlug: slug,
    nameAr: entry.name,
    nameEn: entry.nameEn,
    country: 'مصر',
    menuLanguage: 'العربية',
    branchCount: 'فرع واحد',
    city: entry.city,
    address: entry.address,
    workFrom: '10ص',
    workTo: '2ص',
    workDays: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
    themeColor: 'برتقالي',
    themeMode: 'light',
    menuTemplate: 'classic',
    acceptOrders: true,
    paymentMethods: ['نقداً', 'فودافون كاش', 'انستاباي'],
    bio: entry.bio,
    whatsapp: entry.whatsapp,
    isOpen: true,
    subscriptionStatus: 'trial',
    trialEndsAt: now + 7 * 24 * 60 * 60 * 1000,
    deliveryFee: 20,
    freeDelivery: false,
    freeDeliveryMinOrder: 200,
    deliveryTime: '25-40 دقيقة',
    enableServiceFee: false,
    serviceFeePct: 0,
    enableVat: false,
    vatPct: 0,
    enablePackagingFee: false,
    packagingFee: 0,
  };
  return {
    shop,
    products: mapSeedItemsToProducts(slug, entry.items),
  };
}

export function findDemoStoreBySlug(
  rawSlug: string
): { shop: Shop; products: Product[] } | null {
  const raw = (rawSlug || '').trim().toLowerCase();
  const norm = normalizeStoreSlug(rawSlug);
  const aliased = SLUG_ALIASES[raw] || (norm ? SLUG_ALIASES[norm] : undefined);

  const match = DEMO_STORES.find(
    (s) =>
      s.slug.toLowerCase() === raw ||
      (norm && s.slug.toLowerCase() === norm) ||
      (aliased && s.slug.toLowerCase() === aliased)
  );
  if (!match) return null;
  return buildShopFromDemoEntry(match, match.slug);
}

export function readableNameFromSlug(rawSlug: string): string {
  let decoded = (rawSlug || '').trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // keep raw
  }
  const clean = decoded.replace(/^\/?menu\//i, '').trim();
  if (!clean) return 'مطعمي الجديد';
  return clean;
}

export function buildFallbackStoreForSlug(rawSlug: string): {
  shop: Shop;
  products: Product[];
} {
  const cleanSlug =
    normalizeStoreSlug(rawSlug) || rawSlug.trim().replace(/^\/+|\/+$/g, '') || 'mtgry-algdyd';
  const displayTitle = readableNameFromSlug(rawSlug);
  const now = Date.now();
  const shop: Shop = {
    id: cleanSlug,
    ownerId: `owner-${cleanSlug}`,
    storeSlug: cleanSlug,
    nameAr: displayTitle,
    nameEn: displayTitle,
    country: 'مصر',
    menuLanguage: 'العربية',
    branchCount: 'فرع واحد',
    city: 'القاهرة',
    address: '',
    workFrom: '10ص',
    workTo: '2ص',
    workDays: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
    themeColor: 'برتقالي',
    themeMode: 'light',
    menuTemplate: 'classic',
    acceptOrders: true,
    paymentMethods: ['نقداً', 'فودافون كاش', 'انستاباي'],
    bio: 'منيو رقمي تفاعلي عبر غزالو — اطلب مباشرة بسهولة.',
    whatsapp: '201015861991',
    isOpen: true,
    subscriptionStatus: 'trial',
    trialEndsAt: now + 7 * 24 * 60 * 60 * 1000,
    deliveryFee: 20,
    freeDelivery: false,
    freeDeliveryMinOrder: 200,
    deliveryTime: '25-40 دقيقة',
    enableServiceFee: false,
    serviceFeePct: 0,
    enableVat: false,
    vatPct: 0,
    enablePackagingFee: false,
    packagingFee: 0,
  };
  return {
    shop,
    products: mapSeedItemsToProducts(cleanSlug, DEFAULT_DEMO_MENU_ITEMS),
  };
}
