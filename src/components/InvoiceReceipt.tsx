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

export const InvoiceReceipt: React.FC<InvoiceReceiptProps> = ({
  shop,
  data,
  isEn = false,
  compactThermal = false,
}) => {
  const displayShopName = getShopDisplayName(shop, isEn);
  const menuUrl = getAbsoluteMenuUrl(shop);
  const d = new Date(data.createdAt || Date.now());
  const loc = isEn ? 'en-US' : 'ar-EG';
  const dateStr = d.toLocaleDateString('en-CA').replace(/-/g, '/');
  const timeStr = d.toLocaleTimeString(isEn ? 'en-US' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  void loc;

  const isDelivery = data.orderType === 'delivery';
  const isPickup = data.orderType === 'pickup';
  const orderTypeLabel = isDelivery
    ? tx(isEn, 'توصيل', 'Delivery')
    : isPickup
      ? tx(isEn, 'تيك اواي', 'Take away')
      : data.orderType === 'table'
        ? tx(isEn, 'طاولة', 'Table')
        : tx(isEn, 'صالة', 'Dine-in');

  const cashier =
    data.source === 'menu'
      ? tx(isEn, 'طلب أونلاين', 'Online order')
      : tx(isEn, 'الكاشير', 'Cashier');

  const paidNum = Number(data.paidAmount || 0);
  const changeDue = paidNum > data.total ? Number((paidNum - data.total).toFixed(2)) : 0;

  const rows: ParsedLine[] =
    data.cartItems && data.cartItems.length > 0
      ? data.cartItems.map((c) => ({
          name: c.note ? `${c.product.name} (${c.note})` : c.product.name,
          qty: c.quantity,
          amount: num(c.unitPrice * c.quantity),
        }))
      : (data.itemSummary || []).map(parseSummaryLine);

  const shopAddress = [shop.city, shop.address].filter(Boolean).join(' - ');
  const isBranchPickupText = (a?: string) => !!a && /الاستلام من|Branch Pickup|استلام من الفرع/.test(a);
  const customerAddress = isDelivery && data.address && !isBranchPickupText(data.address) ? data.address : '';

  const line = 'border-b border-dashed border-black';
  const metaRow = 'flex items-baseline justify-between gap-3';

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      data-receipt={isDelivery ? 'delivery' : isPickup ? 'pickup' : 'other'}
      className={`receipt-paper bg-white text-black mx-auto w-full ${
        compactThermal ? 'max-w-[302px] p-2 text-[12px]' : 'max-w-[340px] p-4 text-[12px] rounded-xl border border-slate-300'
      }`}
      style={{ fontFamily: "'Cairo','Tajawal','Segoe UI',Tahoma,sans-serif", lineHeight: 1.45 }}
    >
      {/* Brand */}
      <div className="text-center pb-2">
        {shop.logoUrl && (
          <img
            src={shop.logoUrl}
            alt={displayShopName}
            className="w-14 h-14 object-contain mx-auto mb-1"
            style={{ filter: 'grayscale(1) contrast(1.4)' }}
          />
        )}
        <h2 className="text-[22px] font-black leading-tight break-words">{displayShopName}</h2>
      </div>

      {/* Big order number + type */}
      <div className="flex items-stretch gap-1.5 pb-2" dir="rtl">
        <div className="flex-1 border-2 border-black rounded-sm text-center py-1 font-black text-[28px] leading-none flex items-center justify-center tabular-nums" dir="ltr">
          {data.orderNumber}
        </div>
        <div className="w-[38%] border-2 border-black rounded-sm text-center font-black text-[16px] flex items-center justify-center leading-tight px-1">
          {orderTypeLabel}
        </div>
      </div>
      <div className="text-center text-[11px] font-bold pb-1.5">
        {isDelivery
          ? tx(isEn, 'توصيل للعميل', 'Delivery to customer')
          : isPickup
            ? tx(isEn, 'استلام من المحل', 'Pickup at the shop')
            : ''}
      </div>

      {/* Meta */}
      <div className={`py-1.5 space-y-0.5 border-t border-black ${line}`}>
        <div className={metaRow}>
          <span className="font-bold">{tx(isEn, 'التاريخ:', 'Date:')}</span>
          <span className="font-extrabold tabular-nums" dir="ltr">{dateStr}</span>
        </div>
        <div className={metaRow}>
          <span className="font-bold">{tx(isEn, 'الوقت:', 'Time:')}</span>
          <span className="font-extrabold tabular-nums" dir="ltr">{timeStr}</span>
        </div>
        <div className={metaRow}>
          <span className="font-bold">{tx(isEn, 'كاشير:', 'Cashier:')}</span>
          <span className="font-extrabold">{cashier}</span>
        </div>
        {data.tableLabel && (
          <div className={metaRow}>
            <span className="font-bold">{tx(isEn, 'الطاولة:', 'Table:')}</span>
            <span className="font-extrabold">{data.tableLabel}</span>
          </div>
        )}
        <div className={metaRow}>
          <span className="font-bold">{tx(isEn, 'اسم العميل:', 'Customer:')}</span>
          <span className="font-extrabold">{data.customerName || ''}</span>
        </div>
        {data.customerPhone && (
          <div className={metaRow}>
            <span className="font-bold">{tx(isEn, 'التليفون:', 'Phone:')}</span>
            <span className="font-extrabold tabular-nums" dir="ltr">{data.customerPhone}</span>
          </div>
        )}
        {isDelivery && customerAddress && (
          <div className="pt-0.5">
            <span className="font-bold">{tx(isEn, 'عنوان التوصيل:', 'Deliver to:')} </span>
            <span className="font-extrabold">
              {customerAddress}
              {data.floor ? ` - ${tx(isEn, 'دور', 'Fl')} ${data.floor}` : ''}
              {data.apartment ? ` - ${tx(isEn, 'شقة', 'Apt')} ${data.apartment}` : ''}
            </span>
          </div>
        )}
        {isDelivery && data.driverName && (
          <div className={metaRow}>
            <span className="font-bold">{tx(isEn, 'الطيار:', 'Driver:')}</span>
            <span className="font-extrabold">{data.driverName}</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div className={`py-1.5 ${line}`}>
        {rows.map((r, idx) => (
          <div key={idx} className="py-1 border-b border-dotted border-slate-400 last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-extrabold text-[13px] flex-1 break-words">{r.name}</span>
              {r.qty !== null && (
                <span className="font-black tabular-nums w-7 text-center" dir="ltr">{r.qty}</span>
              )}
              <span className="font-extrabold tabular-nums w-14 text-end" dir="ltr">{r.amount ?? ''}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="py-1.5 space-y-0.5">
        {(Number(data.discount || 0) > 0 ||
          (isDelivery && Number(data.deliveryFee || 0) > 0) ||
          Number(data.serviceFee || 0) > 0 ||
          Number(data.vat || 0) > 0 ||
          Number(data.packagingFee || 0) > 0) && (
          <>
            <div className={metaRow}>
              <span className="font-bold">{tx(isEn, 'سعر الأصناف', 'Subtotal')}</span>
              <span className="tabular-nums font-bold" dir="ltr">{num(data.subtotal)}</span>
            </div>
            {Number(data.discount || 0) > 0 && (
              <div className={metaRow}>
                <span className="font-bold">{tx(isEn, 'الخصم', 'Discount')}</span>
                <span className="tabular-nums font-bold" dir="ltr">-{num(Number(data.discount))}</span>
              </div>
            )}
            {isDelivery && Number(data.deliveryFee || 0) > 0 && (
              <div className={metaRow}>
                <span className="font-bold">{tx(isEn, 'خدمة التوصيل', 'Delivery fee')}</span>
                <span className="tabular-nums font-bold" dir="ltr">{num(Number(data.deliveryFee))}</span>
              </div>
            )}
            {Number(data.serviceFee || 0) > 0 && (
              <div className={metaRow}>
                <span className="font-bold">{tx(isEn, 'رسوم الخدمة', 'Service')}</span>
                <span className="tabular-nums font-bold" dir="ltr">{num(Number(data.serviceFee))}</span>
              </div>
            )}
            {Number(data.vat || 0) > 0 && (
              <div className={metaRow}>
                <span className="font-bold">{tx(isEn, 'الضريبة', 'VAT')}</span>
                <span className="tabular-nums font-bold" dir="ltr">{num(Number(data.vat))}</span>
              </div>
            )}
            {Number(data.packagingFee || 0) > 0 && (
              <div className={metaRow}>
                <span className="font-bold">{tx(isEn, 'التغليف', 'Packaging')}</span>
                <span className="tabular-nums font-bold" dir="ltr">{num(Number(data.packagingFee))}</span>
              </div>
            )}
          </>
        )}
        <div className="flex items-stretch gap-1.5 pt-1" dir="rtl">
          <div className="border-2 border-black rounded-sm px-2 flex items-center font-black text-[14px]">
            {tx(isEn, 'الاجمالي :', 'Total:')}
          </div>
          <div className="flex-1 border-2 border-black rounded-sm text-center font-black text-[24px] py-0.5 tabular-nums" dir="ltr">
            {Number(data.total).toFixed(2)}
          </div>
        </div>
        <div className={`${metaRow} pt-1`}>
          <span className="font-bold">{tx(isEn, 'الدفع:', 'Payment:')}</span>
          <span className="font-extrabold">{data.paymentMethod || tx(isEn, 'نقداً', 'Cash')}</span>
        </div>
        {paidNum > 0 && changeDue > 0 && (
          <div className={metaRow}>
            <span className="font-bold">{tx(isEn, 'المدفوع / الباقي:', 'Paid / Change:')}</span>
            <span className="tabular-nums font-bold" dir="ltr">{paidNum} / {changeDue}</span>
          </div>
        )}
        {data.notes && (
          <div className="mt-1 p-1.5 border border-black rounded-sm text-[11px] font-bold">
            {tx(isEn, 'ملاحظات:', 'Notes:')} {data.notes}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-dashed border-black text-center space-y-0.5">
        {shopAddress && (
          <div className="text-[11px] font-bold">
            {tx(isEn, 'العنوان: ', 'Address: ')}
            {shopAddress}
          </div>
        )}
        {shop.whatsapp && (
          <div className="text-[12px] font-black tabular-nums" dir="ltr">
            {tx(isEn, 'ت: ', 'Tel: ')}
            {shop.whatsapp}
          </div>
        )}
        <div className="flex justify-center pt-1.5">
          <QrCodeImage value={menuUrl} size={compactThermal ? 70 : 78} className="p-0.5 border-black" />
        </div>
        <div className="text-[10px] font-bold">
          {tx(isEn, 'شكراً لزيارتكم · Ghazalo', 'Thank you · Ghazalo')}
        </div>
      </div>
    </div>
  );
};
