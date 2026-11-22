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
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Loader2,
  Tag,
  Sparkles,
  Lock,
  Mail,
  Clock,
  Truck,
  ShieldCheck,
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
import { resolveDishPhotoClient } from '../utils/dishPhotoResolver';
import { getProductOptions, type ParsedProductOption } from '../utils/productVariants';
import {
  copyMenuLink,
  getAbsoluteMenuUrl,
  getWhatsAppShareUrl,
} from '../utils/menuLink';
import { getShopDisplayName, tx, useUiLang } from '../utils/uiLang';
import {
  SUBSCRIPTION_PRICING,
  SUPPORT_CONTACT,
  getMenuTemplateConfig,
  type CartItem,
  type Order,
  type Product,
  type Shop,
} from '../types';

interface StorefrontPageProps {
  shop: Shop;
  products: Product[];
  isDemo?: boolean;
  isFallbackMenu?: boolean;
  onCreateFreeStore?: () => void;
  forceZeroFeesGlobally?: boolean;
  initialTableLabel?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOrderPlaced?: (order: Order) => void;
  onBack?: () => void;
  backLabel?: string;
}

const ALL_CATEGORIES_KEY = '__all__';

const UPSELL_FALLBACKS: Array<{ id: string; name: string; nameEn: string; price: number }> = [
  { id: 'upsell-1', name: 'وجبة كبدة', nameEn: 'Liver Meal', price: 120 },
  { id: 'upsell-2', name: 'ساندوتش سجق', nameEn: 'Sausage Sandwich', price: 40 },
  { id: 'upsell-3', name: 'طبق سجق', nameEn: 'Sausage Plate', price: 100 },
];

export const StorefrontPage: React.FC<StorefrontPageProps> = ({
  shop,
  products,
  isDemo = false,
  isFallbackMenu = false,
  onCreateFreeStore,
  forceZeroFeesGlobally = false,
  initialTableLabel = '',
  darkMode,
  onToggleDarkMode,
  onOrderPlaced,
  onBack,
  backLabel,
}) => {
  const { isEn, toggleLang } = useUiLang();
  const displayShopName = getShopDisplayName(shop, isEn);
  const resolvedBackLabel = backLabel || tx(isEn, 'العودة', 'Back');
  const themeHex = getShopThemeHex(shop.themeColor);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES_KEY);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<Record<string, CartItem>>({});

  // Drawers & Modals
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersPageOpen, setOrdersPageOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
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
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);

  // Customer local orders history for this shop
  const [customerOrders, setCustomerOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem(`sofrtek_customer_orders_${shop.id}`);
      return saved ? (JSON.parse(saved) as Order[]) : [];
    } catch {
      return [];
    }
  });

  const templateConfig = useMemo(
    () => getMenuTemplateConfig(shop.menuTemplate),
    [shop.menuTemplate]
  );
  const templateId = templateConfig.id;
  const templateStyles = templateConfig.styles;
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
    return [ALL_CATEGORIES_KEY, ...sortMenuCategories(unique)];
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    return activeProducts.filter((p) => {
      const matchCat = selectedCategory === ALL_CATEGORIES_KEY || p.category === selectedCategory;
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

  const totals = useMemo(
    () =>
      calculateOrderTotals(cartSubtotal, {
        orderType,
        deliveryFee: shop.deliveryFee,
        freeDelivery: shop.freeDelivery,
        freeDeliveryMinOrder: shop.freeDeliveryMinOrder,
        enableServiceFee: shop.enableServiceFee,
        serviceFeePct: shop.serviceFeePct,
        enableVat: shop.enableVat,
        vatPct: shop.vatPct,
        enablePackagingFee: shop.enablePackagingFee,
        packagingFee: shop.packagingFee,
        forceZeroFeesGlobally,
      }),
    [
      cartSubtotal,
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
      forceZeroFeesGlobally,
    ]
  );

  const hasAnyExtraFeeEnabled = useMemo(() => {
    if (forceZeroFeesGlobally) return false;
    return Boolean(
      (shop.enableServiceFee && Number(shop.serviceFeePct || 0) > 0) ||
        (shop.enableVat && Number(shop.vatPct || 0) > 0) ||
        (shop.enablePackagingFee && Number(shop.packagingFee || 0) > 0)
    );
  }, [
    forceZeroFeesGlobally,
    shop.enableServiceFee,
    shop.serviceFeePct,
    shop.enableVat,
    shop.vatPct,
    shop.enablePackagingFee,
    shop.packagingFee,
  ]);

  const getProductCartCount = (productId: string) => {
    return Object.entries(cart).reduce((sum, [key, item]) => {
      if (key === productId || key.startsWith(`${productId}__`)) {
        return sum + item.quantity;
      }
      return sum;
    }, 0);
  };

  const upsellSuggestions = useMemo(() => {
    const notInCart = activeProducts
      .filter(
        (p) =>
          !Object.keys(cart).some((key) => key === p.id || key.startsWith(`${p.id}__`))
      )
      .slice(0, 3);
    if (notInCart.length >= 3) return notInCart;
    return UPSELL_FALLBACKS.map((fb) => ({
      id: fb.id,
      shopId: shop.id,
      shopOwnerId: shop.ownerId,
      name: isEn ? fb.nameEn : fb.name,
      category: tx(isEn, 'إضافات', 'Extras'),
      price: fb.price,
      available: true,
    }));
  }, [activeProducts, cart, shop.id, shop.ownerId, isEn]);

  const openProductDetail = (product: Product, initialOptionIdx = 0) => {
    setDetailProduct(product);
    setDetailQty(1);
    setSelectedOptionIndex(initialOptionIdx);
  };

  const detailOptions = useMemo<ParsedProductOption[]>(() => {
    if (!detailProduct) return [];
    return getProductOptions(detailProduct);
  }, [detailProduct]);

  const selectedDetailOption: ParsedProductOption | null =
    detailOptions[selectedOptionIndex] || detailOptions[0] || null;

  const activeDetailUnitPrice = detailProduct
    ? selectedDetailOption
      ? selectedDetailOption.price
      : detailProduct.price
    : 0;

  const getProductPriceDisplay = (product: Product, options: ParsedProductOption[]) => {
    const priced = options.filter((o) => o.hasExplicitPrice && o.price > 0).map((o) => o.price);
    if (priced.length > 1) {
      const minP = Math.min(...priced);
      const maxP = Math.max(...priced);
      if (maxP > minP) {
        return `${tx(isEn, 'من', 'From')} ${formatMoney(minP, shop.country, undefined, isEn)}`;
      }
      return formatMoney(minP, shop.country, undefined, isEn);
    }
    return formatMoney(product.price, shop.country, undefined, isEn);
  };

  const renderCardOptionChips = (product: Product, options: ParsedProductOption[]) => {
    if (options.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 pt-0.5">
        {options.slice(0, 4).map((opt, idx) => (
          <button
            key={opt.raw}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openProductDetail(product, idx);
            }}
            className="px-2 py-0.5 rounded-lg bg-orange-50/90 dark:bg-orange-950/60 hover:bg-orange-100 dark:hover:bg-orange-900/70 border border-orange-200/80 dark:border-orange-800 text-[10px] font-extrabold text-[#FF6A00] dark:text-orange-300 tabular-nums transition-colors"
          >
            {opt.label}
            {opt.hasExplicitPrice ? ` · ${formatMoney(opt.price, shop.country, 0, isEn)}` : ''}
          </button>
        ))}
        {options.length > 4 && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
            +{options.length - 4}
          </span>
        )}
      </div>
    );
  };

  const addToCart = (product: Product) => {
    const options = getProductOptions(product);
    if (options.length > 0) {
      openProductDetail(product);
      return;
    }
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
    const option = selectedDetailOption;
    const cartKey = option ? `${detailProduct.id}__${option.label}` : detailProduct.id;
    const unitPrice = option ? option.price : detailProduct.price;
    setCart((prev) => {
      const existing = prev[cartKey];
      return {
        ...prev,
        [cartKey]: {
          product: detailProduct,
          unitPrice,
          quantity: existing ? existing.quantity + detailQty : detailQty,
          note: option?.label,
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

  const menuShareUrl = getAbsoluteMenuUrl(shop);

  const handleShareMenu = async () => {
    const ok = await copyMenuLink(menuShareUrl);
    setShareToast(
      ok
        ? tx(isEn, 'تم نسخ اللينك ✅', 'Link copied ✅')
        : menuShareUrl
    );
    setTimeout(() => setShareToast(''), 3000);
  };

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError('');

    if (!customerName.trim() || !customerPhone.trim()) {
      setCheckoutError(tx(isEn, 'يرجى إدخال الاسم ورقم الهاتف.', 'Please enter your name and phone number.'));
      return;
    }
    if (orderType === 'delivery' && !address.trim()) {
      setCheckoutError(tx(isEn, 'يرجى إدخال عنوان التوصيل.', 'Please enter your delivery address.'));
      return;
    }

    setSubmitting(true);
    try {
      const itemSummary = cartItems.map(
        (c) =>
          `${c.product.name}${c.note ? ` (${c.note})` : ''} × ${c.quantity} (${c.unitPrice * c.quantity})`
      );

      const basePayload = {
        shopId: shop.id,
        shopOwnerId: shop.ownerId,
        source: 'menu' as const,
        orderType,
        status: 'new' as const,
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
        deliveryFee: totals.deliveryFee,
        packagingFee: totals.packagingFee,
        serviceFee: totals.serviceFee,
        vat: totals.vat,
        roundingDiff: 0,
        total: totals.total,
        paidAmount: totals.total,
      };

      const makeLocalOrder = (): Order => ({
        ...basePayload,
        id: `ord-${Date.now()}`,
        orderNumber: `GH-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: Date.now(),
      });

      let created: Order;
      if (isDemo || !shop.id.startsWith('shop-')) {
        created = makeLocalOrder();
      } else {
        try {
          created = await createOrder(basePayload);
        } catch {
          created = makeLocalOrder();
        }
      }

      onOrderPlaced?.(created);

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
      setCheckoutError(
        err instanceof Error ? err.message : tx(isEn, 'تعذر إرسال الطلب.', 'Could not place order.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const shopAccess = useMemo(() => getShopAccessState(shop), [shop]);

  if (!isDemo && !shopAccess.isActive) {
    const waText = encodeURIComponent(
      `مرحباً إدارة غزالة، أرغب في تفعيل ${
        selectedPlan === 'monthly'
          ? `الاشتراك الشهري (${SUBSCRIPTION_PRICING.MONTHLY_EGP} جنيه / 30 يوم)`
          : `الاشتراك السنوي (${SUBSCRIPTION_PRICING.YEARLY_EGP} جنيه / 365 يوم)`
      } لمنيو مطعم (${shop.nameAr})`
    );
    const mailSubject = encodeURIComponent(
      `تفعيل ${selectedPlan === 'monthly' ? 'اشتراك شهري' : 'اشتراك سنوي'} لمنيو ${shop.nameAr} - Ghazalo`
    );

    return (
      <div
        dir={isEn ? 'ltr' : 'rtl'}
        className="min-h-screen bg-orange-50/30 dark:bg-slate-950 flex items-center justify-center p-4"
      >
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-orange-200 dark:border-orange-900 text-center space-y-5 shadow-sm relative">
          <button
            type="button"
            onClick={toggleLang}
            className={`absolute top-4 ${
              isEn ? 'right-4' : 'left-4'
            } px-2.5 py-1 rounded-full bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 text-xs font-extrabold inline-flex items-center gap-1`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isEn ? 'عربي' : 'EN'}</span>
          </button>
          <div className="w-16 h-16 rounded-3xl bg-orange-100 dark:bg-orange-950/60 text-[#FF6A00] dark:text-orange-300 mx-auto flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-extrabold text-[#FF6A00] dark:text-orange-400">
              {displayShopName}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug">
              {tx(
                isEn,
                'المنيو متوقف مؤقتاً، انتهت الفترة المجانية، فعل اشتراكك لتشغيل المنيو',
                'Menu temporarily paused — free trial ended. Activate a plan to resume.'
              )}
            </h1>
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${isEn ? 'text-left' : 'text-right'}`}>
            <button
              type="button"
              onClick={() => setSelectedPlan('monthly')}
              aria-pressed={selectedPlan === 'monthly'}
              className={`p-4 rounded-2xl space-y-1 text-start transition-all cursor-pointer ${
                selectedPlan === 'monthly'
                  ? 'border-2 border-[#FF6A00] bg-orange-50 dark:bg-orange-950/40 shadow-sm'
                  : 'border border-orange-200 dark:border-slate-700 bg-orange-50/30 dark:bg-slate-800/70 hover:border-[#FF6A00]/60'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-xs font-bold ${
                    selectedPlan === 'monthly'
                      ? 'text-orange-900 dark:text-orange-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tx(isEn, 'اشتراك شهري (30 يوم)', 'Monthly Plan (30 days)')}
                </span>
                {selectedPlan === 'monthly' && (
                  <span className="w-5 h-5 rounded-full bg-[#FF6A00] text-white inline-flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div className="text-lg font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
                {SUBSCRIPTION_PRICING.MONTHLY_EGP} {tx(isEn, 'جنيه / شهري', 'EGP / month')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan('yearly')}
              aria-pressed={selectedPlan === 'yearly'}
              className={`p-4 rounded-2xl space-y-1 text-start transition-all cursor-pointer ${
                selectedPlan === 'yearly'
                  ? 'border-2 border-[#FF6A00] bg-orange-50 dark:bg-orange-950/40 shadow-sm'
                  : 'border border-orange-200 dark:border-slate-700 bg-orange-50/30 dark:bg-slate-800/70 hover:border-[#FF6A00]/60'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-xs font-bold ${
                    selectedPlan === 'yearly'
                      ? 'text-orange-900 dark:text-orange-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tx(isEn, 'اشتراك سنوي (365 يوم)', 'Yearly Plan (365 days)')}
                </span>
                <div className="flex items-center gap-1">
                  <span className="px-2 py-0.5 rounded-full bg-amber-300 text-slate-900 text-[11px] font-extrabold">
                    {tx(
                      isEn,
                      `وفّر ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه`,
                      `Save ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} EGP`
                    )}
                  </span>
                  {selectedPlan === 'yearly' && (
                    <span className="w-5 h-5 rounded-full bg-[#FF6A00] text-white inline-flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </div>
              <div className="text-lg font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
                {SUBSCRIPTION_PRICING.YEARLY_EGP} {tx(isEn, 'جنيه / سنوي', 'EGP / year')}
              </div>
            </button>
          </div>

          <div className="space-y-2.5 pt-1">
            <a
              href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${waText}`}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3.5 px-4 rounded-full bg-[#FF6A00] hover:bg-[#E55E00] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <MessageCircle className="w-4 h-4" />
              <span>
                {tx(isEn, 'تواصل واتساب للتفعيل:', 'Activate via WhatsApp:')} {SUPPORT_CONTACT.PHONE_DISPLAY}
              </span>
            </a>

            <a
              href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${mailSubject}`}
              className="w-full py-3.5 px-4 rounded-full bg-orange-50 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-slate-700 text-orange-900 dark:text-orange-200 border border-orange-200 dark:border-slate-700 font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Mail className="w-4 h-4" />
              <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
            </a>
          </div>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-2.5 rounded-full glass-btn text-slate-700 dark:text-slate-200 font-bold text-xs"
            >
              {resolvedBackLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (ordersPageOpen) {
    return (
      <div
        dir={isEn ? 'ltr' : 'rtl'}
        className="min-h-screen bg-orange-50/30 dark:bg-slate-950 p-4 sm:p-6"
      >
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-3xl p-4 border border-orange-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setOrdersPageOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#FF6A00] dark:text-orange-400"
            >
              {isEn ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              {tx(isEn, 'العودة للمنيو', 'Back to Menu')}
            </button>
            <h1 className="text-lg font-extrabold">{tx(isEn, 'طلباتي', 'My Orders')}</h1>
            <div className="w-16" />
          </div>

          {customerOrders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-orange-100 dark:border-slate-800 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-orange-50 dark:bg-slate-800 text-[#FF6A00] mx-auto flex items-center justify-center">
                <ClipboardList className="w-8 h-8" />
              </div>
              <p className="text-base font-bold text-slate-700 dark:text-slate-200">
                {tx(
                  isEn,
                  'لا توجد طلبات بعد. اطلب من المنيو لتظهر طلباتك هنا',
                  'No orders yet. Place an order from the menu to track it here.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setOrdersPageOpen(false)}
                className="px-6 py-3 rounded-2xl bg-[#FF6A00] text-white font-bold text-sm"
              >
                {tx(isEn, 'تصفح المنيو', 'Browse Menu')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {customerOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-base tabular-nums">
                      {tx(isEn, `طلب #${ord.orderNumber}`, `Order #${ord.orderNumber}`)}
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-orange-50 dark:bg-orange-950 text-[#FF6A00] dark:text-orange-300 text-xs font-extrabold">
                      {ord.status === 'new'
                        ? tx(isEn, 'جديد', 'New')
                        : ord.status === 'preparing'
                          ? tx(isEn, 'قيد التحضير', 'Preparing')
                          : ord.status === 'ready'
                            ? tx(isEn, 'جاهز', 'Ready')
                            : tx(isEn, 'مكتمل', 'Completed')}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {ord.itemSummary?.join(' • ')}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-orange-50 dark:border-slate-800 text-sm font-extrabold">
                    <span>{tx(isEn, 'الإجمالي', 'Total')}</span>
                    <span className="text-[#FF6A00] dark:text-orange-400 tabular-nums">
                      {formatMoney(ord.total, shop.country, undefined, isEn)}
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
      dir={isEn ? 'ltr' : 'rtl'}
      className={`min-h-screen pb-28 transition-colors ${templateStyles.pageBackgroundClass}`}
    >
      {/* Generic Store Fallback Banner when opened via unknown slug */}
      {isFallbackMenu && (
        <div className="bg-gradient-to-l from-[#FF6A00] to-orange-500 text-white px-4 py-2.5 shadow-xs">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-extrabold">
            <span>
              {tx(
                isEn,
                `معاينة منيو (${displayShopName}) — هل هذا مطعمك؟ أنشئ متجرك الخاص وعدّل أصنافك مجاناً`,
                `Previewing menu (${displayShopName}) — Own this place? Create your store and customize items free`
              )}
            </span>
            {onCreateFreeStore && (
              <button
                type="button"
                onClick={onCreateFreeStore}
                className="px-4 py-1.5 rounded-full bg-white text-[#FF6A00] hover:bg-orange-50 text-xs font-extrabold shadow-xs transition-colors shrink-0"
              >
                {tx(isEn, 'انشئ متجرك مجانا', 'Create your store free')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Floating Glass Bar */}
      <div className="sticky top-0 z-30 bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border-b border-white/60 dark:border-slate-800 px-4 h-14 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 rounded-full glass-btn text-[#FF6A00] dark:text-orange-300 text-xs font-bold inline-flex items-center gap-1 shrink-0"
            >
              {isEn ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {resolvedBackLabel}
            </button>
          )}
          <span className="text-sm font-extrabold truncate max-w-[140px] sm:max-w-[200px]">
            {displayShopName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {offerProducts.length > 0 && (
            <button
              type="button"
              onClick={scrollToOffers}
              className="px-2.5 sm:px-3 py-1.5 rounded-full glass-btn-amber text-xs font-extrabold inline-flex items-center gap-1"
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{tx(isEn, 'العروض', 'Offers')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleLang}
            className="h-9 px-2.5 rounded-full glass-btn text-[#FF6A00] dark:text-orange-300 text-xs font-extrabold inline-flex items-center gap-1"
            aria-label={tx(isEn, 'تغيير اللغة إلى الإنجليزية', 'Switch to Arabic')}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isEn ? 'عربي' : 'EN'}</span>
          </button>
          <button
            type="button"
            onClick={() => setOrdersPageOpen(true)}
            className="w-9 h-9 rounded-full glass-btn text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
            aria-label={tx(isEn, 'طلباتي', 'My Orders')}
          >
            <ClipboardList className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="w-9 h-9 rounded-full glass-btn text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
            aria-label={tx(isEn, 'تغيير المظهر', 'Toggle theme')}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setSideMenuOpen(true)}
            className="w-9 h-9 rounded-full glass-btn text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
            aria-label={tx(isEn, 'القائمة', 'Menu')}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Store Hero Header: Cover Background Behind Logo & Store Name */}
      <div className={`${templateStyles.contentContainerClass} pt-4`}>
        <div
          className={`relative overflow-hidden border shadow-xs ${
            shop.coverImage
              ? 'rounded-3xl min-h-[180px] sm:min-h-[215px] flex flex-col justify-end border-orange-200/60 dark:border-slate-800'
              : templateStyles.heroShellClass
          }`}
        >
          {shop.coverImage ? (
            <>
              <img
                src={shop.coverImage}
                alt={shop.nameAr}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/15" />
            </>
          ) : (
            <div
              style={{ backgroundColor: `${themeHex}12` }}
              className={`${
                templateId === 'minimal' ? 'h-14 sm:h-16' : 'h-20 sm:h-24'
              } w-full flex items-center justify-center border-b border-orange-100/70 dark:border-slate-800`}
            >
              <Utensils style={{ color: themeHex }} className="w-8 h-8 opacity-35" />
            </div>
          )}

          {/* Store Identity + WhatsApp + Customer Delivery/Fees Badges */}
          <div className="relative z-10 p-4 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                {shop.logoUrl ? (
                  <img
                    src={shop.logoUrl}
                    alt={shop.nameAr}
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 bg-white shadow-md shrink-0 ${
                      shop.coverImage
                        ? 'border-white'
                        : 'border-orange-200 dark:border-slate-700'
                    }`}
                  />
                ) : (
                  <ShopInitialAvatar name={shop.nameAr} themeHex={themeHex} size="md" />
                )}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1
                      className={`text-xl sm:text-2xl font-extrabold ${
                        shop.coverImage
                          ? 'text-white drop-shadow-xs'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {displayShopName}
                    </h1>
                    <span
                      className={`px-2.5 py-0.5 rounded-xl text-xs font-extrabold ${
                        shop.isOpen
                          ? shop.coverImage
                            ? 'bg-[#FF6A00] text-white shadow-xs'
                            : 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300'
                          : shop.coverImage
                            ? 'bg-slate-900/80 text-slate-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {shop.isOpen ? tx(isEn, 'مفتوح الآن', 'Open Now') : tx(isEn, 'مغلق الآن', 'Closed Now')}
                    </span>
                  </div>
                  {(shop.city || shop.address || initialTableLabel) && (
                    <p
                      className={`text-xs font-semibold ${
                        shop.coverImage
                          ? 'text-slate-200'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {[shop.city, shop.address, initialTableLabel].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>

              <a
                href={`https://wa.me/${(shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER).replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full glass-btn-primary font-bold text-xs whitespace-nowrap shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                {tx(isEn, 'تواصل واتساب', 'WhatsApp Us')}
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-extrabold">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl tabular-nums ${
                  shop.coverImage
                    ? 'bg-white/15 text-white border border-white/20 backdrop-blur-sm'
                    : 'bg-orange-50 dark:bg-slate-800 text-orange-900 dark:text-orange-200 border border-orange-200 dark:border-slate-700'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                {shop.freeDelivery || Number(shop.deliveryFee || 0) === 0
                  ? tx(isEn, 'سعر التوصيل: مجاني', 'Delivery: Free')
                  : `${tx(isEn, 'سعر التوصيل:', 'Delivery Fee:')} ${formatMoney(Number(shop.deliveryFee || 0), shop.country, 0, isEn)}`}
              </span>

              {!shop.freeDelivery && Number(shop.freeDeliveryMinOrder || 0) > 0 && (
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl tabular-nums ${
                    shop.coverImage
                      ? 'bg-white/15 text-amber-200 border border-white/20 backdrop-blur-sm'
                      : 'bg-amber-50 dark:bg-slate-800 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-slate-700'
                  }`}
                >
                  {tx(isEn, 'توصيل مجاني فوق', 'Free delivery over')}{' '}
                  {formatMoney(Number(shop.freeDeliveryMinOrder), shop.country, 0, isEn)}
                </span>
              )}

              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
                  shop.coverImage
                    ? 'bg-white/15 text-white border border-white/20 backdrop-blur-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {tx(isEn, 'وقت التوصيل:', 'Delivery Time:')}{' '}
                  {shop.deliveryTime || tx(isEn, '30-45 دقيقة', '30-45 mins')}
                </span>
              </span>

              {!hasAnyExtraFeeEnabled && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
                    shop.coverImage
                      ? 'bg-[#FF6A00]/90 text-white border border-white/20'
                      : 'bg-orange-100/80 dark:bg-orange-950/60 text-[#FF6A00] dark:text-orange-300 border border-orange-200 dark:border-orange-900'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {tx(isEn, 'السعر شامل، بدون اي رسوم اضافية', 'All-inclusive prices, zero extra fees')}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Prominent Special Offers Menu */}
      {offerProducts.length > 0 && !searchQuery.trim() && (
        <section id="offers-section" className={`${templateStyles.contentContainerClass} mt-4 scroll-mt-16`}>
          <div className={`border p-4 sm:p-5 space-y-3 shadow-xs ${templateStyles.offersSectionClass}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    className={`text-base sm:text-lg font-extrabold ${
                      templateId === 'modern' ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {tx(isEn, 'عروض اليوم والخصومات', "Today's Offers & Deals")}
                  </h2>
                  <p
                    className={`text-[11px] font-bold ${
                      templateId === 'modern'
                        ? 'text-orange-200'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tx(
                      isEn,
                      `وفر أكثر مع أقوى عروض ${displayShopName}`,
                      `Save more with top deals from ${displayShopName}`
                    )}
                  </p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-extrabold tabular-nums ${
                  templateId === 'modern'
                    ? 'bg-white/15 text-amber-300 border border-white/15'
                    : 'glass-surface text-amber-800 dark:text-amber-300'
                }`}
              >
                {tx(isEn, `${offerProducts.length} عروض متاحة`, `${offerProducts.length} offers`)}
              </span>
            </div>

            <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1 snap-x">
              {offerProducts.map((product) => {
                const inCartQty = getProductCartCount(product.id);
                const pct = getDiscountPct(product);
                const options = getProductOptions(product);
                return (
                  <div
                    key={`offer-${product.id}`}
                    onClick={() => openProductDetail(product)}
                    className={`cursor-pointer min-w-[235px] sm:min-w-[260px] max-w-[270px] shrink-0 snap-start flex flex-col justify-between gap-2.5 transition-colors ${templateStyles.offersCardClass}`}
                  >
                    <div className="space-y-2">
                      <div className="relative h-28 rounded-2xl bg-orange-50/70 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
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
                          <Utensils className="w-9 h-9 text-orange-300" />
                        )}

                        <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[11px] font-extrabold shadow-xs">
                          {product.offerLabel || tx(isEn, 'عرض خاص', 'Special Offer')}
                        </span>

                        {pct > 0 && (
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full glass-btn-primary text-[10px] font-extrabold tabular-nums">
                            {tx(isEn, `وفر ${pct}%`, `Save ${pct}%`)}
                          </span>
                        )}

                        {showDishLogo && shop.logoUrl && (
                          <img
                            src={shop.logoUrl}
                            alt={displayShopName}
                            className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute top-2 left-2"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <h3 className="font-extrabold text-sm text-slate-900 dark:text-white line-clamp-1">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-2">
                            {product.description}
                          </p>
                        )}
                        {renderCardOptionChips(product, options)}
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between gap-2 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-baseline gap-1.5 tabular-nums">
                        <span className={`text-sm font-extrabold ${templateStyles.priceTextClass}`}>
                          {getProductPriceDisplay(product, options)}
                        </span>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <span className="text-[11px] font-bold text-slate-400 line-through">
                            {formatMoney(product.originalPrice, shop.country, undefined, isEn)}
                          </span>
                        )}
                      </div>

                      {inCartQty === 0 || options.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => openProductDetail(product)}
                          disabled={!shop.acceptOrders}
                          className={`px-3.5 py-1.5 rounded-full disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1 tabular-nums ${templateStyles.primaryButtonClass}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {inCartQty > 0
                            ? tx(isEn, `في السلة (${inCartQty})`, `In Cart (${inCartQty})`)
                            : options.length > 0
                              ? tx(isEn, 'اختر', 'Select')
                              : tx(isEn, 'أضف', 'Add')}
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 glass-surface rounded-full px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="w-6 h-6 rounded-full bg-[#FF6A00] text-white flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-xs tabular-nums min-w-[14px] text-center">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => decrementCart(product.id)}
                            className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
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

      {/* Search + View Toggle + Categories */}
      <div className={`${templateStyles.contentContainerClass} mt-4 space-y-3`}>
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search
              className={`w-4 h-4 text-slate-400 absolute ${
                isEn ? 'left-3.5' : 'right-3.5'
              } top-1/2 -translate-y-1/2`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tx(isEn, 'ابحث عن صنف', 'Search menu items')}
              className={`w-full ${
                isEn ? 'pl-10 pr-4' : 'pr-10 pl-4'
              } py-3 rounded-2xl glass-surface text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]`}
            />
          </div>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-label={tx(isEn, 'عرض القائمة', 'List view')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              viewMode === 'list'
                ? templateStyles.primaryButtonClass
                : 'glass-btn text-slate-600 dark:text-slate-300'
            }`}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-label={tx(isEn, 'عرض الشبكة', 'Grid view')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              viewMode === 'grid'
                ? templateStyles.primaryButtonClass
                : 'glass-btn text-slate-600 dark:text-slate-300'
            }`}
          >
            <Grid className="w-5 h-5" />
          </button>
        </div>

        {/* Categories Bar Styled By Active Template */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5">
          {offerProducts.length > 0 && (
            <button
              type="button"
              onClick={scrollToOffers}
              className="px-4 py-2 rounded-full glass-btn-amber text-sm font-extrabold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              {tx(isEn, `العروض (${offerProducts.length})`, `Offers (${offerProducts.length})`)}
            </button>
          )}
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap shrink-0 transition-colors ${
                  active ? templateStyles.categoryActiveClass : templateStyles.categoryIdleClass
                }`}
              >
                {cat === ALL_CATEGORIES_KEY ? tx(isEn, 'الكل', 'All') : cat}
              </button>
            );
          })}
        </div>

        {/* Section Title */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {selectedCategory === ALL_CATEGORIES_KEY
              ? tx(isEn, 'جميع الأصناف', 'All Menu Items')
              : selectedCategory}
          </h2>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
            {tx(isEn, `${filteredProducts.length} صنف`, `${filteredProducts.length} items`)}
          </span>
        </div>

        {/* Products Rendered According to Selected Menu Template & View Mode */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-orange-100 dark:border-slate-800 text-center space-y-2">
            <Utensils className="w-10 h-10 text-orange-300 mx-auto" />
            <p className="text-base font-bold text-slate-600 dark:text-slate-300">
              {tx(isEn, 'لا توجد أصناف في هذه الفئة', 'No items in this category')}
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === 'list'
                ? templateStyles.listContainerClass
                : templateStyles.gridContainerClass
            }
          >
            {filteredProducts.map((product) => {
              const inCartQty = getProductCartCount(product.id);
              const isFav = Boolean(favorites[product.id]);
              const options = getProductOptions(product);
              const displayPrice = getProductPriceDisplay(product, options);

              // Explicit List View Mode OR Compact Template ("مكثف")
              if (viewMode === 'list' || templateId === 'compact') {
                return (
                  <div
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    className={`cursor-pointer flex items-center justify-between gap-2.5 transition-colors ${
                      viewMode === 'list' && templateId === 'minimal'
                        ? 'p-3.5 bg-white dark:bg-slate-900 hover:bg-stone-50/70 dark:hover:bg-slate-800/50'
                        : templateStyles.cardClass
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`relative ${
                          templateId === 'compact' ? 'w-14 h-14' : 'w-16 h-16'
                        } rounded-2xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden`}
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
                          <Utensils className="w-6 h-6 text-orange-300" />
                        )}
                        {showDishLogo && shop.logoUrl && (
                          <img
                            src={shop.logoUrl}
                            alt={shop.nameAr}
                            className="w-5 h-5 rounded-full object-cover border border-white bg-white shadow-xs absolute top-1 left-1"
                          />
                        )}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                            {product.name}
                          </h3>
                          {product.isOffer && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                              {product.offerLabel || tx(isEn, 'عرض', 'Offer')}
                            </span>
                          )}
                        </div>
                        {product.description && (
                          <p
                            className={`text-xs text-slate-500 dark:text-slate-400 ${
                              templateId === 'compact' ? 'line-clamp-1' : 'line-clamp-2'
                            }`}
                          >
                            {product.description}
                          </p>
                        )}
                        {renderCardOptionChips(product, options)}
                        <div className="flex items-baseline gap-1.5 tabular-nums pt-0.5">
                          <span className={`text-sm font-extrabold ${templateStyles.priceTextClass}`}>
                            {displayPrice}
                          </span>
                          {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-[11px] font-bold text-slate-400 line-through">
                              {formatMoney(product.originalPrice, shop.country, undefined, isEn)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {inCartQty === 0 || options.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => openProductDetail(product)}
                          disabled={!shop.acceptOrders}
                          aria-label={tx(isEn, `إضافة ${product.name}`, `Add ${product.name}`)}
                          className={
                            options.length > 0
                              ? `px-3 py-1.5 rounded-full disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1 tabular-nums ${templateStyles.primaryButtonClass}`
                              : `w-9 h-9 rounded-full disabled:opacity-40 flex items-center justify-center ${templateStyles.primaryButtonClass}`
                          }
                        >
                          <Plus className="w-4 h-4" />
                          {options.length > 0 && (
                            <span>{inCartQty > 0 ? `(${inCartQty})` : tx(isEn, 'اختر', 'Select')}</span>
                          )}
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 glass-surface rounded-full px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="w-7 h-7 rounded-full bg-[#FF6A00] text-white flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-xs tabular-nums min-w-[16px] text-center">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => decrementCart(product.id)}
                            className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Template 3: Minimal Clean Menu ("بسيط")
              if (templateId === 'minimal') {
                return (
                  <div
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    className={`cursor-pointer flex items-start justify-between gap-3.5 transition-colors ${templateStyles.cardClass}`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`${templateStyles.cardImageBoxClass} flex items-center justify-center overflow-hidden`}>
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
                          <Utensils className="w-6 h-6 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-snug">
                            {product.name}
                          </h3>
                          {product.isOffer && (
                            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                              {product.offerLabel || tx(isEn, 'عرض', 'Offer')}
                            </span>
                          )}
                        </div>
                        {product.description && (
                          <p className="text-xs font-normal text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {product.description}
                          </p>
                        )}
                        {renderCardOptionChips(product, options)}
                        <div
                          className="flex items-center justify-between gap-2 pt-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-baseline gap-2 tabular-nums">
                            <span className={`text-sm font-extrabold ${templateStyles.priceTextClass}`}>
                              {displayPrice}
                            </span>
                            {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                              <span className="text-[11px] font-medium text-slate-400 line-through">
                                {formatMoney(product.originalPrice, shop.country, undefined, isEn)}
                              </span>
                            )}
                          </div>

                          {inCartQty === 0 || options.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => openProductDetail(product)}
                              disabled={!shop.acceptOrders}
                              aria-label={tx(isEn, `إضافة ${product.name}`, `Add ${product.name}`)}
                              className={`px-3.5 py-1.5 rounded-full disabled:opacity-40 text-xs font-bold inline-flex items-center gap-1 tabular-nums transition-colors ${templateStyles.primaryButtonClass}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>
                                {inCartQty > 0
                                  ? `(${inCartQty})`
                                  : options.length > 0
                                    ? tx(isEn, 'اختر', 'Select')
                                    : tx(isEn, 'أضف', 'Add')}
                              </span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 rounded-full px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={() => addToCart(product)}
                                className="w-6 h-6 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                              <span className="font-bold text-xs tabular-nums min-w-[14px] text-center">
                                {inCartQty}
                              </span>
                              <button
                                type="button"
                                onClick={() => decrementCart(product.id)}
                                className="w-6 h-6 rounded-full bg-stone-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Template 2: Modern Editorial Showcase ("عصري")
              if (templateId === 'modern') {
                return (
                  <div
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    className={`cursor-pointer flex items-stretch justify-between gap-4 transition-all ${templateStyles.cardClass}`}
                  >
                    <div className="flex-1 min-w-0 flex flex-col justify-between gap-2.5">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-extrabold text-[#FF6A00] dark:text-orange-400">
                            {product.category}
                          </span>
                          {product.isOffer && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-extrabold">
                              {product.offerLabel || tx(isEn, 'عرض خاص', 'Special Offer')}
                            </span>
                          )}
                        </div>
                        <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white line-clamp-2 leading-snug">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {product.description}
                          </p>
                        )}
                        {renderCardOptionChips(product, options)}
                      </div>

                      <div
                        className="flex items-center justify-between gap-2 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-baseline gap-1.5 tabular-nums flex-wrap">
                          <span className={`text-base font-extrabold ${templateStyles.priceTextClass}`}>
                            {displayPrice}
                          </span>
                          {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-xs font-bold text-slate-400 line-through">
                              {formatMoney(product.originalPrice, shop.country, undefined, isEn)}
                            </span>
                          )}
                        </div>
                        {inCartQty === 0 || options.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => openProductDetail(product)}
                            disabled={!shop.acceptOrders}
                            className={`px-4 py-2 rounded-full disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1 tabular-nums transition-colors ${templateStyles.primaryButtonClass}`}
                          >
                            <Plus className="w-4 h-4" />
                            {inCartQty > 0
                              ? tx(isEn, `في السلة (${inCartQty})`, `In Cart (${inCartQty})`)
                              : options.length > 0
                                ? tx(isEn, 'اختر', 'Select')
                                : tx(isEn, 'أضف للسلة', 'Add to Cart')}
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 glass-surface rounded-full px-1.5 py-1">
                            <button
                              type="button"
                              onClick={() => addToCart(product)}
                              className="w-7 h-7 rounded-full bg-[#FF6A00] text-white flex items-center justify-center"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-extrabold text-xs tabular-nums min-w-[16px] text-center">
                              {inCartQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => decrementCart(product.id)}
                              className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={`${templateStyles.cardImageBoxClass} overflow-hidden flex items-center justify-center`}>
                      {product.imageUrl && !brokenImages[product.id] ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils className="w-9 h-9 text-orange-300" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavorites((prev) => ({ ...prev, [product.id]: !isFav }));
                        }}
                        aria-label={tx(isEn, 'مفضلة', 'Favorite')}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full glass-btn flex items-center justify-center"
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${
                            isFav ? 'fill-[#FF6A00] text-[#FF6A00]' : 'text-slate-600'
                          }`}
                        />
                      </button>
                      {showDishLogo && shop.logoUrl && (
                        <img
                          src={shop.logoUrl}
                          alt={displayShopName}
                          className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute bottom-2 left-2"
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // Template 1 (Default): Classic Balanced Grid ("كلاسيكي")
              return (
                <div
                  key={product.id}
                  onClick={() => openProductDetail(product)}
                  className={`cursor-pointer flex flex-col justify-between gap-3 transition-colors ${templateStyles.cardClass}`}
                >
                  <div className="space-y-2.5">
                    <div className={`${templateStyles.cardImageBoxClass} flex items-center justify-center overflow-hidden`}>
                      {product.imageUrl && !brokenImages[product.id] ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils className="w-10 h-10 text-orange-300" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavorites((prev) => ({ ...prev, [product.id]: !isFav }));
                        }}
                        aria-label={tx(isEn, 'مفضلة', 'Favorite')}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full glass-btn flex items-center justify-center"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            isFav ? 'fill-[#FF6A00] text-[#FF6A00]' : 'text-slate-500'
                          }`}
                        />
                      </button>

                      {product.isOffer && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-extrabold shadow-xs">
                          {product.offerLabel || tx(isEn, 'عرض', 'Offer')}
                        </span>
                      )}

                      {showDishLogo && shop.logoUrl && (
                        <img
                          src={shop.logoUrl}
                          alt={displayShopName}
                          className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute top-2 left-2"
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-white line-clamp-2">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-2">
                          {product.description}
                        </p>
                      )}
                      {renderCardOptionChips(product, options)}
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between gap-2 pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-baseline gap-1.5 tabular-nums flex-wrap">
                      <span className={`text-sm font-extrabold ${templateStyles.priceTextClass}`}>
                        {displayPrice}
                      </span>
                      {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                        <span className="text-[10px] font-bold text-slate-400 line-through">
                          {formatMoney(product.originalPrice, shop.country, undefined, isEn)}
                        </span>
                      )}
                    </div>

                    {inCartQty === 0 || options.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => openProductDetail(product)}
                        disabled={!shop.acceptOrders}
                        aria-label={tx(isEn, `إضافة ${product.name}`, `Add ${product.name}`)}
                        className={
                          options.length > 0
                            ? `px-3 py-1.5 rounded-full disabled:opacity-40 text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 tabular-nums ${templateStyles.primaryButtonClass}`
                            : `w-9 h-9 rounded-full disabled:opacity-40 flex items-center justify-center shrink-0 ${templateStyles.primaryButtonClass}`
                        }
                      >
                        <Plus className="w-4 h-4" />
                        {options.length > 0 && (
                          <span>{inCartQty > 0 ? `(${inCartQty})` : tx(isEn, 'اختر', 'Select')}</span>
                        )}
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 glass-surface rounded-full px-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="w-6 h-6 rounded-full bg-[#FF6A00] text-white flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-extrabold text-xs tabular-nums min-w-[14px] text-center">
                          {inCartQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => decrementCart(product.id)}
                          className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
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
                <span>
                  {tx(isEn, `السلة - ${totalItemsCount} صنف`, `Cart - ${totalItemsCount} items`)}
                </span>
              </div>
              <span>{formatMoney(cartSubtotal, shop.country, undefined, isEn)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Share Toast */}
      {shareToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#FF6A00] text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-lg text-center space-y-0.5 max-w-[90vw]">
          <div>{shareToast}</div>
          <div dir="ltr" className="text-[11px] opacity-95 truncate max-w-xs mx-auto">
            {menuShareUrl}
          </div>
        </div>
      )}

      {/* Cart Slide-Up Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-t-3xl p-5 sm:p-6 max-h-[88vh] flex flex-col justify-between shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-orange-100 dark:border-slate-800">
              <h2 className="text-xl font-extrabold">{tx(isEn, 'السلة', 'Your Cart')}</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto py-4 space-y-5 flex-1">
              {cartItems.length === 0 ? (
                <p className="text-center text-sm font-bold text-slate-500 py-8">
                  {tx(isEn, 'السلة فارغة', 'Your cart is empty')}
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(cart).map(([cartKey, { product, quantity, unitPrice, note }]) => (
                    <div
                      key={cartKey}
                      className="flex items-center justify-between gap-3 bg-orange-50/40 dark:bg-slate-800/70 rounded-2xl p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-orange-100 dark:border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                          {product.imageUrl && !brokenImages[product.id] ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Utensils className="w-5 h-5 text-[#FF6A00]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm truncate">{product.name}</div>
                          {note && (
                            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                              {note}
                            </div>
                          )}
                          <div className="text-xs font-bold text-[#FF6A00] dark:text-orange-400 tabular-nums">
                            {formatMoney(unitPrice * quantity, shop.country, undefined, isEn)}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(cartKey)}
                            className="text-xs font-bold text-slate-500 hover:text-amber-600 mt-0.5"
                          >
                            {tx(isEn, 'حذف', 'Remove')}
                          </button>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 rounded-full px-2 py-1 border border-orange-200 dark:border-slate-700 shrink-0">
                        <button
                          type="button"
                          onClick={() => incrementCartKey(cartKey)}
                          className="w-7 h-7 rounded-full bg-[#FF6A00] text-white flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <span className="font-extrabold text-sm tabular-nums min-w-[16px] text-center">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => decrementCart(cartKey)}
                          className="w-7 h-7 rounded-full bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
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
                  {tx(isEn, 'يكمل طلبك', 'Goes Great With')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {upsellSuggestions.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-slate-800 border border-orange-100 dark:border-slate-700 rounded-2xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate">{item.name}</div>
                        <div className="text-xs font-extrabold text-[#FF6A00] tabular-nums">
                          {formatMoney(item.price, shop.country, undefined, isEn)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="w-8 h-8 rounded-full bg-[#FF6A00] text-white flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-orange-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between font-extrabold text-base">
                <span>{tx(isEn, 'الإجمالي', 'Subtotal')}</span>
                <span className="text-[#FF6A00] dark:text-orange-400 tabular-nums">
                  {formatMoney(cartSubtotal, shop.country, undefined, isEn)}
                </span>
              </div>
              <button
                type="button"
                disabled={cartItems.length === 0}
                onClick={() => {
                  setCartOpen(false);
                  setCheckoutOpen(true);
                }}
                className="w-full py-3.5 rounded-2xl bg-[#FF6A00] hover:bg-[#E55E00] disabled:opacity-40 text-white font-extrabold text-base"
              >
                {tx(isEn, 'متابعة للتفاصيل', 'Continue to Checkout')}
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
            <div className="flex items-center justify-between pb-3 border-b border-orange-100 dark:border-slate-800">
              <h2 className="text-xl font-extrabold">{tx(isEn, 'بيانات الطلب', 'Order Details')}</h2>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Type */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-600 dark:text-slate-300">
                {tx(isEn, 'نوع الطلب', 'Order Type')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'delivery', label: tx(isEn, 'توصيل', 'Delivery') },
                  { id: 'pickup', label: tx(isEn, 'استلام', 'Pickup') },
                  { id: 'dine_in', label: tx(isEn, 'محلي', 'Dine-in') },
                  { id: 'table', label: tx(isEn, 'طاولة', 'Table') },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOrderType(opt.id as typeof orderType)}
                    className={`py-2.5 rounded-2xl text-sm font-bold border transition-colors ${
                      orderType === opt.id
                        ? 'bg-orange-50 dark:bg-orange-950/60 border-[#FF6A00] text-orange-900 dark:text-orange-300'
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
                {tx(isEn, 'طريقة الدفع', 'Payment Method')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(shop.paymentMethods?.length ? shop.paymentMethods : ['نقداً', 'فودافون كاش']).map(
                  (pm) => {
                    const pmLabel = isEn
                      ? pm === 'نقداً'
                        ? 'Cash'
                        : pm === 'فودافون كاش'
                          ? 'Vodafone Cash'
                          : pm === 'فيزا / بطاقة'
                            ? 'Card / Visa'
                            : pm
                      : pm;
                    return (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setPaymentMethod(pm)}
                        className={`py-2.5 rounded-2xl text-sm font-bold border transition-colors ${
                          paymentMethod === pm
                            ? 'bg-orange-50 dark:bg-orange-950/60 border-[#FF6A00] text-orange-900 dark:text-orange-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {pmLabel}
                      </button>
                    );
                  }
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
                placeholder={tx(isEn, 'الاسم', 'Full Name')}
                className="w-full px-4 py-3 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
              />
              <input
                type="tel"
                required
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={tx(isEn, 'الهاتف', 'Phone Number')}
                className={`w-full px-4 py-3 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold ${
                  isEn ? 'text-left' : 'text-right'
                }`}
              />

              {orderType === 'pickup' ? (
                <div className="rounded-2xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-900 p-3.5 text-sm font-bold text-orange-900 dark:text-orange-200">
                  {tx(isEn, 'الاستلام من: الفرع الرئيسي', 'Pickup from: Main Branch')}
                </div>
              ) : orderType === 'table' ? (
                <input
                  type="text"
                  value={tableLabel}
                  onChange={(e) => setTableLabel(e.target.value)}
                  placeholder={tx(isEn, 'رقم الطاولة (مثال: طاولة 3)', 'Table Number (e.g. Table 3)')}
                  className="w-full px-4 py-3 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                />
              ) : orderType === 'delivery' ? (
                <>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={tx(isEn, 'العنوان', 'Delivery Address')}
                    className="w-full px-4 py-3 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      placeholder={tx(isEn, 'الدور', 'Floor')}
                      className="w-full px-4 py-3 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                    <input
                      type="text"
                      value={apartment}
                      onChange={(e) => setApartment(e.target.value)}
                      placeholder={tx(isEn, 'الشقة', 'Apartment')}
                      className="w-full px-4 py-3 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                  </div>
                </>
              ) : null}

              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tx(isEn, 'اكتب أي طلب خاص', 'Any special instructions...')}
                className="w-full px-4 py-3 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
              />
            </div>

            {/* Detailed Calculation: Food + Delivery (+ Optional Fees ONLY if enabled) */}
            <div className="bg-orange-50/70 dark:bg-slate-800 rounded-2xl p-4 space-y-2 text-sm font-bold">
              <div className="flex justify-between">
                <span>{tx(isEn, 'سعر الأكل', 'Subtotal')}</span>
                <span className="tabular-nums">
                  {formatMoney(totals.subtotal, shop.country, undefined, isEn)}
                </span>
              </div>
              {orderType === 'delivery' && (
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>{tx(isEn, 'سعر التوصيل', 'Delivery Fee')}</span>
                  <span className="tabular-nums font-extrabold text-[#FF6A00] dark:text-orange-400">
                    {totals.freeDeliveryApplied
                      ? tx(isEn, 'مجاناً', 'Free')
                      : formatMoney(totals.deliveryFee, shop.country, undefined, isEn)}
                  </span>
                </div>
              )}
              {totals.serviceFee > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>{tx(isEn, `رسوم الخدمة (${totals.serviceFeePct}%)`, `Service Fee (${totals.serviceFeePct}%)`)}</span>
                  <span className="tabular-nums">
                    {formatMoney(totals.serviceFee, shop.country, undefined, isEn)}
                  </span>
                </div>
              )}
              {totals.vat > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>{tx(isEn, `الضريبة (${totals.vatPct}%)`, `VAT (${totals.vatPct}%)`)}</span>
                  <span className="tabular-nums">
                    {formatMoney(totals.vat, shop.country, undefined, isEn)}
                  </span>
                </div>
              )}
              {totals.packagingFee > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>{tx(isEn, 'رسوم التغليف', 'Packaging Fee')}</span>
                  <span className="tabular-nums">
                    {formatMoney(totals.packagingFee, shop.country, undefined, isEn)}
                  </span>
                </div>
              )}
              {!totals.hasExtraFees && (
                <div className="text-[11px] font-extrabold text-[#FF6A00] dark:text-orange-400 pt-0.5">
                  {tx(isEn, 'السعر شامل، بدون اي رسوم اضافية', 'All-inclusive, no extra fees')}
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold pt-2 border-t border-orange-200 dark:border-slate-700">
                <span>{tx(isEn, 'الإجمالي', 'Total')}</span>
                <span className="text-[#FF6A00] dark:text-orange-400 tabular-nums">
                  {formatMoney(totals.total, shop.country, undefined, isEn)}
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
              className="w-full py-4 rounded-2xl bg-[#FF6A00] hover:bg-[#E55E00] text-white font-extrabold text-base flex items-center justify-center gap-2 tabular-nums"
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              <span>
                {tx(isEn, 'تأكيد الطلب', 'Place Order')} - {formatMoney(totals.total, shop.country, undefined, isEn)}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* Order Confirmation Modal */}
      {placedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 text-center space-y-4 border border-orange-100 dark:border-slate-800 shadow-xl">
            <CheckCircle2 className="w-14 h-14 text-[#FF6A00] mx-auto" />
            <h3 className="text-xl font-extrabold">
              {tx(isEn, 'تم استلام طلبك بنجاح!', 'Order Received Successfully!')}
            </h3>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              {tx(isEn, `رقم الطلب: #${placedOrder.orderNumber}`, `Order Number: #${placedOrder.orderNumber}`)}
            </p>
            <p className="text-lg font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
              {tx(isEn, 'الإجمالي:', 'Total:')} {formatMoney(placedOrder.total, shop.country, undefined, isEn)}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPlacedOrder(null);
                  setOrdersPageOpen(true);
                }}
                className="flex-1 py-3 rounded-2xl bg-[#FF6A00] text-white font-bold text-sm"
              >
                {tx(isEn, 'عرض طلباتي', 'View My Orders')}
              </button>
              <button
                type="button"
                onClick={() => setPlacedOrder(null)}
                className="flex-1 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 font-bold text-sm"
              >
                {tx(isEn, 'متابعة التسوق', 'Continue Browsing')}
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
                <span className="font-extrabold text-lg">{displayShopName}</span>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(false)}
                  className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-1.5 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => {
                    toggleLang();
                    setSideMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <span className="inline-flex items-center gap-3">
                    <Globe className="w-4 h-4 text-[#FF6A00]" />
                    {tx(isEn, 'اللغة / Language', 'Language / اللغة')}
                  </span>
                  <span className="text-xs font-extrabold text-[#FF6A00]">
                    {isEn ? 'عربي' : 'English'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    void handleShareMenu();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Share2 className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'نسخ رابط المنيو', 'Copy Menu Link')}
                </button>
                <a
                  href={getWhatsAppShareUrl(menuShareUrl)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setSideMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start text-emerald-700 dark:text-emerald-400"
                >
                  <MessageCircle className="w-4 h-4" />
                  {tx(isEn, 'مشاركة على واتساب', 'Share via WhatsApp')}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    onToggleDarkMode();
                    setSideMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  {darkMode ? <Sun className="w-4 h-4 text-[#FF6A00]" /> : <Moon className="w-4 h-4 text-[#FF6A00]" />}
                  {tx(isEn, 'تغيير المظهر', 'Toggle Theme')}
                </button>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Utensils className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'المنيو', 'Menu')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    setOrdersPageOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <ClipboardList className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'الطلبات', 'My Orders')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    setAboutModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Info className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'عن المطعم', 'About Restaurant')}
                </button>
                <a
                  href={`https://wa.me/${(shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER).replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Phone className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'تواصل معنا', 'Contact Us')}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About Restaurant Modal */}
      {aboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 border border-orange-100 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {tx(isEn, `عن ${displayShopName}`, `About ${displayShopName}`)}
              </h3>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {shop.bio || tx(isEn, 'أشهى المأكولات والمشروبات الطازجة يومياً.', 'Freshly prepared food and drinks daily.')}
            </p>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 space-y-1">
              {shop.address && (
                <div>
                  {tx(isEn, 'العنوان:', 'Address:')} {shop.city} - {shop.address}
                </div>
              )}
              <div>
                {tx(isEn, 'ساعات العمل:', 'Opening Hours:')} {shop.workFrom || '4م'} - {shop.workTo || '2ص'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Page / Modal */}
      {detailProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setDetailProduct(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-orange-100 dark:border-slate-800"
          >
            {/* Large Product Image */}
            <div className="relative h-60 sm:h-72 bg-orange-50/70 dark:bg-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
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
                <Utensils className="w-16 h-16 text-orange-300" />
              )}

              <button
                type="button"
                onClick={() => setDetailProduct(null)}
                aria-label={tx(isEn, 'إغلاق', 'Close')}
                className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-white flex items-center justify-center shadow-md"
              >
                <X className="w-5 h-5" />
              </button>

              {showDishLogo && shop.logoUrl && (
                <img
                  src={shop.logoUrl}
                  alt={displayShopName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-white bg-white shadow-md absolute top-3 right-3"
                />
              )}

              {detailProduct.isOffer && (
                <span className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-xs font-extrabold shadow-sm">
                  {detailProduct.offerLabel || tx(isEn, 'عرض خاص', 'Special Offer')}
                </span>
              )}
            </div>

            {/* Original Item Name, Full Description & Real Menu Options */}
            <div className="overflow-y-auto p-5 sm:p-6 space-y-4 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-extrabold text-[#FF6A00] dark:text-orange-400">
                    {detailProduct.category}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                    {detailProduct.name}
                  </h2>
                </div>
                <div className={`${isEn ? 'text-right' : 'text-left'} shrink-0 tabular-nums`}>
                  <div className="text-xl font-extrabold text-[#FF6A00] dark:text-orange-400">
                    {formatMoney(activeDetailUnitPrice, shop.country, undefined, isEn)}
                  </div>
                  {detailProduct.isOffer &&
                    detailProduct.originalPrice &&
                    detailProduct.originalPrice > activeDetailUnitPrice && (
                      <div className="text-xs font-bold text-slate-400 line-through">
                        {formatMoney(detailProduct.originalPrice, shop.country, undefined, isEn)}
                      </div>
                    )}
                </div>
              </div>

              {detailProduct.description && (
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {detailProduct.description}
                </p>
              )}

              {/* ONLY shown when the uploaded menu/product actually contains options/weights/offers */}
              {detailOptions.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-orange-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {tx(isEn, 'اختر من الخيارات المتاحة في المنيو', 'Choose an option')}
                    </span>
                    <span className="text-xs font-bold text-[#FF6A00] dark:text-orange-400">
                      {tx(isEn, 'مطلوب', 'Required')}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {detailOptions.map((opt, idx) => {
                      const active = (selectedDetailOption?.raw ?? '') === opt.raw;
                      return (
                        <button
                          key={opt.raw}
                          type="button"
                          onClick={() => setSelectedOptionIndex(idx)}
                          className={`p-3 rounded-2xl border text-start transition-all flex items-center justify-between gap-2 ${
                            active
                              ? 'bg-orange-50 dark:bg-orange-950/60 border-[#FF6A00] ring-2 ring-[#FF6A00]/30'
                              : 'bg-white dark:bg-slate-800 border-orange-100 dark:border-slate-700 hover:border-orange-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                active
                                  ? 'bg-[#FF6A00] text-white'
                                  : 'border border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {active && <Check className="w-3 h-3" />}
                            </span>
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                              {opt.label}
                            </span>
                          </div>
                          <span className="text-sm font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums shrink-0">
                            {formatMoney(opt.price, shop.country, undefined, isEn)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer: Quantity +/- & Add to Cart Button */}
            <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-t border-orange-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
              <div className="inline-flex items-center gap-2.5 bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-full px-2.5 py-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDetailQty((q) => q + 1)}
                  aria-label={tx(isEn, 'زيادة الكمية', 'Increase quantity')}
                  className="w-8 h-8 rounded-full bg-[#FF6A00] text-white flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <span className="font-extrabold text-base tabular-nums min-w-[20px] text-center">
                  {detailQty}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                  aria-label={tx(isEn, 'إنقاص الكمية', 'Decrease quantity')}
                  className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center"
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
                <span>{tx(isEn, 'أضف للسلة', 'Add to Cart')}</span>
                <span>{formatMoney(activeDetailUnitPrice * detailQty, shop.country, undefined, isEn)}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
