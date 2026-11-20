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
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

export const ADMIN_EMAIL = 'alsadatmohammad399@gmail.com';
export const ADMIN_PORTAL_KEY: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_PORTAL_KEY) ||
  'ghz-991-owner';

export type MenuTemplateId = 'classic' | 'luxury' | 'magazine' | 'compact';

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
  menuTemplate?: MenuTemplateId;
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
  createdAt?: unknown;
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
