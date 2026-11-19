import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Edit3,
  Grid,
  List,
  Loader2,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { createOrder } from '../services/firestoreService';
import { calculateOrderTotals, formatCompactMoney, formatMoney } from '../utils/calculations';
import { sortMenuCategories, sortProductsCulinary } from '../utils/menuSorting';
import type { CartItem, Order, Product, Shop, ShopTable } from '../types';

interface CashierPageProps {
  shop: Shop;
  products: Product[];
  tables: ShopTable[];
  onBackDashboard: () => void;
  onOrderCreated: (order: Order) => void;
}

export const CashierPage: React.FC<CashierPageProps> = ({
  shop,
  products,
  tables,
  onBackDashboard,
  onOrderCreated,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [closeCartOpen, setCloseCartOpen] = useState(false);
  const [closeCartTab, setCloseCartTab] = useState<'cart' | 'details'>('cart');

  // Close Cart Details State
  const [orderType, setOrderType] = useState<'delivery' | 'pickup' | 'dine_in' | 'table'>('dine_in');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [driverName, setDriverName] = useState('');
  const [customerInput, setCustomerInput] = useState('');
  const [manualDiscount, setManualDiscount] = useState<number>(0);
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('نقداً');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState('');
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const sortedProducts = useMemo(() => sortProductsCulinary(products), [products]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(sortedProducts.map((p) => p.category).filter(Boolean)));
    return ['الكل', ...sortMenuCategories(unique)];
  }, [sortedProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedProducts.filter((p) => {
      const catOk = selectedCategory === 'الكل' || p.category === selectedCategory;
      const qOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [sortedProducts, selectedCategory, searchQuery]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalCount = useMemo(
    () => cartItems.reduce((acc, c) => acc + c.quantity, 0),
    [cartItems]
  );
  const subtotal = useMemo(
    () => cartItems.reduce((acc, c) => acc + c.unitPrice * c.quantity, 0),
    [cartItems]
  );

  // Exact Cashier Calculation (Service 12%, VAT 14%, Rounding Diff)
  const totals = useMemo(
    () => calculateOrderTotals(subtotal, manualDiscount, true),
    [subtotal, manualDiscount]
  );

  const addItem = (product: Product) => {
    setCart((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          product,
          unitPrice: existing ? existing.unitPrice : product.price,
          quantity: existing ? existing.quantity + 1 : 1,
          note: existing?.note,
        },
      };
    });
  };

  const decItem = (productId: string) => {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return {
        ...prev,
        [productId]: { ...existing, quantity: existing.quantity - 1 },
      };
    });
  };

  const removeItem = (productId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const submitCashierOrder = async (targetStatus: 'completed' | 'held') => {
    if (cartItems.length === 0) return;
    setSaving(true);
    try {
      const order = await createOrder({
        shopId: shop.id,
        shopOwnerId: shop.ownerId,
        source: 'cashier',
        orderType,
        status: targetStatus,
        paymentMethod,
        customerName: customerInput.trim() || 'عميل كاشير',
        customerPhone: '',
        address: orderType === 'delivery' ? deliveryAddress.trim() : '',
        driverName: orderType === 'delivery' ? driverName.trim() : '',
        tableLabel: orderType === 'table' ? selectedTable : '',
        notes: orderNotes.trim(),
        itemsCount: totalCount,
        itemSummary: cartItems.map((c) => `${c.product.name} × ${c.quantity}`),
        subtotal: totals.subtotal,
        discount: totals.discount,
        serviceFee: totals.serviceFee,
        vat: totals.vat,
        roundingDiff: totals.roundingDiff,
        total: totals.total,
        paidAmount: Number(paidAmount) || totals.total,
      });

      onOrderCreated(order);
      setCart({});
      setManualDiscount(0);
      setPaidAmount('');
      setOrderNotes('');
      setCloseCartOpen(false);
      setToastMsg(
        targetStatus === 'held'
          ? `تم تعليق الطلب #${order.orderNumber}`
          : `تم إنهاء الطلب #${order.orderNumber} بنجاح`
      );
      setTimeout(() => setToastMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const paidNum = Number(paidAmount) || 0;
  const changeDue = paidNum > totals.total ? paidNum - totals.total : 0;

  return (
    <div dir="rtl" className="min-h-screen bg-emerald-50/30 dark:bg-slate-950 pb-24">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-emerald-100 dark:border-slate-800 px-4 h-14 flex items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackDashboard}
            className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
            aria-label="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <span
            className={`px-3 py-1 rounded-xl text-xs font-extrabold tabular-nums ${
              shop.isOpen
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {shop.isOpen ? 'مفتوح' : 'مغلق'} ({totalCount})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCloseCartOpen(true)}
            className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center relative"
            aria-label="السلة"
          >
            <ShoppingCart className="w-4 h-4" />
            {totalCount > 0 && (
              <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {totalCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              viewMode === 'list'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300'
            }`}
            aria-label="عرض القائمة"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              viewMode === 'grid'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300'
            }`}
            aria-label="عرض الشبكة"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onBackDashboard}
            className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
            aria-label="الإشعارات"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </header>

      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-lg no-print">
          {toastMsg}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 pt-4 space-y-4 no-print">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="اسم الصنف، الوصف، أو الباركود"
            className="w-full pr-11 pl-4 py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 text-sm font-semibold"
          />
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-2xl text-sm font-bold whitespace-nowrap shrink-0 border transition-colors ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-emerald-100 dark:border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Cards (Taller POS Cards) */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-emerald-100 dark:border-slate-800 text-center space-y-2">
            <Utensils className="w-10 h-10 text-emerald-300 mx-auto" />
            <p className="text-base font-bold text-slate-600 dark:text-slate-300">
              لا توجد أصناف مطابقة للبحث
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5'
                : 'space-y-3'
            }
          >
            {filteredProducts.map((product) => {
              const qty = cart[product.id]?.quantity || 0;
              return (
                <div
                  key={product.id}
                  onClick={() => addItem(product)}
                  className={`cursor-pointer bg-white dark:bg-slate-900 rounded-3xl p-3.5 border border-emerald-100 dark:border-slate-800 shadow-xs hover:border-emerald-400 transition-colors ${
                    viewMode === 'grid' ? 'min-h-[235px] flex flex-col justify-between' : 'flex items-center justify-between gap-3'
                  }`}
                >
                  <div className={viewMode === 'grid' ? 'space-y-2.5' : 'flex items-center gap-3'}>
                    <div
                      className={`${
                        viewMode === 'grid' ? 'h-32 w-full' : 'w-14 h-14 shrink-0'
                      } rounded-2xl bg-emerald-50/70 dark:bg-slate-800 flex items-center justify-center overflow-hidden`}
                    >
                      {product.imageUrl && !brokenImages[product.id] ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils className="w-8 h-8 text-emerald-300" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="font-extrabold text-sm text-slate-900 dark:text-white line-clamp-2">
                        {product.name}
                      </div>
                      <div className="text-xs font-semibold text-slate-400">{product.category}</div>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between gap-2 pt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatMoney(product.price, shop.country)}
                    </span>
                    {qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => addItem(product)}
                        className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950 rounded-full px-1.5 py-1 border border-emerald-200 dark:border-emerald-800">
                        <button
                          type="button"
                          onClick={() => addItem(product)}
                          className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-extrabold text-xs tabular-nums min-w-[14px] text-center">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => decItem(product.id)}
                          className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 text-emerald-700 flex items-center justify-center"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Sticky Cashier Bar */}
      <div className="fixed bottom-4 left-4 right-4 z-30 max-w-2xl mx-auto no-print">
        <button
          type="button"
          onClick={() => setCloseCartOpen(true)}
          className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-lg flex items-center justify-between tabular-nums"
        >
          {totalCount === 0 ? (
            <>
              <span>السلة فارغة</span>
              <span>0 {shop.country === 'السعودية' ? 'ر.س' : 'ج.م'}</span>
            </>
          ) : (
            <>
              <span>عرض السلة - {totalCount} صنف</span>
              <span>{formatMoney(totals.total, shop.country)}</span>
            </>
          )}
        </button>
      </div>

      {/* Close Cart ("إغلاق السلة") Modal/Sheet */}
      {closeCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs no-print">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[92vh] flex flex-col justify-between shadow-2xl">
            <div className="space-y-3 pb-3 border-b border-emerald-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold">إغلاق السلة</h2>
                <button
                  type="button"
                  onClick={() => setCloseCartOpen(false)}
                  className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 2 Tabs: السلة - N & البيانات */}
              <div className="grid grid-cols-2 gap-2 bg-emerald-50/70 dark:bg-slate-800 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setCloseCartTab('cart')}
                  className={`py-2 rounded-xl text-sm font-extrabold transition-colors tabular-nums ${
                    closeCartTab === 'cart'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  السلة - {totalCount}
                </button>
                <button
                  type="button"
                  onClick={() => setCloseCartTab('details')}
                  className={`py-2 rounded-xl text-sm font-extrabold transition-colors ${
                    closeCartTab === 'details'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  البيانات
                </button>
              </div>
            </div>

            <div className="overflow-y-auto py-4 space-y-4 flex-1">
              {closeCartTab === 'cart' ? (
                <>
                  {/* Order Type Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'delivery', label: 'توصيل' },
                      { id: 'pickup', label: 'استلام' },
                      { id: 'dine_in', label: 'محلي' },
                      { id: 'table', label: 'طاولة' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setOrderType(opt.id as typeof orderType)}
                        className={`py-2.5 rounded-2xl text-xs font-extrabold border ${
                          orderType === opt.id
                            ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {orderType === 'table' && (
                    <button
                      type="button"
                      onClick={() => setTablePickerOpen(true)}
                      className="w-full py-2.5 px-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold text-sm"
                    >
                      {selectedTable ? `الطاولة المختارة: ${selectedTable}` : 'اختر الطاولة'}
                    </button>
                  )}

                  {orderType === 'delivery' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="عنوان التوصيل"
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                      />
                      <input
                        type="text"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="اسم السائق (اختياري)"
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                      />
                    </div>
                  )}

                  {/* Line Items */}
                  {cartItems.length === 0 ? (
                    <p className="text-center text-sm font-bold text-slate-500 py-6">
                      السلة فارغة. أضف أصنافاً من شاشة الكاشير.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {cartItems.map(({ product, quantity, unitPrice }) => (
                        <div
                          key={product.id}
                          className="bg-emerald-50/40 dark:bg-slate-800 rounded-2xl p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-extrabold text-sm truncate">
                                {product.name} - {formatCompactMoney(unitPrice, shop.country)}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => addItem(product)}
                                className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-extrabold text-sm tabular-nums min-w-[18px] text-center">
                                {quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => decItem(product.id)}
                                className="w-7 h-7 rounded-full bg-white dark:bg-slate-900 text-emerald-700 flex items-center justify-center"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingItemId(editingItemId === product.id ? null : product.id)
                                }
                                className="w-7 h-7 rounded-xl bg-white dark:bg-slate-900 text-slate-600 flex items-center justify-center"
                                aria-label="تعديل السعر"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItem(product.id)}
                                className="w-7 h-7 rounded-xl bg-white dark:bg-slate-900 text-amber-600 flex items-center justify-center"
                                aria-label="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {editingItemId === product.id && (
                            <div className="flex items-center gap-2 pt-1">
                              <label className="text-xs font-bold">سعر الوحدة:</label>
                              <input
                                type="number"
                                value={unitPrice}
                                onChange={(e) => {
                                  const nextPrice = Math.max(0, Number(e.target.value) || 0);
                                  setCart((prev) => ({
                                    ...prev,
                                    [product.id]: { ...prev[product.id], unitPrice: nextPrice },
                                  }));
                                }}
                                className="w-24 px-2 py-1 rounded-xl border border-emerald-200 bg-white dark:bg-slate-900 text-xs font-bold tabular-nums"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">العميل</label>
                    <input
                      type="text"
                      value={customerInput}
                      onChange={(e) => setCustomerInput(e.target.value)}
                      placeholder="الاسم أو رقم الهاتف أو رقم الطلب"
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">الخصم</label>
                    <input
                      type="number"
                      min={0}
                      value={manualDiscount || ''}
                      onChange={(e) => setManualDiscount(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="خصم يدوي (ج.م)"
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">ملاحظة</label>
                    <textarea
                      rows={2}
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="ملاحظات الطلب"
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                  </div>
                </div>
              )}

              {/* Payment & Cash Received */}
              <div className="space-y-2.5 pt-2 border-t border-emerald-100 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  {['نقداً', 'فودافون كاش'].map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentMethod(pm)}
                      className={`py-2.5 rounded-2xl text-xs font-extrabold border ${
                        paymentMethod === pm
                          ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>ما دفعه العميل</span>
                    {changeDue > 0 && (
                      <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                        الباقي للعميل: {formatCompactMoney(changeDue, shop.country)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[120, 150, 200].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPaidAmount(String(amt))}
                        className={`py-2 rounded-xl text-xs font-extrabold border tabular-nums ${
                          Number(paidAmount) === amt
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-slate-700'
                        }`}
                      >
                        {amt}ج
                      </button>
                    ))}
                    <input
                      type="number"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder="مبلغ آخر"
                      className="px-2 py-2 rounded-xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Exact Calculation Breakdown */}
              <div className="bg-emerald-50/60 dark:bg-slate-800 rounded-2xl p-3.5 space-y-1.5 text-xs font-bold">
                <div className="flex justify-between">
                  <span>المجموع</span>
                  <span className="tabular-nums">{formatCompactMoney(totals.subtotal, shop.country)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>الخصم</span>
                    <span className="tabular-nums">-{formatCompactMoney(totals.discount, shop.country)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>رسوم الخدمة 12%</span>
                  <span className="tabular-nums">{totals.serviceFee.toFixed(2)}ج</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>ضريبة القيمة المضافة 14%</span>
                  <span className="tabular-nums">{totals.vat.toFixed(2)}ج</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>فرق التقريب</span>
                  <span className="tabular-nums">{totals.roundingDiff.toFixed(2)}ج</span>
                </div>
                <div className="flex justify-between text-base font-extrabold pt-2 border-t border-emerald-200 dark:border-slate-700">
                  <span>الإجمالي</span>
                  <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {totals.total}ج
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom 3 Action Buttons */}
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-emerald-100 dark:border-slate-800">
              <button
                type="button"
                disabled={saving || cartItems.length === 0}
                onClick={() => void submitCashierOrder('completed')}
                className="col-span-2 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-sm flex items-center justify-center gap-1.5 tabular-nums"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>إنهاء - {totals.total}ج</span>
              </button>
              <button
                type="button"
                disabled={cartItems.length === 0}
                onClick={() => window.print()}
                className="py-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 font-bold text-sm inline-flex items-center justify-center gap-1"
              >
                <Printer className="w-4 h-4" />
                طباعة
              </button>
              <button
                type="button"
                disabled={saving || cartItems.length === 0}
                onClick={() => void submitCashierOrder('held')}
                className="py-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 font-bold text-sm"
              >
                معلق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table Picker Modal */}
      {tablePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 space-y-4 border border-emerald-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base">اختر الطاولة</h3>
              <button
                type="button"
                onClick={() => setTablePickerOpen(false)}
                className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {tables.length === 0 ? (
              <div className="space-y-3 text-center">
                <p className="text-xs font-bold text-slate-500">
                  لا توجد طاولات مضافة بعد، يمكنك كتابة رقم الطاولة يدوياً:
                </p>
                <input
                  type="text"
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  placeholder="مثال: طاولة 5"
                  className="w-full px-3 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 text-sm font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setTablePickerOpen(false)}
                  className="w-full py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
                >
                  حفظ
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {tables.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTable(t.label);
                      setTablePickerOpen(false);
                    }}
                    className="py-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-sm"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Receipt */}
      <div className="hidden print-only p-6 text-right" dir="rtl">
        <h2 className="text-xl font-extrabold text-center">{shop.nameAr}</h2>
        <p className="text-xs text-center mb-4">فاتورة كاشير Ghazalo</p>
        <div className="border-t border-b py-2 space-y-1 text-sm">
          {cartItems.map((c) => (
            <div key={c.product.id} className="flex justify-between">
              <span>{c.product.name} × {c.quantity}</span>
              <span>{c.unitPrice * c.quantity} ج</span>
            </div>
          ))}
        </div>
        <div className="pt-2 space-y-1 text-xs">
          <div className="flex justify-between"><span>المجموع</span><span>{totals.subtotal}ج</span></div>
          <div className="flex justify-between"><span>رسوم الخدمة 12%</span><span>{totals.serviceFee.toFixed(2)}ج</span></div>
          <div className="flex justify-between"><span>ضريبة 14%</span><span>{totals.vat.toFixed(2)}ج</span></div>
          <div className="flex justify-between font-extrabold text-base"><span>الإجمالي</span><span>{totals.total}ج</span></div>
        </div>
      </div>
    </div>
  );
};
