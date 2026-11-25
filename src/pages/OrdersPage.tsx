import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, MailOpen, MapPin, Phone, Printer, Receipt, Search, X } from 'lucide-react';
import { InvoiceReceipt, orderToInvoiceData } from '../components/InvoiceReceipt';
import { updateOrderStatus } from '../services/firestoreService';
import { formatMoney } from '../utils/calculations';
import { tx, useUiLang } from '../utils/uiLang';
import type { Order, OrderStatus, Shop } from '../types';

interface OrdersPageProps {
  shop: Shop;
  orders: Order[];
  onBackDashboard: () => void;
  onOpenCashier: () => void;
  onOrderStatusUpdated?: (orderId: string, status: OrderStatus) => void;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({
  shop,
  orders,
  onBackDashboard,
  onOpenCashier,
  onOrderStatusUpdated,
}) => {
  const { isEn } = useUiLang();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'preparing' | 'ready'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'cashier' | 'menu'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'delivery' | 'pickup' | 'dine_in' | 'table'>('all');
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);

  const statusLabels: Record<OrderStatus, string> = {
    new: tx(isEn, 'جديد', 'New'),
    preparing: tx(isEn, 'قيد التحضير', 'Preparing'),
    ready: tx(isEn, 'جاهز', 'Ready'),
    held: tx(isEn, 'معلق', 'Held'),
    completed: tx(isEn, 'مكتمل', 'Completed'),
  };

  const typeLabels: Record<string, string> = {
    delivery: tx(isEn, 'توصيل', 'Delivery'),
    pickup: tx(isEn, 'استلام', 'Pickup'),
    dine_in: tx(isEn, 'محلي', 'Dine-in'),
    table: tx(isEn, 'طاولة', 'Table'),
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((ord) => {
      const sOk = statusFilter === 'all' || ord.status === statusFilter;
      const srcOk = sourceFilter === 'all' || ord.source === sourceFilter;
      const tOk = typeFilter === 'all' || ord.orderType === typeFilter;
      const qOk =
        !q ||
        ord.orderNumber.toLowerCase().includes(q) ||
        (ord.customerName || '').toLowerCase().includes(q) ||
        (ord.customerPhone || '').toLowerCase().includes(q);
      return sOk && srcOk && tOk && qOk;
    });
  }, [orders, searchQuery, statusFilter, sourceFilter, typeFilter]);

  const handleAdvanceStatus = async (order: Order) => {
    const nextMap: Record<OrderStatus, OrderStatus | null> = {
      new: 'preparing',
      preparing: 'ready',
      ready: 'completed',
      held: 'preparing',
      completed: null,
    };
    const next = nextMap[order.status];
    if (!next) return;
    if (onOrderStatusUpdated) {
      onOrderStatusUpdated(order.id, next);
    }
    try {
      await updateOrderStatus(shop.id, order.id, next);
    } catch {
      // ignore if demo/local-only order
    }
  };

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] pb-20">
      <header className="sticky top-0 z-20 bg-[#FFFFFF] dark:bg-[#18231C] border-b border-[#CFE3D5] dark:border-[#2C3D32] no-print">
        <div className="max-w-[560px] mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBackDashboard}
            className="sf-btn min-h-[40px] px-3 text-xs text-[#15803D] dark:text-[#BBF7D0]"
          >
            {isEn ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            {tx(isEn, 'لوحة التحكم', 'Dashboard')}
          </button>
          <h1 className="text-lg font-extrabold text-[#14201A] dark:text-[#E8F2EB]">
            {tx(isEn, 'الطلبات', 'Orders')}
          </h1>
          <button
            type="button"
            onClick={onOpenCashier}
            className="sf-btn-yellow min-h-[40px] px-3.5 text-xs"
          >
            {tx(isEn, 'الكاشير', 'Cashier')}
          </button>
        </div>
      </header>

      <main className="max-w-[560px] mx-auto px-4 pt-3.5 space-y-3.5 no-print">
        {/* Search */}
        <div className="relative">
          <Search
            className={`w-4 h-4 text-[#4B5B52] dark:text-[#A3B5AA] absolute ${
              isEn ? 'left-4' : 'right-4'
            } top-1/2 -translate-y-1/2`}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tx(
              isEn,
              'رقم الطلب، اسم العميل، رقم الهاتف',
              'Order #, customer name, or phone number'
            )}
            className={`sf-inp ${isEn ? 'pl-11 pr-4' : 'pr-11 pl-4'}`}
          />
        </div>

        {/* Horizontal Filter Chips */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: 'all', label: tx(isEn, 'الكل', 'All') },
              { id: 'new', label: tx(isEn, 'جديد', 'New') },
              { id: 'preparing', label: tx(isEn, 'قيد التحضير', 'Preparing') },
              { id: 'ready', label: tx(isEn, 'جاهز', 'Ready') },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id as typeof statusFilter)}
                className={statusFilter === st.id ? 'sf-chip-on text-xs' : 'sf-chip text-xs'}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: 'all', label: tx(isEn, 'كل المصادر', 'All Sources') },
              { id: 'cashier', label: tx(isEn, 'الكاشير', 'Cashier') },
              { id: 'menu', label: tx(isEn, 'المنيو', 'Menu') },
            ].map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => setSourceFilter(src.id as typeof sourceFilter)}
                className={sourceFilter === src.id ? 'sf-chip-on text-xs' : 'sf-chip text-xs'}
              >
                {src.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: 'all', label: tx(isEn, 'كل الأنواع', 'All Types') },
              { id: 'delivery', label: tx(isEn, 'توصيل', 'Delivery') },
              { id: 'pickup', label: tx(isEn, 'استلام', 'Pickup') },
              { id: 'dine_in', label: tx(isEn, 'محلي', 'Dine-in') },
              { id: 'table', label: tx(isEn, 'طاولة', 'Table') },
            ].map((tp) => (
              <button
                key={tp.id}
                type="button"
                onClick={() => setTypeFilter(tp.id as typeof typeFilter)}
                className={typeFilter === tp.id ? 'sf-chip-on text-xs' : 'sf-chip text-xs'}
              >
                {tp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Orders List or Empty Envelope State */}
        {filtered.length === 0 ? (
          <div className="sf-card py-10 px-6 text-center items-center flex flex-col gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center">
              <MailOpen className="w-8 h-8" />
            </div>
            <p className="text-sm font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'لا توجد طلبات في هذه الفئة', 'No orders in this filter')}
            </p>
            <button
              type="button"
              onClick={onOpenCashier}
              className="sf-btn-primary text-sm px-6"
            >
              {tx(isEn, 'طلب جديد من الكاشير', 'New POS Order')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ord) => (
              <div key={ord.id} className="sf-card space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-extrabold text-base text-[#14201A] dark:text-[#E8F2EB] tabular-nums">
                    #{ord.orderNumber} ·{' '}
                    {ord.source === 'cashier'
                      ? tx(isEn, 'الكاشير', 'Cashier')
                      : tx(isEn, 'المنيو', 'Menu')}
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-xs font-extrabold">
                    {statusLabels[ord.status]}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                      ord.orderType === 'delivery'
                        ? 'bg-[#FEF3C7] text-[#92400E]'
                        : ord.orderType === 'pickup'
                          ? 'bg-[#E0F2FE] text-[#075985]'
                          : 'bg-[#F1F5F9] text-[#334155]'
                    }`}
                  >
                    {ord.orderType === 'pickup'
                      ? tx(isEn, 'تيك اواي - استلام من المحل', 'Take away - pickup')
                      : typeLabels[ord.orderType] || ord.orderType}
                    {ord.tableLabel ? ` (${ord.tableLabel})` : ''}
                  </span>
                  <span className="text-sm font-extrabold text-[#14201A] dark:text-[#E8F2EB]">
                    {ord.customerName || tx(isEn, 'عميل', 'Customer')}
                  </span>
                </div>

                {(ord.customerPhone || (ord.orderType === 'delivery' && ord.address)) && (
                  <div className="rounded-xl border border-[#CFE3D5] dark:border-[#2C3D32] p-2.5 space-y-1.5 text-sm">
                    {ord.customerPhone && (
                      <a
                        href={`tel:${ord.customerPhone}`}
                        className="flex items-center gap-2 font-extrabold tabular-nums text-[#15803D] dark:text-[#4ADE80]"
                        dir="ltr"
                      >
                        <Phone className="w-4 h-4 shrink-0" />
                        {ord.customerPhone}
                      </a>
                    )}
                    {ord.orderType === 'delivery' && ord.address && (
                      <div className="flex items-start gap-2 font-bold text-[#14201A] dark:text-[#E8F2EB]">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" />
                        <span>
                          {ord.address}
                          {ord.floor ? ` - ${tx(isEn, 'دور', 'Fl')} ${ord.floor}` : ''}
                          {ord.apartment ? ` - ${tx(isEn, 'شقة', 'Apt')} ${ord.apartment}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {ord.notes && (
                  <div className="text-xs font-bold text-[#92400E] bg-[#FFFBEB] rounded-lg px-2.5 py-1.5">
                    {tx(isEn, 'ملاحظات: ', 'Notes: ')}
                    {ord.notes}
                  </div>
                )}

                {ord.itemSummary && ord.itemSummary.length > 0 && (
                  <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA] bg-[#F6FBF7] dark:bg-[#0F1712] rounded-xl p-2.5 border border-[#CFE3D5]/60 dark:border-[#2C3D32]">
                    {ord.itemSummary.join(' • ')}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-base font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                    {formatMoney(ord.total, shop.country)}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewOrder(ord)}
                      className="sf-btn min-h-[40px] text-xs px-3"
                    >
                      <Receipt className="w-3.5 h-3.5 text-[#15803D]" />
                      {tx(isEn, 'فاتورة / طباعة', 'Receipt / Print')}
                    </button>
                    {ord.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => void handleAdvanceStatus(ord)}
                        className="sf-btn-mint min-h-[40px] text-xs px-4"
                      >
                        {ord.status === 'new'
                          ? tx(isEn, 'تحويل إلى قيد التحضير', 'Start Preparing')
                          : ord.status === 'preparing'
                            ? tx(isEn, 'تحويل إلى جاهز', 'Mark Ready')
                            : tx(isEn, 'إتمام الطلب', 'Complete')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {previewOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/55 backdrop-blur-xs no-print"
          onClick={() => setPreviewOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sf-card max-w-md w-full max-h-[92vh] flex flex-col justify-between p-4 sm:p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#CFE3D5] dark:border-[#2C3D32]">
              <h3 className="font-extrabold text-base">
                {tx(isEn, `فاتورة الطلب #${previewOrder.orderNumber}`, `Invoice #${previewOrder.orderNumber}`)}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewOrder(null)}
                className="sf-btn min-h-[36px] w-9 px-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <InvoiceReceipt
                shop={shop}
                data={orderToInvoiceData(previewOrder, shop)}
                isEn={isEn}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="sf-btn-primary flex-1 min-h-[44px] text-sm"
              >
                <Printer className="w-4 h-4" />
                {tx(isEn, 'طباعة الفاتورة', 'Print Invoice')}
              </button>
              <button
                type="button"
                onClick={() => setPreviewOrder(null)}
                className="sf-btn min-h-[44px] text-sm"
              >
                {tx(isEn, 'إغلاق', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewOrder && (
        <div className="hidden print-only p-2">
          <InvoiceReceipt
            shop={shop}
            data={orderToInvoiceData(previewOrder, shop)}
            isEn={isEn}
            compactThermal
          />
        </div>
      )}
    </div>
  );
};
