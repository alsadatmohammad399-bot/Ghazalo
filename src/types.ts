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

export const BRAND_COLOR = '#15803D';
export const ADMIN_EMAIL = 'alsadatmohammad399@gmail.com';
export const ADMIN_PORTAL_KEY: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_PORTAL_KEY) ||
  'ghz-991-owner';

export type MenuTemplateId = 'classic' | 'modern' | 'minimal' | 'compact' | 'royal';
export type LegacyMenuTemplateId = 'luxury' | 'magazine';
export type ShopMenuTemplateId = MenuTemplateId | LegacyMenuTemplateId;

export type MenuTemplateLayoutMode = 'grid' | 'editorial' | 'minimal' | 'dense' | 'royal';
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
  hasAiChef?: boolean;
  styles: MenuTemplateStyleTokens;
}

export const MENU_TEMPLATE_CONFIGS: Record<MenuTemplateId, MenuTemplateConfig> = {
  classic: {
    id: 'classic',
    name: 'كلاسيكي',
    englishName: 'Classic',
    tagline: 'شبكة متوازنة ببطاقات نعناع ناعمة وصور واضحة تناسب معظم المطاعم والكافيهات',
    badge: 'الافتراضي',
    layoutMode: 'grid',
    cardDensity: 'comfortable',
    showCardImages: true,
    showDescription: true,
    showFavoritesButton: true,
    showCategoryKicker: false,
    styles: {
      pageBackgroundClass: 'bg-[#F6FBF7] dark:bg-[#0F1712]',
      contentContainerClass: 'max-w-[560px] mx-auto px-4',
      heroShellClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32] rounded-[24px]',
      offersSectionClass:
        'bg-[#DCFCE7]/60 dark:bg-[#173323]/60 border-[#86EFAC] dark:border-[#2C3D32] rounded-[24px]',
      offersCardClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] rounded-[22px] p-3 border border-[#CFE3D5] dark:border-[#2C3D32] shadow-xs hover:border-[#15803D]',
      categoryActiveClass: 'bg-[#15803D] text-white border-[1.5px] border-[#15803D]',
      categoryIdleClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] text-[#14201A] dark:text-[#E8F2EB] border-[1.5px] border-[#CFE3D5] dark:border-[#2C3D32]',
      gridContainerClass: 'grid grid-cols-2 gap-2.5',
      listContainerClass: 'space-y-3',
      cardClass:
        'bg-[#DCFCE7] dark:bg-[#173323] rounded-[22px] p-2.5 border border-[#CFE3D5]/60 dark:border-[#2C3D32]',
      cardImageBoxClass:
        'relative h-24 sm:h-28 rounded-[16px] bg-[#FFFFFF]/80 dark:bg-[#18231C]',
      priceTextClass: 'text-[#15803D] dark:text-[#BBF7D0]',
      primaryButtonClass: 'bg-[#15803D] hover:bg-[#166534] text-white',
      badgeClass: 'bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0]',
      cardPreviewClass: 'bg-[#DCFCE7] border-[#CFE3D5] text-[#14201A]',
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
        'bg-[#F6FBF7] dark:bg-[#0F1712]',
      contentContainerClass: 'max-w-4xl mx-auto px-4',
      heroShellClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32] rounded-[24px] shadow-sm',
      offersSectionClass:
        'bg-[#14201A] text-white border-[#2C3D32] rounded-[24px] shadow-md',
      offersCardClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] text-[#14201A] dark:text-[#E8F2EB] rounded-[22px] p-3.5 border border-[#CFE3D5] dark:border-[#2C3D32] shadow-sm hover:border-[#FACC15]',
      categoryActiveClass:
        'bg-[#14201A] dark:bg-[#15803D] text-white shadow-sm border border-[#14201A] dark:border-[#15803D]',
      categoryIdleClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] text-[#14201A] dark:text-[#E8F2EB] border border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D]',
      gridContainerClass: 'grid grid-cols-1 md:grid-cols-2 gap-3.5',
      listContainerClass: 'space-y-3',
      cardClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] rounded-[24px] p-4 border border-[#CFE3D5] dark:border-[#2C3D32] shadow-sm hover:border-[#15803D]',
      cardImageBoxClass:
        'relative w-28 h-28 sm:w-32 sm:h-32 rounded-[18px] bg-[#DCFCE7] dark:bg-[#173323] shrink-0',
      priceTextClass: 'text-[#15803D] dark:text-[#BBF7D0]',
      primaryButtonClass:
        'bg-[#14201A] hover:bg-[#15803D] dark:bg-[#15803D] dark:hover:bg-[#166534] text-white',
      badgeClass: 'bg-[#FEF9C3] dark:bg-amber-950/70 text-[#14201A] dark:text-amber-200',
      cardPreviewClass: 'bg-[#14201A] border-[#2C3D32] text-white',
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
      pageBackgroundClass: 'bg-[#F6FBF7] dark:bg-[#0F1712]',
      contentContainerClass: 'max-w-[560px] mx-auto px-4',
      heroShellClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32] rounded-[22px]',
      offersSectionClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32] rounded-[22px]',
      offersCardClass:
        'bg-[#F6FBF7] dark:bg-[#173323] rounded-[18px] p-3 border border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D]',
      categoryActiveClass:
        'bg-[#15803D] text-white border border-[#15803D]',
      categoryIdleClass:
        'bg-transparent text-[#4B5B52] dark:text-[#A3B5AA] border border-[#CFE3D5] dark:border-[#2C3D32] hover:bg-[#FFFFFF] dark:hover:bg-[#18231C]',
      gridContainerClass: 'grid grid-cols-1 sm:grid-cols-2 gap-3',
      listContainerClass:
        'divide-y divide-[#CFE3D5] dark:divide-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C] rounded-[22px] border border-[#CFE3D5] dark:border-[#2C3D32] overflow-hidden',
      cardClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] rounded-[20px] p-3.5 border border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D]',
      cardImageBoxClass:
        'relative w-16 h-16 sm:w-20 sm:h-20 rounded-[14px] bg-[#DCFCE7] dark:bg-[#173323] shrink-0',
      priceTextClass: 'text-[#14201A] dark:text-[#E8F2EB]',
      primaryButtonClass:
        'bg-[#15803D] hover:bg-[#166534] text-white',
      badgeClass: 'bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0]',
      cardPreviewClass: 'bg-[#FFFFFF] border-[#CFE3D5] text-[#14201A]',
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
      pageBackgroundClass: 'bg-[#F6FBF7] dark:bg-[#0F1712]',
      contentContainerClass: 'max-w-4xl mx-auto px-3 sm:px-4',
      heroShellClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32] rounded-[20px]',
      offersSectionClass:
        'bg-[#DCFCE7]/70 dark:bg-[#173323]/60 border-[#86EFAC] dark:border-[#2C3D32] rounded-[20px]',
      offersCardClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] rounded-[18px] p-2.5 border border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D]',
      categoryActiveClass: 'bg-[#15803D] text-white border border-[#15803D]',
      categoryIdleClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] text-[#14201A] dark:text-[#E8F2EB] border border-[#CFE3D5] dark:border-[#2C3D32]',
      gridContainerClass: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5',
      listContainerClass: 'space-y-2',
      cardClass:
        'bg-[#FFFFFF] dark:bg-[#18231C] rounded-[18px] p-2.5 border border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D]',
      cardImageBoxClass:
        'relative w-14 h-14 rounded-[12px] bg-[#DCFCE7] dark:bg-[#173323] shrink-0',
      priceTextClass: 'text-[#15803D] dark:text-[#BBF7D0]',
      primaryButtonClass: 'bg-[#15803D] hover:bg-[#166534] text-white',
      badgeClass: 'bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0]',
      cardPreviewClass: 'bg-[#F6FBF7] border-[#CFE3D5] text-[#14201A]',
    },
  },
  royal: {
    id: 'royal',
    name: 'زين الشام (ملكي + شيف AI)',
    englishName: 'Royal Damascene + AI Chef',
    tagline: 'تصميم ملكي فاخر بالذهبي والكحلي/العاجي مع مساعد شيف الذكاء الاصطناعي لترشيح الوجبات والطلب السريع',
    badge: 'شيف ذكي AI',
    layoutMode: 'royal',
    cardDensity: 'airy',
    showCardImages: true,
    showDescription: true,
    showFavoritesButton: true,
    showCategoryKicker: true,
    hasAiChef: true,
    styles: {
      pageBackgroundClass: 'bg-[#F7F4ED] dark:bg-[#0E1526]',
      contentContainerClass: 'max-w-5xl mx-auto px-4',
      heroShellClass:
        'bg-[#FFFFFF] dark:bg-[#1B2540] border-[#E3DCCB] dark:border-[#2A3550] rounded-[18px]',
      offersSectionClass:
        'bg-[#EFE9DA]/80 dark:bg-[#0A1120] border-[#E3DCCB] dark:border-[#2A3550] rounded-[18px]',
      offersCardClass:
        'bg-[#FFFFFF] dark:bg-[#1B2540] rounded-[14px] p-3 border border-[#E3DCCB] dark:border-[#2A3550] hover:border-[#A9813F] dark:hover:border-[#C9A35B]',
      categoryActiveClass:
        'bg-[#A9813F] dark:bg-[#C9A35B] text-white dark:text-[#0E1526] border border-[#A9813F] dark:border-[#C9A35B]',
      categoryIdleClass:
        'bg-[#FFFFFF] dark:bg-[#1B2540] text-[#20263A] dark:text-[#F5F1E8] border border-[#E3DCCB] dark:border-[#2A3550] hover:border-[#A9813F] dark:hover:border-[#C9A35B]',
      gridContainerClass: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5',
      listContainerClass: 'space-y-3',
      cardClass:
        'bg-[#FFFFFF] dark:bg-[#1B2540] rounded-[14px] p-3 border border-[#E3DCCB] dark:border-[#2A3550] hover:border-[#A9813F] dark:hover:border-[#C9A35B]',
      cardImageBoxClass:
        'relative h-40 rounded-[10px] bg-[#EFE9DA] dark:bg-[#0A1120]',
      priceTextClass: 'text-[#A9813F] dark:text-[#C9A35B]',
      primaryButtonClass:
        'bg-[#A9813F] hover:bg-[#8E6A31] dark:bg-[#C9A35B] dark:hover:bg-[#DCB877] text-white dark:text-[#0E1526]',
      badgeClass: 'bg-[#EFE9DA] dark:bg-[#2A3550] text-[#A9813F] dark:text-[#C9A35B]',
      cardPreviewClass: 'bg-[#0E1526] border-[#C9A35B]/40 text-[#F5F1E8]',
    },
  },
};

export const MENU_TEMPLATES_LIST: MenuTemplateConfig[] = [
  MENU_TEMPLATE_CONFIGS.classic,
  MENU_TEMPLATE_CONFIGS.modern,
  MENU_TEMPLATE_CONFIGS.minimal,
  MENU_TEMPLATE_CONFIGS.compact,
  MENU_TEMPLATE_CONFIGS.royal,
];

export function normalizeMenuTemplateId(id?: string | null): MenuTemplateId {
  if (id === 'modern' || id === 'luxury' || id === 'magazine') return 'modern';
  if (id === 'minimal') return 'minimal';
  if (id === 'compact') return 'compact';
  if (id === 'royal' || id === 'zain' || id === 'bistro') return 'royal';
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
  updatedAt?: number;
  shop: Shop;
  products?: Product[];
}
