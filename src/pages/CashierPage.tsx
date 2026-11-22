import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Edit3,
  Globe,
  Grid,
  List,
  Loader2,
  MessageCircle,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { createOrder, updateOrderStatus } from '../services/firestoreService';
import { calculateOrderTotals, formatCompactMoney, formatMoney } from '../utils/calculations';
import {
  copyMenuLink,
  getAbsoluteMenuUrl,
  getWhatsAppShareUrl,
} from '../utils/menuLink';
import { sortMenuCategories, sortProductsCulinary } from '../utils/menuSorting';
import { getProductOptions, type ParsedProductOption } from '../utils/productVariants';
import { getShopDisplayName, tx, useUiLang } from '../utils/uiLang';
import type { CartItem, Order, OrderStatus, Product, Shop, ShopTable } from '../types';

interface CashierPageProps {
  shop: Shop;
  products: Product[];
  tables: ShopTable[];
  orders?: Order[];
  forceZeroFeesGlobally?: boolean;
  onBackDashboard: () => void;
  onOrderCreated: (order: Order) => void;
  onOrderStatusChange?: (orderId: string, status: OrderStatus) => void;
}

const ALL_CATEGORIES_KEY = '__all__';

export const CashierPage: React.FC<CashierPageProps> = ({
  shop,
  products,
  tables,
  orders = [],
  forceZeroFeesGlobally = false,
  onBackDashboard,
  onOrderCreated,
  onOrderStatusChange,
}) => {
  const { isEn, toggleLang } = useUiLang();
  const displayShopName = getShopDisplayName(shop, isEn);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES_KEY);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [ticketTab, setTicketTab] = useState<'cart' | 'details'>('cart');
  const [ordersQueueOpen, setOrdersQueueOpen] = useState(false);

  // POS Checkout State — fees OFF by default unless enabled in restaurant settings & not disabled globally
  const [orderType, setOrderType] = useState<'delivery' | 'pickup' | 'dine_in' | 'table'>('dine_in');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [driverName, setDriverName] = useState('');
  const [customerInput, setCustomerInput] = useState('');
  const [manualDiscount, setManualDiscount] = useState<number>(0);
  const [applyTaxAndService, setApplyTaxAndService] = useState<boolean>(() =>
    Boolean(!forceZeroFeesGlobally && (shop.enableServiceFee || shop.enableVat || shop.enablePackagingFee))
  );
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('نقداً');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState('');
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [optionPickerProduct, setOptionPickerProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [menuLinkCopied, setMenuLinkCopied] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [lastReceiptOrder, setLastReceiptOrder] = useState<Order | null>(null);

  const menuUrl = getAbsoluteMenuUrl(shop);
  const handleCopyMenuUrl = async () => {
    const ok = await copyMenuLink(menuUrl);
    if (ok) {
      setMenuLinkCopied(true);
      setToastMsg(tx(isEn, 'تم نسخ اللينك ✅', 'Link copied ✅'));
      setTimeout(() => {
        setMenuLinkCopied(false);
        setToastMsg('');
      }, 2600);
    }
  };

  const sortedProducts = useMemo(() => sortProductsCulinary(products), [products]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(sortedProducts.map((p) => p.category).filter(Boolean)));
    return [ALL_CATEGORIES_KEY, ...sortMenuCategories(unique)];
  }, [sortedProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedProducts.filter((p) => {
      const catOk = selectedCategory === ALL_CATEGORIES_KEY || p.category === selectedCategory;
      const qOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [sortedProducts, selectedCategory, searchQuery]);

  const heldAndActiveOrders = useMemo(
    () => orders.filter((o) => o.status === 'held' || o.status === 'new' || o.status === 'preparing'),
    [orders]
  );

  const heldOrdersCount = useMemo(
    () => orders.filter((o) => o.status === 'held' || o.status === 'new').length,
    [orders]
  );

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalCount = useMemo(
    () => cartItems.reduce((acc, c) => acc + c.quantity, 0),
    [cartItems]
  );
  const subtotal = useMemo(
    () => cartItems.reduce((acc, c) => acc + c.unitPrice * c.quantity, 0),
    [cartItems]
  );

  const totals = useMemo(
    () =>
      calculateOrderTotals(subtotal, {
        discount: manualDiscount,
        orderType,
        deliveryFee: shop.deliveryFee,
        freeDelivery: shop.freeDelivery,
        freeDeliveryMinOrder: shop.freeDeliveryMinOrder,
        enableServiceFee: applyTaxAndService && !forceZeroFeesGlobally,
        serviceFeePct: shop.enableServiceFee ? Number(shop.serviceFeePct || 0) : 12,
        enableVat: applyTaxAndService && !forceZeroFeesGlobally,
        vatPct: shop.enableVat ? Number(shop.vatPct || 0) : 14,
        enablePackagingFee: applyTaxAndService && Boolean(shop.enablePackagingFee) && !forceZeroFeesGlobally,
        packagingFee: Number(shop.packagingFee || 0),
        forceZeroFeesGlobally,
        roundForCashier: true,
      }),
    [
      subtotal,
      manualDiscount,
      orderType,
      shop.deliveryFee,
      shop.freeDelivery,
      shop.freeDeliveryMinOrder,
      shop.enableServiceFee,
      shop.serviceFeePct,
      shop.enableVat,
      shop.vatPct,
      shop.enablePackagingFee,
      shop.packagingFee,
      applyTaxAndService,
      forceZeroFeesGlobally,
    ]
  );

  const quickCashAmounts = useMemo(() => {
    const base = Math.max(0, totals.total);
    if (base <= 0) return [50, 100, 200];
    const suggestions = new Set<number>([base]);
    const steps = [50, 100, 200, 500, 1000];
    for (const step of steps) {
      const rounded = Math.ceil(base / step) * step;
      if (rounded > base) suggestions.add(rounded);
      if (suggestions.size >= 4) break;
    }
    return Array.from(suggestions).slice(0, 4);
  }, [totals.total]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const getProductQty = (productId: string) => {
    return Object.entries(cart).reduce((sum, [key, item]) => {
      if (key === productId || key.startsWith(`${productId}__`)) {
        return sum + item.quantity;
      }
      return sum;
    }, 0);
  };

  const addItemWithOption = (product: Product, option?: ParsedProductOption) => {
    if (product.available === false) {
      showToast(tx(isEn, 'هذا الصنف غير متاح حالياً', 'This item is currently unavailable'));
      return;
    }
    const cartKey = option ? `${product.id}__${option.label}` : product.id;
    const unitPrice = option ? option.price : product.price;
    setCart((prev) => {
      const existing = prev[cartKey];
      return {
        ...prev,
        [cartKey]: {
          product,
          unitPrice: existing ? existing.unitPrice : unitPrice,
          quantity: existing ? existing.quantity + 1 : 1,
          note: option ? option.label : existing?.note,
        },
      };
    });
  };

  const handleProductTap = (product: Product) => {
    if (product.available === false) {
      showToast(tx(isEn, 'هذا الصنف غير متاح حالياً', 'This item is currently unavailable'));
      return;
    }
    const options = getProductOptions(product);
    if (options.length > 0) {
      setOptionPickerProduct(product);
      return;
    }
    addItemWithOption(product);
  };

  const handleBarcodeOrEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const exactBarcode = sortedProducts.find(
      (p) => p.barcode && p.barcode.trim().toLowerCase() === q
    );
    const target = exactBarcode || (filteredProducts.length === 1 ? filteredProducts[0] : null);
    if (target) {
      e.preventDefault();
      handleProductTap(target);
      setSearchQuery('');
    }
  };

  const incCartKey = (cartKey: string) => {
    setCart((prev) => {
      const existing = prev[cartKey];
      if (!existing) return prev;
      return {
        ...prev,
        [cartKey]: { ...existing, quantity: existing.quantity + 1 },
      };
    });
  };

  const decItem = (cartKey: string) => {
    setCart((prev) => {
      const existing = prev[cartKey];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const next = { ...prev };
        delete next[cartKey];
        return next;
      }
      return {
        ...prev,
        [cartKey]: { ...existing, quantity: existing.quantity - 1 },
      };
    });
  };

  const removeItem = (cartKey: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[cartKey];
      return next;
    });
  };

  const clearCart = () => {
    setCart({});
    setManualDiscount(0);
    setPaidAmount('');
    setOrderNotes('');
    setCustomerInput('');
    setDeliveryAddress('');
    setDriverName('');
    setSelectedTable('');
  };

  const submitCashierOrder = async (
    targetStatus: 'completed' | 'held',
    autoPrint = false
  ) => {
    if (cartItems.length === 0) return;
    setSaving(true);
    try {
      const orderPayload = {
        shopId: shop.id,
        shopOwnerId: shop.ownerId,
        source: 'cashier' as const,
        orderType,
        status: targetStatus,
        paymentMethod,
        customerName: customerInput.trim() || tx(isEn, 'عميل كاشير', 'Walk-in Customer'),
        customerPhone: '',
        address: orderType === 'delivery' ? deliveryAddress.trim() : '',
        driverName: orderType === 'delivery' ? driverName.trim() : '',
        tableLabel: orderType === 'table' ? selectedTable : '',
        notes: orderNotes.trim(),
        itemsCount: totalCount,
        itemSummary: cartItems.map(
          (c) => `${c.product.name}${c.note ? ` (${c.note})` : ''} × ${c.quantity}`
        ),
        subtotal: totals.subtotal,
        discount: totals.discount,
        deliveryFee: totals.deliveryFee,
        packagingFee: totals.packagingFee,
        serviceFee: totals.serviceFee,
        vat: totals.vat,
        roundingDiff: totals.roundingDiff,
        total: totals.total,
        paidAmount: Number(paidAmount) || totals.total,
      };

      const makeLocal = (): Order => ({
        ...orderPayload,
        id: `pos-${Date.now()}`,
        orderNumber: `GH-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: Date.now(),
      });

      let order: Order;
      if (!shop.id.startsWith('shop-')) {
        order = makeLocal();
      } else {
        try {
          order = await createOrder(orderPayload);
        } catch {
          order = makeLocal();
        }
      }

      setLastReceiptOrder(order);
      onOrderCreated(order);
      clearCart();
      setMobileCartOpen(false);
      showToast(
        targetStatus === 'held'
          ? tx(isEn, `تم تعليق الطلب #${order.orderNumber}`, `Order #${order.orderNumber} held`)
          : tx(isEn, `تم تسجيل الفاتورة #${order.orderNumber} بنجاح`, `Invoice #${order.orderNumber} recorded`)
      );
      if (autoPrint) {
        setTimeout(() => window.print(), 120);
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePrintActiveOrLast = () => {
    if (cartItems.length > 0) {
      setLastReceiptOrder(null);
    }
    setTimeout(() => window.print(), 50);
  };

  const paidNum = Number(paidAmount) || 0;
  const changeDue = paidNum > totals.total ? paidNum - totals.total : 0;

  const orderTypeOptions = [
    { id: 'dine_in' as const, label: tx(isEn, 'محلي', 'Dine-in') },
    { id: 'pickup' as const, label: tx(isEn, 'تيك أواي', 'Takeaway') },
    { id: 'delivery' as const, label: tx(isEn, 'دليفري', 'Delivery') },
    { id: 'table' as const, label: tx(isEn, 'طاولة', 'Table') },
  ];

  // Reusable POS Checkout Ticket Body (used in desktop right column & mobile modal)
  const renderTicketBody = () => (
    <div className="space-y-3.5">
      {/* Tabs: Cart & Details */}
      <div className="grid grid-cols-2 gap-1.5 bg-orange-50/70 dark:bg-slate-800 p-1 rounded-2xl">
        <button
          type="button"
          onClick={() => setTicketTab('cart')}
          className={`py-2 rounded-xl text-xs font-extrabold transition-colors tabular-nums ${
            ticketTab === 'cart'
              ? 'bg-white dark:bg-slate-900 text-[#FF6A00] dark:text-orange-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {tx(isEn, `الأصناف (${totalCount})`, `Items (${totalCount})`)}
        </button>
        <button
          type="button"
          onClick={() => setTicketTab('details')}
          className={`py-2 rounded-xl text-xs font-extrabold transition-colors ${
            ticketTab === 'details'
              ? 'bg-white dark:bg-slate-900 text-[#FF6A00] dark:text-orange-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {tx(isEn, 'بيانات العميل والخصم', 'Customer & Discount')}
        </button>
      </div>

      {ticketTab === 'cart' ? (
        <>
          {/* Order Type Buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {orderTypeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setOrderType(opt.id)}
                className={`py-2 rounded-xl text-xs font-extrabold border transition-colors ${
                  orderType === opt.id
                    ? 'bg-[#FF6A00] text-white border-[#FF6A00]'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
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
              className="w-full py-2 px-3 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-200 font-bold text-xs"
            >
              {selectedTable
                ? tx(isEn, `الطاولة المختارة: ${selectedTable}`, `Selected Table: ${selectedTable}`)
                : tx(isEn, 'اضغط لاختيار الطاولة', 'Tap to choose table')}
            </button>
          )}

          {orderType === 'delivery' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder={tx(isEn, 'عنوان التوصيل', 'Delivery Address')}
                className="w-full px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
              />
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder={tx(isEn, 'اسم الطيار / السائق', 'Driver Name')}
                className="w-full px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
              />
            </div>
          )}

          {/* Cart Items */}
          {cartItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 dark:border-slate-700 py-8 px-4 text-center space-y-1.5">
              <ShoppingCart className="w-8 h-8 text-orange-300 mx-auto" />
              <p className="text-xs font-bold text-slate-500">
                {tx(
                  isEn,
                  'اضغط على أي صنف أو امسح الباركود لإضافته للفاتورة',
                  'Tap any item or scan a barcode to add it to the order'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[250px] lg:max-h-[270px] overflow-y-auto pr-0.5">
              {Object.entries(cart).map(([cartKey, { product, quantity, unitPrice, note }]) => (
                <div
                  key={cartKey}
                  className="bg-orange-50/40 dark:bg-slate-800 rounded-2xl p-2.5 space-y-1.5 border border-orange-100/70 dark:border-slate-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                        {product.name}
                      </div>
                      <div className="text-[11px] font-bold text-[#FF6A00] dark:text-orange-300 tabular-nums truncate">
                        {formatCompactMoney(unitPrice, shop.country, isEn)}
                        {note ? ` · ${note}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => incCartKey(cartKey)}
                        className="w-7 h-7 rounded-full bg-[#FF6A00] text-white flex items-center justify-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-extrabold text-xs tabular-nums min-w-[18px] text-center">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => decItem(cartKey)}
                        className="w-7 h-7 rounded-full bg-white dark:bg-slate-900 text-[#FF6A00] flex items-center justify-center border border-orange-100 dark:border-slate-700"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingItemId(editingItemId === cartKey ? null : cartKey)
                        }
                        className="w-7 h-7 rounded-xl bg-white dark:bg-slate-900 text-slate-600 flex items-center justify-center"
                        aria-label={tx(isEn, 'تعديل السعر', 'Edit price')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(cartKey)}
                        className="w-7 h-7 rounded-xl bg-white dark:bg-slate-900 text-amber-600 flex items-center justify-center"
                        aria-label={tx(isEn, 'حذف', 'Remove')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {editingItemId === cartKey && (
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-[11px] font-bold">
                        {tx(isEn, 'سعر الوحدة:', 'Unit Price:')}
                      </label>
                      <input
                        type="number"
                        value={unitPrice}
                        onChange={(e) => {
                          const nextPrice = Math.max(0, Number(e.target.value) || 0);
                          setCart((prev) => ({
                            ...prev,
                            [cartKey]: { ...prev[cartKey], unitPrice: nextPrice },
                          }));
                        }}
                        className="w-24 px-2 py-1 rounded-xl border border-orange-200 bg-white dark:bg-slate-900 text-xs font-bold tabular-nums"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2.5">
          <div>
            <label className="block text-xs font-bold mb-1">
              {tx(isEn, 'اسم العميل / الهاتف', 'Customer Name / Phone')}
            </label>
            <input
              type="text"
              value={customerInput}
              onChange={(e) => setCustomerInput(e.target.value)}
              placeholder={tx(isEn, 'مثال: أحمد - 010...', 'e.g. Ahmed - 010...')}
              className="w-full px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">
              {tx(isEn, 'خصم يدوي', 'Manual Discount')}
            </label>
            <input
              type="number"
              min={0}
              value={manualDiscount || ''}
              onChange={(e) => setManualDiscount(Math.max(0, Number(e.target.value) || 0))}
              placeholder={tx(isEn, 'قيمة الخصم', 'Discount amount')}
              className="w-full px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">
              {tx(isEn, 'ملاحظات للمطبخ', 'Kitchen Notes')}
            </label>
            <textarea
              rows={2}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder={tx(isEn, 'بدون بصل، زيادة صوص...', 'No onions, extra sauce...')}
              className="w-full px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
            />
          </div>
        </div>
      )}

      {/* Payment Method + Tax Toggle + Quick Cash */}
      <div className="space-y-2.5 pt-2 border-t border-orange-100 dark:border-slate-800">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'نقداً', label: tx(isEn, 'كاش', 'Cash') },
            { id: 'فيزا / بطاقة', label: tx(isEn, 'فيزا', 'Card') },
            { id: 'فودافون كاش', label: tx(isEn, 'محفظة', 'Wallet') },
          ].map((pm) => (
            <button
              key={pm.id}
              type="button"
              onClick={() => setPaymentMethod(pm.id)}
              className={`py-2 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1 ${
                paymentMethod === pm.id
                  ? 'bg-orange-50 dark:bg-orange-950 border-[#FF6A00] text-orange-900 dark:text-orange-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              <CreditCard className="w-3 h-3" />
              <span>{pm.label}</span>
            </button>
          ))}
        </div>

        {/* Optional Fees Toggle (OFF by default; disabled when admin turns off global fees) */}
        {!forceZeroFeesGlobally && (
          <button
            type="button"
            onClick={() => setApplyTaxAndService((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-orange-50/50 dark:bg-slate-800 border border-orange-100 dark:border-slate-700 text-xs font-bold"
          >
            <span>{tx(isEn, 'رسوم الخدمة والضريبة (اختياري)', 'Service Fee & Tax (Optional)')}</span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold ${
                applyTaxAndService
                  ? 'bg-[#FF6A00] text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {applyTaxAndService ? tx(isEn, 'مفعل', 'Enabled') : tx(isEn, 'بدون رسوم (0)', 'No Fees (0)')}
            </span>
          </button>
        )}

        {/* Cash Tendered */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span>{tx(isEn, 'المدفوع من العميل', 'Cash Tendered')}</span>
            {changeDue > 0 && (
              <span className="text-[#FF6A00] dark:text-orange-400 font-extrabold tabular-nums">
                {tx(isEn, 'الباقي للعميل:', 'Change Due:')}{' '}
                {formatCompactMoney(changeDue, shop.country, isEn)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {quickCashAmounts.map((amt, i) => (
              <button
                key={`${amt}-${i}`}
                type="button"
                onClick={() => setPaidAmount(String(amt))}
                className={`py-1.5 rounded-xl text-[11px] font-extrabold border tabular-nums ${
                  Number(paidAmount) === amt
                    ? 'bg-[#FF6A00] text-white border-[#FF6A00]'
                    : 'bg-white dark:bg-slate-800 border-orange-200 dark:border-slate-700'
                }`}
              >
                {i === 0 && amt === totals.total && totals.total > 0 ? tx(isEn, 'بالضبط', 'Exact') : amt}
              </button>
            ))}
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder={tx(isEn, 'مبلغ', 'Amount')}
              className="col-span-1 px-1.5 py-1.5 rounded-xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-center tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Totals Breakdown */}
      <div className="bg-orange-50/70 dark:bg-slate-800 rounded-2xl p-3 space-y-1 text-xs font-bold">
        <div className="flex justify-between">
          <span>{tx(isEn, 'سعر الأكل', 'Subtotal')}</span>
          <span className="tabular-nums">{formatCompactMoney(totals.subtotal, shop.country, isEn)}</span>
        </div>
        {totals.discount > 0 && (
          <div className="flex justify-between text-amber-700">
            <span>{tx(isEn, 'الخصم', 'Discount')}</span>
            <span className="tabular-nums">-{formatCompactMoney(totals.discount, shop.country, isEn)}</span>
          </div>
        )}
        {orderType === 'delivery' && (
          <div className="flex justify-between text-slate-700 dark:text-slate-300">
            <span>{tx(isEn, 'التوصيل', 'Delivery')}</span>
            <span className="tabular-nums">
              {totals.freeDeliveryApplied
                ? tx(isEn, 'مجاناً', 'Free')
                : formatCompactMoney(totals.deliveryFee, shop.country, isEn)}
            </span>
          </div>
        )}
        {totals.serviceFee > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>{tx(isEn, `الخدمة (${totals.serviceFeePct}%)`, `Service (${totals.serviceFeePct}%)`)}</span>
            <span className="tabular-nums">{totals.serviceFee.toFixed(2)}</span>
          </div>
        )}
        {totals.vat > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>{tx(isEn, `الضريبة (${totals.vatPct}%)`, `Tax (${totals.vatPct}%)`)}</span>
            <span className="tabular-nums">{totals.vat.toFixed(2)}</span>
          </div>
        )}
        {totals.packagingFee > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>{tx(isEn, 'التغليف', 'Packaging')}</span>
            <span className="tabular-nums">{totals.packagingFee.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-extrabold pt-1.5 border-t border-orange-200 dark:border-slate-700">
          <span>{tx(isEn, 'الإجمالي', 'Total')}</span>
          <span className="text-[#FF6A00] dark:text-orange-400 tabular-nums">
            {formatCompactMoney(totals.total, shop.country, isEn)}
          </span>
        </div>
      </div>

      {/* POS Action Buttons */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          disabled={saving || cartItems.length === 0}
          onClick={() => void submitCashierOrder('completed', true)}
          className="col-span-2 py-3 rounded-2xl bg-[#FF6A00] hover:bg-[#E55E00] disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 tabular-nums"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{tx(isEn, `دفع وطباعة (${totals.total})`, `Pay & Print (${totals.total})`)}</span>
        </button>
        <button
          type="button"
          disabled={saving || cartItems.length === 0}
          onClick={() => void submitCashierOrder('held')}
          className="py-3 rounded-2xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 disabled:opacity-40 font-extrabold text-xs inline-flex items-center justify-center gap-1"
        >
          <PauseCircle className="w-3.5 h-3.5" />
          {tx(isEn, 'تعليق', 'Hold')}
        </button>
        <button
          type="button"
          disabled={cartItems.length === 0 && !lastReceiptOrder}
          onClick={handlePrintActiveOrLast}
          className="py-3 rounded-2xl bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 disabled:opacity-40 font-bold text-xs inline-flex items-center justify-center gap-1"
        >
          <Printer className="w-3.5 h-3.5" />
          {tx(isEn, 'إيصال', 'Receipt')}
        </button>
      </div>
    </div>
  );

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen bg-orange-50/30 dark:bg-slate-950 pb-24 lg:pb-6">
      {/* Top POS Bar */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-orange-100 dark:border-slate-800 px-4 h-14 flex items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackDashboard}
            className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center shrink-0"
            aria-label={tx(isEn, 'رجوع', 'Back')}
          >
            {isEn ? <ArrowLeft className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
          </button>
          <div className="min-w-0">
            <div className="font-extrabold text-sm truncate">
              {tx(isEn, `كاشير ${displayShopName} · POS`, `${displayShopName} POS`)}
            </div>
          </div>
          <span
            className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-xl text-[11px] font-extrabold tabular-nums ${
              shop.isOpen
                ? 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {shop.isOpen ? tx(isEn, 'نقطة البيع نشطة', 'POS Active') : tx(isEn, 'مغلق', 'Closed')}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleLang}
            className="h-9 px-2.5 rounded-xl bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 text-xs font-extrabold inline-flex items-center gap-1"
            aria-label={tx(isEn, 'تغيير اللغة إلى الإنجليزية', 'Switch to Arabic')}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isEn ? 'عربي' : 'EN'}</span>
          </button>

          <PWAInstallButton variant="compact" label={tx(isEn, 'تثبيت POS', 'Install POS')} />

          <button
            type="button"
            onClick={() => setOrdersQueueOpen(true)}
            className="px-3 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-extrabold text-xs inline-flex items-center gap-1.5 relative"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tx(isEn, 'المعلقة والواردة', 'Held & Incoming')}</span>
            <span className="tabular-nums">({heldOrdersCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="lg:hidden w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center relative"
            aria-label={tx(isEn, 'السلة', 'Cart')}
          >
            <ShoppingCart className="w-4 h-4" />
            {totalCount > 0 && (
              <span
                className={`absolute -top-1 ${
                  isEn ? '-right-1' : '-left-1'
                } w-4 h-4 rounded-full bg-[#FF6A00] text-white text-[10px] font-bold flex items-center justify-center tabular-nums`}
              >
                {totalCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              viewMode === 'list'
                ? 'bg-[#FF6A00] text-white'
                : 'bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300'
            }`}
            aria-label={tx(isEn, 'عرض القائمة', 'List view')}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              viewMode === 'grid'
                ? 'bg-[#FF6A00] text-white'
                : 'bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300'
            }`}
            aria-label={tx(isEn, 'عرض الشبكة', 'Grid view')}
          >
            <Grid className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Menu Share & Copy Link Strip */}
      <div className="bg-orange-50/70 dark:bg-slate-900/90 border-b border-orange-100 dark:border-slate-800 px-4 py-2 no-print">
        <div className="max-w-7xl mx-auto flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyMenuUrl()}
                className="px-3.5 py-1.5 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
              >
                {menuLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>
                  {menuLinkCopied
                    ? tx(isEn, 'تم نسخ اللينك ✅', 'Link copied ✅')
                    : tx(isEn, 'نسخ لينك المنيو', 'Copy Menu Link')}
                </span>
              </button>
              <a
                href={getWhatsAppShareUrl(menuUrl)}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{tx(isEn, 'واتساب', 'WhatsApp')}</span>
              </a>
            </div>
            <span
              dir="ltr"
              className="text-[11px] font-bold text-[#FF6A00] dark:text-orange-300 bg-white dark:bg-slate-800 px-3 py-1 rounded-xl border border-orange-200/70 dark:border-slate-700 break-all"
            >
              {menuUrl}
            </span>
          </div>
        </div>
      </div>

      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#FF6A00] text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-lg no-print">
          {toastMsg}
        </div>
      )}

      {/* Main Split-Screen POS Workspace */}
      <div className="max-w-7xl mx-auto px-4 pt-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start no-print">
        {/* Left/Main Catalog Panel (7 or 8 cols on desktop) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3.5">
          {/* Search + Barcode Scanner Bar */}
          <div className="relative">
            <Search
              className={`w-4 h-4 text-slate-400 absolute ${
                isEn ? 'left-4' : 'right-4'
              } top-1/2 -translate-y-1/2`}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleBarcodeOrEnter}
              placeholder={tx(
                isEn,
                'ابحث بالاسم أو امسح الباركود واضغط Enter للإضافة الفورية...',
                'Search by name or scan barcode and press Enter...'
              )}
              className={`w-full ${
                isEn ? 'pl-11 pr-10' : 'pr-11 pl-10'
              } py-3 rounded-2xl bg-white dark:bg-slate-900 border border-orange-100 dark:border-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]`}
            />
            <Barcode
              className={`w-4 h-4 text-[#FF6A00] absolute ${
                isEn ? 'right-3.5' : 'left-3.5'
              } top-1/2 -translate-y-1/2`}
            />
          </div>

          {/* Categories Strip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold whitespace-nowrap shrink-0 border transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[#FF6A00] text-white border-[#FF6A00]'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-orange-100 dark:border-slate-800'
                }`}
              >
                {cat === ALL_CATEGORIES_KEY ? tx(isEn, 'الكل', 'All') : cat}
              </button>
            ))}
          </div>

          {/* Product Grid / List */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-orange-100 dark:border-slate-800 text-center space-y-2">
              <Utensils className="w-10 h-10 text-orange-300 mx-auto" />
              <p className="text-base font-bold text-slate-600 dark:text-slate-300">
                {tx(isEn, 'لا توجد أصناف مطابقة للبحث', 'No matching items found')}
              </p>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3'
                  : 'space-y-2.5'
              }
            >
              {filteredProducts.map((product) => {
                const qty = getProductQty(product.id);
                const options = getProductOptions(product);
                const isUnavailable = product.available === false;
                return (
                  <div
                    key={product.id}
                    onClick={() => handleProductTap(product)}
                    className={`cursor-pointer bg-white dark:bg-slate-900 rounded-3xl p-3 border transition-colors ${
                      isUnavailable
                        ? 'opacity-50 border-slate-200 dark:border-slate-800'
                        : qty > 0
                          ? 'border-[#FF6A00] shadow-xs'
                          : 'border-orange-100 dark:border-slate-800 hover:border-orange-400'
                    } ${
                      viewMode === 'grid'
                        ? 'min-h-[215px] flex flex-col justify-between'
                        : 'flex items-center justify-between gap-3'
                    }`}
                  >
                    <div className={viewMode === 'grid' ? 'space-y-2' : 'flex items-center gap-3'}>
                      <div
                        className={`${
                          viewMode === 'grid' ? 'h-28 w-full' : 'w-14 h-14 shrink-0'
                        } rounded-2xl bg-orange-50/70 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative`}
                      >
                        {product.imageUrl && !brokenImages[product.id] ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [product.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Utensils className="w-7 h-7 text-orange-300" />
                        )}
                        {qty > 0 && (
                          <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-[#FF6A00] text-white text-[10px] font-extrabold tabular-nums shadow">
                            {qty}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-2">
                          {product.name}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          {product.category}
                          {isUnavailable ? tx(isEn, ' · نفد', ' · Out of stock') : ''}
                        </div>
                        {options.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {options.slice(0, 2).map((opt) => (
                              <span
                                key={opt.raw}
                                className="px-1.5 py-0.5 rounded-lg bg-orange-50 dark:bg-orange-950/60 text-orange-900 dark:text-orange-200 text-[10px] font-extrabold tabular-nums"
                              >
                                {opt.label}
                                {opt.hasExplicitPrice ? ` · ${opt.price}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between gap-2 pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs sm:text-sm font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
                        {formatCompactMoney(product.price, shop.country, isEn)}
                      </span>
                      {qty === 0 || options.length > 0 ? (
                        <button
                          type="button"
                          disabled={isUnavailable}
                          onClick={() => handleProductTap(product)}
                          className={
                            options.length > 0
                              ? 'px-2.5 py-1.5 rounded-full bg-[#FF6A00] hover:bg-[#E55E00] disabled:opacity-40 text-white text-[11px] font-extrabold inline-flex items-center gap-1 tabular-nums'
                              : 'w-8 h-8 rounded-full bg-[#FF6A00] hover:bg-[#E55E00] disabled:opacity-40 text-white flex items-center justify-center'
                          }
                        >
                          <Plus className="w-4 h-4" />
                          {options.length > 0 && <span>{qty > 0 ? `(${qty})` : tx(isEn, 'خيارات', 'Options')}</span>}
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1 bg-orange-50 dark:bg-orange-950 rounded-full px-1.5 py-0.5 border border-orange-200 dark:border-orange-800">
                          <button
                            type="button"
                            onClick={() => addItemWithOption(product)}
                            className="w-6 h-6 rounded-full bg-[#FF6A00] text-white flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <span className="font-extrabold text-xs tabular-nums min-w-[14px] text-center">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => decItem(product.id)}
                            className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 text-[#FF6A00] flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
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

        {/* Desktop Persistent POS Register Ticket Panel */}
        <aside className="hidden lg:block lg:col-span-5 xl:col-span-4 sticky top-[72px] bg-white dark:bg-slate-900 rounded-3xl p-4 border border-orange-100 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-orange-100 dark:border-slate-800">
            <div className="flex items-center gap-2 font-extrabold text-base">
              <Receipt className="w-4 h-4 text-[#FF6A00]" />
              <span>{tx(isEn, 'فاتورة الكاشير الحالية', 'Current POS Order')}</span>
            </div>
            {cartItems.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs font-bold text-amber-700 hover:underline"
              >
                {tx(isEn, 'تفريغ السلة', 'Clear Cart')}
              </button>
            )}
          </div>
          {renderTicketBody()}
        </aside>
      </div>

      {/* Mobile Sticky Bottom Cart Bar */}
      <div className="fixed bottom-4 left-4 right-4 z-30 max-w-2xl mx-auto lg:hidden no-print">
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="w-full py-3.5 px-6 rounded-2xl bg-[#FF6A00] hover:bg-[#E55E00] text-white font-extrabold text-base shadow-lg flex items-center justify-between tabular-nums"
        >
          {totalCount === 0 ? (
            <>
              <span>{tx(isEn, 'السلة فارغة — افتح الفاتورة', 'Cart Empty — Open Order')}</span>
              <span>{formatCompactMoney(0, shop.country, isEn)}</span>
            </>
          ) : (
            <>
              <span>{tx(isEn, `إغلاق السلة - ${totalCount} صنف`, `Checkout - ${totalCount} items`)}</span>
              <span>{formatCompactMoney(totals.total, shop.country, isEn)}</span>
            </>
          )}
        </button>
      </div>

      {/* Mobile Close Cart Modal/Sheet */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex items-end justify-center bg-slate-900/40 backdrop-blur-xs no-print">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-orange-100 dark:border-slate-800">
              <h2 className="text-lg font-extrabold">
                {tx(isEn, 'إغلاق السلة والدفع', 'Checkout & Payment')}
              </h2>
              <div className="flex items-center gap-2">
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs font-bold text-amber-700"
                  >
                    {tx(isEn, 'مسح الكل', 'Clear All')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileCartOpen(false)}
                  className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {renderTicketBody()}
          </div>
        </div>
      )}

      {/* Held & Active POS Queue Modal */}
      {ordersQueueOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs no-print"
          onClick={() => setOrdersQueueOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-5 max-h-[85vh] flex flex-col justify-between border border-orange-100 dark:border-slate-800 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-orange-100 dark:border-slate-800">
              <h3 className="font-extrabold text-base">
                {tx(
                  isEn,
                  `الطلبات المعلقة والواردة (${heldAndActiveOrders.length})`,
                  `Held & Incoming Orders (${heldAndActiveOrders.length})`
                )}
              </h3>
              <button
                type="button"
                onClick={() => setOrdersQueueOpen(false)}
                className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2.5 flex-1">
              {heldAndActiveOrders.length === 0 ? (
                <p className="text-center text-sm font-bold text-slate-500 py-8">
                  {tx(isEn, 'لا توجد طلبات معلقة أو قيد التنفيذ حالياً.', 'No held or active orders right now.')}
                </p>
              ) : (
                heldAndActiveOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="rounded-2xl bg-orange-50/50 dark:bg-slate-800 border border-orange-100 dark:border-slate-700 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-sm tabular-nums">
                          #{ord.orderNumber} · {ord.customerName || tx(isEn, 'عميل', 'Customer')}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500">
                          {ord.status === 'held'
                            ? tx(isEn, 'معلق بالكاشير', 'Held at POS')
                            : ord.status === 'new'
                              ? tx(isEn, 'طلب جديد من المنيو', 'New Menu Order')
                              : tx(isEn, 'قيد التحضير', 'Preparing')}
                          {ord.tableLabel ? ` · ${ord.tableLabel}` : ''}
                        </div>
                      </div>
                      <span className="font-extrabold text-sm text-[#FF6A00] dark:text-orange-400 tabular-nums">
                        {formatCompactMoney(ord.total, shop.country, isEn)}
                      </span>
                    </div>
                    {ord.itemSummary && ord.itemSummary.length > 0 && (
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {ord.itemSummary.join(' • ')}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setLastReceiptOrder(ord);
                          setTimeout(() => window.print(), 100);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        {tx(isEn, 'طباعة', 'Print')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (shop.id.startsWith('shop-')) {
                            try {
                              await updateOrderStatus(shop.id, ord.id, 'completed');
                            } catch {
                              // ignore if local/demo
                            }
                          }
                          onOrderStatusChange?.(ord.id, 'completed');
                          showToast(
                            tx(isEn, `تم إتمام الطلب #${ord.orderNumber}`, `Order #${ord.orderNumber} completed`)
                          );
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-[#FF6A00] hover:bg-[#E55E00] text-white text-xs font-extrabold inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {tx(isEn, 'إتمام الطلب', 'Complete')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table Picker Modal */}
      {tablePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 space-y-4 border border-orange-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base">{tx(isEn, 'اختر الطاولة', 'Select Table')}</h3>
              <button
                type="button"
                onClick={() => setTablePickerOpen(false)}
                className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {tables.length === 0 ? (
              <div className="space-y-3 text-center">
                <p className="text-xs font-bold text-slate-500">
                  {tx(
                    isEn,
                    'لا توجد طاولات مضافة بعد، يمكنك كتابة رقم الطاولة يدوياً:',
                    'No tables configured yet. Type the table number manually:'
                  )}
                </p>
                <input
                  type="text"
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  placeholder={tx(isEn, 'مثال: طاولة 5', 'e.g. Table 5')}
                  className="w-full px-3 py-2.5 rounded-2xl border border-orange-200 dark:border-slate-700 text-sm font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setTablePickerOpen(false)}
                  className="w-full py-2.5 rounded-2xl bg-[#FF6A00] text-white font-bold text-sm"
                >
                  {tx(isEn, 'حفظ', 'Save')}
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
                    className="py-3 rounded-2xl bg-orange-50 hover:bg-orange-100 text-orange-900 font-bold text-sm"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cashier Option Picker Modal */}
      {optionPickerProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs no-print"
          onClick={() => setOptionPickerProduct(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 space-y-4 border border-orange-100 dark:border-slate-800 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="font-extrabold text-base truncate">{optionPickerProduct.name}</h3>
                {optionPickerProduct.description && (
                  <p className="text-xs font-medium text-slate-500 line-clamp-2">
                    {optionPickerProduct.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOptionPickerProduct(null)}
                className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {getProductOptions(optionPickerProduct).map((opt) => (
                <button
                  key={opt.raw}
                  type="button"
                  onClick={() => {
                    addItemWithOption(optionPickerProduct, opt);
                    setOptionPickerProduct(null);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-orange-50/70 hover:bg-orange-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-orange-200 dark:border-slate-700 flex items-center justify-between text-sm font-extrabold"
                >
                  <span>{opt.label}</span>
                  <span className="text-[#FF6A00] dark:text-orange-400 tabular-nums">
                    {formatMoney(opt.price, shop.country, undefined, isEn)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Printable 80mm Thermal POS Receipt */}
      <div
        className={`hidden print-only p-4 ${isEn ? 'text-left' : 'text-right'} max-w-[320px] mx-auto`}
        dir={isEn ? 'ltr' : 'rtl'}
      >
        <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400">
          <h2 className="text-lg font-extrabold">{displayShopName}</h2>
          {shop.address && <p className="text-[11px]">{shop.address}</p>}
          {shop.whatsapp && <p className="text-[11px]" dir="ltr">{shop.whatsapp}</p>}
          <p className="text-xs font-bold pt-1">
            {lastReceiptOrder
              ? tx(isEn, `فاتورة رقم #${lastReceiptOrder.orderNumber}`, `Invoice #${lastReceiptOrder.orderNumber}`)
              : tx(isEn, 'إيصال مبيعات كاشير POS', 'POS Sales Receipt')}
          </p>
        </div>
        {lastReceiptOrder && cartItems.length === 0 ? (
          <>
            <div className="border-b border-dashed border-slate-400 py-2.5 space-y-1 text-xs">
              {(lastReceiptOrder.itemSummary || []).map((line, i) => (
                <div key={i} className="font-semibold">
                  {line}
                </div>
              ))}
            </div>
            <div className="pt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span>{tx(isEn, 'سعر الأكل', 'Subtotal')}</span>
                <span>{lastReceiptOrder.subtotal}</span>
              </div>
              {lastReceiptOrder.discount ? (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'الخصم', 'Discount')}</span>
                  <span>-{lastReceiptOrder.discount}</span>
                </div>
              ) : null}
              {(lastReceiptOrder.deliveryFee ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'التوصيل', 'Delivery')}</span>
                  <span>{Number(lastReceiptOrder.deliveryFee).toFixed(2)}</span>
                </div>
              )}
              {lastReceiptOrder.serviceFee > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'الخدمة', 'Service')}</span>
                  <span>{lastReceiptOrder.serviceFee.toFixed(2)}</span>
                </div>
              )}
              {lastReceiptOrder.vat > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'الضريبة', 'Tax')}</span>
                  <span>{lastReceiptOrder.vat.toFixed(2)}</span>
                </div>
              )}
              {(lastReceiptOrder.packagingFee ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'التغليف', 'Packaging')}</span>
                  <span>{Number(lastReceiptOrder.packagingFee).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-slate-300">
                <span>{tx(isEn, 'الإجمالي', 'Total')}</span>
                <span>{formatCompactMoney(lastReceiptOrder.total, shop.country, isEn)}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-dashed border-slate-400 py-2.5 space-y-1 text-xs">
              {cartItems.map((c, idx) => (
                <div key={`${c.product.id}-${idx}`} className="flex justify-between">
                  <span>
                    {c.product.name}
                    {c.note ? ` (${c.note})` : ''} × {c.quantity}
                  </span>
                  <span>{c.unitPrice * c.quantity}</span>
                </div>
              ))}
            </div>
            <div className="pt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span>{tx(isEn, 'سعر الأكل', 'Subtotal')}</span>
                <span>{totals.subtotal}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'الخصم', 'Discount')}</span>
                  <span>-{totals.discount}</span>
                </div>
              )}
              {orderType === 'delivery' && (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'التوصيل', 'Delivery')}</span>
                  <span>
                    {totals.freeDeliveryApplied
                      ? tx(isEn, 'مجاناً', 'Free')
                      : totals.deliveryFee.toFixed(2)}
                  </span>
                </div>
              )}
              {totals.serviceFee > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, `رسوم الخدمة (${totals.serviceFeePct}%)`, `Service (${totals.serviceFeePct}%)`)}</span>
                  <span>{totals.serviceFee.toFixed(2)}</span>
                </div>
              )}
              {totals.vat > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, `الضريبة (${totals.vatPct}%)`, `Tax (${totals.vatPct}%)`)}</span>
                  <span>{totals.vat.toFixed(2)}</span>
                </div>
              )}
              {totals.packagingFee > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'التغليف', 'Packaging')}</span>
                  <span>{totals.packagingFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-slate-300">
                <span>{tx(isEn, 'الإجمالي', 'Total')}</span>
                <span>{formatCompactMoney(totals.total, shop.country, isEn)}</span>
              </div>
              {paidNum > 0 && (
                <div className="flex justify-between">
                  <span>{tx(isEn, 'المدفوع / الباقي', 'Paid / Change')}</span>
                  <span>
                    {paidNum} / {changeDue}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
        <p className="text-center text-[10px] pt-3 mt-2 border-t border-dashed border-slate-400">
          {tx(isEn, 'شكراً لزيارتكم · Ghazalo POS', 'Thank you · Ghazalo POS')}
        </p>
      </div>
    </div>
  );
};
