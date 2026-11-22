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
    <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen bg-slate-50/70 dark:bg-slate-950 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-3xl p-4 border border-orange-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onBackDashboard}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#FF6A00]"
          >
            {isEn ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            {tx(isEn, 'لوحة التحكم', 'Dashboard')}
          </button>
          <h1 className="text-lg sm:text-xl font-extrabold">{tx(isEn, 'الطلبات', 'Orders')}</h1>
          <button
            type="button"
            onClick={onOpenCashier}
            className="px-4 py-2 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-xs"
          >
            {tx(isEn, 'الكاشير', 'Cashier POS')}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className={`w-4 h-4 text-slate-400 absolute ${
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
            className={`w-full ${
              isEn ? 'pl-11 pr-4' : 'pr-11 pl-4'
            } py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-orange-100 dark:border-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]`}
          />
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-orange-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-slate-500 me-1">
              {tx(isEn, 'الحالة:', 'Status:')}
            </span>
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
                className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold border ${
                  statusFilter === st.id
                    ? 'bg-[#FF6A00] text-white border-[#FF6A00]'
                    : 'bg-orange-50/40 dark:bg-slate-800 border-orange-100 dark:border-slate-700'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-500">
                {tx(isEn, 'المصدر:', 'Source:')}
              </span>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
                className="px-3 py-1.5 rounded-xl bg-orange-50/50 dark:bg-slate-800 border border-orange-100 dark:border-slate-700 text-xs font-bold"
              >
                <option value="all">{tx(isEn, 'كل المصادر', 'All Sources')}</option>
                <option value="cashier">{tx(isEn, 'الكاشير', 'Cashier POS')}</option>
                <option value="menu">{tx(isEn, 'المنيو', 'Online Menu')}</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-500">
                {tx(isEn, 'النوع:', 'Type:')}
              </span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                className="px-3 py-1.5 rounded-xl bg-orange-50/50 dark:bg-slate-800 border border-orange-100 dark:border-slate-700 text-xs font-bold"
              >
                <option value="all">{tx(isEn, 'كل الأنواع', 'All Types')}</option>
                <option value="delivery">{tx(isEn, 'توصيل', 'Delivery')}</option>
                <option value="pickup">{tx(isEn, 'استلام', 'Pickup')}</option>
                <option value="dine_in">{tx(isEn, 'محلي', 'Dine-in')}</option>
                <option value="table">{tx(isEn, 'طاولة', 'Table')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Orders List or Empty Envelope State */}
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-orange-100 dark:border-slate-800 text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-orange-50 dark:bg-slate-800 text-[#FF6A00] mx-auto flex items-center justify-center">
              <MailOpen className="w-10 h-10" />
            </div>
            <p className="text-base font-extrabold text-slate-700 dark:text-slate-200">
              {tx(isEn, 'لا توجد طلبات في هذه الفئة', 'No orders in this filter')}
            </p>
            <button
              type="button"
              onClick={onOpenCashier}
              className="px-6 py-3 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-sm"
            >
              {tx(isEn, 'طلب جديد من الكاشير', 'New POS Order')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ord) => (
              <div
                key={ord.id}
                className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-base tabular-nums">
                      #{ord.orderNumber}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {ord.source === 'cashier'
                        ? tx(isEn, 'الكاشير', 'Cashier')
                        : tx(isEn, 'المنيو', 'Menu')}{' '}
                      · {typeLabels[ord.orderType] || ord.orderType}
                      {ord.tableLabel ? ` (${ord.tableLabel})` : ''}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {ord.customerName || tx(isEn, 'عميل', 'Customer')}{' '}
                    {ord.customerPhone ? `- ${ord.customerPhone}` : ''}
                  </div>
                  {ord.itemSummary && ord.itemSummary.length > 0 && (
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {ord.itemSummary.join(' • ')}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className={isEn ? 'text-right' : 'text-left'}>
                    <div className="text-base font-extrabold text-[#FF6A00] tabular-nums">
                      {formatMoney(ord.total, shop.country)}
                    </div>
                    <div className="text-xs font-bold text-slate-500">
                      {statusLabels[ord.status]}
                    </div>
                  </div>
                  {ord.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => void handleAdvanceStatus(ord)}
                      className="px-4 py-2 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-bold text-xs whitespace-nowrap"
                    >
                      {ord.status === 'new'
                        ? tx(isEn, 'بدء التحضير', 'Start Preparing')
                        : ord.status === 'preparing'
                          ? tx(isEn, 'جاهز', 'Mark Ready')
                          : tx(isEn, 'إتمام', 'Complete')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
