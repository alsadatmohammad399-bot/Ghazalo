export type AppView =
  | 'landing'
  | 'signup'
  | 'login'
  | 'onboarding'
  | 'dashboard'
  | 'storefront'
  | 'cashier'
  | 'orders'
  | 'share'
  | 'admin';

export type OrderType = 'delivery' | 'pickup' | 'dine_in' | 'table';
export type OrderSource = 'menu' | 'cashier';
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'held' | 'completed';
export type SubscriptionStatus =
  | 'trial'
  | 'monthly'
  | 'yearly'
  | 'active'
  | 'expired'
  | 'suspended';

export const BRAND_COLOR = '#FF6A00';
export const ADMIN_EMAIL = 'alsadatmohammad399@gmail.com';
export const ADMIN_PORTAL_KEY: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_PORTAL_KEY) ||
  'ghz-991-owner';

export type MenuTemplateId = 'classic' | 'modern' | 'minimal' | 'compact';
export type LegacyMenuTemplateId = 'luxury' | 'magazine';
export type ShopMenuTemplateId = MenuTemplateId | LegacyMenuTemplateId;

export type MenuTemplateLayoutMode = 'grid' | 'editorial' | 'minimal' | 'dense';
export type MenuTemplateDensity = 'comfortable' | 'airy' | 'clean' | 'compact';

export interface MenuTemplateStyleTokens {
  pageBackgroundClass: string;
  contentContainerClass: string;
  heroShellClass: string;
  offersSectionClass: string;
  offersCardClass: string;
  categoryActiveClass: string;
  categoryIdleClass: string;
  gridContainerClass: string;
  listContainerClass: string;
  cardClass: string;
  cardImageBoxClass: string;
  priceTextClass: string;
  primaryButtonClass: string;
  badgeClass: string;
  cardPreviewClass: string;
}

export interface MenuTemplateConfig {
  id: MenuTemplateId;
  name: string;
  englishName: string;
  tagline: string;
  badge: string;
  layoutMode: MenuTemplateLayoutMode;
  cardDensity: MenuTemplateDensity;
  showCardImages: boolean;
  showDescription: boolean;
  showFavoritesButton: boolean;
  showCategoryKicker: boolean;
  styles: MenuTemplateStyleTokens;
}

export const MENU_TEMPLATE_CONFIGS: Record<MenuTemplateId, MenuTemplateConfig> = {
  classic: {
    id: 'classic',
    name: 'كلاسيكي',
    englishName: 'Classic',
    tagline: 'شبكة متوازنة ببطاقات واضحة وصور جذابة تناسب معظم المطاعم والكافيهات',
    badge: 'الافتراضي',
    layoutMode: 'grid',
    cardDensity: 'comfortable',
    showCardImages: true,
    showDescription: true,
    showFavoritesButton: true,
    showCategoryKicker: false,
    styles: {
      pageBackgroundClass: 'bg-white dark:bg-slate-950',
      contentContainerClass: 'max-w-5xl mx-auto px-4',
      heroShellClass: 'bg-white dark:bg-slate-900 border-orange-100 dark:border-slate-800 rounded-3xl',
      offersSectionClass:
        'bg-gradient-to-l from-orange-50/90 via-white to-amber-50/70 dark:from-orange-950/30 dark:via-slate-900 dark:to-amber-950/20 border-orange-200/80 dark:border-orange-800/50 rounded-3xl',
      offersCardClass:
        'bg-white dark:bg-slate-900 rounded-3xl p-3 border border-orange-200/80 dark:border-slate-800 shadow-xs hover:border-[#FF6A00]',
      categoryActiveClass: 'glass-btn-primary',
      categoryIdleClass: 'glass-btn text-slate-700 dark:text-slate-200',
      gridContainerClass: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5',
      listContainerClass: 'space-y-3',
      cardClass:
        'bg-white dark:bg-slate-900 rounded-3xl p-3 border border-orange-100 dark:border-slate-800 shadow-xs hover:border-[#FF6A00]',
      cardImageBoxClass: 'relative h-32 sm:h-36 rounded-2xl bg-orange-50/70 dark:bg-slate-800',
      priceTextClass: 'text-[#FF6A00] dark:text-orange-400',
      primaryButtonClass: 'glass-btn-primary',
      badgeClass: 'bg-orange-100/80 dark:bg-slate-700 text-orange-800 dark:text-orange-200',
      cardPreviewClass: 'bg-white border-orange-200 text-slate-900',
    },
  },
  modern: {
    id: 'modern',
    name: 'عصري',
    englishName: 'Modern',
    tagline: 'تصميم بصري جريء ببطاقات عريضة وصور كبيرة تُبرز أطباقك وعروضك',
    badge: 'الأكثر جذباً',
    layoutMode: 'editorial',
    cardDensity: 'airy',
    showCardImages: true,
    showDescription: true,
    showFavoritesButton: true,
    showCategoryKicker: true,
    styles: {
      pageBackgroundClass:
        'bg-gradient-to-b from-slate-50 via-orange-50/25 to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900',
      contentContainerClass: 'max-w-5xl mx-auto px-4',
      heroShellClass:
        'bg-gradient-to-br from-white via-orange-50/35 to-amber-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-orange-950/25 border-orange-200/80 dark:border-slate-700 rounded-3xl shadow-sm',
      offersSectionClass:
        'bg-gradient-to-l from-[#FF6A00] via-orange-600 to-slate-900 text-white border-orange-500/60 rounded-3xl shadow-md',
      offersCardClass:
        'bg-white/95 dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl p-3.5 border border-orange-200/80 dark:border-orange-800/60 shadow-sm hover:border-amber-400',
      categoryActiveClass:
        'bg-slate-900 dark:bg-[#FF6A00] text-white shadow-sm border border-slate-900 dark:border-orange-400',
      categoryIdleClass:
        'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700 hover:border-orange-300',
      gridContainerClass: 'grid grid-cols-1 md:grid-cols-2 gap-4',
      listContainerClass: 'space-y-3.5',
      cardClass:
        'bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-orange-300',
      cardImageBoxClass:
        'relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-slate-100 dark:bg-slate-800 shrink-0',
      priceTextClass: 'text-[#FF6A00] dark:text-orange-400',
      primaryButtonClass:
        'bg-slate-900 hover:bg-[#FF6A00] dark:bg-[#FF6A00] dark:hover:bg-orange-500 text-white',
      badgeClass: 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300',
      cardPreviewClass: 'bg-slate-900 border-orange-500/40 text-white',
    },
  },
  minimal: {
    id: 'minimal',
    name: 'بسيط',
    englishName: 'Minimal',
    tagline: 'منيو هادئ ونظيف يركز على وضوح الاسم والوصف والسعر بأقل تشويش بصري',
    badge: 'أنيق وهادئ',
    layoutMode: 'minimal',
    cardDensity: 'clean',
    showCardImages: true,
    showDescription: true,
    showFavoritesButton: false,
    showCategoryKicker: false,
    styles: {
      pageBackgroundClass: 'bg-[#FAFAF9] dark:bg-slate-950',
      contentContainerClass: 'max-w-4xl mx-auto px-4',
      heroShellClass:
        'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 rounded-2xl',
      offersSectionClass:
        'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 rounded-2xl',
      offersCardClass:
        'bg-stone-50/70 dark:bg-slate-800/70 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-700 hover:border-slate-400',
      categoryActiveClass:
        'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-900 dark:border-white',
      categoryIdleClass:
        'bg-transparent text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900',
      gridContainerClass: 'grid grid-cols-1 sm:grid-cols-2 gap-3',
      listContainerClass:
        'divide-y divide-slate-200/80 dark:divide-slate-800 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden',
      cardClass:
        'bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600',
      cardImageBoxClass:
        'relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-stone-100 dark:bg-slate-800 shrink-0',
      priceTextClass: 'text-slate-900 dark:text-white',
      primaryButtonClass:
        'bg-slate-900 hover:bg-[#FF6A00] dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900',
      badgeClass: 'bg-stone-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
      cardPreviewClass: 'bg-[#FAFAF9] border-slate-300 text-slate-900',
    },
  },
  compact: {
    id: 'compact',
    name: 'مكثف',
    englishName: 'Compact',
    tagline: 'صفوف سريعة ومكثفة لعرض أكبر عدد من الأصناف في الشاشة والطلب بضغطة زر',
    badge: 'للمنيو الكبير',
    layoutMode: 'dense',
    cardDensity: 'compact',
    showCardImages: true,
    showDescription: true,
    showFavoritesButton: false,
    showCategoryKicker: false,
    styles: {
      pageBackgroundClass: 'bg-slate-50 dark:bg-slate-950',
      contentContainerClass: 'max-w-6xl mx-auto px-3 sm:px-4',
      heroShellClass:
        'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl',
      offersSectionClass:
        'bg-orange-50/70 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50 rounded-2xl',
      offersCardClass:
        'bg-white dark:bg-slate-900 rounded-2xl p-2.5 border border-orange-200 dark:border-slate-800 hover:border-[#FF6A00]',
      categoryActiveClass: 'glass-btn-primary',
      categoryIdleClass:
        'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700',
      gridContainerClass: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5',
      listContainerClass: 'space-y-2',
      cardClass:
        'bg-white dark:bg-slate-900 rounded-2xl p-2.5 border border-slate-200/90 dark:border-slate-800 hover:border-[#FF6A00]',
      cardImageBoxClass:
        'relative w-14 h-14 rounded-xl bg-orange-50/80 dark:bg-slate-800 shrink-0',
      priceTextClass: 'text-[#FF6A00] dark:text-orange-400',
      primaryButtonClass: 'glass-btn-primary',
      badgeClass: 'bg-orange-50 dark:bg-slate-800 text-orange-700 dark:text-orange-300',
      cardPreviewClass: 'bg-slate-50 border-slate-300 text-slate-900',
    },
  },
};

export const MENU_TEMPLATES_LIST: MenuTemplateConfig[] = [
  MENU_TEMPLATE_CONFIGS.classic,
  MENU_TEMPLATE_CONFIGS.modern,
  MENU_TEMPLATE_CONFIGS.minimal,
  MENU_TEMPLATE_CONFIGS.compact,
];

export function normalizeMenuTemplateId(id?: string | null): MenuTemplateId {
  if (id === 'modern' || id === 'luxury' || id === 'magazine') return 'modern';
  if (id === 'minimal') return 'minimal';
  if (id === 'compact') return 'compact';
  return 'classic';
}

export function getMenuTemplateConfig(id?: string | null): MenuTemplateConfig {
  return MENU_TEMPLATE_CONFIGS[normalizeMenuTemplateId(id)];
}

const ARABIC_TO_LATIN_MAP: Record<string, string> = {
  أ: 'a', إ: 'e', آ: 'a', ا: 'a', ى: 'a', ب: 'b', ت: 't', ة: 'a', ث: 'th',
  ج: 'g', ح: 'h', خ: 'kh', د: 'd', ذ: 'z', ر: 'r', ز: 'z', س: 's', ش: 'sh',
  ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k',
  ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w', ؤ: 'o', ي: 'y', ئ: 'e', ء: '',
};

export function normalizeStoreSlug(raw: string): string {
  const withoutOrigin = (raw || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?menu\//i, '')
    .replace(/^\/?dashboard\//i, '');

  const transliterated = Array.from(withoutOrigin.toLowerCase())
    .map((ch) => (ARABIC_TO_LATIN_MAP[ch] !== undefined ? ARABIC_TO_LATIN_MAP[ch] : ch))
    .join('');

  return transliterated
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const SUBSCRIPTION_PRICING = {
  MONTHLY_EGP: 600,
  YEARLY_EGP: 3000,
  YEARLY_SAVINGS_EGP: 4200,
} as const;

export const SUPPORT_CONTACT = {
  PHONE_DISPLAY: '01015861991',
  WHATSAPP_NUMBER: '201015861991',
  TEL_LINK: '+201015861991',
  EMAIL: 'mohamed.ghazal.s203@gmail.com',
} as const;

export const FIELD_LIMITS = {
  NAME_AR_MAX: 120,
  NAME_EN_MAX: 120,
  SLUG_MAX: 64,
  COUNTRY_MAX: 60,
  CITY_MAX: 80,
  ADDRESS_MAX: 240,
  BIO_MAX: 500,
  PRODUCT_NAME_MAX: 160,
  CATEGORY_MAX: 80,
  DESCRIPTION_MAX: 400,
  CUSTOMER_NAME_MAX: 120,
  PHONE_MAX: 40,
  NOTES_MAX: 300,
  OFFER_LABEL_MAX: 60,
  PAYMENT_NOTE_MAX: 200,
  DELIVERY_TIME_MAX: 60,
  LOGO_URL_MAX: 24000,
  COVER_IMAGE_MAX: 90000,
} as const;

export interface UserProfile {
  uid: string;
  fullName: string;
  email?: string;
  phone?: string;
  country?: string;
  defaultShopId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Shop {
  id: string;
  ownerId: string;
  storeSlug?: string;
  nameAr: string;
  nameEn?: string;
  country: string;
  menuLanguage?: string;
  branchCount?: string;
  city?: string;
  address?: string;
  workFrom?: string;
  workTo?: string;
  workDays?: string[];
  themeColor?: string;
  themeMode?: 'light' | 'dark';
  menuTemplate?: ShopMenuTemplateId;
  logoUrl?: string;
  showLogoOnItems?: boolean;
  acceptOrders: boolean;
  paymentMethods?: string[];
  bio?: string;
  whatsapp?: string;
  coverImage?: string;
  isOpen: boolean;
  subscriptionStatus: SubscriptionStatus;
  approvedByAdmin?: boolean;
  approvedAt?: number;
  plan?: string;
  requestedPlan?: '' | 'monthly_600' | 'yearly_3000' | 'yearly_6000';
  paymentNote?: string;
  trialEndsAt?: number;
  subscriptionExpiresAt?: number;
  // Delivery & Optional Fees Settings (All extra fees OFF by default)
  deliveryFee?: number;
  freeDelivery?: boolean;
  freeDeliveryMinOrder?: number;
  deliveryTime?: string;
  enableServiceFee?: boolean;
  serviceFeePct?: number;
  enableVat?: boolean;
  vatPct?: number;
  enablePackagingFee?: boolean;
  packagingFee?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StoreCredentialRecord {
  shopId: string;
  storeSlug: string;
  ownerId: string;
  nameAr: string;
  email?: string;
  phone?: string;
  resetCode?: string;
  resetCodeExpiresAt?: number;
  updatedAt?: unknown;
}

export interface PlatformSettings {
  forceZeroFeesGlobally: boolean;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  shopId: string;
  shopOwnerId: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  imageUrl?: string;
  barcode?: string;
  available: boolean;
  variants?: string[];
  sortOrder?: number;
  isOffer?: boolean;
  originalPrice?: number;
  offerLabel?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ShopTable {
  id: string;
  shopId: string;
  shopOwnerId: string;
  label: string;
  createdAt?: unknown;
}

export interface Order {
  id: string;
  orderNumber: string;
  shopId: string;
  shopOwnerId: string;
  source: OrderSource;
  orderType: OrderType;
  status: OrderStatus;
  paymentMethod: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  floor?: string;
  apartment?: string;
  driverName?: string;
  tableLabel?: string;
  notes?: string;
  itemsCount: number;
  itemSummary?: string[];
  subtotal: number;
  discount?: number;
  deliveryFee?: number;
  packagingFee?: number;
  serviceFee: number;
  vat: number;
  roundingDiff?: number;
  total: number;
  paidAmount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  note?: string;
}

export interface ExtractedMenuItem {
  name: string;
  category: string;
  price: number;
  description?: string;
  variants?: string[];
  imageUrl?: string;
  sortOrder?: number;
  isOffer?: boolean;
  originalPrice?: number;
  offerLabel?: string;
}

export interface DemoProject {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  shop: Shop;
  products: Product[];
}

export interface DemoRestaurantRecord {
  id: string;
  shopId: string;
  storeSlug: string;
  nameAr: string;
  email: string;
  phone: string;
  /** Stored for demo / admin management parity with localStorage "restaurants" */
  password?: string;
  resetCode?: string;
  resetCodeExpiresAt?: number;
  status: SubscriptionStatus;
  trialEndDate: number;
  subscriptionEndDate: number;
  deliveryFee: number;
  freeDelivery: boolean;
  freeDeliveryMinOrder: number;
  deliveryTime: string;
  enableServiceFee: boolean;
  serviceFeePct: number;
  enableVat: boolean;
  vatPct: number;
  enablePackagingFee: boolean;
  packagingFee: number;
  createdAt: number;
  shop: Shop;
  products?: Product[];
}
