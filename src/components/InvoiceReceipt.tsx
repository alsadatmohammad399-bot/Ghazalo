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
  };
}

function parseSummaryLine(line: string): { label: string; amount: string | null } {
  const match = line.match(/^(.*)\(([^()]+)\)\s*$/);
  if (match && /\d/.test(match[2])) {
    return { label: match[1].trim(), amount: match[2].trim() };
  }
  return { label: line, amount: null };
}

export const InvoiceReceipt: React.FC<InvoiceReceiptProps> = ({
  shop,
  data,
  isEn = false,
  compactThermal = false,
}) => {
  const displayShopName = getShopDisplayName(shop, isEn);
  const menuUrl = getAbsoluteMenuUrl(shop);
  const formattedDate = new Date(data.createdAt || Date.now()).toLocaleString(
    isEn ? 'en-US' : 'ar-EG',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }
  );

  const orderTypeLabel =
    data.orderType === 'delivery'
      ? tx(isEn, 'توصيل', 'Delivery')
      : data.orderType === 'pickup'
        ? tx(isEn, 'استلام من الفرع', 'Pickup')
        : data.orderType === 'table'
          ? tx(isEn, 'طلب طاولة', 'Table Order')
          : tx(isEn, 'محلي / صالة', 'Dine-in');

  const paidNum = Number(data.paidAmount || 0);
  const changeDue = paidNum > data.total ? Number((paidNum - data.total).toFixed(2)) : 0;

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      className={`bg-white text-slate-900 border border-slate-300 rounded-2xl overflow-hidden ${
        compactThermal ? 'max-w-[320px] mx-auto p-3 text-[11px]' : 'p-4 sm:p-5 text-xs'
      }`}
    >
      {/* Invoice Header */}
      <div className="text-center pb-3 border-b-2 border-dashed border-slate-300 space-y-1">
        {shop.logoUrl && (
          <img
            src={shop.logoUrl}
            alt={displayShopName}
            className="w-12 h-12 rounded-full object-cover mx-auto border border-slate-300 bg-white"
          />
        )}
        <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
          {displayShopName}
        </h2>
        {(shop.city || shop.address) && (
          <p className="text-[11px] font-semibold text-slate-600">
            {[shop.city, shop.address].filter(Boolean).join(' - ')}
          </p>
        )}
        {shop.whatsapp && (
          <p className="text-[11px] font-bold text-slate-700 tabular-nums" dir="ltr">
            {shop.whatsapp}
          </p>
        )}
        <div className="pt-1.5 flex items-center justify-center gap-2 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-black text-[11px] tabular-nums">
            {tx(isEn, `فاتورة #${data.orderNumber}`, `Invoice #${data.orderNumber}`)}
          </span>
          <span className="px-2 py-0.5 rounded-md border border-slate-300 bg-slate-50 font-extrabold text-[10px]">
            {orderTypeLabel}
          </span>
        </div>
        <div className="text-[10px] font-semibold text-slate-500 tabular-nums" dir="ltr">
          {formattedDate}
        </div>
      </div>

      {/* Customer & Order Meta Grid */}
      {(data.customerName ||
        data.customerPhone ||
        data.address ||
        data.tableLabel ||
        data.driverName) && (
        <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
          {data.customerName && (
            <div className="flex justify-between gap-2">
              <span className="font-bold text-slate-500">{tx(isEn, 'العميل:', 'Customer:')}</span>
              <span className="font-extrabold text-slate-900">{data.customerName}</span>
            </div>
          )}
          {data.customerPhone && (
            <div className="flex justify-between gap-2">
              <span className="font-bold text-slate-500">{tx(isEn, 'الهاتف:', 'Phone:')}</span>
              <span className="font-extrabold tabular-nums text-slate-900" dir="ltr">
                {data.customerPhone}
              </span>
            </div>
          )}
          {data.tableLabel && (
            <div className="flex justify-between gap-2">
              <span className="font-bold text-slate-500">{tx(isEn, 'الطاولة:', 'Table:')}</span>
              <span className="font-extrabold text-slate-900">{data.tableLabel}</span>
            </div>
          )}
          {data.address && (
            <div className="flex justify-between gap-2">
              <span className="font-bold text-slate-500 shrink-0">
                {tx(isEn, 'العنوان:', 'Address:')}
              </span>
              <span className="font-semibold text-slate-800 text-end">
                {data.address}
                {data.floor ? ` · ${tx(isEn, 'دور', 'Fl')} ${data.floor}` : ''}
                {data.apartment ? ` · ${tx(isEn, 'شقة', 'Apt')} ${data.apartment}` : ''}
              </span>
            </div>
          )}
          {data.driverName && (
            <div className="flex justify-between gap-2">
              <span className="font-bold text-slate-500">{tx(isEn, 'الطيار:', 'Driver:')}</span>
              <span className="font-bold text-slate-800">{data.driverName}</span>
            </div>
          )}
        </div>
      )}

      {/* Bordered Items Table */}
      <div className="py-2.5 border-b-2 border-dashed border-slate-300">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-slate-700 font-black">
              <th className="py-1.5 px-2 text-start">{tx(isEn, 'الصنف', 'Item')}</th>
              <th className="py-1.5 px-1.5 text-center w-12">{tx(isEn, 'الكمية', 'Qty')}</th>
              <th className="py-1.5 px-2 text-end w-20">{tx(isEn, 'السعر', 'Amount')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.cartItems && data.cartItems.length > 0 ? (
              data.cartItems.map((c, idx) => (
                <tr key={`${c.product.id}-${idx}`}>
                  <td className="py-1.5 px-2 font-bold text-slate-900">
                    <div>{c.product.name}</div>
                    {c.note && (
                      <div className="text-[10px] font-semibold text-slate-500">{c.note}</div>
                    )}
                  </td>
                  <td className="py-1.5 px-1.5 text-center font-extrabold tabular-nums">
                    {c.quantity}
                  </td>
                  <td className="py-1.5 px-2 text-end font-extrabold tabular-nums">
                    {formatCompactMoney(c.unitPrice * c.quantity, shop.country, isEn)}
                  </td>
                </tr>
              ))
            ) : (
              (data.itemSummary || []).map((rawLine, idx) => {
                const parsed = parseSummaryLine(rawLine);
                return (
                  <tr key={idx}>
                    <td className="py-1.5 px-2 font-bold text-slate-900" colSpan={parsed.amount ? 2 : 3}>
                      {parsed.label}
                    </td>
                    {parsed.amount && (
                      <td className="py-1.5 px-2 text-end font-extrabold tabular-nums">
                        {parsed.amount}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Totals Breakdown */}
      <div className="py-2.5 space-y-1 text-[11px]">
        <div className="flex justify-between font-bold text-slate-700">
          <span>{tx(isEn, 'سعر الأصناف', 'Subtotal')}</span>
          <span className="tabular-nums">{formatCompactMoney(data.subtotal, shop.country, isEn)}</span>
        </div>
        {Number(data.discount || 0) > 0 && (
          <div className="flex justify-between font-bold text-amber-700">
            <span>{tx(isEn, 'الخصم', 'Discount')}</span>
            <span className="tabular-nums">-{formatCompactMoney(Number(data.discount), shop.country, isEn)}</span>
          </div>
        )}
        {data.orderType === 'delivery' && (
          <div className="flex justify-between font-bold text-slate-700">
            <span>{tx(isEn, 'التوصيل', 'Delivery')}</span>
            <span className="tabular-nums">
              {Number(data.deliveryFee || 0) === 0
                ? tx(isEn, 'مجاناً', 'Free')
                : formatCompactMoney(Number(data.deliveryFee || 0), shop.country, isEn)}
            </span>
          </div>
        )}
        {Number(data.serviceFee || 0) > 0 && (
          <div className="flex justify-between font-bold text-slate-700">
            <span>
              {tx(
                isEn,
                `رسوم الخدمة${data.serviceFeePct ? ` (${data.serviceFeePct}%)` : ''}`,
                `Service${data.serviceFeePct ? ` (${data.serviceFeePct}%)` : ''}`
              )}
            </span>
            <span className="tabular-nums">{Number(data.serviceFee).toFixed(2)}</span>
          </div>
        )}
        {Number(data.vat || 0) > 0 && (
          <div className="flex justify-between font-bold text-slate-700">
            <span>
              {tx(
                isEn,
                `الضريبة${data.vatPct ? ` (${data.vatPct}%)` : ''}`,
                `VAT${data.vatPct ? ` (${data.vatPct}%)` : ''}`
              )}
            </span>
            <span className="tabular-nums">{Number(data.vat).toFixed(2)}</span>
          </div>
        )}
        {Number(data.packagingFee || 0) > 0 && (
          <div className="flex justify-between font-bold text-slate-700">
            <span>{tx(isEn, 'التغليف', 'Packaging')}</span>
            <span className="tabular-nums">{Number(data.packagingFee).toFixed(2)}</span>
          </div>
        )}

        {/* Highlighted Grand Total */}
        <div className="mt-1.5 pt-2 pb-2 px-2.5 rounded-xl bg-emerald-50 border border-emerald-300 flex justify-between items-center text-sm font-black text-emerald-950">
          <span>{tx(isEn, 'الإجمالي المستحق', 'Grand Total')}</span>
          <span className="tabular-nums">{formatCompactMoney(data.total, shop.country, isEn)}</span>
        </div>

        <div className="flex justify-between font-bold text-slate-600 pt-1">
          <span>{tx(isEn, 'طريقة الدفع:', 'Payment:')}</span>
          <span>{data.paymentMethod || tx(isEn, 'نقداً', 'Cash')}</span>
        </div>

        {paidNum > 0 && (
          <div className="flex justify-between font-bold text-slate-600">
            <span>{tx(isEn, 'المدفوع / الباقي:', 'Paid / Change:')}</span>
            <span className="tabular-nums">
              {paidNum} / {changeDue}
            </span>
          </div>
        )}

        {data.notes && (
          <div className="mt-1 p-2 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-semibold text-slate-700">
            {tx(isEn, 'ملاحظات:', 'Notes:')} {data.notes}
          </div>
        )}
      </div>

      {/* QR Code & Footer */}
      <div className="pt-2.5 border-t-2 border-dashed border-slate-300 text-center space-y-1.5">
        <div className="flex justify-center">
          <QrCodeImage value={menuUrl} size={compactThermal ? 76 : 86} className="p-1 rounded-lg border-slate-200" />
        </div>
        <div className="text-[10px] font-bold text-slate-600">
          {tx(isEn, 'امسح الرمز لفتح المنيو الإلكتروني', 'Scan QR to browse menu & order')}
        </div>
        <div className="text-[10px] font-extrabold text-slate-500">
          {tx(isEn, 'شكراً لزيارتكم · Ghazalo POS', 'Thank you · Ghazalo POS')}
        </div>
      </div>
    </div>
  );
};
