import type { Shop } from '../types';

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  serviceFee: number;
  vat: number;
  rawTotal: number;
  roundingDiff: number;
  total: number;
}

/**
 * Exact tax & fee math matching Sofrtek POS & Storefront specifications:
 * - Service fee = 12% of subtotal after discount
 * - VAT = 14% of (subtotal after discount + service fee)
 * - Cashier POS optionally rounds total to nearest integer and tracks roundingDiff
 */
export function calculateOrderTotals(
  subtotal: number,
  discount = 0,
  roundForCashier = false
): OrderTotals {
  const safeSubtotal = round2(Math.max(0, subtotal));
  const safeDiscount = round2(Math.min(safeSubtotal, Math.max(0, discount)));
  const afterDiscount = round2(Math.max(0, safeSubtotal - safeDiscount));
  const serviceFee = round2(afterDiscount * 0.12);
  const vat = round2((afterDiscount + serviceFee) * 0.14);
  const rawTotal = round2(afterDiscount + serviceFee + vat);
  const total = roundForCashier ? Math.round(rawTotal) : rawTotal;
  const roundingDiff = roundForCashier ? round2(total - rawTotal) : 0;

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    afterDiscount,
    serviceFee,
    vat,
    rawTotal,
    roundingDiff,
    total,
  };
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
      return 'ج.م';
  }
}

export function formatMoney(amount: number, country?: string, decimals = 2): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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
      return '#B45309'; // Warm amber-terracotta alternative avoiding pure red
    case 'أزرق مخضر':
      return '#0D9488';
    case 'أسود':
      return '#1E293B';
    case 'لون آخر':
      return '#059669';
    case 'أخضر':
    default:
      return '#16A34A';
  }
}

export interface ShopAccessState {
  isActive: boolean;
  reason: 'active' | 'trial' | 'trial_expired' | 'subscription_expired' | 'suspended';
  daysLeft: number;
  hoursLeft: number;
}

export function getShopAccessState(shop: Shop): ShopAccessState {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  if (shop.subscriptionStatus === 'suspended') {
    return { isActive: false, reason: 'suspended', daysLeft: 0, hoursLeft: 0 };
  }

  if (shop.subscriptionStatus === 'expired') {
    return { isActive: false, reason: 'trial_expired', daysLeft: 0, hoursLeft: 0 };
  }

  if (shop.subscriptionStatus === 'active') {
    if (shop.approvedByAdmin === false) {
      return { isActive: false, reason: 'suspended', daysLeft: 0, hoursLeft: 0 };
    }
    const exp = shop.subscriptionExpiresAt || now + 30 * dayMs;
    if (now >= exp) {
      return { isActive: false, reason: 'subscription_expired', daysLeft: 0, hoursLeft: 0 };
    }
    return {
      isActive: true,
      reason: 'active',
      daysLeft: Math.max(1, Math.ceil((exp - now) / dayMs)),
      hoursLeft: Math.max(1, Math.ceil((exp - now) / hourMs)),
    };
  }

  // Trial period (7 days)
  const trialEnds = shop.trialEndsAt || now + 7 * dayMs;
  if (now >= trialEnds) {
    return { isActive: false, reason: 'trial_expired', daysLeft: 0, hoursLeft: 0 };
  }

  return {
    isActive: true,
    reason: 'trial',
    daysLeft: Math.max(1, Math.ceil((trialEnds - now) / dayMs)),
    hoursLeft: Math.max(1, Math.ceil((trialEnds - now) / hourMs)),
  };
}

