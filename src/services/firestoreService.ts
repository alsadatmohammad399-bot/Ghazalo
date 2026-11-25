import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { resolveDishPhotoClient } from '../utils/dishPhotoResolver';
import { sortProductsCulinary } from '../utils/menuSorting';
import {
  FIELD_LIMITS,
  normalizeMenuTemplateId,
  normalizeStoreSlug,
  type ExtractedMenuItem,
  type Order,
  type OrderStatus,
  type PlatformSettings,
  type Product,
  type Shop,
  type ShopTable,
  type StoreCredentialRecord,
  type UserProfile,
} from '../types';

export function sanitizeId(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 100);
  return clean || `id-${Date.now()}`;
}

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeId(`${prefix}-${Date.now()}-${rand}`);
}

export async function saveUserProfile(profile: Omit<UserProfile, 'createdAt' | 'updatedAt'>): Promise<void> {
  const path = `users/${profile.uid}`;
  try {
    const ref = doc(db, 'users', profile.uid);
    const snap = await getDoc(ref);
    const payload: Record<string, unknown> = {
      uid: profile.uid,
      fullName: (profile.fullName || 'تاجر').slice(0, FIELD_LIMITS.NAME_AR_MAX),
      updatedAt: serverTimestamp(),
    };
    if (profile.email) payload.email = profile.email.slice(0, 200);
    if (profile.phone) payload.phone = profile.phone.slice(0, FIELD_LIMITS.PHONE_MAX);
    if (profile.country) payload.country = profile.country.slice(0, FIELD_LIMITS.COUNTRY_MAX);
    if (profile.defaultShopId) payload.defaultShopId = profile.defaultShopId.slice(0, 128);

    if (!snap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getOwnerShops(ownerId: string): Promise<Shop[]> {
  const path = 'shops';
  try {
    const q = query(collection(db, 'shops'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Shop);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function findShopBySlugOrId(slugOrId: string): Promise<Shop | null> {
  const raw = (slugOrId || '').trim();
  if (!raw) return null;
  try {
    const directSnap = await getDoc(doc(db, 'shops', raw));
    if (directSnap.exists()) return directSnap.data() as Shop;
    const norm = normalizeStoreSlug(raw);
    if (!norm) return null;
    const q = query(collection(db, 'shops'), where('storeSlug', '==', norm));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].data() as Shop;
    return null;
  } catch {
    return null;
  }
}

export async function saveStoreCredentialRecord(input: {
  shopId: string;
  storeSlug: string;
  ownerId: string;
  nameAr: string;
  email?: string;
  phone?: string;
}): Promise<void> {
  const path = `store_credentials/${input.shopId}`;
  try {
    await setDoc(doc(db, 'store_credentials', input.shopId), {
      shopId: input.shopId,
      storeSlug: normalizeStoreSlug(input.storeSlug) || input.shopId,
      ownerId: input.ownerId,
      nameAr: (input.nameAr || 'متجر').slice(0, FIELD_LIMITS.NAME_AR_MAX),
      email: (input.email || '').slice(0, 200),
      phone: (input.phone || '').slice(0, FIELD_LIMITS.PHONE_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getAllStoreCredentials(): Promise<StoreCredentialRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'store_credentials'));
    return snap.docs.map((d) => d.data() as StoreCredentialRecord);
  } catch {
    return [];
  }
}

export async function createShopWithProducts(
  shopData: Omit<Shop, 'id' | 'createdAt' | 'updatedAt' | 'subscriptionStatus' | 'trialEndsAt'>,
  extractedItems: ExtractedMenuItem[] = []
): Promise<{ shop: Shop; products: Product[] }> {
  const shopId = generateId('shop');
  const path = `shops/${shopId}`;
  const trialEndsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const derivedSlug =
    normalizeStoreSlug(shopData.storeSlug || '') ||
    normalizeStoreSlug(shopData.nameEn || '') ||
    shopId;

  try {
    const cleanShop: Record<string, unknown> = {
      id: shopId,
      ownerId: shopData.ownerId,
      storeSlug: derivedSlug.slice(0, FIELD_LIMITS.SLUG_MAX),
      nameAr: (shopData.nameAr || 'متجري').trim().slice(0, FIELD_LIMITS.NAME_AR_MAX),
      nameEn: (shopData.nameEn || '').trim().slice(0, FIELD_LIMITS.NAME_EN_MAX),
      country: (shopData.country || 'مصر').trim().slice(0, FIELD_LIMITS.COUNTRY_MAX),
      menuLanguage: (shopData.menuLanguage || 'العربية').slice(0, 30),
      branchCount: (shopData.branchCount || 'فرع واحد').slice(0, 40),
      city: (shopData.city || '').trim().slice(0, FIELD_LIMITS.CITY_MAX),
      address: (shopData.address || '').trim().slice(0, FIELD_LIMITS.ADDRESS_MAX),
      workFrom: (shopData.workFrom || '4م').slice(0, 30),
      workTo: (shopData.workTo || '2ص').slice(0, 30),
      workDays: (shopData.workDays || []).slice(0, 7),
      themeColor: (shopData.themeColor || 'برتقالي').slice(0, 30),
      themeMode: shopData.themeMode === 'dark' ? 'dark' : 'light',
      menuTemplate: normalizeMenuTemplateId(shopData.menuTemplate),
      logoUrl: (shopData.logoUrl || '').slice(0, FIELD_LIMITS.LOGO_URL_MAX),
      showLogoOnItems: Boolean(shopData.showLogoOnItems),
      acceptOrders: Boolean(shopData.acceptOrders),
      paymentMethods: (shopData.paymentMethods || ['نقداً']).slice(0, 10),
      bio: (shopData.bio || '').trim().slice(0, FIELD_LIMITS.BIO_MAX),
      whatsapp: (shopData.whatsapp || '').trim().slice(0, FIELD_LIMITS.PHONE_MAX),
      facebookUrl: (shopData.facebookUrl || '').trim().slice(0, FIELD_LIMITS.SOCIAL_URL_MAX),
      instagramUrl: (shopData.instagramUrl || '').trim().slice(0, FIELD_LIMITS.SOCIAL_URL_MAX),
      tiktokUrl: (shopData.tiktokUrl || '').trim().slice(0, FIELD_LIMITS.SOCIAL_URL_MAX),
      googleMapsUrl: (shopData.googleMapsUrl || '').trim().slice(0, FIELD_LIMITS.MAPS_URL_MAX),
      googleAdsId: (shopData.googleAdsId || '').trim().slice(0, FIELD_LIMITS.ADS_ID_MAX),
      googleAdsConversionLabel: (shopData.googleAdsConversionLabel || '').trim().slice(0, FIELD_LIMITS.ADS_ID_MAX),
      coverImage: (shopData.coverImage || '').trim().slice(0, FIELD_LIMITS.COVER_IMAGE_MAX),
      isOpen: true,
      subscriptionStatus: 'trial',
      approvedByAdmin: false,
      plan: (shopData.plan || 'تجريبي 7 أيام').slice(0, 40),
      trialEndsAt,
      deliveryFee: Math.max(0, Number(shopData.deliveryFee) || 0),
      freeDelivery: Boolean(shopData.freeDelivery),
      freeDeliveryMinOrder: Math.max(0, Number(shopData.freeDeliveryMinOrder) || 0),
      deliveryTime: (shopData.deliveryTime || '30-45 دقيقة').slice(0, FIELD_LIMITS.DELIVERY_TIME_MAX),
      enableServiceFee: Boolean(shopData.enableServiceFee),
      serviceFeePct: Math.max(0, Number(shopData.serviceFeePct) || 0),
      enableVat: Boolean(shopData.enableVat),
      vatPct: Math.max(0, Number(shopData.vatPct) || 0),
      enablePackagingFee: Boolean(shopData.enablePackagingFee),
      packagingFee: Math.max(0, Number(shopData.packagingFee) || 0),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'shops', shopId), cleanShop);

    const createdProducts: Product[] = [];

    // Only write products if AI extracted items were reviewed & confirmed (empty store otherwise)
    if (extractedItems.length > 0) {
      const chunks: Array<Array<{ item: ExtractedMenuItem; idx: number }>> = [];
      const indexed = extractedItems.map((item, idx) => ({ item, idx }));
      for (let i = 0; i < indexed.length; i += 400) {
        chunks.push(indexed.slice(i, i + 400));
      }
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const { item, idx } of chunk) {
          const prodId = generateId('prod');
          const cleanPrice =
            Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? Number(item.price) : 0;
          const cleanCat = (item.category || 'أصناف متنوعة').trim().slice(0, FIELD_LIMITS.CATEGORY_MAX);
          const cleanName = item.name.trim().slice(0, FIELD_LIMITS.PRODUCT_NAME_MAX);
          const cleanImage =
            (item.imageUrl || '').trim().slice(0, 500) ||
            resolveDishPhotoClient(cleanName, cleanCat).slice(0, 500);

          const prodData: Record<string, unknown> = {
            id: prodId,
            shopId,
            shopOwnerId: shopData.ownerId,
            name: cleanName,
            category: cleanCat,
            price: cleanPrice,
            description: (item.description || '').trim().slice(0, FIELD_LIMITS.DESCRIPTION_MAX),
            imageUrl: cleanImage,
            barcode: '',
            available: true,
            variants: (item.variants || []).slice(0, 20),
            sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx,
            isOffer: Boolean(item.isOffer),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (item.isOffer && Number(item.originalPrice) > 0) {
            prodData.originalPrice = Number(item.originalPrice);
          }
          if (item.isOffer && item.offerLabel) {
            prodData.offerLabel = item.offerLabel.trim().slice(0, FIELD_LIMITS.OFFER_LABEL_MAX);
          }
          batch.set(doc(db, 'shops', shopId, 'products', prodId), prodData);

          createdProducts.push({
            id: prodId,
            shopId,
            shopOwnerId: shopData.ownerId,
            name: cleanName,
            category: cleanCat,
            price: cleanPrice,
            description: String(prodData.description || ''),
            imageUrl: cleanImage,
            barcode: '',
            available: true,
            variants: (prodData.variants as string[]) || [],
            sortOrder: Number(prodData.sortOrder),
            isOffer: Boolean(prodData.isOffer),
            originalPrice: prodData.originalPrice ? Number(prodData.originalPrice) : undefined,
            offerLabel: prodData.offerLabel ? String(prodData.offerLabel) : undefined,
          });
        }
        await batch.commit();
      }
    }

    const createdShop: Shop = {
      ...(cleanShop as unknown as Shop),
      id: shopId,
      trialEndsAt,
    };
    return {
      shop: createdShop,
      products: sortProductsCulinary(createdProducts),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createShop(
  shopData: Omit<Shop, 'id' | 'createdAt' | 'updatedAt' | 'subscriptionStatus' | 'trialEndsAt'>,
  extractedItems: ExtractedMenuItem[] = []
): Promise<Shop> {
  const { shop } = await createShopWithProducts(shopData, extractedItems);
  return shop;
}

export async function updateShop(
  shopId: string,
  updates: Partial<Shop>
): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    const allowed: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.storeSlug !== undefined) {
      const s = normalizeStoreSlug(updates.storeSlug);
      if (s) allowed.storeSlug = s.slice(0, FIELD_LIMITS.SLUG_MAX);
    }
    if (updates.nameAr !== undefined) allowed.nameAr = updates.nameAr.slice(0, FIELD_LIMITS.NAME_AR_MAX);
    if (updates.nameEn !== undefined) allowed.nameEn = updates.nameEn.slice(0, FIELD_LIMITS.NAME_EN_MAX);
    if (updates.country !== undefined) allowed.country = updates.country.slice(0, FIELD_LIMITS.COUNTRY_MAX);
    if (updates.menuLanguage !== undefined) allowed.menuLanguage = updates.menuLanguage.slice(0, 30);
    if (updates.branchCount !== undefined) allowed.branchCount = updates.branchCount.slice(0, 40);
    if (updates.city !== undefined) allowed.city = updates.city.slice(0, FIELD_LIMITS.CITY_MAX);
    if (updates.address !== undefined) allowed.address = updates.address.slice(0, FIELD_LIMITS.ADDRESS_MAX);
    if (updates.workFrom !== undefined) allowed.workFrom = updates.workFrom.slice(0, 30);
    if (updates.workTo !== undefined) allowed.workTo = updates.workTo.slice(0, 30);
    if (updates.workDays !== undefined) allowed.workDays = updates.workDays.slice(0, 7);
    if (updates.themeColor !== undefined) allowed.themeColor = updates.themeColor.slice(0, 30);
    if (updates.themeMode !== undefined) allowed.themeMode = updates.themeMode;
    if (updates.menuTemplate !== undefined) {
      allowed.menuTemplate = normalizeMenuTemplateId(updates.menuTemplate);
    }
    if (updates.logoUrl !== undefined) allowed.logoUrl = updates.logoUrl.slice(0, FIELD_LIMITS.LOGO_URL_MAX);
    if (updates.showLogoOnItems !== undefined) allowed.showLogoOnItems = Boolean(updates.showLogoOnItems);
    if (updates.acceptOrders !== undefined) allowed.acceptOrders = Boolean(updates.acceptOrders);
    if (updates.paymentMethods !== undefined) allowed.paymentMethods = updates.paymentMethods.slice(0, 10);
    if (updates.bio !== undefined) allowed.bio = updates.bio.slice(0, FIELD_LIMITS.BIO_MAX);
    if (updates.whatsapp !== undefined) allowed.whatsapp = updates.whatsapp.slice(0, FIELD_LIMITS.PHONE_MAX);
    if (updates.facebookUrl !== undefined) allowed.facebookUrl = updates.facebookUrl.slice(0, FIELD_LIMITS.SOCIAL_URL_MAX);
    if (updates.instagramUrl !== undefined) allowed.instagramUrl = updates.instagramUrl.slice(0, FIELD_LIMITS.SOCIAL_URL_MAX);
    if (updates.tiktokUrl !== undefined) allowed.tiktokUrl = updates.tiktokUrl.slice(0, FIELD_LIMITS.SOCIAL_URL_MAX);
    if (updates.googleMapsUrl !== undefined) allowed.googleMapsUrl = updates.googleMapsUrl.slice(0, FIELD_LIMITS.MAPS_URL_MAX);
    if (updates.googleAdsId !== undefined) allowed.googleAdsId = updates.googleAdsId.slice(0, FIELD_LIMITS.ADS_ID_MAX);
    if (updates.googleAdsConversionLabel !== undefined) allowed.googleAdsConversionLabel = updates.googleAdsConversionLabel.slice(0, FIELD_LIMITS.ADS_ID_MAX);
    if (updates.coverImage !== undefined) allowed.coverImage = updates.coverImage.slice(0, FIELD_LIMITS.COVER_IMAGE_MAX);
    if (updates.isOpen !== undefined) allowed.isOpen = Boolean(updates.isOpen);
    if (updates.plan !== undefined) allowed.plan = updates.plan.slice(0, 40);
    if (updates.requestedPlan !== undefined) allowed.requestedPlan = updates.requestedPlan;
    if (updates.paymentNote !== undefined) allowed.paymentNote = updates.paymentNote.slice(0, FIELD_LIMITS.PAYMENT_NOTE_MAX);
    if (updates.deliveryFee !== undefined) allowed.deliveryFee = Math.max(0, Number(updates.deliveryFee) || 0);
    if (updates.freeDelivery !== undefined) allowed.freeDelivery = Boolean(updates.freeDelivery);
    if (updates.freeDeliveryMinOrder !== undefined) allowed.freeDeliveryMinOrder = Math.max(0, Number(updates.freeDeliveryMinOrder) || 0);
    if (updates.deliveryTime !== undefined) allowed.deliveryTime = updates.deliveryTime.slice(0, FIELD_LIMITS.DELIVERY_TIME_MAX);
    if (updates.enableServiceFee !== undefined) allowed.enableServiceFee = Boolean(updates.enableServiceFee);
    if (updates.serviceFeePct !== undefined) allowed.serviceFeePct = Math.max(0, Math.min(100, Number(updates.serviceFeePct) || 0));
    if (updates.enableVat !== undefined) allowed.enableVat = Boolean(updates.enableVat);
    if (updates.vatPct !== undefined) allowed.vatPct = Math.max(0, Math.min(100, Number(updates.vatPct) || 0));
    if (updates.enablePackagingFee !== undefined) allowed.enablePackagingFee = Boolean(updates.enablePackagingFee);
    if (updates.packagingFee !== undefined) allowed.packagingFee = Math.max(0, Number(updates.packagingFee) || 0);

    await updateDoc(doc(db, 'shops', shopId), allowed);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function activateShopFor30Days(shopId: string): Promise<void> {
  return approveAndActivateShop(shopId, 30);
}

export async function approveAndActivateShop(shopId: string, days = 30): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    const now = Date.now();
    const expiresAt = now + days * 24 * 60 * 60 * 1000;
    const isYearly = days >= 360;
    const planLabel = isYearly ? 'السنوية (3,000 ج)' : 'الشهرية (600 ج)';
    await updateDoc(doc(db, 'shops', shopId), {
      subscriptionStatus: isYearly ? 'yearly' : 'monthly',
      approvedByAdmin: true,
      approvedAt: now,
      subscriptionExpiresAt: expiresAt,
      plan: planLabel,
      requestedPlan: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function extendTrialShop(shopId: string, days = 7): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    const trialEndsAt = Date.now() + days * 24 * 60 * 60 * 1000;
    await updateDoc(doc(db, 'shops', shopId), {
      subscriptionStatus: 'trial',
      approvedByAdmin: true,
      trialEndsAt,
      plan: 'تجريبي مجاني - 7 أيام',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function suspendShop(shopId: string): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    await updateDoc(doc(db, 'shops', shopId), {
      subscriptionStatus: 'suspended',
      approvedByAdmin: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getPlatformConfig(): Promise<PlatformSettings> {
  try {
    const snap = await getDoc(doc(db, 'app_settings', 'platform_config'));
    if (!snap.exists()) return { forceZeroFeesGlobally: false };
    const data = snap.data() as PlatformSettings;
    return {
      forceZeroFeesGlobally: Boolean(data.forceZeroFeesGlobally),
      updatedAt: data.updatedAt,
    };
  } catch {
    return { forceZeroFeesGlobally: false };
  }
}

export async function savePlatformConfig(forceZeroFeesGlobally: boolean): Promise<void> {
  const path = 'app_settings/platform_config';
  try {
    await setDoc(doc(db, 'app_settings', 'platform_config'), {
      forceZeroFeesGlobally: Boolean(forceZeroFeesGlobally),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getAdminCustomPin(): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'app_settings', 'admin_security'));
    if (!snap.exists()) return null;
    const data = snap.data() as { adminPin?: string };
    return data.adminPin || null;
  } catch {
    return null;
  }
}

export async function saveAdminCustomPin(newPin: string): Promise<void> {
  const path = 'app_settings/admin_security';
  try {
    const clean = newPin.trim().slice(0, 32);
    await setDoc(doc(db, 'app_settings', 'admin_security'), {
      adminPin: clean,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToShop(
  shopId: string,
  onData: (shop: Shop | null) => void,
  onError?: (error: unknown) => void
): () => void {
  const path = `shops/${shopId}`;
  return onSnapshot(
    doc(db, 'shops', shopId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as Shop) : null);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // non-fatal listener error
      }
    }
  );
}

export function subscribeToAllShops(
  onData: (shops: Shop[]) => void
): () => void {
  const path = 'shops';
  return onSnapshot(
    collection(db, 'shops'),
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Shop));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchProductsOnce(shopId: string): Promise<Product[]> {
  try {
    const snap = await getDocs(collection(db, 'shops', shopId, 'products'));
    return sortProductsCulinary(snap.docs.map((d) => d.data() as Product));
  } catch {
    return [];
  }
}

export function subscribeToProducts(
  shopId: string,
  onData: (products: Product[]) => void,
  onError?: (error: unknown) => void
): () => void {
  const path = `shops/${shopId}/products`;
  return onSnapshot(
    collection(db, 'shops', shopId, 'products'),
    (snap) => {
      onData(sortProductsCulinary(snap.docs.map((d) => d.data() as Product)));
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // non-fatal listener error
      }
    }
  );
}

export async function addProduct(
  shopId: string,
  shopOwnerId: string,
  input: {
    name: string;
    category: string;
    price: number;
    description?: string;
    imageUrl?: string;
    barcode?: string;
    variants?: string[];
    isOffer?: boolean;
    originalPrice?: number;
    offerLabel?: string;
  }
): Promise<void> {
  const prodId = generateId('prod');
  const path = `shops/${shopId}/products/${prodId}`;
  try {
    const payload: Record<string, unknown> = {
      id: prodId,
      shopId,
      shopOwnerId,
      name: input.name.trim().slice(0, FIELD_LIMITS.PRODUCT_NAME_MAX),
      category: input.category.trim().slice(0, FIELD_LIMITS.CATEGORY_MAX),
      price: Number.isFinite(Number(input.price)) && Number(input.price) >= 0 ? Number(input.price) : 0,
      description: (input.description || '').trim().slice(0, FIELD_LIMITS.DESCRIPTION_MAX),
      imageUrl: (input.imageUrl || '').trim().slice(0, 500),
      barcode: (input.barcode || '').trim().slice(0, 64),
      available: true,
      variants: (input.variants || []).slice(0, 20),
      isOffer: Boolean(input.isOffer),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.isOffer && Number(input.originalPrice) > 0) {
      payload.originalPrice = Math.max(0, Number(input.originalPrice));
    }
    if (input.isOffer && input.offerLabel) {
      payload.offerLabel = input.offerLabel.trim().slice(0, FIELD_LIMITS.OFFER_LABEL_MAX);
    }
    await setDoc(doc(db, 'shops', shopId, 'products', prodId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function addProductsBatch(
  shopId: string,
  shopOwnerId: string,
  items: ExtractedMenuItem[]
): Promise<void> {
  const path = `shops/${shopId}/products`;
  try {
    const batch = writeBatch(db);
    items.slice(0, 400).forEach((item, idx) => {
      const prodId = generateId('prod');
      const prodPayload: Record<string, unknown> = {
        id: prodId,
        shopId,
        shopOwnerId,
        name: item.name.trim().slice(0, FIELD_LIMITS.PRODUCT_NAME_MAX),
        category: (item.category || 'أصناف متنوعة').trim().slice(0, FIELD_LIMITS.CATEGORY_MAX),
        price: Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? Number(item.price) : 0,
        description: (item.description || '').trim().slice(0, FIELD_LIMITS.DESCRIPTION_MAX),
        imageUrl: (item.imageUrl || '').trim().slice(0, 500),
        barcode: '',
        available: true,
        variants: (item.variants || []).slice(0, 20),
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx,
        isOffer: Boolean(item.isOffer),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (item.isOffer && Number(item.originalPrice) > 0) {
        prodPayload.originalPrice = Math.max(0, Number(item.originalPrice));
      }
      if (item.isOffer && item.offerLabel) {
        prodPayload.offerLabel = item.offerLabel.trim().slice(0, FIELD_LIMITS.OFFER_LABEL_MAX);
      }
      batch.set(doc(db, 'shops', shopId, 'products', prodId), prodPayload);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateProduct(
  shopId: string,
  productId: string,
  updates: Partial<Product>
): Promise<void> {
  const path = `shops/${shopId}/products/${productId}`;
  try {
    const allowed: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) allowed.name = updates.name.slice(0, FIELD_LIMITS.PRODUCT_NAME_MAX);
    if (updates.category !== undefined) allowed.category = updates.category.slice(0, FIELD_LIMITS.CATEGORY_MAX);
    if (updates.price !== undefined) allowed.price = Math.max(0, Number(updates.price));
    if (updates.description !== undefined) allowed.description = updates.description.slice(0, FIELD_LIMITS.DESCRIPTION_MAX);
    if (updates.imageUrl !== undefined) allowed.imageUrl = updates.imageUrl.slice(0, 500);
    if (updates.barcode !== undefined) allowed.barcode = updates.barcode.slice(0, 64);
    if (updates.available !== undefined) allowed.available = Boolean(updates.available);
    if (updates.variants !== undefined) allowed.variants = updates.variants.slice(0, 20);
    if (updates.sortOrder !== undefined) allowed.sortOrder = Number(updates.sortOrder);
    if (updates.isOffer !== undefined) allowed.isOffer = Boolean(updates.isOffer);
    if (updates.originalPrice !== undefined) allowed.originalPrice = Math.max(0, Number(updates.originalPrice));
    if (updates.offerLabel !== undefined) allowed.offerLabel = updates.offerLabel.slice(0, FIELD_LIMITS.OFFER_LABEL_MAX);
    await updateDoc(doc(db, 'shops', shopId, 'products', productId), allowed);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function backfillShopMissingPhotos(shopId: string): Promise<number> {
  const path = `shops/${shopId}/products`;
  try {
    const snap = await getDocs(collection(db, 'shops', shopId, 'products'));
    const missing = snap.docs.filter((d) => {
      const data = d.data() as Product;
      return !data.imageUrl || !data.imageUrl.trim();
    });
    if (missing.length === 0) return 0;

    let updatedCount = 0;
    for (let i = 0; i < missing.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of missing.slice(i, i + 400)) {
        const data = d.data() as Product;
        const resolvedUrl = resolveDishPhotoClient(data.name, data.category).slice(0, 500);
        batch.update(doc(db, 'shops', shopId, 'products', d.id), {
          imageUrl: resolvedUrl,
          updatedAt: serverTimestamp(),
        });
        updatedCount += 1;
      }
      await batch.commit();
    }
    return updatedCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function backfillAllShopsMissingPhotos(shopIds: string[]): Promise<number> {
  let total = 0;
  for (const id of shopIds) {
    total += await backfillShopMissingPhotos(id);
  }
  return total;
}

export async function deleteProduct(shopId: string, productId: string): Promise<void> {
  const path = `shops/${shopId}/products/${productId}`;
  try {
    await deleteDoc(doc(db, 'shops', shopId, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function renameShopCategory(
  shopId: string,
  oldCategory: string,
  newCategory: string
): Promise<number> {
  const cleanNew = newCategory.trim().slice(0, FIELD_LIMITS.CATEGORY_MAX);
  if (!cleanNew || oldCategory === cleanNew) return 0;
  const path = `shops/${shopId}/products`;
  try {
    const snap = await getDocs(
      query(collection(db, 'shops', shopId, 'products'), where('category', '==', oldCategory))
    );
    if (snap.empty) return 0;
    let updatedCount = 0;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 400)) {
        batch.update(doc(db, 'shops', shopId, 'products', d.id), {
          category: cleanNew,
          updatedAt: serverTimestamp(),
        });
        updatedCount += 1;
      }
      await batch.commit();
    }
    return updatedCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeToTables(
  shopId: string,
  onData: (tables: ShopTable[]) => void
): () => void {
  const path = `shops/${shopId}/tables`;
  const q = query(collection(db, 'shops', shopId, 'tables'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as ShopTable));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addShopTable(
  shopId: string,
  shopOwnerId: string,
  label: string
): Promise<void> {
  const tableId = generateId('tbl');
  const path = `shops/${shopId}/tables/${tableId}`;
  try {
    await setDoc(doc(db, 'shops', shopId, 'tables', tableId), {
      id: tableId,
      shopId,
      shopOwnerId,
      label: label.trim().slice(0, 60),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteShopTable(shopId: string, tableId: string): Promise<void> {
  const path = `shops/${shopId}/tables/${tableId}`;
  try {
    await deleteDoc(doc(db, 'shops', shopId, 'tables', tableId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToOrders(
  shopId: string,
  ownerId: string,
  onData: (orders: Order[]) => void
): () => void {
  const path = `shops/${shopId}/orders`;
  const q = query(
    collection(db, 'shops', shopId, 'orders'),
    where('shopOwnerId', '==', ownerId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Order));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createOrder(
  orderInput: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>
): Promise<Order> {
  const orderId = generateId('ord');
  const orderNumber = `GH-${Math.floor(1000 + Math.random() * 9000)}`;
  const path = `shops/${orderInput.shopId}/orders/${orderId}`;

  try {
    const payload: Record<string, unknown> = {
      id: orderId,
      orderNumber,
      shopId: orderInput.shopId,
      shopOwnerId: orderInput.shopOwnerId,
      source: orderInput.source,
      orderType: orderInput.orderType,
      status: orderInput.status,
      paymentMethod: orderInput.paymentMethod.slice(0, 40),
      customerName: (orderInput.customerName || 'عميل').slice(0, FIELD_LIMITS.CUSTOMER_NAME_MAX),
      customerPhone: (orderInput.customerPhone || '').slice(0, FIELD_LIMITS.PHONE_MAX),
      address: (orderInput.address || '').slice(0, FIELD_LIMITS.ADDRESS_MAX),
      floor: (orderInput.floor || '').slice(0, 30),
      apartment: (orderInput.apartment || '').slice(0, 30),
      driverName: (orderInput.driverName || '').slice(0, 80),
      tableLabel: (orderInput.tableLabel || '').slice(0, 60),
      notes: (orderInput.notes || '').slice(0, FIELD_LIMITS.NOTES_MAX),
      itemsCount: Math.max(1, Math.min(500, Math.round(orderInput.itemsCount))),
      itemSummary: (orderInput.itemSummary || []).slice(0, 50),
      subtotal: Math.max(0, Number(orderInput.subtotal)),
      discount: Math.max(0, Number(orderInput.discount || 0)),
      deliveryFee: Math.max(0, Number(orderInput.deliveryFee || 0)),
      packagingFee: Math.max(0, Number(orderInput.packagingFee || 0)),
      serviceFee: Math.max(0, Number(orderInput.serviceFee)),
      vat: Math.max(0, Number(orderInput.vat)),
      roundingDiff: Number(orderInput.roundingDiff || 0),
      total: Math.max(0, Number(orderInput.total)),
      paidAmount: Math.max(0, Number(orderInput.paidAmount || orderInput.total)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'shops', orderInput.shopId, 'orders', orderId), payload);

    return {
      ...(payload as unknown as Order),
      id: orderId,
      orderNumber,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateOrderStatus(
  shopId: string,
  orderId: string,
  status: OrderStatus,
  extra?: { driverName?: string; notes?: string }
): Promise<void> {
  const path = `shops/${shopId}/orders/${orderId}`;
  try {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (extra?.driverName !== undefined) updates.driverName = extra.driverName.slice(0, 80);
    if (extra?.notes !== undefined) updates.notes = extra.notes.slice(0, FIELD_LIMITS.NOTES_MAX);
    await updateDoc(doc(db, 'shops', shopId, 'orders', orderId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
