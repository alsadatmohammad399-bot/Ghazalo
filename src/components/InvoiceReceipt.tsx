import React from 'react';
import { QrCodeImage } from './QrToolkit';
import { formatCompactMoney } from '../utils/calculations';
import { getAbsoluteMenuUrl } from '../utils/menuLink';
import { getShopDisplayName, tx } from '../utils/uiLang';
import type { CartItem, Order, Shop } from '../types';

export interface InvoiceReceiptData {
  orderNumber: string;
  createdAt?: number;
  orderType: 'delivery' | 'pickup' | 'dine_in' | 'table';
  paymentMethod?: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  floor?: string;
  apartment?: string;
  tableLabel?: string;
  driverName?: string;
  notes?: string;
  subtotal: number;
  discount?: number;
  deliveryFee?: number;
  serviceFee?: number;
  serviceFeePct?: number;
  vat?: number;
  vatPct?: number;
  packagingFee?: number;
  total: number;
  paidAmount?: number;
  cartItems?: CartItem[];
  itemSummary?: string[];
  source?: 'menu' | 'cashier';
}

interface InvoiceReceiptProps {
  shop: Shop;
  data: InvoiceReceiptData;
  isEn?: boolean;
  compactThermal?: boolean;
}

export function orderToInvoiceData(order: Order, shop: Shop): InvoiceReceiptData {
  return {
    orderNumber: order.orderNumber || 'POS',
    createdAt:
      typeof order.createdAt === 'number'
        ? order.createdAt
        : typeof (order.createdAt as { toMillis?: () => number } | undefined)?.toMillis === 'function'
          ? (order.createdAt as { toMillis: () => number }).toMillis()
          : Date.now(),
    orderType: order.orderType,
    paymentMethod: order.paymentMethod || 'نقداً',
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    address: order.address,
    floor: order.floor,
    apartment: order.apartment,
    tableLabel: order.tableLabel,
    driverName: order.driverName,
    notes: order.notes,
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.discount || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    serviceFee: Number(order.serviceFee || 0),
    serviceFeePct: shop.serviceFeePct,
    vat: Number(order.vat || 0),
    vatPct: shop.vatPct,
    packagingFee: Number(order.packagingFee || 0),
    total: Number(order.total || 0),
    paidAmount: order.paidAmount,
    itemSummary: order.itemSummary || [],
    source: order.source,
  };
}

interface ParsedLine {
  name: string;
  qty: number | null;
  amount: string | null;
}

function parseSummaryLine(line: string): ParsedLine {
  // "name (note) × 2 (180)"  or  "name (180)"  or plain text
  let rest = line.trim();
  let amount: string | null = null;
  const am = rest.match(/\(([\d.,]+)\)\s*$/);
  if (am) {
    amount = am[1];
    rest = rest.slice(0, am.index).trim();
  }
  let qty: number | null = null;
  const qm = rest.match(/[×xX*]\s*(\d+)\s*$/);
  if (qm) {
    qty = Number(qm[1]);
    rest = rest.slice(0, qm.index).trim();
  }
  return { name: rest || line, qty, amount };
}

const num = (n: number) => (Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2));

const NAVY = '#0f172a';
const AMBER = '#f59e0b';

export const InvoiceReceipt: React.FC<InvoiceReceiptProps> = ({
  shop,
  data,
  isEn = false,
  compactThermal = false,
}) => {
  const displayShopName = getShopDisplayName(shop, isEn);
  const secondaryName = isEn ? shop.nameAr : shop.nameEn || '';
  const menuUrl = getAbsoluteMenuUrl(shop);
  const d = new Date(data.createdAt || Date.now());
  const dateStr = d.toLocaleDateString('en-CA').replace(/-/g, '/');
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const isDelivery = data.orderType === 'delivery';
  const isPickup = data.orderType === 'pickup';
  const typeLabel = isDelivery
    ? tx(isEn, 'توصيل', 'Delivery')
    : isPickup
      ? tx(isEn, 'تيك اواي', 'Take away')
      : data.orderType === 'table'
        ? data.tableLabel
          ? tx(isEn, `طاولة ${data.tableLabel}`, `Table ${data.tableLabel}`)
          : tx(isEn, 'طاولة', 'Table')
        : tx(isEn, 'صالة', 'Dine-in');
  const typeSub = isDelivery
    ? tx(isEn, 'توصيل للعميل', 'Delivery to customer')
    : isPickup
      ? tx(isEn, 'استلام من المحل', 'Pickup at the shop')
      : '';
  const sourceLabel =
    data.source === 'menu' ? tx(isEn, 'طلب أونلاين', 'Online order') : tx(isEn, 'الكاشير', 'Cashier');

  const rows: ParsedLine[] =
    data.cartItems && data.cartItems.length > 0
      ? data.cartItems.map((c) => ({
          name: c.note ? `${c.product.name} (${c.note})` : c.product.name,
          qty: c.quantity,
          amount: num(c.unitPrice * c.quantity),
        }))
      : (data.itemSummary || []).map(parseSummaryLine);

  const shopAddress = [shop.address, shop.city].filter(Boolean).join('، ');
  const isBranchPickupText = (a?: string) => !!a && /الاستلام من|Branch Pickup|استلام من الفرع/.test(a);
  const customerAddress = isDelivery && data.address && !isBranchPickupText(data.address) ? data.address : '';
  const currency = tx(isEn, 'ج.م', 'EGP');
  const paidNum = Number(data.paidAmount || 0);
  const changeDue = paidNum > data.total ? Number((paidNum - data.total).toFixed(2)) : 0;
  const hasExtras =
    Number(data.discount || 0) > 0 ||
    Number(data.serviceFee || 0) > 0 ||
    Number(data.vat || 0) > 0 ||
    Number(data.packagingFee || 0) > 0;

  const muted = { color: '#64748b' } as const;
  const line = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-3" style={{ fontSize: 12.5, ...muted }}>
      <span>{label}</span>
      <span className="tabular-nums font-bold" dir="ltr">{value}</span>
    </div>
  );

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      data-receipt={isDelivery ? 'delivery' : isPickup ? 'pickup' : 'other'}
      className={`receipt-paper bg-white mx-auto w-full overflow-hidden ${
        compactThermal ? 'max-w-[302px]' : 'max-w-[360px] rounded-2xl border border-slate-200 shadow-sm'
      }`}
      style={{
        color: NAVY,
        fontFamily: "'Cairo','Tajawal','Segoe UI',Tahoma,sans-serif",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {/* Header */}
      <div style={{ padding: compactThermal ? '10px 10px 8px' : '20px 20px 14px' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {shop.logoUrl ? (
              <img
                src={shop.logoUrl}
                alt={displayShopName}
                className="object-cover shrink-0"
                style={{ width: 44, height: 44, borderRadius: '50%', filter: compactThermal ? 'grayscale(1) contrast(1.3)' : undefined }}
              />
            ) : (
              <div
                className="shrink-0 flex items-center justify-center font-black"
                style={{ width: 44, height: 44, borderRadius: '50%', background: NAVY, color: '#fff', fontSize: 22 }}
              >
                {(displayShopName || '?').trim().charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-black break-words" style={{ fontSize: 19, lineHeight: 1.2 }}>{displayShopName}</div>
              {secondaryName && (
                <div className="font-semibold uppercase" style={{ fontSize: 10.5, ...muted }} dir="ltr">
                  {secondaryName}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 text-end" style={{ fontSize: 11 }}>
            <div className="font-bold" style={muted}>{sourceLabel}</div>
            <bdi dir="ltr" className="font-bold tabular-nums" style={{ unicodeBidi: 'isolate', display: 'block' }}>
              {dateStr} · {timeStr}
            </bdi>
          </div>
        </div>

        {/* Order number hero */}
        <div className="flex items-end justify-between gap-2" style={{ marginTop: 16 }}>
          <div>
            <div className="font-extrabold" style={{ fontSize: 11, letterSpacing: 2, ...muted }} dir="ltr">ORDER</div>
            <div className="font-black tabular-nums" dir="ltr" style={{ fontSize: 66, lineHeight: 0.95, letterSpacing: -2 }}>
              #{data.orderNumber}
            </div>
          </div>
          <div className="text-center">
            <div
              className="font-black"
              style={{ background: AMBER, color: '#111', borderRadius: 999, padding: '6px 18px', fontSize: 16, border: compactThermal ? '2px solid #111' : undefined, printColorAdjust: 'exact' }}
            >
              {typeLabel}
            </div>
            {typeSub && <div className="font-semibold" style={{ fontSize: 11, marginTop: 4, ...muted }}>{typeSub}</div>}
          </div>
        </div>

        {data.customerName && (
          <div className="font-extrabold" style={{ marginTop: 12, fontSize: 14 }}>{data.customerName}</div>
        )}

        {/* Address / pickup box */}
        {isDelivery ? (
          (customerAddress || data.customerPhone || data.driverName) && (
            <div style={{ background: '#fff8eb', border: '1px solid #fde1a8', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
              {customerAddress && (
                <>
                  <div className="font-extrabold" style={{ fontSize: 11, color: '#b45309', letterSpacing: 1 }}>
                    {tx(isEn, 'عنوان التوصيل', 'Delivery address')}
                  </div>
                  <div className="font-extrabold" style={{ marginTop: 2 }}>
                    {customerAddress}
                    {data.floor ? ` ، ${tx(isEn, 'دور', 'Floor')} ${data.floor}` : ''}
                    {data.apartment ? ` ، ${tx(isEn, 'شقة', 'Apt')} ${data.apartment}` : ''}
                  </div>
                </>
              )}
              {data.customerPhone && (
                <div className="font-extrabold tabular-nums" dir="ltr" style={{ marginTop: 4, textAlign: isEn ? 'left' : 'right' }}>
                  {data.customerPhone}
                </div>
              )}
              {data.driverName && (
                <div className="font-bold" style={{ marginTop: 4, fontSize: 12 }}>
                  {tx(isEn, 'الطيار: ', 'Driver: ')}
                  {data.driverName}
                </div>
              )}
            </div>
          )
        ) : (
          (isPickup || data.customerPhone) && (
            <div style={{ background: '#f4f6fa', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
              {isPickup && (
                <>
                  <div className="font-extrabold" style={{ fontSize: 11, color: '#475569', letterSpacing: 1 }}>
                    {tx(isEn, 'استلام من المحل', 'Pickup at the shop')}
                  </div>
                  {shopAddress && <div className="font-bold" style={{ marginTop: 2, fontSize: 12.5 }}>{shopAddress}</div>}
                </>
              )}
              {data.customerPhone && (
                <div className="font-extrabold tabular-nums" dir="ltr" style={{ marginTop: 4, textAlign: isEn ? 'left' : 'right' }}>
                  {data.customerPhone}
                </div>
              )}
            </div>
          )
        )}
      </div>

      <div style={{ borderTop: '2px dashed #cbd5e1', margin: '0 14px' }} />

      {/* Items */}
      <div style={{ padding: '6px 20px 2px' }}>
        {rows.map((r, idx) => (
          <div key={idx} style={{ padding: '9px 0', borderBottom: idx === rows.length - 1 ? 0 : '1px solid #eef0f3' }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-extrabold break-words" style={{ fontSize: 14 }}>{r.name}</span>
              {r.amount && <span className="font-extrabold tabular-nums" dir="ltr">{r.amount.includes('.') ? r.amount : `${r.amount}.00`}</span>}
            </div>
            {r.qty !== null && r.amount && (
              <div className="font-semibold tabular-nums" style={{ fontSize: 11.5, color: '#94a3b8' }}>
                {tx(isEn, 'الكمية', 'Qty')} {r.qty}
              </div>
            )}
          </div>
        ))}
        {(hasExtras || (isDelivery && Number(data.deliveryFee || 0) > 0)) && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #eef0f3' }} className="space-y-0.5">
            {line(tx(isEn, 'سعر الأصناف', 'Subtotal'), Number(data.subtotal).toFixed(2))}
            {Number(data.discount || 0) > 0 && line(tx(isEn, 'الخصم', 'Discount'), `-${Number(data.discount).toFixed(2)}`)}
            {isDelivery && Number(data.deliveryFee || 0) > 0 && line(tx(isEn, 'خدمة التوصيل', 'Delivery fee'), Number(data.deliveryFee).toFixed(2))}
            {Number(data.serviceFee || 0) > 0 && line(tx(isEn, 'رسوم الخدمة', 'Service'), Number(data.serviceFee).toFixed(2))}
            {Number(data.vat || 0) > 0 && line(tx(isEn, 'الضريبة', 'VAT'), Number(data.vat).toFixed(2))}
            {Number(data.packagingFee || 0) > 0 && line(tx(isEn, 'التغليف', 'Packaging'), Number(data.packagingFee).toFixed(2))}
          </div>
        )}
      </div>

      {/* Total bar */}
      <div
        className="flex items-center justify-between"
        style={{ margin: '8px 14px 0', padding: '12px 14px', background: NAVY, color: '#fff', borderRadius: 12, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >
        <span className="font-bold">
          {tx(isEn, 'الإجمالي', 'Total')} · {data.paymentMethod || tx(isEn, 'نقداً', 'Cash')}
        </span>
        <span className="font-black tabular-nums" dir="ltr" style={{ fontSize: 28, color: AMBER, lineHeight: 1 }}>
          {num(Number(data.total))}
          <span className="font-semibold" style={{ fontSize: 12, color: '#fff' }}> {currency}</span>
        </span>
      </div>
      {paidNum > 0 && changeDue > 0 && (
        <div className="flex justify-between font-bold tabular-nums" style={{ padding: '6px 20px 0', fontSize: 12, ...muted }}>
          <span>{tx(isEn, 'المدفوع / الباقي', 'Paid / Change')}</span>
          <span dir="ltr">{paidNum} / {changeDue}</span>
        </div>
      )}
      {data.notes && (
        <div className="font-bold" style={{ padding: '8px 20px 0', fontSize: 12, color: '#92400e' }}>
          {tx(isEn, 'ملاحظة: ', 'Note: ')}
          {data.notes}
        </div>
      )}

      {/* Footer */}
      <div className="text-center" style={{ padding: '14px 20px 20px' }}>
        <div className="flex justify-center">
          <QrCodeImage value={menuUrl} size={compactThermal ? 70 : 76} className="p-0.5 border-slate-300" />
        </div>
        {shopAddress && <div className="font-semibold" style={{ fontSize: 11, marginTop: 6, ...muted }}>{shopAddress}</div>}
        {shop.whatsapp && (
          <div className="font-extrabold tabular-nums" dir="ltr" style={{ fontSize: 13 }}>{shop.whatsapp}</div>
        )}
        <div className="font-extrabold" style={{ fontSize: 12, marginTop: 4 }}>
          {tx(isEn, `شكراً لاختياركم ${displayShopName}`, `Thank you for choosing ${displayShopName}`)}
        </div>
      </div>
    </div>
  );
};
