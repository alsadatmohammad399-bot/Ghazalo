import React, { useMemo, useState } from 'react';
import {
  Grid,
  Heart,
  List,
  Menu,
  MessageCircle,
  Minus,
  Moon,
  Plus,
  Search,
  Share2,
  ShoppingBag,
  Sun,
  Utensils,
  X,
  CheckCircle2,
  ClipboardList,
  Info,
  Phone,
  ArrowRight,
  Check,
  Loader2,
  Tag,
  Sparkles,
} from 'lucide-react';
import { ShopInitialAvatar } from '../components/BrandLogo';
import { createOrder } from '../services/firestoreService';
import {
  calculateOrderTotals,
  formatMoney,
  getShopAccessState,
  getShopThemeHex,
} from '../utils/calculations';
import { sortMenuCategories, sortProductsCulinary } from '../utils/menuSorting';
import { getMenuTemplateMeta } from '../utils/menuTemplates';
import { resolveDishPhotoClient } from '../utils/dishPhotoResolver';
import type { CartItem, Order, Product, Shop } from '../types';

interface StorefrontPageProps {
  shop: Shop;
  products: Product[];
  isDemo?: boolean;
  initialTableLabel?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onBack?: () => void;
  backLabel?: string;
}

const UPSELL_FALLBACKS: Array<{ id: string; name: string; price: number }> = [
  { id: 'upsell-1', name: 'وجبة كبدة', price: 120 },
  { id: 'upsell-2', name: 'ساندوتش سجق', price: 40 },
  { id: 'upsell-3', name: 'طبق سجق', price: 100 },
];

export const StorefrontPage: React.FC<StorefrontPageProps> = ({
  shop,
  products,
  isDemo = false,
  initialTableLabel = '',
  darkMode,
  onToggleDarkMode,
  onBack,
  backLabel = 'العودة',
}) => {
  const themeHex = getShopThemeHex(shop.themeColor);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<Record<string, CartItem>>({});

  // Drawers & Modals
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersPageOpen, setOrdersPageOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [shareToast, setShareToast] = useState('');

  // Checkout state
  const [orderType, setOrderType] = useState<'delivery' | 'pickup' | 'dine_in' | 'table'>(
    initialTableLabel ? 'table' : 'delivery'
  );
  const [paymentMethod, setPaymentMethod] = useState<string>('نقداً');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [tableLabel, setTableLabel] = useState(initialTableLabel);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Product Detail Page / Modal state
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailQty, setDetailQty] = useState<number>(1);

  // Customer local orders history for this shop
  const [customerOrders, setCustomerOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem(`sofrtek_customer_orders_${shop.id}`);
      return saved ? (JSON.parse(saved) as Order[]) : [];
    } catch {
      return [];
    }
  });

  const templateId = shop.menuTemplate || 'classic';
  const templateMeta = getMenuTemplateMeta(templateId);
  const showDishLogo = Boolean(shop.logoUrl && shop.showLogoOnItems);

  const activeProducts = useMemo(
    () =>
      sortProductsCulinary(products.filter((p) => p.available !== false)).map((p) => ({
        ...p,
        imageUrl: p.imageUrl || resolveDishPhotoClient(p.name, p.category),
      })),
    [products]
  );

  const offerProducts = useMemo(
    () => activeProducts.filter((p) => Boolean(p.isOffer)),
    [activeProducts]
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(activeProducts.map((p) => p.category).filter(Boolean)));
    return ['الكل', ...sortMenuCategories(unique)];
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    return activeProducts.filter((p) => {
      const matchCat = selectedCategory === 'الكل' || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [activeProducts, selectedCategory, searchQuery]);

  const getDiscountPct = (p: Product) => {
    if (!p.originalPrice || p.originalPrice <= p.price) return 0;
    return Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
  };

  const scrollToOffers = () => {
    const el = document.getElementById('offers-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalItemsCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );
  const cartSubtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems]
  );

  const totals = useMemo(() => calculateOrderTotals(cartSubtotal, 0, false), [cartSubtotal]);

  const upsellSuggestions = useMemo(() => {
    const notInCart = activeProducts.filter((p) => !cart[p.id]).slice(0, 3);
    if (notInCart.length >= 3) return notInCart;
    return UPSELL_FALLBACKS.map((fb) => ({
      id: fb.id,
      shopId: shop.id,
      shopOwnerId: shop.ownerId,
      name: fb.name,
      category: 'إضافات',
      price: fb.price,
      available: true,
    }));
  }, [activeProducts, cart, shop.id, shop.ownerId]);

  const openProductDetail = (product: Product) => {
    setDetailProduct(product);
    setDetailQty(1);
  };

  const getProductCartCount = (productId: string) => {
    return cart[productId]?.quantity || 0;
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          product,
          unitPrice: product.price,
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });
  };

  const addDetailToCart = () => {
    if (!detailProduct) return;
    setCart((prev) => {
      const existing = prev[detailProduct.id];
      return {
        ...prev,
        [detailProduct.id]: {
          product: detailProduct,
          unitPrice: detailProduct.price,
          quantity: existing ? existing.quantity + detailQty : detailQty,
        },
      };
    });
    setDetailProduct(null);
  };

  const incrementCartKey = (cartKey: string) => {
    setCart((prev) => {
      const existing = prev[cartKey];
      if (!existing) return prev;
      return {
        ...prev,
        [cartKey]: { ...existing, quantity: existing.quantity + 1 },
      };
    });
  };

  const decrementCart = (cartKey: string) => {
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

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[cartKey];
      return next;
    });
  };

  const handleShareMenu = async () => {
    const shareUrl = `${window.location.origin}/?shop=${shop.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareToast('تم نسخ رابط المنيو');
      setTimeout(() => setShareToast(''), 2500);
    } catch {
      setShareToast(shareUrl);
    }
  };

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError('');

    if (!customerName.trim() || !customerPhone.trim()) {
      setCheckoutError('يرجى إدخال الاسم ورقم الهاتف.');
      return;
    }
    if (orderType === 'delivery' && !address.trim()) {
      setCheckoutError('يرجى إدخال عنوان التوصيل.');
      return;
    }

    setSubmitting(true);
    try {
      const itemSummary = cartItems.map(
        (c) =>
          `${c.product.name}${c.note ? ` (${c.note})` : ''} × ${c.quantity} (${c.unitPrice * c.quantity})`
      );

      let created: Order;
      if (isDemo) {
        created = {
          id: `demo-ord-${Date.now()}`,
          orderNumber: `GH-${Math.floor(1000 + Math.random() * 9000)}`,
          shopId: shop.id,
          shopOwnerId: shop.ownerId,
          source: 'menu',
          orderType,
          status: 'new',
          paymentMethod,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          address: orderType === 'pickup' ? 'الاستلام من: الفرع الرئيسي' : address.trim(),
          floor: floor.trim(),
          apartment: apartment.trim(),
          tableLabel: orderType === 'table' ? tableLabel.trim() : '',
          notes: notes.trim(),
          itemsCount: totalItemsCount,
          itemSummary,
          subtotal: totals.subtotal,
          discount: 0,
          serviceFee: totals.serviceFee,
          vat: totals.vat,
          roundingDiff: 0,
          total: totals.total,
        };
      } else {
        created = await createOrder({
          shopId: shop.id,
          shopOwnerId: shop.ownerId,
          source: 'menu',
          orderType,
          status: 'new',
          paymentMethod,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          address: orderType === 'pickup' ? 'الاستلام من: الفرع الرئيسي' : address.trim(),
          floor: floor.trim(),
          apartment: apartment.trim(),
          tableLabel: orderType === 'table' ? tableLabel.trim() : '',
          notes: notes.trim(),
          itemsCount: totalItemsCount,
          itemSummary,
          subtotal: totals.subtotal,
          discount: 0,
          serviceFee: totals.serviceFee,
          vat: totals.vat,
          roundingDiff: 0,
          total: totals.total,
          paidAmount: totals.total,
        });
      }

      const nextOrders = [created, ...customerOrders];
      setCustomerOrders(nextOrders);
      try {
        localStorage.setItem(`sofrtek_customer_orders_${shop.id}`, JSON.stringify(nextOrders));
      } catch {
        // ignore storage quota
      }

      setCart({});
      setPlacedOrder(created);
      setCheckoutOpen(false);
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : 'تعذر إرسال الطلب.');
    } finally {
      setSubmitting(false);
    }
  };

  const shopAccess = useMemo(() => getShopAccessState(shop), [shop]);

  if (!isDemo && !shopAccess.isActive) {
    return (
      <div dir="rtl" className="min-h-screen bg-emerald-50/30 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-7 border border-amber-200 dark:border-amber-800 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 mx-auto flex items-center justify-center">
            <Utensils className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{shop.nameAr}</h1>
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
            عذراً، هذا المنيو متوقف مؤقتاً لحين موافقة الإدارة وتجديد الاشتراك.
          </p>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
            >
              {backLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (ordersPageOpen) {
    return (
      <div dir="rtl" className="min-h-screen bg-emerald-50/30 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-3xl p-4 border border-emerald-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setOrdersPageOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400"
            >
              <ArrowRight className="w-4 h-4" />
              العودة للمنيو
            </button>
            <h1 className="text-lg font-extrabold">طلباتي</h1>
            <div className="w-16" />
          </div>

          {customerOrders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-emerald-100 dark:border-slate-800 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-slate-800 text-emerald-600 mx-auto flex items-center justify-center">
                <ClipboardList className="w-8 h-8" />
              </div>
              <p className="text-base font-bold text-slate-700 dark:text-slate-200">
                لا توجد طلبات بعد. اطلب من المنيو لتظهر طلباتك هنا
              </p>
              <button
                type="button"
                onClick={() => setOrdersPageOpen(false)}
                className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
              >
                تصفح المنيو
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {customerOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-base tabular-nums">
                      طلب #{ord.orderNumber}
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold">
                      {ord.status === 'new'
                        ? 'جديد'
                        : ord.status === 'preparing'
                          ? 'قيد التحضير'
                          : ord.status === 'ready'
                            ? 'جاهز'
                            : 'مكتمل'}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {ord.itemSummary?.join(' • ')}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-emerald-50 dark:border-slate-800 text-sm font-extrabold">
                    <span>الإجمالي</span>
                    <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatMoney(ord.total, shop.country)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className={`min-h-screen pb-28 transition-colors ${
        templateId === 'luxury'
          ? 'bg-gradient-to-b from-amber-50/40 via-white to-emerald-50/20 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900'
          : 'bg-emerald-50/30 dark:bg-slate-950'
      }`}
    >
      {/* Top Floating Glass Bar */}
      <div className="sticky top-0 z-30 bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border-b border-white/60 dark:border-slate-800 px-4 h-14 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 rounded-full glass-btn text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1 shrink-0"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              {backLabel}
            </button>
          )}
          <span className="text-sm font-extrabold truncate max-w-[160px]">{shop.nameAr}</span>
        </div>

        <div className="flex items-center gap-2">
          {offerProducts.length > 0 && (
            <button
              type="button"
              onClick={scrollToOffers}
              className="px-3 py-1.5 rounded-full glass-btn-amber text-xs font-extrabold inline-flex items-center gap-1"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>العروض</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setOrdersPageOpen(true)}
            className="w-9 h-9 rounded-full glass-btn text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
            aria-label="طلباتي"
          >
            <ClipboardList className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="w-9 h-9 rounded-full glass-btn text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
            aria-label="تغيير المظهر"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setSideMenuOpen(true)}
            className="w-9 h-9 rounded-full glass-btn text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
            aria-label="القائمة"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Compact Cover Image & Store Identity */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div
          className={`rounded-3xl overflow-hidden border shadow-xs ${
            templateId === 'luxury'
              ? 'bg-gradient-to-br from-white via-amber-50/30 to-white dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/20 border-amber-200/80 dark:border-amber-900/50'
              : 'bg-white dark:bg-slate-900 border-emerald-100 dark:border-slate-800'
          }`}
        >
          {shop.coverImage ? (
            <img
              src={shop.coverImage}
              alt={shop.nameAr}
              referrerPolicy="no-referrer"
              className="w-full h-28 sm:h-36 object-cover"
            />
          ) : (
            <div
              style={{ backgroundColor: `${themeHex}15` }}
              className="w-full h-24 sm:h-28 flex items-center justify-center"
            >
              <Utensils style={{ color: themeHex }} className="w-8 h-8 opacity-40" />
            </div>
          )}

          {/* Store Identity + WhatsApp BELOW cover */}
          <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {shop.logoUrl ? (
                <img
                  src={shop.logoUrl}
                  alt={shop.nameAr}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-200 dark:border-slate-700 bg-white shadow-xs shrink-0"
                />
              ) : (
                <ShopInitialAvatar name={shop.nameAr} themeHex={themeHex} size="md" />
              )}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                    {shop.nameAr}
                  </h1>
                  <span
                    className={`px-2.5 py-0.5 rounded-xl text-xs font-extrabold ${
                      shop.isOpen
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {shop.isOpen ? 'مفتوح الآن' : 'مغلق الآن'}
                  </span>
                  {templateId !== 'classic' && (
                    <span className="px-2.5 py-0.5 rounded-xl text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/50">
                      {templateMeta.name}
                    </span>
                  )}
                </div>
                {(shop.city || shop.address || initialTableLabel) && (
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {[shop.city, shop.address, initialTableLabel].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            <a
              href={`https://wa.me/${(shop.whatsapp || '201000000000').replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full glass-btn-primary font-bold text-xs whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" />
              تواصل واتساب
            </a>
          </div>
        </div>
      </div>

      {/* Prominent Special Offers Menu ("قائمة العروض والخصومات") */}
      {offerProducts.length > 0 && !searchQuery.trim() && (
        <section id="offers-section" className="max-w-5xl mx-auto px-4 mt-4 scroll-mt-16">
          <div className="rounded-3xl bg-gradient-to-l from-amber-50/90 via-white to-emerald-50/70 dark:from-amber-950/30 dark:via-slate-900 dark:to-emerald-950/20 border border-amber-200/80 dark:border-amber-800/50 p-4 sm:p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    عروض اليوم والخصومات
                  </h2>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    وفر أكثر مع أقوى عروض {shop.nameAr}
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full glass-surface text-xs font-extrabold text-amber-800 dark:text-amber-300 tabular-nums">
                {offerProducts.length} عروض متاحة
              </span>
            </div>

            <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1 snap-x">
              {offerProducts.map((product) => {
                const inCartQty = getProductCartCount(product.id);
                const pct = getDiscountPct(product);
                return (
                  <div
                    key={`offer-${product.id}`}
                    onClick={() => openProductDetail(product)}
                    className="cursor-pointer min-w-[235px] sm:min-w-[260px] max-w-[270px] shrink-0 snap-start bg-white dark:bg-slate-900 rounded-3xl p-3 border border-amber-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-2.5 hover:border-emerald-300 transition-colors"
                  >
                    <div className="space-y-2">
                      <div className="relative h-28 rounded-2xl bg-emerald-50/70 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
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
                          <Utensils className="w-9 h-9 text-emerald-300" />
                        )}

                        <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[11px] font-extrabold shadow-xs">
                          {product.offerLabel || 'عرض خاص'}
                        </span>

                        {pct > 0 && (
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full glass-btn-primary text-[10px] font-extrabold tabular-nums">
                            وفر {pct}%
                          </span>
                        )}

                        {showDishLogo && shop.logoUrl && (
                          <img
                            src={shop.logoUrl}
                            alt={shop.nameAr}
                            className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute top-2 left-2"
                          />
                        )}
                      </div>

                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900 dark:text-white line-clamp-1">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-1">
                            {product.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between gap-2 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-baseline gap-1.5 tabular-nums">
                        <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                          {formatMoney(product.price, shop.country)}
                        </span>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <span className="text-[11px] font-bold text-slate-400 line-through">
                            {formatMoney(product.originalPrice, shop.country)}
                          </span>
                        )}
                      </div>

                      {inCartQty === 0 ? (
                        <button
                          type="button"
                          onClick={() => openProductDetail(product)}
                          disabled={!shop.acceptOrders}
                          className="px-3.5 py-1.5 rounded-full glass-btn-primary disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          أضف
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 glass-surface rounded-full px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-xs tabular-nums min-w-[14px] text-center">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => decrementCart(product.id)}
                            className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
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
          </div>
        </section>
      )}

      {/* Search + View Toggle + Floating Glass Categories */}
      <div className="max-w-5xl mx-auto px-4 mt-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن صنف"
              className="w-full pr-10 pl-4 py-3 rounded-2xl glass-surface text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-label="عرض القائمة"
            className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              viewMode === 'list'
                ? 'glass-btn-primary'
                : 'glass-btn text-slate-600 dark:text-slate-300'
            }`}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-label="عرض الشبكة"
            className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              viewMode === 'grid'
                ? 'glass-btn-primary'
                : 'glass-btn text-slate-600 dark:text-slate-300'
            }`}
          >
            <Grid className="w-5 h-5" />
          </button>
        </div>

        {/* Floating Glass Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5">
          {offerProducts.length > 0 && (
            <button
              type="button"
              onClick={scrollToOffers}
              className="px-4 py-2 rounded-full glass-btn-amber text-sm font-extrabold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              العروض ({offerProducts.length})
            </button>
          )}
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap shrink-0 ${
                  active
                    ? 'glass-btn-primary'
                    : 'glass-btn text-slate-700 dark:text-slate-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Section Title */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {selectedCategory === 'الكل' ? 'جميع الأصناف' : selectedCategory}
          </h2>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
            {filteredProducts.length} صنف
          </span>
        </div>

        {/* Products Rendered According to Selected Menu Template & View Mode */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-emerald-100 dark:border-slate-800 text-center space-y-2">
            <Utensils className="w-10 h-10 text-emerald-300 mx-auto" />
            <p className="text-base font-bold text-slate-600 dark:text-slate-300">
              لا توجد أصناف في هذه الفئة
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === 'list' || templateId === 'compact'
                ? templateId === 'compact' && viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                  : 'space-y-3'
                : templateId === 'magazine'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                  : templateId === 'luxury'
                    ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                    : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5'
            }
          >
            {filteredProducts.map((product) => {
              const inCartQty = getProductCartCount(product.id);
              const isFav = Boolean(favorites[product.id]);

              // Explicit List Mode OR Compact Fast-Ordering Template
              if (viewMode === 'list' || templateId === 'compact') {
                return (
                  <div
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    className="cursor-pointer bg-white dark:bg-slate-900 rounded-3xl p-3 border border-emerald-100 dark:border-slate-800 flex items-center justify-between gap-3 shadow-xs hover:border-emerald-300 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                        {product.imageUrl && !brokenImages[product.id] ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Utensils className="w-6 h-6 text-emerald-300" />
                        )}
                        {showDishLogo && shop.logoUrl && (
                          <img
                            src={shop.logoUrl}
                            alt={shop.nameAr}
                            className="w-5 h-5 rounded-full object-cover border border-white bg-white shadow-xs absolute top-1 left-1"
                          />
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                            {product.name}
                          </h3>
                          {product.isOffer && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                              {product.offerLabel || 'عرض'}
                            </span>
                          )}
                        </div>
                        {product.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                            {product.description}
                          </p>
                        )}
                        <div className="flex items-baseline gap-1.5 tabular-nums">
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                            {formatMoney(product.price, shop.country)}
                          </span>
                          {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-[11px] font-bold text-slate-400 line-through">
                              {formatMoney(product.originalPrice, shop.country)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {inCartQty === 0 ? (
                        <button
                          type="button"
                          onClick={() => openProductDetail(product)}
                          disabled={!shop.acceptOrders}
                          aria-label={`إضافة ${product.name}`}
                          className="w-10 h-10 rounded-full glass-btn-primary disabled:opacity-40 flex items-center justify-center"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-2 glass-surface rounded-full px-2 py-1">
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <span className="font-extrabold text-sm tabular-nums min-w-[18px] text-center">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => decrementCart(product.id)}
                            className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Template 2: Luxury Editorial Split Card
              if (templateId === 'luxury') {
                return (
                  <div
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    className="cursor-pointer bg-white dark:bg-slate-900 rounded-3xl p-4 border border-amber-200/80 dark:border-amber-900/50 shadow-xs flex items-center justify-between gap-4 hover:border-emerald-400 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-extrabold text-amber-700 dark:text-amber-300">
                          {product.category}
                        </span>
                        {product.isOffer && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-extrabold">
                            {product.offerLabel || 'عرض خاص'}
                          </span>
                        )}
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white line-clamp-2">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>
                      )}
                      <div
                        className="flex items-center justify-between gap-2 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-baseline gap-1.5 tabular-nums">
                          <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                            {formatMoney(product.price, shop.country)}
                          </span>
                          {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-xs font-bold text-slate-400 line-through">
                              {formatMoney(product.originalPrice, shop.country)}
                            </span>
                          )}
                        </div>
                        {inCartQty === 0 ? (
                          <button
                            type="button"
                            onClick={() => openProductDetail(product)}
                            disabled={!shop.acceptOrders}
                            className="px-4 py-2 rounded-full glass-btn-primary disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1"
                          >
                            <Plus className="w-4 h-4" />
                            أضف
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 glass-surface rounded-full px-1.5 py-1">
                            <button
                              type="button"
                              onClick={() => addToCart(product)}
                              className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-extrabold text-xs tabular-nums min-w-[16px] text-center">
                              {inCartQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => decrementCart(product.id)}
                              className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-amber-50/70 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                      {product.imageUrl && !brokenImages[product.id] ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils className="w-9 h-9 text-amber-300" />
                      )}
                      {showDishLogo && shop.logoUrl && (
                        <img
                          src={shop.logoUrl}
                          alt={shop.nameAr}
                          className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute top-1.5 left-1.5"
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // Template 3: Photo-First Magazine Card
              if (templateId === 'magazine') {
                return (
                  <div
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    className="cursor-pointer bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-emerald-100 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-emerald-300 transition-colors"
                  >
                    <div className="relative h-48 sm:h-52 bg-emerald-50/70 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                      {product.imageUrl && !brokenImages[product.id] ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils className="w-12 h-12 text-emerald-300" />
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavorites((prev) => ({ ...prev, [product.id]: !isFav }));
                        }}
                        aria-label="مفضلة"
                        className="absolute top-3 right-3 w-8 h-8 rounded-full glass-btn flex items-center justify-center"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            isFav ? 'fill-emerald-600 text-emerald-600' : 'text-slate-500'
                          }`}
                        />
                      </button>

                      {product.isOffer && (
                        <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-extrabold shadow-xs">
                          {product.offerLabel || 'عرض خاص'}
                        </span>
                      )}

                      {showDishLogo && shop.logoUrl && (
                        <img
                          src={shop.logoUrl}
                          alt={shop.nameAr}
                          className="w-8 h-8 rounded-full object-cover border-2 border-white bg-white shadow-md absolute top-3 left-3"
                        />
                      )}

                      <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full glass-surface text-xs font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">
                        {formatMoney(product.price, shop.country)}
                      </div>
                    </div>

                    <div className="p-4 flex flex-col justify-between gap-3 flex-1">
                      <div className="space-y-1">
                        <h3 className="font-extrabold text-base text-slate-900 dark:text-white line-clamp-2">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-2">
                            {product.description}
                          </p>
                        )}
                      </div>

                      <div
                        className="flex items-center justify-between gap-2 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {product.isOffer && product.originalPrice && product.originalPrice > product.price ? (
                          <span className="text-xs font-bold text-slate-400 line-through tabular-nums">
                            بدلاً من {formatMoney(product.originalPrice, shop.country)}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            {product.category}
                          </span>
                        )}

                        {inCartQty === 0 ? (
                          <button
                            type="button"
                            onClick={() => openProductDetail(product)}
                            disabled={!shop.acceptOrders}
                            className="px-4 py-2 rounded-full glass-btn-primary disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1"
                          >
                            <Plus className="w-4 h-4" />
                            أضف للسلة
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 glass-surface rounded-full px-1.5 py-1">
                            <button
                              type="button"
                              onClick={() => addToCart(product)}
                              className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-extrabold text-xs tabular-nums min-w-[16px] text-center">
                              {inCartQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => decrementCart(product.id)}
                              className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Template 1 (Default): Classic Modern Grid
              return (
                <div
                  key={product.id}
                  onClick={() => openProductDetail(product)}
                  className="cursor-pointer bg-white dark:bg-slate-900 rounded-3xl p-3 border border-emerald-100 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-3 hover:border-emerald-300 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="relative h-32 sm:h-36 rounded-2xl bg-emerald-50/70 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                      {product.imageUrl && !brokenImages[product.id] ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils className="w-10 h-10 text-emerald-300" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavorites((prev) => ({ ...prev, [product.id]: !isFav }));
                        }}
                        aria-label="مفضلة"
                        className="absolute top-2 right-2 w-8 h-8 rounded-full glass-btn flex items-center justify-center"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            isFav ? 'fill-emerald-600 text-emerald-600' : 'text-slate-500'
                          }`}
                        />
                      </button>

                      {product.isOffer && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-extrabold shadow-xs">
                          {product.offerLabel || 'عرض'}
                        </span>
                      )}

                      {showDishLogo && shop.logoUrl && (
                        <img
                          src={shop.logoUrl}
                          alt={shop.nameAr}
                          className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute top-2 left-2"
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-white line-clamp-2">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-1">
                          {product.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between gap-2 pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-baseline gap-1.5 tabular-nums flex-wrap">
                      <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(product.price, shop.country)}
                      </span>
                      {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                        <span className="text-[10px] font-bold text-slate-400 line-through">
                          {formatMoney(product.originalPrice, shop.country)}
                        </span>
                      )}
                    </div>

                    {inCartQty === 0 ? (
                      <button
                        type="button"
                        onClick={() => openProductDetail(product)}
                        disabled={!shop.acceptOrders}
                        aria-label={`إضافة ${product.name}`}
                        className="w-9 h-9 rounded-full glass-btn-primary disabled:opacity-40 flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 glass-surface rounded-full px-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-extrabold text-xs tabular-nums min-w-[14px] text-center">
                          {inCartQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => decrementCart(product.id)}
                          className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
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

      {/* Bottom Floating Glass Cart Bar */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-30 max-w-2xl mx-auto">
          <div className="glass-dock rounded-full p-1.5">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="w-full py-3 px-6 rounded-full glass-btn-primary font-extrabold text-base flex items-center justify-between tabular-nums"
            >
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5" />
                <span>السلة - {totalItemsCount} صنف</span>
              </div>
              <span>{formatMoney(cartSubtotal, shop.country)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Share Toast */}
      {shareToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-lg">
          {shareToast}
        </div>
      )}

      {/* Cart Slide-Up Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-t-3xl p-5 sm:p-6 max-h-[88vh] flex flex-col justify-between shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-100 dark:border-slate-800">
              <h2 className="text-xl font-extrabold">السلة</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto py-4 space-y-5 flex-1">
              {cartItems.length === 0 ? (
                <p className="text-center text-sm font-bold text-slate-500 py-8">السلة فارغة</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(cart).map(([cartKey, { product, quantity, unitPrice, note }]) => (
                    <div
                      key={cartKey}
                      className="flex items-center justify-between gap-3 bg-emerald-50/40 dark:bg-slate-800/70 rounded-2xl p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                          {product.imageUrl && !brokenImages[product.id] ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Utensils className="w-5 h-5 text-emerald-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm truncate">{product.name}</div>
                          {note && (
                            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                              {note}
                            </div>
                          )}
                          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {formatMoney(unitPrice * quantity, shop.country)}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(cartKey)}
                            className="text-xs font-bold text-slate-500 hover:text-amber-600 mt-0.5"
                          >
                            حذف
                          </button>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 rounded-full px-2 py-1 border border-emerald-200 dark:border-slate-700 shrink-0">
                        <button
                          type="button"
                          onClick={() => incrementCartKey(cartKey)}
                          className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <span className="font-extrabold text-sm tabular-nums min-w-[16px] text-center">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => decrementCart(cartKey)}
                          className="w-7 h-7 rounded-full bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Section "يكمل طلبك" */}
              <div className="space-y-2.5 pt-2">
                <h3 className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  يكمل طلبك
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {upsellSuggestions.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 rounded-2xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate">{item.name}</div>
                        <div className="text-xs font-extrabold text-emerald-600 tabular-nums">
                          {item.price}ج
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-emerald-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between font-extrabold text-base">
                <span>الإجمالي</span>
                <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatMoney(cartSubtotal, shop.country)}
                </span>
              </div>
              <button
                type="button"
                disabled={cartItems.length === 0}
                onClick={() => {
                  setCartOpen(false);
                  setCheckoutOpen(true);
                }}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-base"
              >
                متابعة للتفاصيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Details Drawer */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmOrder}
            className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-t-3xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-emerald-100 dark:border-slate-800">
              <h2 className="text-xl font-extrabold">بيانات الطلب</h2>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Type */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-600 dark:text-slate-300">
                نوع الطلب
              </label>
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
                    className={`py-2.5 rounded-2xl text-sm font-bold border transition-colors ${
                      orderType === opt.id
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-600 dark:text-slate-300">
                طريقة الدفع
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(shop.paymentMethods?.length ? shop.paymentMethods : ['نقداً', 'فودافون كاش']).map(
                  (pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentMethod(pm)}
                      className={`py-2.5 rounded-2xl text-sm font-bold border transition-colors ${
                        paymentMethod === pm
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {pm}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Ordered Customer Fields */}
            <div className="space-y-3">
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="الاسم"
                className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
              />
              <input
                type="tel"
                required
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="الهاتف"
                className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-right"
              />

              {orderType === 'pickup' ? (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 p-3.5 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                  الاستلام من: الفرع الرئيسي
                </div>
              ) : orderType === 'table' ? (
                <input
                  type="text"
                  value={tableLabel}
                  onChange={(e) => setTableLabel(e.target.value)}
                  placeholder="رقم الطاولة (مثال: طاولة 3)"
                  className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                />
              ) : orderType === 'delivery' ? (
                <>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="العنوان"
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      placeholder="الدور"
                      className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                    <input
                      type="text"
                      value={apartment}
                      onChange={(e) => setApartment(e.target.value)}
                      placeholder="الشقة"
                      className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                  </div>
                </>
              ) : null}

              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اكتب أي طلب خاص"
                className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
              />
            </div>

            {/* Detailed Calculation */}
            <div className="bg-emerald-50/60 dark:bg-slate-800 rounded-2xl p-4 space-y-2 text-sm font-bold">
              <div className="flex justify-between">
                <span>المجموع</span>
                <span className="tabular-nums">{formatMoney(totals.subtotal, shop.country)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>رسوم الخدمة (12%)</span>
                <span className="tabular-nums">{formatMoney(totals.serviceFee, shop.country)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>الضريبة (14%)</span>
                <span className="tabular-nums">{formatMoney(totals.vat, shop.country)}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold pt-2 border-t border-emerald-200 dark:border-slate-700">
                <span>الإجمالي</span>
                <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatMoney(totals.total, shop.country)}
                </span>
              </div>
            </div>

            {checkoutError && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs font-bold text-amber-800">
                {checkoutError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base flex items-center justify-center gap-2 tabular-nums"
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              <span>تأكيد الطلب - {formatMoney(totals.total, shop.country)}</span>
            </button>
          </form>
        </div>
      )}

      {/* Order Confirmation Modal */}
      {placedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 text-center space-y-4 border border-emerald-100 dark:border-slate-800 shadow-xl">
            <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto" />
            <h3 className="text-xl font-extrabold">تم استلام طلبك بنجاح!</h3>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              رقم الطلب: #{placedOrder.orderNumber}
            </p>
            <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
              الإجمالي: {formatMoney(placedOrder.total, shop.country)}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPlacedOrder(null);
                  setOrdersPageOpen(true);
                }}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
              >
                عرض طلباتي
              </button>
              <button
                type="button"
                onClick={() => setPlacedOrder(null)}
                className="flex-1 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 font-bold text-sm"
              >
                متابعة التسوق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Side Menu */}
      {sideMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setSideMenuOpen(false)} />
          <div className="relative z-10 w-72 bg-white dark:bg-slate-900 h-full p-5 flex flex-col justify-between shadow-xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-lg">{shop.nameAr}</span>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(false)}
                  className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-1.5 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    void handleShareMenu();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Share2 className="w-4 h-4 text-emerald-600" />
                  مشاركة المنيو
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleDarkMode();
                    setSideMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  {darkMode ? <Sun className="w-4 h-4 text-emerald-600" /> : <Moon className="w-4 h-4 text-emerald-600" />}
                  تغيير المظهر
                </button>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Utensils className="w-4 h-4 text-emerald-600" />
                  المنيو
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    setOrdersPageOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <ClipboardList className="w-4 h-4 text-emerald-600" />
                  الطلبات
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    setAboutModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Info className="w-4 h-4 text-emerald-600" />
                  عن المطعم
                </button>
                <a
                  href={`https://wa.me/${(shop.whatsapp || '201000000000').replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Phone className="w-4 h-4 text-emerald-600" />
                  تواصل معنا
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About Restaurant Modal */}
      {aboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 border border-emerald-100 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">عن {shop.nameAr}</h3>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {shop.bio || 'أشهى المأكولات والمشروبات الطازجة يومياً.'}
            </p>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 space-y-1">
              {shop.address && <div>العنوان: {shop.city} - {shop.address}</div>}
              <div>ساعات العمل: من {shop.workFrom || '4م'} إلى {shop.workTo || '2ص'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Page / Modal (Exact original item details only) */}
      {detailProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setDetailProduct(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-emerald-100 dark:border-slate-800"
          >
            {/* Large Product Image */}
            <div className="relative h-60 sm:h-72 bg-emerald-50/70 dark:bg-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
              {detailProduct.imageUrl && !brokenImages[detailProduct.id] ? (
                <img
                  src={detailProduct.imageUrl}
                  alt={detailProduct.name}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setBrokenImages((prev) => ({ ...prev, [detailProduct.id]: true }))
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <Utensils className="w-16 h-16 text-emerald-300" />
              )}

              <button
                type="button"
                onClick={() => setDetailProduct(null)}
                aria-label="إغلاق"
                className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-white flex items-center justify-center shadow-md"
              >
                <X className="w-5 h-5" />
              </button>

              {showDishLogo && shop.logoUrl && (
                <img
                  src={shop.logoUrl}
                  alt={shop.nameAr}
                  className="w-10 h-10 rounded-full object-cover border-2 border-white bg-white shadow-md absolute top-3 right-3"
                />
              )}

              {detailProduct.isOffer && (
                <span className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-xs font-extrabold shadow-sm">
                  {detailProduct.offerLabel || 'عرض خاص'}
                </span>
              )}
            </div>

            {/* Original Item Name, Full Description & Original Price */}
            <div className="overflow-y-auto p-5 sm:p-6 space-y-4 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                    {detailProduct.category}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                    {detailProduct.name}
                  </h2>
                </div>
                <div className="text-left shrink-0 tabular-nums">
                  <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                    {formatMoney(detailProduct.price, shop.country)}
                  </div>
                  {detailProduct.isOffer &&
                    detailProduct.originalPrice &&
                    detailProduct.originalPrice > detailProduct.price && (
                      <div className="text-xs font-bold text-slate-400 line-through">
                        {formatMoney(detailProduct.originalPrice, shop.country)}
                      </div>
                    )}
                </div>
              </div>

              {detailProduct.description && (
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                  {detailProduct.description}
                </p>
              )}
            </div>

            {/* Footer: Quantity +/- & Add to Cart Button */}
            <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-t border-emerald-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
              <div className="inline-flex items-center gap-2.5 bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 rounded-full px-2.5 py-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDetailQty((q) => q + 1)}
                  aria-label="زيادة الكمية"
                  className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <span className="font-extrabold text-base tabular-nums min-w-[20px] text-center">
                  {detailQty}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                  aria-label="إنقاص الكمية"
                  className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={!shop.acceptOrders}
                onClick={addDetailToCart}
                className="flex-1 py-3.5 px-5 rounded-full glass-btn-primary disabled:opacity-40 font-extrabold text-sm sm:text-base flex items-center justify-between gap-2 shadow-md tabular-nums"
              >
                <span>أضف للسلة</span>
                <span>{formatMoney(detailProduct.price * detailQty, shop.country)}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
