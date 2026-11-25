import { normalizeStoreSlug, type Product, type Shop } from '../types';
import { toWhatsAppNumber } from './phone';

export function getStoreSlug(shopOrSlug: string | Partial<Shop>): string {
  if (typeof shopOrSlug === 'string') {
    return (
      normalizeStoreSlug(shopOrSlug) ||
      shopOrSlug.trim().replace(/^\/+|\/+$/g, '') ||
      'mtgry-algdyd'
    );
  }
  const candidates = [
    shopOrSlug.storeSlug,
    shopOrSlug.nameEn,
    shopOrSlug.nameAr,
    shopOrSlug.id,
  ];
  for (const val of candidates) {
    if (val) {
      const norm = normalizeStoreSlug(val);
      if (norm) return norm;
    }
  }
  return shopOrSlug.id || 'mtgry-algdyd';
}

export function getAbsoluteMenuUrl(
  shopOrSlug: string | Partial<Shop>,
  tableLabel?: string
): string {
  const slug = getStoreSlug(shopOrSlug);
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  const baseUrl = `${origin}/menu/${slug}`;
  if (tableLabel && tableLabel.trim()) {
    return `${baseUrl}?table=${encodeURIComponent(tableLabel.trim())}`;
  }
  return baseUrl;
}

export function getWhatsAppShareUrl(menuUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(menuUrl)}`;
}

export async function copyMenuLink(menuUrl: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(menuUrl);
      return true;
    } catch {
      // fall through to textarea execCommand fallback
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = menuUrl;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, menuUrl.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function notifyAdminStoreSync(reason = 'store-updated'): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('ghazalo_admin_sync');
      ch.postMessage({ type: reason, ts: Date.now() });
      ch.close();
    }
  } catch {
    // ignore unsupported BroadcastChannel
  }
}

export async function syncPublicStoreSnapshot(
  shop: Shop,
  products?: Product[]
): Promise<boolean> {
  try {
    const res = await fetch('/api/public-stores', {
      method: 'POST',
      headers: (() => {
        const h: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
          const t = localStorage.getItem('token');
          if (t) h.Authorization = `Bearer ${t}`;
          const a = localStorage.getItem('adminToken');
          if (a) h['x-admin-token'] = a;
        } catch {
          // ignore
        }
        return h;
      })(),
      body: JSON.stringify({
        shop,
        products,
      }),
    });
    if (res.ok) {
      notifyAdminStoreSync('store-snapshot-synced');
    }
    return res.ok;
  } catch {
    return false;
  }
}

export function buildWhatsAppOrderUrl(input: {
  whatsappPhone?: string;
  shopName: string;
  orderNumber?: string;
  orderType: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  floor?: string;
  apartment?: string;
  tableLabel?: string;
  notes?: string;
  paymentMethod?: string;
  itemsSummary: string[];
  subtotal: number;
  deliveryFee?: number;
  serviceFee?: number;
  vat?: number;
  packagingFee?: number;
  total: number;
  isEn?: boolean;
}): string {
  const cleanPhone = toWhatsAppNumber(input.whatsappPhone);
  const typeLabel =
    input.orderType === 'delivery'
      ? input.isEn
        ? 'Delivery'
        : 'توصيل'
      : input.orderType === 'pickup'
        ? input.isEn
          ? 'Pickup'
          : 'استلام من الفرع'
        : input.orderType === 'table'
          ? input.isEn
            ? `Table (${input.tableLabel || '-'})`
            : `طاولة (${input.tableLabel || '-'})`
          : input.isEn
            ? 'Dine-in'
            : 'محلي';

  const lines: string[] = [
    input.isEn
      ? `*New Order — ${input.shopName}*${input.orderNumber ? ` (#${input.orderNumber})` : ''}`
      : `*طلب جديد — ${input.shopName}*${input.orderNumber ? ` (#${input.orderNumber})` : ''}`,
    `${input.isEn ? 'Order Type' : 'نوع الطلب'}: ${typeLabel}`,
    ...(input.customerName ? [`${input.isEn ? 'Customer' : 'الاسم'}: ${input.customerName}`] : []),
    ...(input.customerPhone ? [`${input.isEn ? 'Phone' : 'الهاتف'}: ${input.customerPhone}`] : []),
    ...(input.address
      ? [
          `${input.isEn ? 'Address' : 'العنوان'}: ${input.address}${
            input.floor ? ` - ${input.isEn ? 'Floor' : 'دور'} ${input.floor}` : ''
          }${input.apartment ? ` - ${input.isEn ? 'Apt' : 'شقة'} ${input.apartment}` : ''}`,
        ]
      : []),
    ...(input.paymentMethod
      ? [`${input.isEn ? 'Payment' : 'الدفع'}: ${input.paymentMethod}`]
      : []),
    '',
    input.isEn ? '*Items:*' : '*الأصناف:*',
    ...input.itemsSummary.map((line) => `• ${line}`),
    '',
    `${input.isEn ? 'Subtotal' : 'المجموع الفرعي'}: ${input.subtotal}`,
    ...(input.deliveryFee && input.deliveryFee > 0
      ? [`${input.isEn ? 'Delivery' : 'التوصيل'}: ${input.deliveryFee}`]
      : []),
    ...(input.serviceFee && input.serviceFee > 0
      ? [`${input.isEn ? 'Service' : 'الخدمة'}: ${input.serviceFee}`]
      : []),
    ...(input.vat && input.vat > 0 ? [`${input.isEn ? 'VAT' : 'الضريبة'}: ${input.vat}`] : []),
    ...(input.packagingFee && input.packagingFee > 0
      ? [`${input.isEn ? 'Packaging' : 'التغليف'}: ${input.packagingFee}`]
      : []),
    `*${input.isEn ? 'Grand Total' : 'الإجمالي النهائي'}: ${input.total}*`,
    ...(input.notes ? [`${input.isEn ? 'Notes' : 'ملاحظات'}: ${input.notes}`] : []),
  ];

  const encoded = encodeURIComponent(lines.join('\n'));
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export async function fetchPublicStoreSnapshot(
  slug: string
): Promise<{ shop: Shop; products: Product[]; updatedAt?: number } | null> {
  try {
    const res = await fetch(`/api/public-stores/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      found?: boolean;
      shop?: Shop;
      products?: Product[];
      updatedAt?: number;
    };
    if (data.ok && data.found && data.shop) {
      return {
        shop: data.shop,
        products: Array.isArray(data.products) ? data.products : [],
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}
