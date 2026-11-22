import {
  normalizeStoreSlug,
  type DemoRestaurantRecord,
  type PlatformSettings,
  type Product,
  type Shop,
  type SubscriptionStatus,
} from '../types';
import { DEMO_PROJECTS } from '../data/demoProjects';
import {
  DEMO_STORES,
  buildShopFromDemoEntry,
  mapSeedItemsToProducts,
} from '../data/stores';

export const LS_KEYS = {
  USERS: 'users',
  RESTAURANTS: 'restaurants',
  TOKEN: 'token',
  LAST_STORE: 'lastStore',
  ADMIN_TOKEN: 'adminToken',
  PLATFORM_SETTINGS: 'ghazalo_platform_settings',
  GHAZALO_USER: 'ghazalo_user',
} as const;

export interface GhazaloUserSession {
  uid?: string;
  name: string;
  email?: string;
  phone?: string;
  photo?: string;
  isGuest?: boolean;
  loginMethod?: 'google' | 'phone' | 'guest' | 'email';
}

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

export function getDemoStoreEntriesMeta(): Map<
  string,
  { logoEmoji: string; category: string; isDemo: boolean }
> {
  const map = new Map<string, { logoEmoji: string; category: string; isDemo: boolean }>();
  for (const entry of DEMO_STORES) {
    map.set(entry.slug.toLowerCase(), {
      logoEmoji: entry.logoEmoji,
      category: entry.category,
      isDemo: true,
    });
  }
  return map;
}

export function getDemoStoreRecords(): DemoRestaurantRecord[] {
  return DEMO_STORES.map((entry) => {
    const built = buildShopFromDemoEntry(entry, entry.slug);
    return shopToDemoRecord(
      built.shop,
      {
        email: `${entry.slug}@menu.eg`,
        phone: entry.phone,
        password: '123456',
      },
      built.products
    );
  });
}

function getDefaultDemoSeed(): DemoRestaurantRecord[] {
  return getDemoStoreRecords();
}

export function getLocalUsers(): DemoUserRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.USERS);
    const list = safeJsonParse<DemoUserRecord[]>(raw, []);
    if (list.length > 0) return list;
    const defaultUsers: DemoUserRecord[] = [
      {
        id: 'user-kebda-msr',
        restaurantName: 'كبدة مصر',
        email: 'kebda@menu.eg',
        phone: '01015861991',
        password: '123456',
        storeSlug: 'kebda-msr',
        shopId: 'kebda-msr',
        plan: 'trial',
        createdAt: Date.now(),
      },
      {
        id: 'user-mshwyat-al-ghazal',
        restaurantName: 'مشويات الغزال',
        email: 'ghazal@menu.eg',
        phone: '01000000001',
        password: '123456',
        storeSlug: 'mshwyat-al-ghazal',
        shopId: 'mshwyat-al-ghazal',
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
      const seedVersionKey = 'ghazalo_seed_5demos_v3';
      if (!localStorage.getItem(seedVersionKey)) {
        const cleaned = list.map((r) => ({
          ...r,
          email: (r.email || '').replace(/@ghazalo\.com$/i, '@menu.eg'),
        }));
        const existingSlugs = new Set(
          cleaned.map((r) => normalizeStoreSlug(r.storeSlug || r.shopId))
        );
        const missingSeeds = seed.filter(
          (s) => !existingSlugs.has(normalizeStoreSlug(s.storeSlug))
        );
        const merged = [...cleaned, ...missingSeeds];
        localStorage.setItem(seedVersionKey, '1');
        localStorage.setItem(LS_KEYS.RESTAURANTS, JSON.stringify(merged));
        return merged;
      }
      return list;
    }
    localStorage.setItem(LS_KEYS.RESTAURANTS, JSON.stringify(seed));
    localStorage.setItem('ghazalo_seed_5demos_v3', '1');
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

export function getGhazaloUser(): GhazaloUserSession | null {
  try {
    const parsed = safeJsonParse<GhazaloUserSession | null>(
      localStorage.getItem(LS_KEYS.GHAZALO_USER),
      null
    );
    if (!parsed || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setGhazaloUser(user: GhazaloUserSession): void {
  try {
    const clean: GhazaloUserSession = {
      uid: user.uid || '',
      name: (user.name || 'مستخدم غزالو').trim(),
      email: (user.email || '').trim(),
      phone: (user.phone || '').trim(),
      photo: (user.photo || '').trim(),
      isGuest: Boolean(user.isGuest),
      loginMethod: user.loginMethod || (user.isGuest ? 'guest' : user.phone ? 'phone' : 'google'),
    };
    localStorage.setItem(LS_KEYS.GHAZALO_USER, JSON.stringify(clean));
  } catch {
    // ignore storage restriction
  }
}

export function clearGhazaloUser(): void {
  try {
    localStorage.removeItem(LS_KEYS.GHAZALO_USER);
  } catch {
    // ignore storage restriction
  }
}

export interface VisibleStoreItem {
  record: DemoRestaurantRecord;
  isDemo: boolean;
  isOwnedByUser: boolean;
  logoEmoji: string;
  category: string;
}

export function isStoreOwnedByUser(
  record: DemoRestaurantRecord,
  user: GhazaloUserSession | null
): boolean {
  if (!user) return false;
  if (user.uid && record.shop?.ownerId && record.shop.ownerId === user.uid) return true;
  if (
    user.email &&
    record.email &&
    record.email.trim().toLowerCase() === user.email.trim().toLowerCase()
  ) {
    return true;
  }
  if (user.phone) {
    const userPhoneNorm = normalizeEgyptianPhone(user.phone);
    const recPhoneNorm = normalizeEgyptianPhone(record.phone || record.shop?.whatsapp || '');
    if (userPhoneNorm && recPhoneNorm && userPhoneNorm === recPhoneNorm) return true;
  }
  return false;
}

export function getVisibleStoresForUser(
  user: GhazaloUserSession | null,
  extraShops: Shop[] = []
): VisibleStoreItem[] {
  const demoMetaMap = getDemoStoreEntriesMeta();
  const demoSlugs = new Set(DEMO_STORES.map((d) => d.slug.toLowerCase()));
  const localRestaurants = getLocalRestaurants();
  const seenSlugs = new Set<string>();
  const userOwnedItems: VisibleStoreItem[] = [];
  const demoItems: VisibleStoreItem[] = [];

  for (const fsShop of extraShops) {
    const slug = normalizeStoreSlug(fsShop.storeSlug || fsShop.id);
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    const localRec = findLocalRestaurantBySlugOrShopId(slug);
    const rec = shopToDemoRecord(
      fsShop,
      { email: user?.email || localRec?.email || '', phone: user?.phone || fsShop.whatsapp || '' },
      localRec?.products
    );
    const isDemo = demoSlugs.has(slug);
    const meta = demoMetaMap.get(slug);
    const item: VisibleStoreItem = {
      record: rec,
      isDemo,
      isOwnedByUser: true,
      logoEmoji: meta?.logoEmoji || '🍽️',
      category: meta?.category || 'متجري',
    };
    userOwnedItems.push(item);
  }

  for (const rec of localRestaurants) {
    const slug = normalizeStoreSlug(rec.storeSlug || rec.shopId);
    if (!slug || seenSlugs.has(slug)) continue;
    const isDemo = demoSlugs.has(slug);
    const owned = isStoreOwnedByUser(rec, user);
    if (owned && !isDemo) {
      seenSlugs.add(slug);
      userOwnedItems.push({
        record: rec,
        isDemo: false,
        isOwnedByUser: true,
        logoEmoji: '🏪',
        category: 'متجري',
      });
    }
  }

  // Always show all 5 DEMO_STORES for every user (including guests)
  for (const demoEntry of DEMO_STORES) {
    const slug = demoEntry.slug.toLowerCase();
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    const localOverride = localRestaurants.find(
      (r) => normalizeStoreSlug(r.storeSlug || r.shopId) === slug
    );
    const built = buildShopFromDemoEntry(demoEntry, demoEntry.slug);
    const rec = localOverride
      ? {
          ...localOverride,
          products:
            localOverride.products && localOverride.products.length > 0
              ? localOverride.products
              : built.products,
        }
      : shopToDemoRecord(
          built.shop,
          { email: `${demoEntry.slug}@menu.eg`, phone: demoEntry.phone },
          built.products
        );
    demoItems.push({
      record: rec,
      isDemo: true,
      isOwnedByUser: isStoreOwnedByUser(rec, user),
      logoEmoji: demoEntry.logoEmoji,
      category: demoEntry.category,
    });
  }

  return [...userOwnedItems, ...demoItems];
}

export function createStoreForCurrentUser(
  input: { restaurantName: string; phone?: string },
  user: GhazaloUserSession | null
): DemoRestaurantRecord {
  const cleanName = input.restaurantName.trim() || 'مطعمي الجديد';
  const storeSlug = makeUniqueStoreSlug(cleanName);
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const ownerId = user?.uid || `owner-${storeSlug}`;
  const cleanPhone = normalizeEgyptianPhone(input.phone || user?.phone || '01015861991');

  const seedItems = DEMO_STORES[4]?.items || DEMO_STORES[0].items;
  const starterProducts = mapSeedItemsToProducts(storeSlug, seedItems).map((p) => ({
    ...p,
    shopOwnerId: ownerId,
  }));

  const newShop: Shop = {
    id: storeSlug,
    ownerId,
    storeSlug,
    nameAr: cleanName,
    nameEn: storeSlug,
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
    whatsapp: cleanPhone || '01015861991',
    isOpen: true,
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

  const rec = shopToDemoRecord(
    newShop,
    {
      email: user?.email || '',
      phone: cleanPhone,
    },
    starterProducts
  );
  upsertLocalRestaurant(rec);
  setAuthSessionStorage(storeSlug, localStorage.getItem(LS_KEYS.TOKEN) || `ghz-${ownerId}-${now}`);
  return rec;
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
    localStorage.removeItem(LS_KEYS.GHAZALO_USER);
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
