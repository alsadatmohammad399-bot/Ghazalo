import {
  normalizeStoreSlug,
  type DemoRestaurantRecord,
  type PlatformSettings,
  type Product,
  type Shop,
  type SubscriptionStatus,
} from '../types';
import { DEMO_PROJECTS } from '../data/demoProjects';

export const LS_KEYS = {
  USERS: 'users',
  RESTAURANTS: 'restaurants',
  TOKEN: 'token',
  LAST_STORE: 'lastStore',
  ADMIN_TOKEN: 'adminToken',
  PLATFORM_SETTINGS: 'ghazalo_platform_settings',
} as const;

export interface DemoUserRecord {
  id: string;
  restaurantName: string;
  email: string;
  phone: string;
  password: string;
  storeSlug: string;
  shopId: string;
  plan?: 'trial' | 'monthly' | 'yearly';
  resetCode?: string;
  resetCodeExpiresAt?: number;
  createdAt: number;
}

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function normalizeEgyptianPhone(raw: string): string {
  const ascii = (raw || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const digits = ascii.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('20') && digits.length >= 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('1') && digits.length === 10) return `0${digits}`;
  return digits;
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
  if (shop.nameAr && normalizeStoreSlug(shop.nameAr)) {
    return normalizeStoreSlug(shop.nameAr);
  }
  if (shop.id && normalizeStoreSlug(shop.id)) {
    return normalizeStoreSlug(shop.id);
  }
  return `store-${Date.now().toString().slice(-6)}`;
}

export function makeUniqueStoreSlug(nameOrSlug: string): string {
  const base = normalizeStoreSlug(nameOrSlug) || `store-${Date.now().toString().slice(-5)}`;
  const restaurants = getLocalRestaurants();
  const users = getLocalUsers();
  const taken = new Set<string>([
    ...restaurants.map((r) => normalizeStoreSlug(r.storeSlug)),
    ...users.map((u) => normalizeStoreSlug(u.storeSlug)),
  ]);
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
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

  const kebdaShop: Shop = {
    ...(firstDemo?.shop || {
      id: 'kebda-masr',
      ownerId: 'demo-owner-kebda',
      nameAr: 'كبدة مصر',
      nameEn: 'Kebda Masr',
      country: 'مصر',
      city: 'القاهرة',
      address: 'وسط البلد - شارع 26 يوليو',
      acceptOrders: true,
      isOpen: true,
      subscriptionStatus: 'trial',
    }),
    id: 'kebda-masr',
    storeSlug: 'kebda-masr',
    nameAr: 'كبدة مصر',
    nameEn: 'Kebda Masr',
    whatsapp: '01015861991',
    subscriptionStatus: 'trial',
    trialEndsAt: now + sevenDays,
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
    nameAr: 'ركن الكشري',
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
      kebdaShop,
      {
        email: 'kebda@menu.eg',
        phone: '01015861991',
        password: '123456',
      },
      firstDemo?.products
    ),
    shopToDemoRecord(
      kosharyShop,
      {
        email: 'koshary@menu.eg',
        phone: '01099887766',
        password: '123456',
      },
      firstDemo?.products
    ),
  ];
}

export function getLocalUsers(): DemoUserRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.USERS);
    const list = safeJsonParse<DemoUserRecord[]>(raw, []);
    if (list.length > 0) return list;
    const defaultUsers: DemoUserRecord[] = [
      {
        id: 'user-kebda-masr',
        restaurantName: 'كبدة مصر',
        email: 'kebda@menu.eg',
        phone: '01015861991',
        password: '123456',
        storeSlug: 'kebda-masr',
        shopId: 'kebda-masr',
        plan: 'trial',
        createdAt: Date.now(),
      },
      {
        id: 'user-koshary-corner',
        restaurantName: 'ركن الكشري',
        email: 'koshary@menu.eg',
        phone: '01099887766',
        password: '123456',
        storeSlug: 'koshary-corner',
        shopId: 'koshary-corner',
        plan: 'trial',
        createdAt: Date.now(),
      },
    ];
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(defaultUsers));
    return defaultUsers;
  } catch {
    return [];
  }
}

export function saveLocalUsers(list: DemoUserRecord[]): void {
  try {
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(list));
  } catch {
    // ignore storage quota
  }
}

export function upsertLocalUser(user: DemoUserRecord): DemoUserRecord[] {
  const existing = getLocalUsers();
  const idx = existing.findIndex(
    (u) =>
      u.id === user.id ||
      u.storeSlug === user.storeSlug ||
      (user.email && u.email.toLowerCase() === user.email.toLowerCase()) ||
      (user.phone &&
        normalizeEgyptianPhone(u.phone) === normalizeEgyptianPhone(user.phone))
  );
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...user };
  } else {
    next.unshift(user);
  }
  saveLocalUsers(next);
  return next;
}

export function findLocalUserByEmailOrPhone(identifier: string): DemoUserRecord | null {
  const raw = (identifier || '').trim().toLowerCase();
  if (!raw) return null;
  const phoneNorm = normalizeEgyptianPhone(raw);
  const users = getLocalUsers();
  return (
    users.find((u) => {
      if (u.email && u.email.toLowerCase() === raw) return true;
      if (phoneNorm && u.phone && normalizeEgyptianPhone(u.phone) === phoneNorm) return true;
      if (normalizeStoreSlug(raw) && u.storeSlug === normalizeStoreSlug(raw)) return true;
      return false;
    }) || null
  );
}

export function registerDemoAccount(input: {
  restaurantName: string;
  email: string;
  phone: string;
  password: string;
  plan?: 'trial' | 'monthly' | 'yearly';
}): { ok: boolean; error?: string; user?: DemoUserRecord; record?: DemoRestaurantRecord; token?: string } {
  const cleanName = input.restaurantName.trim();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanPhone = normalizeEgyptianPhone(input.phone);
  const cleanPass = input.password;

  if (!cleanName) return { ok: false, error: 'يرجى إدخال اسم المطعم.' };
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, error: 'يرجى إدخال بريد إلكتروني صحيح.' };
  }
  if (cleanPhone.length < 10) {
    return { ok: false, error: 'يرجى إدخال رقم موبايل مصري صحيح.' };
  }
  if (cleanPass.length < 6) {
    return { ok: false, error: 'كلمة السر يجب أن تكون 6 أحرف أو أرقام على الأقل.' };
  }

  const existingUsers = getLocalUsers();
  if (existingUsers.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return { ok: false, error: 'هذا البريد الإلكتروني مسجل بالفعل، يمكنك تسجيل الدخول مباشرة.' };
  }
  if (existingUsers.some((u) => normalizeEgyptianPhone(u.phone) === cleanPhone)) {
    return { ok: false, error: 'رقم الموبايل مسجل بالفعل، يمكنك تسجيل الدخول مباشرة.' };
  }

  const storeSlug = makeUniqueStoreSlug(cleanName);
  const shopId = storeSlug;
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const templateProducts = (DEMO_PROJECTS[0]?.products || []).map((p, idx) => ({
    ...p,
    id: `${storeSlug}-p-${idx + 1}`,
    shopId,
    shopOwnerId: `owner-${shopId}`,
  }));

  const newShop: Shop = {
    id: shopId,
    storeSlug,
    ownerId: `owner-${shopId}`,
    nameAr: cleanName,
    nameEn: storeSlug,
    country: 'مصر',
    menuLanguage: 'العربية',
    branchCount: 'فرع واحد',
    city: 'القاهرة',
    address: '',
    workFrom: '10ص',
    workTo: '12ص',
    workDays: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
    themeColor: 'برتقالي',
    themeMode: 'light',
    menuTemplate: 'classic',
    acceptOrders: true,
    paymentMethods: ['نقداً', 'فودافون كاش', 'انستاباي'],
    whatsapp: cleanPhone,
    isOpen: true,
    subscriptionStatus: 'trial',
    trialEndsAt: now + sevenDays,
    deliveryFee: 20,
    freeDelivery: false,
    freeDeliveryMinOrder: 0,
    deliveryTime: '30-45 دقيقة',
    enableServiceFee: false,
    serviceFeePct: 0,
    enableVat: false,
    vatPct: 0,
    enablePackagingFee: false,
    packagingFee: 0,
  };

  const userRecord: DemoUserRecord = {
    id: `user-${shopId}-${now}`,
    restaurantName: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    password: cleanPass,
    storeSlug,
    shopId,
    plan: input.plan || 'trial',
    createdAt: now,
  };

  const restRecord = shopToDemoRecord(
    newShop,
    {
      email: cleanEmail,
      phone: cleanPhone,
      password: cleanPass,
    },
    templateProducts
  );

  upsertLocalUser(userRecord);
  upsertLocalRestaurant(restRecord);

  const token = `ghz-token-${storeSlug}-${now}`;
  setAuthSessionStorage(storeSlug, token);

  return { ok: true, user: userRecord, record: restRecord, token };
}

export function getLocalRestaurants(): DemoRestaurantRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.RESTAURANTS);
    const list = safeJsonParse<DemoRestaurantRecord[]>(raw, []);
    const seed = getDefaultDemoSeed();
    if (list.length > 0) {
      const seedVersionKey = 'ghazalo_seed_clean_v2';
      if (!localStorage.getItem(seedVersionKey)) {
        const cleaned = list.map((r) => ({
          ...r,
          email: (r.email || '').replace(/@ghazalo\.com$/i, '@menu.eg'),
        }));
        const kebdaSeed = seed.find((s) => s.storeSlug === 'kebda-masr');
        const hasKebda = cleaned.some(
          (r) => normalizeStoreSlug(r.storeSlug) === 'kebda-masr' || r.shopId === 'kebda-masr'
        );
        const merged = kebdaSeed && !hasKebda ? [kebdaSeed, ...cleaned] : cleaned;
        localStorage.setItem(seedVersionKey, '1');
        localStorage.setItem(LS_KEYS.RESTAURANTS, JSON.stringify(merged));
        return merged;
      }
      return list;
    }
    localStorage.setItem(LS_KEYS.RESTAURANTS, JSON.stringify(seed));
    localStorage.setItem('ghazalo_seed_clean_v2', '1');
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
  const direct =
    list.find(
      (r) =>
        r.shopId.toLowerCase() === raw ||
        r.id.toLowerCase() === raw ||
        (norm && normalizeStoreSlug(r.storeSlug) === norm)
    ) || null;
  if (direct) return direct;

  try {
    const rawStores = safeJsonParse<Array<Record<string, unknown>>>(
      localStorage.getItem('stores'),
      []
    );
    const storeMatch = rawStores.find((s) => {
      const sSlug = normalizeStoreSlug(String(s.slug || s.storeSlug || ''));
      const sId = String(s.id || s.shopId || '').toLowerCase();
      return (norm && sSlug === norm) || (raw && (sId === raw || sSlug === raw));
    });
    if (storeMatch) {
      const slug =
        normalizeStoreSlug(String(storeMatch.slug || storeMatch.storeSlug || '')) || raw || 'mtgry-algdyd';
      const name = String(storeMatch.name || storeMatch.nameAr || slug);
      const shop: Shop = {
        id: String(storeMatch.id || slug),
        ownerId: String(storeMatch.ownerId || `owner-${slug}`),
        storeSlug: slug,
        nameAr: name,
        nameEn: String(storeMatch.nameEn || name),
        country: String(storeMatch.country || 'مصر'),
        acceptOrders: true,
        isOpen: true,
        subscriptionStatus: 'trial',
        whatsapp: String(storeMatch.whatsapp || storeMatch.phone || '201015861991'),
      };
      const prods = Array.isArray(storeMatch.items || storeMatch.products)
        ? ((storeMatch.items || storeMatch.products) as Product[])
        : undefined;
      return shopToDemoRecord(shop, undefined, prods);
    }
  } catch {
    // ignore invalid localStorage 'stores'
  }
  return null;
}

export function findLocalRestaurantByIdentifier(identifier: string): DemoRestaurantRecord | null {
  const raw = (identifier || '').trim().toLowerCase();
  if (!raw) return null;
  const slug = normalizeStoreSlug(raw);
  const phoneNorm = normalizeEgyptianPhone(raw);
  const list = getLocalRestaurants();
  return (
    list.find((r) => {
      if (r.email && r.email.toLowerCase() === raw) return true;
      if (phoneNorm && r.phone && normalizeEgyptianPhone(r.phone) === phoneNorm) return true;
      if (phoneNorm && r.shop?.whatsapp && normalizeEgyptianPhone(r.shop.whatsapp) === phoneNorm)
        return true;
      if (slug && normalizeStoreSlug(r.storeSlug) === slug) return true;
      if (r.nameAr.toLowerCase() === raw) return true;
      return false;
    }) || null
  );
}

export function setAuthSessionStorage(storeSlug: string, token: string): void {
  try {
    if (storeSlug) {
      localStorage.setItem(LS_KEYS.LAST_STORE, normalizeStoreSlug(storeSlug) || storeSlug);
    }
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
