import { normalizeStoreSlug, type Product, type Shop } from '../types';
import { resolveDishPhotoClient } from '../utils/dishPhotoResolver';

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
  city: string;
  address: string;
  bio: string;
  whatsapp: string;
  items: DemoStoreItemSeed[];
}

export const DEFAULT_DEMO_MENU_ITEMS: DemoStoreItemSeed[] = [
  {
    id: 'demo-item-kebda',
    name: 'كبدة',
    category: 'ساندوتشات وأطباق ساخنة',
    price: 60,
    description: 'كبدة إسكندراني طازجة بالثوم والفلفل والخلطة الخاصة',
  },
  {
    id: 'demo-item-sogoq',
    name: 'سجق',
    category: 'ساندوتشات وأطباق ساخنة',
    price: 70,
    description: 'سجق بلدي متبل مشوي على الجريل',
  },
  {
    id: 'demo-item-koshary',
    name: 'كشري',
    category: 'أطباق رئيسية',
    price: 45,
    description: 'كشري مصري أصلي بالصلصة والدقة والشطة',
  },
  {
    id: 'demo-item-grilled-chicken',
    name: 'فراخ مشوية',
    category: 'مشويات',
    price: 120,
    description: 'فراخ مشوية على الفحم مع أرز وسلطات',
  },
];

export const DEMO_STORES: DemoStoreEntry[] = [
  {
    slug: 'mtgry-algdyd',
    name: 'مطعمي الجديد',
    nameEn: 'My New Restaurant',
    city: 'القاهرة',
    address: 'وسط البلد - القاهرة',
    bio: 'أشهى المأكولات والمشويات المصرية الطازجة يومياً.',
    whatsapp: '201015861991',
    items: DEFAULT_DEMO_MENU_ITEMS,
  },
  {
    slug: 'mtamy-algdyd',
    name: 'مطعمي الجديد',
    nameEn: 'My New Restaurant',
    city: 'القاهرة',
    address: 'وسط البلد - القاهرة',
    bio: 'أشهى المأكولات والمشويات المصرية الطازجة يومياً.',
    whatsapp: '201015861991',
    items: DEFAULT_DEMO_MENU_ITEMS,
  },
  {
    slug: 'kebda-masr',
    name: 'كبدة مصر',
    nameEn: 'Kebda Masr',
    city: 'القاهرة',
    address: 'وسط البلد - شارع 26 يوليو',
    bio: 'أشهر ساندوتشات وأطباق الكبدة والسجق والمشويات في مصر.',
    whatsapp: '201015861991',
    items: DEFAULT_DEMO_MENU_ITEMS,
  },
  {
    slug: 'koshary-corner',
    name: 'ركن الكشري',
    nameEn: 'Koshary Corner',
    city: 'القاهرة',
    address: 'مدينة نصر - شارع عباس العقاد',
    bio: 'كشري مصري أصلي وطواجن ومشويات طازجة.',
    whatsapp: '201015861991',
    items: DEFAULT_DEMO_MENU_ITEMS,
  },
];

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
    ownerId: `owner-${slug}`,
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
  const match = DEMO_STORES.find(
    (s) => s.slug.toLowerCase() === raw || (norm && s.slug.toLowerCase() === norm)
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
  if (/^[a-z0-9-_]+$/i.test(clean)) {
    return clean;
  }
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
