import type { OrderType, Shop } from '../types';

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  deliveryFee: number;
  freeDeliveryApplied: boolean;
  serviceFee: number;
  serviceFeePct: number;
  vat: number;
  vatPct: number;
  packagingFee: number;
  rawTotal: number;
  roundingDiff: number;
  total: number;
  hasExtraFees: boolean;
}

export interface CalculateOrderTotalsOptions {
  discount?: number;
  orderType?: OrderType;
  deliveryFee?: number;
  freeDelivery?: boolean;
  freeDeliveryMinOrder?: number;
  enableServiceFee?: boolean;
  serviceFeePct?: number;
  enableVat?: boolean;
  vatPct?: number;
  enablePackagingFee?: boolean;
  packagingFee?: number;
  forceZeroFeesGlobally?: boolean;
  roundForCashier?: boolean;
}

/**
 * Computes order totals according to Ghazalo SaaS rules:
 * - Zero hidden fees by default (serviceFee, VAT, packagingFee all 0 unless explicitly enabled).
 * - If forceZeroFeesGlobally is enabled by Admin, serviceFee, VAT, packagingFee are forced to 0.
 * - Delivery fee applies only for 'delivery' orders unless freeDelivery is ON or subtotal >= freeDeliveryMinOrder.
 * - Final checkout equation (with no optional fees enabled): Total = Food Subtotal (after discount) + Delivery Fee.
 */
export function calculateOrderTotals(
  subtotal: number,
  optionsOrDiscount: CalculateOrderTotalsOptions | number = {},
  legacyRoundForCashier = false,
  legacyApplyTaxAndService = false
): OrderTotals {
  const opts: CalculateOrderTotalsOptions =
    typeof optionsOrDiscount === 'number'
      ? {
          discount: optionsOrDiscount,
          roundForCashier: legacyRoundForCashier,
          enableServiceFee: legacyApplyTaxAndService,
          serviceFeePct: legacyApplyTaxAndService ? 12 : 0,
          enableVat: legacyApplyTaxAndService,
          vatPct: legacyApplyTaxAndService ? 14 : 0,
        }
      : optionsOrDiscount;

  const safeSubtotal = round2(Math.max(0, Number(subtotal) || 0));
  const safeDiscount = round2(Math.min(safeSubtotal, Math.max(0, Number(opts.discount) || 0)));
  const afterDiscount = round2(Math.max(0, safeSubtotal - safeDiscount));

  // Delivery Calculation
  const isDelivery = (opts.orderType || 'delivery') === 'delivery';
  const configuredDelivery = Math.max(0, Number(opts.deliveryFee) || 0);
  const minFreeThreshold = Math.max(0, Number(opts.freeDeliveryMinOrder) || 0);
  const reachedMinFree = minFreeThreshold > 0 && afterDiscount >= minFreeThreshold;
  const freeDeliveryApplied = !isDelivery || Boolean(opts.freeDelivery) || reachedMinFree;
  const deliveryFee = freeDeliveryApplied ? 0 : round2(configuredDelivery);

  // Optional Fees (All OFF / 0 by default, or forced 0 by Admin global toggle)
  const disableExtraFees = Boolean(opts.forceZeroFeesGlobally);

  const servicePct =
    !disableExtraFees && opts.enableServiceFee
      ? Math.max(0, Number(opts.serviceFeePct) || 0)
      : 0;
  const vatPct =
    !disableExtraFees && opts.enableVat
      ? Math.max(0, Number(opts.vatPct) || 0)
      : 0;

  const serviceFee = servicePct > 0 ? round2((afterDiscount * servicePct) / 100) : 0;
  const vat = vatPct > 0 ? round2(((afterDiscount + serviceFee) * vatPct) / 100) : 0;
  const packagingFee =
    !disableExtraFees && opts.enablePackagingFee && afterDiscount > 0
      ? round2(Math.max(0, Number(opts.packagingFee) || 0))
      : 0;

  const rawTotal = round2(afterDiscount + deliveryFee + serviceFee + vat + packagingFee);
  const total = opts.roundForCashier ? Math.round(rawTotal) : rawTotal;
  const roundingDiff = opts.roundForCashier ? round2(total - rawTotal) : 0;
  const hasExtraFees = serviceFee > 0 || vat > 0 || packagingFee > 0;

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    afterDiscount,
    deliveryFee,
    freeDeliveryApplied,
    serviceFee,
    serviceFeePct: servicePct,
    vat,
    vatPct,
    packagingFee,
    rawTotal,
    roundingDiff,
    total,
    hasExtraFees,
  };
}

export function getShopEffectiveDeliveryFee(shop: Shop, orderSubtotal = 0): number {
  if (shop.freeDelivery) return 0;
  const minThreshold = Math.max(0, Number(shop.freeDeliveryMinOrder) || 0);
  if (minThreshold > 0 && orderSubtotal >= minThreshold) return 0;
  return Math.max(0, Number(shop.deliveryFee) || 0);
}

export function getCurrencyLabel(country?: string): string {
  switch (country) {
    case 'السعودية':
      return 'ر.س';
    case 'الإمارات':
      return 'د.إ';
    case 'الكويت':
      return 'د.ك';
    case 'قطر':
      return 'ر.ق';
    default:
      return 'جنيه';
  }
}

export function formatMoney(amount: number, country?: string, decimals = 2): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isWhole = Math.abs(safe - Math.round(safe)) < 0.005;
  const usedDecimals = isWhole && decimals === 2 ? 0 : decimals;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: usedDecimals,
    maximumFractionDigits: usedDecimals,
  });
  return `${formatted} ${getCurrencyLabel(country)}`;
}

export function formatCompactMoney(amount: number, country?: string): string {
  const isWhole = Math.abs(amount - Math.round(amount)) < 0.005;
  return formatMoney(amount, country, isWhole ? 0 : 2);
}

export function getShopThemeHex(colorName?: string): string {
  switch (colorName) {
    case 'أحمر':
      return '#B45309';
    case 'أزرق مخضر':
      return '#0D9488';
    case 'أسود':
      return '#1E293B';
    case 'أخضر':
      return '#16A34A';
    case 'لون آخر':
      return '#059669';
    case 'برتقالي':
    default:
      return '#FF6A00';
  }
}

export interface ShopAccessState {
  isActive: boolean;
  reason: 'active' | 'monthly' | 'yearly' | 'trial' | 'trial_expired' | 'subscription_expired' | 'suspended';
  daysLeft: number;
  hoursLeft: number;
  isExpiringSoon: boolean;
  expiresAt: number;
  expirationDateFormatted: string;
}

export function formatArabicDate(timestamp?: number): string {
  if (!timestamp || timestamp <= 0) return '-';
  try {
    return new Date(timestamp).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return new Date(timestamp).toLocaleDateString();
  }
}

export function getShopAccessState(shop: Shop): ShopAccessState {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  if (shop.subscriptionStatus === 'suspended') {
    return {
      isActive: false,
      reason: 'suspended',
      daysLeft: 0,
      hoursLeft: 0,
      isExpiringSoon: false,
      expiresAt: 0,
      expirationDateFormatted: '-',
    };
  }

  if (shop.subscriptionStatus === 'expired') {
    const exp = shop.subscriptionExpiresAt || shop.trialEndsAt || 0;
    return {
      isActive: false,
      reason: 'trial_expired',
      daysLeft: 0,
      hoursLeft: 0,
      isExpiringSoon: false,
      expiresAt: exp,
      expirationDateFormatted: formatArabicDate(exp),
    };
  }

  const isPaidStatus =
    shop.subscriptionStatus === 'active' ||
    shop.subscriptionStatus === 'monthly' ||
    shop.subscriptionStatus === 'yearly';

  if (isPaidStatus) {
    if (shop.approvedByAdmin === false) {
      return {
        isActive: false,
        reason: 'suspended',
        daysLeft: 0,
        hoursLeft: 0,
        isExpiringSoon: false,
        expiresAt: 0,
        expirationDateFormatted: '-',
      };
    }
    const exp = shop.subscriptionExpiresAt || 0;
    if (!exp || now >= exp) {
      return {
        isActive: false,
        reason: 'subscription_expired',
        daysLeft: 0,
        hoursLeft: 0,
        isExpiringSoon: false,
        expiresAt: exp,
        expirationDateFormatted: formatArabicDate(exp),
      };
    }
    const daysLeft = Math.max(1, Math.ceil((exp - now) / dayMs));
    const hoursLeft = Math.max(1, Math.ceil((exp - now) / hourMs));
    const paidReason: 'active' | 'monthly' | 'yearly' =
      shop.subscriptionStatus === 'yearly' || daysLeft > 45
        ? 'yearly'
        : shop.subscriptionStatus === 'monthly'
          ? 'monthly'
          : 'active';

    return {
      isActive: true,
      reason: paidReason,
      daysLeft,
      hoursLeft,
      isExpiringSoon: daysLeft <= 1,
      expiresAt: exp,
      expirationDateFormatted: formatArabicDate(exp),
    };
  }

  // Trial period (7 days)
  const trialEnds = shop.trialEndsAt || 0;
  if (!trialEnds || now >= trialEnds) {
    return {
      isActive: false,
      reason: 'trial_expired',
      daysLeft: 0,
      hoursLeft: 0,
      isExpiringSoon: false,
      expiresAt: trialEnds,
      expirationDateFormatted: formatArabicDate(trialEnds),
    };
  }

  const daysLeft = Math.max(1, Math.ceil((trialEnds - now) / dayMs));
  const hoursLeft = Math.max(1, Math.ceil((trialEnds - now) / hourMs));
  return {
    isActive: true,
    reason: 'trial',
    daysLeft,
    hoursLeft,
    isExpiringSoon: daysLeft <= 1,
    expiresAt: trialEnds,
    expirationDateFormatted: formatArabicDate(trialEnds),
  };
}
