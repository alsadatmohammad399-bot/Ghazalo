import { normalizeStoreSlug, type DemoRestaurantRecord, type PlatformSettings, type Product, type Shop, type SubscriptionStatus } from '../types';
import { DEMO_PROJECTS } from '../data/demoProjects';

export const LS_KEYS = {
  RESTAURANTS: 'restaurants',
  TOKEN: 'token',
  LAST_STORE: 'lastStore',
  ADMIN_TOKEN: 'adminToken',
  PLATFORM_SETTINGS: 'ghazalo_platform_settings',
} as const;

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getPlatformSettingsLocal(): PlatformSettings {
  try {
    const parsed = safeJsonParse<PlatformSettings | null>(
      localStorage.getItem(LS_KEYS.PLATFORM_SETTINGS),
      null
    );
    return {
      forceZeroFeesGlobally: Boolean(parsed?.forceZeroFeesGlobally),
      updatedAt: parsed?.updatedAt,
    };
  } catch {
    return { forceZeroFeesGlobally: false };
  }
}

export function savePlatformSettingsLocal(settings: PlatformSettings): void {
  try {
    localStorage.setItem(LS_KEYS.PLATFORM_SETTINGS, JSON.stringify(settings));
  } catch {
    // ignore storage quota
  }
}

export function deriveShopSlug(shop: Partial<Shop>): string {
  if (shop.storeSlug && normalizeStoreSlug(shop.storeSlug)) {
    return normalizeStoreSlug(shop.storeSlug);
  }
  if (shop.nameEn && normalizeStoreSlug(shop.nameEn)) {
    return normalizeStoreSlug(shop.nameEn);
  }
  if (shop.id && normalizeStoreSlug(shop.id)) {
    return normalizeStoreSlug(shop.id);
  }
  return `store-${Date.now().toString().slice(-6)}`;
}

export function shopToDemoRecord(
  shop: Shop,
  overrides?: Partial<DemoRestaurantRecord>,
  products?: Product[]
): DemoRestaurantRecord {
  const now = Date.now();
  const storeSlug = deriveShopSlug(shop);
  const trialEnds = shop.trialEndsAt || now + 7 * 24 * 60 * 60 * 1000;
  const subEnds = shop.subscriptionExpiresAt || trialEnds;
  return {
    id: shop.id,
    shopId: shop.id,
    storeSlug,
    nameAr: shop.nameAr,
    email: overrides?.email || '',
    phone: overrides?.phone || shop.whatsapp || '',
    password: overrides?.password,
    resetCode: overrides?.resetCode,
    resetCodeExpiresAt: overrides?.resetCodeExpiresAt,
    status: (shop.subscriptionStatus || 'trial') as SubscriptionStatus,
    trialEndDate: trialEnds,
    subscriptionEndDate: subEnds,
    deliveryFee: Number(shop.deliveryFee ?? 0),
    freeDelivery: Boolean(shop.freeDelivery),
    freeDeliveryMinOrder: Number(shop.freeDeliveryMinOrder ?? 0),
    deliveryTime: shop.deliveryTime || '30-45 دقيقة',
    enableServiceFee: Boolean(shop.enableServiceFee),
    serviceFeePct: Number(shop.serviceFeePct ?? 0),
    enableVat: Boolean(shop.enableVat),
    vatPct: Number(shop.vatPct ?? 0),
    enablePackagingFee: Boolean(shop.enablePackagingFee),
    packagingFee: Number(shop.packagingFee ?? 0),
    createdAt: now,
    shop: {
      ...shop,
      storeSlug,
      deliveryFee: Number(shop.deliveryFee ?? 0),
      freeDelivery: Boolean(shop.freeDelivery),
      freeDeliveryMinOrder: Number(shop.freeDeliveryMinOrder ?? 0),
      deliveryTime: shop.deliveryTime || '30-45 دقيقة',
      enableServiceFee: Boolean(shop.enableServiceFee),
      serviceFeePct: Number(shop.serviceFeePct ?? 0),
      enableVat: Boolean(shop.enableVat),
      vatPct: Number(shop.vatPct ?? 0),
      enablePackagingFee: Boolean(shop.enablePackagingFee),
      packagingFee: Number(shop.packagingFee ?? 0),
    },
    products,
  };
}

function getDefaultDemoSeed(): DemoRestaurantRecord[] {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const firstDemo = DEMO_PROJECTS[0];
  const kosharyShop: Shop = {
    ...(firstDemo?.shop || {
      id: 'koshary-corner',
      ownerId: 'demo-owner-1',
      nameAr: 'ركن الكشري',
      nameEn: 'Koshary Corner',
      country: 'مصر',
      city: 'القاهرة',
      address: 'مدينة نصر - شارع عباس العقاد',
      acceptOrders: true,
      isOpen: true,
      subscriptionStatus: 'trial',
    }),
    id: 'koshary-corner',
    storeSlug: 'koshary-corner',
    nameAr: 'ركن الكشري - Koshary Corner',
    nameEn: 'Koshary Corner',
    whatsapp: '01015861991',
    subscriptionStatus: 'trial',
    trialEndsAt: now + sevenDays,
    deliveryFee: 25,
    freeDelivery: false,
    freeDeliveryMinOrder: 250,
    deliveryTime: '30-45 دقيقة',
    enableServiceFee: false,
    serviceFeePct: 0,
    enableVat: false,
    vatPct: 0,
    enablePackagingFee: false,
    packagingFee: 0,
  };
  return [
    shopToDemoRecord(
      kosharyShop,
      {
        email: 'koshary@ghazalo.com',
        phone: '01015861991',
        password: '123456',
      },
      firstDemo?.products
    ),
  ];
}

export function getLocalRestaurants(): DemoRestaurantRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.RESTAURANTS);
    const list = safeJsonParse<DemoRestaurantRecord[]>(raw, []);
    if (list.length > 0) return list;
    const seed = getDefaultDemoSeed();
    localStorage.setItem(LS_KEYS.RESTAURANTS, JSON.stringify(seed));
    return seed;
  } catch {
    return getDefaultDemoSeed();
  }
}

export function saveLocalRestaurants(list: DemoRestaurantRecord[]): void {
  try {
    localStorage.setItem(LS_KEYS.RESTAURANTS, JSON.stringify(list));
  } catch {
    // ignore storage restriction
  }
}

export function upsertLocalRestaurant(record: DemoRestaurantRecord): DemoRestaurantRecord[] {
  const existing = getLocalRestaurants();
  const slug = normalizeStoreSlug(record.storeSlug);
  const idx = existing.findIndex(
    (r) =>
      r.shopId === record.shopId ||
      r.id === record.id ||
      (slug && normalizeStoreSlug(r.storeSlug) === slug)
  );
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      ...record,
      password: record.password ?? next[idx].password,
      resetCode: record.resetCode !== undefined ? record.resetCode : next[idx].resetCode,
      resetCodeExpiresAt:
        record.resetCodeExpiresAt !== undefined
          ? record.resetCodeExpiresAt
          : next[idx].resetCodeExpiresAt,
      products: record.products ?? next[idx].products,
    };
  } else {
    next.unshift(record);
  }
  saveLocalRestaurants(next);
  return next;
}

export function findLocalRestaurantBySlugOrShopId(queryVal: string): DemoRestaurantRecord | null {
  const norm = normalizeStoreSlug(queryVal);
  const raw = (queryVal || '').trim().toLowerCase();
  const list = getLocalRestaurants();
  return (
    list.find(
      (r) =>
        r.shopId.toLowerCase() === raw ||
        r.id.toLowerCase() === raw ||
        (norm && normalizeStoreSlug(r.storeSlug) === norm)
    ) || null
  );
}

export function findLocalRestaurantByIdentifier(identifier: string): DemoRestaurantRecord | null {
  const raw = (identifier || '').trim().toLowerCase();
  if (!raw) return null;
  const slug = normalizeStoreSlug(raw);
  const digits = raw.replace(/[^0-9]/g, '');
  const list = getLocalRestaurants();
  return (
    list.find((r) => {
      if (slug && normalizeStoreSlug(r.storeSlug) === slug) return true;
      if (r.nameAr.toLowerCase() === raw) return true;
      if (r.email && r.email.toLowerCase() === raw) return true;
      if (digits && r.phone && r.phone.replace(/[^0-9]/g, '') === digits) return true;
      if (digits && r.shop?.whatsapp && r.shop.whatsapp.replace(/[^0-9]/g, '') === digits) return true;
      return false;
    }) || null
  );
}

export function setAuthSessionStorage(storeSlug: string, token: string): void {
  try {
    if (storeSlug) localStorage.setItem(LS_KEYS.LAST_STORE, normalizeStoreSlug(storeSlug) || storeSlug);
    if (token) localStorage.setItem(LS_KEYS.TOKEN, token);
  } catch {
    // ignore storage restriction
  }
}

export function clearAuthTokenKeepLastStore(): void {
  try {
    localStorage.removeItem(LS_KEYS.TOKEN);
  } catch {
    // ignore storage restriction
  }
}

export function getStoredAuthSession(): { token: string; lastStore: string } {
  try {
    return {
      token: localStorage.getItem(LS_KEYS.TOKEN) || '',
      lastStore: localStorage.getItem(LS_KEYS.LAST_STORE) || '',
    };
  } catch {
    return { token: '', lastStore: '' };
  }
}
