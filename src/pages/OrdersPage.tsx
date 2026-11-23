import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, MailOpen, Search } from 'lucide-react';
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
      <header className="sticky top-0 z-20 bg-[#FFFFFF] dark:bg-[#18231C] border-b border-[#CFE3D5] dark:border-[#2C3D32]">
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

      <main className="max-w-[560px] mx-auto px-4 pt-3.5 space-y-3.5">
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

                <div className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
                  {typeLabels[ord.orderType] || ord.orderType}
                  {ord.tableLabel ? ` (${ord.tableLabel})` : ''} ·{' '}
                  {ord.customerName || tx(isEn, 'عميل', 'Customer')}
                  {ord.customerPhone ? ` - ${ord.customerPhone}` : ''}
                </div>

                {ord.itemSummary && ord.itemSummary.length > 0 && (
                  <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA] bg-[#F6FBF7] dark:bg-[#0F1712] rounded-xl p-2.5 border border-[#CFE3D5]/60 dark:border-[#2C3D32]">
                    {ord.itemSummary.join(' • ')}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-base font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                    {formatMoney(ord.total, shop.country)}
                  </div>
                  {ord.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => void handleAdvanceStatus(ord)}
                      className="sf-btn-mint min-h-[42px] text-xs px-4"
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
