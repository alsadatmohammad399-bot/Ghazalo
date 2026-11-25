import React, { useEffect, useMemo, useState } from 'react';
import { toWhatsAppNumber } from '../utils/phone';
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
  ChefHat,
  ExternalLink,
  MapPin,
  Printer,
  QrCode,
} from 'lucide-react';
import { ShopInitialAvatar } from '../components/BrandLogo';
import { ChefAiAssistant } from '../components/ChefAiAssistant';
import { QrCodeImage, downloadQrPng } from '../components/QrToolkit';
import { StoreLocationPicker } from '../components/StoreLocationPicker';
import { createOrder } from '../services/firestoreService';
import {
  buildGoogleMapsLink,
  ensureGoogleAdsLoaded,
  sanitizeExternalUrl,
  trackAdsConversion,
} from '../utils/adsTracking';
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
  buildWhatsAppOrderUrl,
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
  hideDemoBanner?: boolean;
  isFallbackMenu?: boolean;
  isLoading?: boolean;
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
  hideDemoBanner = false,
  isFallbackMenu = false,
  isLoading = false,
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
  const [localDarkOverride, setLocalDarkOverride] = useState<boolean | null>(null);
  const effectiveDark =
    localDarkOverride !== null
      ? localDarkOverride
      : shop.themeMode === 'dark'
        ? true
        : shop.themeMode === 'light'
          ? false
          : darkMode;
  const handleToggleMenuTheme = () => {
    setLocalDarkOverride(!effectiveDark);
    onToggleDarkMode();
  };
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
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [chefChatOpen, setChefChatOpen] = useState(false);
  const [pendingChefQuestion, setPendingChefQuestion] = useState<{ id: string; text: string } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [shareToast, setShareToast] = useState('');

  useEffect(() => {
    ensureGoogleAdsLoaded(shop.googleAdsId);
  }, [shop.googleAdsId]);

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
            className="px-2 py-0.5 rounded-lg bg-[#FFFFFF] dark:bg-[#18231C] hover:bg-[#DCFCE7] dark:hover:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32] text-[10px] font-extrabold text-[#15803D] dark:text-[#BBF7D0] tabular-nums transition-colors"
          >
            {opt.label}
            {opt.hasExplicitPrice ? ` · ${formatMoney(opt.price, shop.country, 0, isEn)}` : ''}
          </button>
        ))}
        {options.length > 4 && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
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
  const fbUrl = sanitizeExternalUrl(shop.facebookUrl);
  const igUrl = sanitizeExternalUrl(shop.instagramUrl);
  const ttUrl = sanitizeExternalUrl(shop.tiktokUrl);
  const mapsUrl = buildGoogleMapsLink({
    googleMapsUrl: shop.googleMapsUrl,
    latitude: shop.latitude,
    longitude: shop.longitude,
    address: shop.address,
    city: shop.city,
    nameAr: shop.nameAr,
  });

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

    if (!isDemo && !getShopAccessState(shop).isActive) {
      setCheckoutError(
        tx(
          isEn,
          'انتهت الفترة المجانية، لتفعيل المنيو تواصل مع إدارة غزالو',
          'Free trial ended — contact Ghazalo team to activate this menu.'
        )
      );
      return;
    }

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
      trackAdsConversion('purchase', {
        adsId: shop.googleAdsId,
        conversionLabel: shop.googleAdsConversionLabel,
        value: created.total,
        currency: 'EGP',
        transactionId: created.orderNumber,
      });

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

  const maxWidthClass =
    templateId === 'modern' || templateId === 'compact' || templateId === 'royal'
      ? 'max-w-5xl mx-auto px-4'
      : templateId === 'minimal'
        ? 'max-w-2xl mx-auto px-4'
        : 'max-w-3xl mx-auto px-4';

  if (isLoading) {
    return (
      <div
        dir={isEn ? 'ltr' : 'rtl'}
        className={`${effectiveDark ? 'dark ' : ''}min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB]`}
      >
        <div className="sticky top-0 z-30 bg-[#FFFFFF]/95 dark:bg-[#18231C]/95 border-b border-[#CFE3D5] dark:border-[#2C3D32] px-4 h-14 flex items-center justify-between">
          <div className="h-5 w-36 rounded-lg bg-[#DCFCE7] dark:bg-[#173323] animate-pulse" />
          <div className="h-8 w-24 rounded-full bg-[#DCFCE7] dark:bg-[#173323] animate-pulse" />
        </div>
        <div className={`${maxWidthClass} pt-5 space-y-4`}>
          <div className="h-44 rounded-[24px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] p-5 flex items-end">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-[#DCFCE7] dark:bg-[#173323] animate-pulse" />
              <div className="space-y-2">
                <div className="h-5 w-44 rounded-lg bg-[#DCFCE7] dark:bg-[#173323] animate-pulse" />
                <div className="h-3.5 w-32 rounded-lg bg-[#F6FBF7] dark:bg-[#173323]/60 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="rounded-[22px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] p-3 space-y-2.5"
              >
                <div className="h-24 rounded-2xl bg-[#DCFCE7]/70 dark:bg-[#173323] animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-[#DCFCE7] dark:bg-[#173323] animate-pulse" />
                <div className="h-3.5 w-1/2 rounded bg-[#F6FBF7] dark:bg-[#173323]/60 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
        className={`${effectiveDark ? 'dark ' : ''}min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB] flex items-center justify-center p-4`}
      >
        <div className="max-w-[520px] w-full sf-card p-6 sm:p-7 text-center space-y-5 relative">
          <button
            type="button"
            onClick={toggleLang}
            className={`absolute top-4 ${
              isEn ? 'right-4' : 'left-4'
            } px-3 py-1.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] border border-[#86EFAC] dark:border-[#2C3D32] text-xs font-extrabold inline-flex items-center gap-1`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isEn ? 'عربي' : 'EN'}</span>
          </button>
          <div className="w-16 h-16 rounded-[20px] bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] border border-[#86EFAC] dark:border-[#2C3D32] mx-auto flex items-center justify-center mt-2">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-black text-[#15803D] dark:text-[#BBF7D0]">
              {displayShopName}
            </div>
            <h1 className="text-xl sm:text-2xl font-black leading-snug">
              {tx(
                isEn,
                'انتهت الفترة المجانية، لتفعيل المنيو تواصل مع إدارة غزالو',
                'Free trial ended — contact Ghazalo team to activate your menu'
              )}
            </h1>
            <p className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                `موبايل وواتساب: ${SUPPORT_CONTACT.PHONE_DISPLAY} · الجيميل: ${SUPPORT_CONTACT.EMAIL}`,
                `Phone & WhatsApp: ${SUPPORT_CONTACT.PHONE_DISPLAY} · Gmail: ${SUPPORT_CONTACT.EMAIL}`
              )}
            </p>
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${isEn ? 'text-left' : 'text-right'}`}>
            <button
              type="button"
              onClick={() => setSelectedPlan('monthly')}
              aria-pressed={selectedPlan === 'monthly'}
              className={`p-4 rounded-[18px] space-y-1 text-start transition-all cursor-pointer ${
                selectedPlan === 'monthly'
                  ? 'border-2 border-[#15803D] bg-[#DCFCE7] dark:bg-[#173323] shadow-sm'
                  : 'border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#18231C] hover:border-[#15803D]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-xs font-extrabold ${
                    selectedPlan === 'monthly'
                      ? 'text-[#14532D] dark:text-[#BBF7D0]'
                      : 'text-[#4B5B52] dark:text-[#A3B5AA]'
                  }`}
                >
                  {tx(isEn, 'اشتراك شهري (30 يوم)', 'Monthly Plan (30 days)')}
                </span>
                {selectedPlan === 'monthly' && (
                  <span className="w-5 h-5 rounded-full bg-[#15803D] text-white inline-flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div className="text-lg font-black text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
                {SUBSCRIPTION_PRICING.MONTHLY_EGP} {tx(isEn, 'جنيه / شهري', 'EGP / month')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan('yearly')}
              aria-pressed={selectedPlan === 'yearly'}
              className={`p-4 rounded-[18px] space-y-1 text-start transition-all cursor-pointer ${
                selectedPlan === 'yearly'
                  ? 'border-2 border-[#15803D] bg-[#DCFCE7] dark:bg-[#173323] shadow-sm'
                  : 'border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#18231C] hover:border-[#15803D]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-xs font-extrabold ${
                    selectedPlan === 'yearly'
                      ? 'text-[#14532D] dark:text-[#BBF7D0]'
                      : 'text-[#4B5B52] dark:text-[#A3B5AA]'
                  }`}
                >
                  {tx(isEn, 'اشتراك سنوي (365 يوم)', 'Yearly Plan (365 days)')}
                </span>
                <div className="flex items-center gap-1">
                  <span className="px-2 py-0.5 rounded-full bg-[#FACC15] text-[#14201A] text-[11px] font-black">
                    {tx(
                      isEn,
                      `وفّر ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه`,
                      `Save ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} EGP`
                    )}
                  </span>
                  {selectedPlan === 'yearly' && (
                    <span className="w-5 h-5 rounded-full bg-[#15803D] text-white inline-flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </div>
              <div className="text-lg font-black text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
                {SUBSCRIPTION_PRICING.YEARLY_EGP} {tx(isEn, 'جنيه / سنوي', 'EGP / year')}
              </div>
            </button>
          </div>

          <div className="space-y-2.5 pt-1">
            <a
              href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${waText}`}
              target="_blank"
              rel="noreferrer"
              className="sf-btn-primary w-full text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              <span>
                {tx(isEn, 'تواصل واتساب للتفعيل:', 'Activate via WhatsApp:')} {SUPPORT_CONTACT.PHONE_DISPLAY}
              </span>
            </a>

            <a
              href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${mailSubject}`}
              className="sf-btn-mint w-full text-sm"
            >
              <Mail className="w-4 h-4" />
              <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
            </a>
          </div>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="sf-btn text-xs px-6"
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
        className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB] p-4 sm:p-6"
      >
        <div className="max-w-[560px] mx-auto space-y-4">
          <div className="flex items-center justify-between sf-card p-3.5">
            <button
              type="button"
              onClick={() => setOrdersPageOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#15803D] dark:text-[#BBF7D0]"
            >
              {isEn ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              {tx(isEn, 'العودة للمنيو', 'Back to Menu')}
            </button>
            <h1 className="text-base font-black">{tx(isEn, 'طلباتي', 'My Orders')}</h1>
            <div className="w-16" />
          </div>

          {customerOrders.length === 0 ? (
            <div className="sf-card p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-[20px] bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] mx-auto flex items-center justify-center">
                <ClipboardList className="w-8 h-8" />
              </div>
              <p className="text-base font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
                {tx(
                  isEn,
                  'لا توجد طلبات بعد. اطلب من المنيو لتظهر طلباتك هنا',
                  'No orders yet. Place an order from the menu to track it here.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setOrdersPageOpen(false)}
                className="sf-btn-primary text-sm px-6"
              >
                {tx(isEn, 'تصفح المنيو', 'Browse Menu')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {customerOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="sf-card p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-base tabular-nums">
                      {tx(isEn, `طلب #${ord.orderNumber}`, `Order #${ord.orderNumber}`)}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-xs font-extrabold">
                      {ord.status === 'new'
                        ? tx(isEn, 'جديد', 'New')
                        : ord.status === 'preparing'
                          ? tx(isEn, 'قيد التحضير', 'Preparing')
                          : ord.status === 'ready'
                            ? tx(isEn, 'جاهز', 'Ready')
                            : tx(isEn, 'مكتمل', 'Completed')}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                    {ord.itemSummary?.join(' • ')}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32] text-sm font-black">
                    <span>{tx(isEn, 'الإجمالي', 'Total')}</span>
                    <span className="text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
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
      className={`${effectiveDark ? 'dark ' : ''}min-h-screen pb-28 transition-colors ${
        templateId === 'royal'
          ? 'bg-[#F7F4ED] dark:bg-[#0E1526] text-[#20263A] dark:text-[#F5F1E8]'
          : templateId === 'minimal'
            ? 'bg-[#FFFFFF] dark:bg-[#0B120E] text-[#14201A] dark:text-[#E8F2EB]'
            : `${templateStyles.pageBackgroundClass} text-[#14201A] dark:text-[#E8F2EB]`
      }`}
    >
      <div className="no-print">
      {/* Generic Store Fallback Banner when opened via unknown slug */}
      {isFallbackMenu && (
        <div
          style={templateId === 'royal' ? undefined : { backgroundColor: themeHex }}
          className={`px-4 py-2.5 shadow-xs ${
            templateId === 'royal'
              ? 'bg-[#A9813F] dark:bg-[#C9A35B] text-white dark:text-[#0E1526]'
              : 'text-white'
          }`}
        >
          <div className={`${maxWidthClass} flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-extrabold`}>
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
                className="px-4 py-1.5 rounded-full bg-[#FACC15] text-[#14201A] hover:bg-[#EAB308] text-xs font-black shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                {tx(isEn, 'انشئ متجرك مجانا', 'Create your store free')}
              </button>
            )}
          </div>
        </div>
      )}

      {isDemo && !isFallbackMenu && !hideDemoBanner && (
        <div
          style={templateId === 'royal' ? undefined : { backgroundColor: themeHex }}
          className={`px-4 py-2 text-xs font-extrabold ${
            templateId === 'royal'
              ? 'bg-[#0A1120] border-b border-[#C9A35B]/45 text-[#F5F1E8]'
              : 'text-white'
          }`}
        >
          <div className={`${maxWidthClass} flex flex-wrap items-center justify-between gap-2`}>
            <span className="inline-flex items-center gap-2 min-w-0">
              {templateId === 'royal' ? (
                <ChefHat className="w-4 h-4 text-[#C9A35B] shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate">
                {tx(
                  isEn,
                  `تجربة المنيو التجريبي — ${templateConfig.name} (${effectiveDark ? 'داكن' : 'فاتح'})`,
                  `Live Demo Menu — ${templateConfig.englishName} (${effectiveDark ? 'Dark' : 'Light'})`
                )}
              </span>
            </span>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className={`px-3 py-1 rounded-full text-[11px] font-black whitespace-nowrap shrink-0 transition-opacity hover:opacity-90 ${
                  templateId === 'royal'
                    ? 'bg-[#C9A35B] text-[#0E1526]'
                    : 'bg-white/20 text-white border border-white/30'
                }`}
              >
                {resolvedBackLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Sticky Menu Bar */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-md border-b px-4 h-14 flex items-center justify-between transition-colors ${
          templateId === 'royal'
            ? 'bg-[#FFFFFF]/95 dark:bg-[#0A1120]/95 text-[#20263A] dark:text-[#F5F1E8] border-[#E3DCCB] dark:border-[#2A3550]'
            : templateId === 'modern'
              ? 'bg-[#14201A]/95 text-white border-[#2C3D32]'
              : templateId === 'minimal'
                ? 'bg-[#FFFFFF]/95 dark:bg-[#0B120E]/95 border-[#CFE3D5]/70 dark:border-[#2C3D32]'
                : 'bg-[#FFFFFF]/95 dark:bg-[#18231C]/95 border-[#CFE3D5] dark:border-[#2C3D32] shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={
                templateId === 'modern'
                  ? undefined
                  : { color: effectiveDark ? '#BBF7D0' : themeHex }
              }
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                templateId === 'modern'
                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
                  : 'glass-btn'
              }`}
            >
              {isEn ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {resolvedBackLabel}
            </button>
          )}
          <span className="text-sm font-black truncate max-w-[150px] sm:max-w-[240px]">
            {displayShopName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {offerProducts.length > 0 && (
            <button
              type="button"
              onClick={scrollToOffers}
              className="px-2.5 sm:px-3 py-1.5 rounded-full bg-[#FACC15] text-[#14201A] text-xs font-black inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{tx(isEn, 'العروض', 'Offers')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleLang}
            className={`h-9 px-2.5 rounded-full text-xs font-extrabold inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
              templateId === 'modern'
                ? 'bg-white/10 text-white border border-white/15'
                : 'glass-btn text-[#15803D] dark:text-[#BBF7D0]'
            }`}
            aria-label={tx(isEn, 'تغيير اللغة إلى الإنجليزية', 'Switch to Arabic')}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isEn ? 'عربي' : 'EN'}</span>
          </button>
          <button
            type="button"
            onClick={() => setOrdersPageOpen(true)}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              templateId === 'modern'
                ? 'bg-white/10 text-white border border-white/15'
                : 'glass-btn text-[#15803D] dark:text-[#BBF7D0]'
            }`}
            aria-label={tx(isEn, 'طلباتي', 'My Orders')}
          >
            <ClipboardList className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleToggleMenuTheme}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              templateId === 'modern'
                ? 'bg-white/10 text-white border border-white/15'
                : 'glass-btn text-[#15803D] dark:text-[#BBF7D0]'
            }`}
            aria-label={tx(isEn, 'تغيير المظهر', 'Toggle theme')}
          >
            {effectiveDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setQrModalOpen(true)}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              templateId === 'modern'
                ? 'bg-white/10 text-white border border-white/15'
                : 'glass-btn text-[#15803D] dark:text-[#BBF7D0]'
            }`}
            aria-label={tx(isEn, 'باركود QR للمنيو', 'Menu QR Code')}
            title={tx(isEn, 'باركود QR للمنيو', 'Menu QR Code')}
          >
            <QrCode className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSideMenuOpen(true)}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              templateId === 'modern'
                ? 'bg-white/10 text-white border border-white/15'
                : 'glass-btn text-[#15803D] dark:text-[#BBF7D0]'
            }`}
            aria-label={tx(isEn, 'القائمة', 'Menu')}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Store Hero Header — Styled Uniquely Per Active Template */}
      <div className={`${maxWidthClass} ${templateId === 'compact' ? 'pt-2.5' : 'pt-4'}`}>
        {templateId === 'royal' ? (
          /* Royal Bistro Template Hero (Zain El Sham Navy/Ivory & Gold Signature) */
          <div className="relative overflow-hidden rounded-[18px] border border-[#E3DCCB] dark:border-[#2A3550] bg-gradient-to-br from-[#EFE9DA] via-[#F7F4ED] to-[#FFFFFF] dark:from-[#0A1120] dark:via-[#0E1526] dark:to-[#1B2540] shadow-sm">
            {shop.coverImage && (
              <>
                <img
                  loading="lazy"
                  decoding="async"
                  src={shop.coverImage}
                  alt={displayShopName}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A1120]/95 via-[#0E1526]/70 to-[#0E1526]/35" />
              </>
            )}

            <div className="relative z-10 p-5 sm:p-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {shop.logoUrl ? (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={shop.logoUrl}
                      alt={displayShopName}
                      className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full object-cover border-2 border-[#C9A35B] bg-white shadow-md shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-[#A9813F] dark:bg-[#C9A35B] text-white dark:text-[#0E1526] font-black text-2xl flex items-center justify-center border-2 border-[#C9A35B]/50 shadow-md shrink-0">
                      {(shop.nameAr || 'غ').trim().slice(0, 1)}
                    </div>
                  )}

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h1
                        className={`text-2xl sm:text-3xl font-black tracking-tight ${
                          shop.coverImage
                            ? 'text-[#F5F1E8]'
                            : 'text-[#20263A] dark:text-[#F5F1E8]'
                        }`}
                      >
                        {displayShopName}
                      </h1>
                      <span
                        className={`text-xs font-extrabold ${
                          shop.coverImage
                            ? 'text-[#C9A35B]'
                            : 'text-[#A9813F] dark:text-[#C9A35B]'
                        }`}
                      >
                        · {shop.isOpen ? tx(isEn, 'مفتوح الآن', 'Open Now') : tx(isEn, 'مغلق الآن', 'Closed Now')}
                      </span>
                    </div>

                    <p
                      className={`text-xs sm:text-[13px] font-semibold leading-relaxed ${
                        shop.coverImage
                          ? 'text-[#F5F1E8]/85'
                          : 'text-[#6B6F7B] dark:text-[#8A93A6]'
                      }`}
                    >
                      {[
                        shop.city,
                        shop.address,
                        initialTableLabel,
                        shop.freeDelivery || Number(shop.deliveryFee || 0) === 0
                          ? tx(isEn, 'توصيل مجاني', 'Free Delivery')
                          : `${tx(isEn, 'التوصيل', 'Delivery')} ${formatMoney(Number(shop.deliveryFee || 0), shop.country, 0, isEn)}`,
                        shop.deliveryTime || tx(isEn, '30-45 دقيقة', '30-45 mins'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => setChefChatOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] bg-[#A9813F] dark:bg-[#C9A35B] hover:opacity-95 text-white dark:text-[#0E1526] font-extrabold text-xs whitespace-nowrap shadow-sm transition-opacity cursor-pointer"
                  >
                    <ChefHat className="w-4 h-4" />
                    {tx(isEn, 'اسأل الشيف الذكي', 'Ask AI Chef')}
                  </button>
                  <a
                    href={`https://wa.me/${toWhatsAppNumber(shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] border font-bold text-xs whitespace-nowrap transition-colors ${
                      shop.coverImage
                        ? 'bg-[#0E1526]/70 border-[#C9A35B]/50 text-[#F5F1E8] hover:border-[#C9A35B]'
                        : 'bg-white dark:bg-[#1B2540] border-[#E3DCCB] dark:border-[#2A3550] text-[#20263A] dark:text-[#F5F1E8] hover:border-[#A9813F] dark:hover:border-[#C9A35B]'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4 text-[#A9813F] dark:text-[#C9A35B]" />
                    {tx(isEn, 'واتساب', 'WhatsApp')}
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : templateId === 'minimal' ? (
          /* Minimal Template Hero: Quiet Architectural Header with Hairline Accent */
          <div className="py-5 border-b border-[#CFE3D5] dark:border-[#2C3D32] space-y-3">
            {shop.coverImage && (
              <div className="relative h-32 sm:h-40 rounded-[18px] overflow-hidden border border-[#CFE3D5] dark:border-[#2C3D32]">
                <img
                  loading="lazy"
                  decoding="async"
                  src={shop.coverImage}
                  alt={displayShopName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                {shop.logoUrl ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={shop.logoUrl}
                    alt={displayShopName}
                    className="w-14 h-14 rounded-2xl object-cover border border-[#CFE3D5] dark:border-[#2C3D32] bg-white shrink-0"
                  />
                ) : (
                  <ShopInitialAvatar name={shop.nameAr} themeHex={themeHex} size="md" />
                )}
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-2xl font-black tracking-tight">{displayShopName}</h1>
                    <span className="text-xs font-extrabold" style={{ color: effectiveDark ? '#BBF7D0' : themeHex }}>
                      {shop.isOpen ? tx(isEn, 'مفتوح الآن', 'Open Now') : tx(isEn, 'مغلق الآن', 'Closed Now')}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[#4B5B52] dark:text-[#A3B5AA]">
                    {[
                      shop.city,
                      shop.address,
                      initialTableLabel,
                      shop.freeDelivery || Number(shop.deliveryFee || 0) === 0
                        ? tx(isEn, 'التوصيل مجاني', 'Free Delivery')
                        : `${tx(isEn, 'التوصيل', 'Delivery')} ${formatMoney(Number(shop.deliveryFee || 0), shop.country, 0, isEn)}`,
                      shop.deliveryTime || tx(isEn, '30-45 دقيقة', '30-45 mins'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <a
                href={`https://wa.me/${toWhatsAppNumber(shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER)}`}
                target="_blank"
                rel="noreferrer"
                style={{ borderColor: themeHex, color: effectiveDark ? '#BBF7D0' : themeHex }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-[1.5px] font-bold text-xs whitespace-nowrap shrink-0 hover:opacity-85 transition-opacity"
              >
                <MessageCircle className="w-4 h-4" />
                {tx(isEn, 'واتساب', 'WhatsApp')}
              </a>
            </div>
          </div>
        ) : (
          <div
            className={`relative overflow-hidden border shadow-xs ${
              shop.coverImage
                ? `rounded-[24px] ${
                    templateId === 'modern'
                      ? 'min-h-[210px] sm:min-h-[250px]'
                      : templateId === 'compact'
                        ? 'min-h-[140px]'
                        : 'min-h-[180px] sm:min-h-[215px]'
                  } flex flex-col justify-end border-[#CFE3D5] dark:border-[#2C3D32]`
                : templateId === 'modern'
                  ? 'rounded-[24px] bg-[#14201A] text-white border-[#2C3D32] shadow-md'
                  : templateStyles.heroShellClass
            }`}
          >
            {shop.coverImage ? (
              <>
                <img
                  loading="lazy"
                  decoding="async"
                  src={shop.coverImage}
                  alt={shop.nameAr}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#14201A]/90 via-[#14201A]/45 to-[#14201A]/15" />
              </>
            ) : templateId === 'modern' ? (
              <div
                style={{
                  background: `linear-gradient(125deg, ${themeHex}45 0%, #14201A 65%)`,
                }}
                className="h-16 sm:h-20 w-full flex items-center justify-between px-5 border-b border-white/10"
              >
                <span className="text-xs font-extrabold text-white/80">
                  {tx(isEn, 'اطلب مباشرة بدون عمولة', 'Direct Commission-Free Ordering')}
                </span>
                <Utensils className="w-6 h-6 text-white/40" />
              </div>
            ) : (
              <div
                style={{ backgroundColor: `${themeHex}18` }}
                className={`${
                  templateId === 'compact' ? 'h-12' : 'h-20 sm:h-24'
                } w-full flex items-center justify-center border-b border-[#CFE3D5]/70 dark:border-[#2C3D32]`}
              >
                <Utensils style={{ color: themeHex }} className={`${templateId === 'compact' ? 'w-5 h-5' : 'w-8 h-8'} opacity-50`} />
              </div>
            )}

            {/* Store Identity + WhatsApp + Customer Delivery/Fees Info */}
            <div className={`relative z-10 ${templateId === 'compact' ? 'p-3 sm:p-4 space-y-2' : 'p-4 sm:p-5 space-y-3'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  {shop.logoUrl ? (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={shop.logoUrl}
                      alt={shop.nameAr}
                      className={`${templateId === 'compact' ? 'w-12 h-12 rounded-[14px]' : 'w-14 h-14 sm:w-16 sm:h-16 rounded-[18px]'} object-cover border-2 bg-white shadow-md shrink-0 ${
                        shop.coverImage || templateId === 'modern'
                          ? 'border-white'
                          : 'border-[#CFE3D5] dark:border-[#2C3D32]'
                      }`}
                    />
                  ) : (
                    <ShopInitialAvatar name={shop.nameAr} themeHex={themeHex} size="md" />
                  )}
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1
                        className={`${templateId === 'modern' ? 'text-2xl sm:text-3xl' : templateId === 'compact' ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'} font-black ${
                          shop.coverImage || templateId === 'modern'
                            ? 'text-white drop-shadow-xs'
                            : 'text-[#14201A] dark:text-[#E8F2EB]'
                        }`}
                      >
                        {displayShopName}
                      </h1>
                      <span
                        className={`text-xs font-extrabold ${
                          shop.coverImage || templateId === 'modern'
                            ? 'text-[#BBF7D0]'
                            : 'text-[#15803D] dark:text-[#BBF7D0]'
                        }`}
                      >
                        · {shop.isOpen ? tx(isEn, 'مفتوح الآن', 'Open Now') : tx(isEn, 'مغلق الآن', 'Closed Now')}
                      </span>
                    </div>
                    {(shop.city || shop.address || initialTableLabel) && (
                      <p
                        className={`text-xs font-semibold truncate ${
                          shop.coverImage || templateId === 'modern'
                            ? 'text-[#E8F2EB]/90'
                            : 'text-[#4B5B52] dark:text-[#A3B5AA]'
                        }`}
                      >
                        {[shop.city, shop.address, initialTableLabel].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                <a
                  href={`https://wa.me/${toWhatsAppNumber(shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ backgroundColor: themeHex, borderColor: themeHex }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-white font-bold text-xs whitespace-nowrap shadow-sm hover:opacity-95 transition-opacity shrink-0"
                >
                  <MessageCircle className="w-4 h-4" />
                  {tx(isEn, 'تواصل واتساب', 'WhatsApp Us')}
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs font-extrabold">
                <span
                  className={`inline-flex items-center gap-1.5 tabular-nums ${
                    shop.coverImage || templateId === 'modern'
                      ? 'text-white'
                      : 'text-[#14532D] dark:text-[#BBF7D0]'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5 shrink-0" />
                  {shop.freeDelivery || Number(shop.deliveryFee || 0) === 0
                    ? tx(isEn, 'سعر التوصيل: مجاني', 'Delivery: Free')
                    : `${tx(isEn, 'سعر التوصيل:', 'Delivery Fee:')} ${formatMoney(Number(shop.deliveryFee || 0), shop.country, 0, isEn)}`}
                </span>

                {!shop.freeDelivery && Number(shop.freeDeliveryMinOrder || 0) > 0 && (
                  <span
                    className={`inline-flex items-center gap-1 tabular-nums ${
                      shop.coverImage || templateId === 'modern'
                        ? 'text-[#FACC15]'
                        : 'text-[#B45309] dark:text-amber-300'
                    }`}
                  >
                    {tx(isEn, 'توصيل مجاني فوق', 'Free delivery over')}{' '}
                    {formatMoney(Number(shop.freeDeliveryMinOrder), shop.country, 0, isEn)}
                  </span>
                )}

                <span
                  className={`inline-flex items-center gap-1.5 ${
                    shop.coverImage || templateId === 'modern'
                      ? 'text-[#E8F2EB]'
                      : 'text-[#4B5B52] dark:text-[#A3B5AA]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {tx(isEn, 'وقت التوصيل:', 'Delivery Time:')}{' '}
                    {shop.deliveryTime || tx(isEn, '30-45 دقيقة', '30-45 mins')}
                  </span>
                </span>

                {!hasAnyExtraFeeEnabled && (
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      shop.coverImage || templateId === 'modern'
                        ? 'text-[#BBF7D0]'
                        : 'text-[#15803D] dark:text-[#BBF7D0]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {tx(isEn, 'السعر شامل، بدون اي رسوم اضافية', 'All-inclusive prices, zero extra fees')}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Prominent Special Offers Menu */}
      {offerProducts.length > 0 && !searchQuery.trim() && (
        <section id="offers-section" className={`${maxWidthClass} mt-4 scroll-mt-16`}>
          <div
            className={`border p-4 sm:p-5 space-y-3 shadow-xs ${
              templateId === 'royal'
                ? 'bg-[#EFE9DA]/85 dark:bg-[#0A1120] border-[#E3DCCB] dark:border-[#2A3550] rounded-[18px]'
                : templateId === 'modern'
                  ? 'bg-[#14201A] text-white border-[#2C3D32] rounded-[24px] shadow-md'
                  : templateStyles.offersSectionClass
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-[14px] bg-[#FACC15] text-[#14201A] flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    className={`text-base sm:text-lg font-black ${
                      templateId === 'modern' ? 'text-white' : 'text-[#14201A] dark:text-[#E8F2EB]'
                    }`}
                  >
                    {tx(isEn, 'عروض اليوم والخصومات', "Today's Offers & Deals")}
                  </h2>
                  <p
                    className={`text-[11px] font-bold ${
                      templateId === 'modern'
                        ? 'text-[#BBF7D0]'
                        : 'text-[#4B5B52] dark:text-[#A3B5AA]'
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
                    ? 'bg-white/15 text-[#FACC15] border border-white/15'
                    : 'bg-[#FEF9C3] dark:bg-[#18231C] text-[#14201A] dark:text-[#FACC15] border border-[#FACC15]'
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
                      <div className="relative h-28 rounded-[16px] bg-[#DCFCE7] dark:bg-[#173323] overflow-hidden flex items-center justify-center">
                        {product.imageUrl && !brokenImages[product.id] ? (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [product.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Utensils className="w-9 h-9 text-[#15803D] opacity-60" />
                        )}

                        <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full bg-[#FACC15] text-[#14201A] text-[11px] font-black shadow-xs">
                          {product.offerLabel || tx(isEn, 'عرض خاص', 'Special Offer')}
                        </span>

                        {pct > 0 && (
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-[#15803D] text-white text-[10px] font-extrabold tabular-nums">
                            {tx(isEn, `وفر ${pct}%`, `Save ${pct}%`)}
                          </span>
                        )}

                        {showDishLogo && shop.logoUrl && (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={shop.logoUrl}
                            alt={displayShopName}
                            className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute top-2 left-2"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <h3 className="font-extrabold text-sm text-[#14201A] dark:text-[#E8F2EB] line-clamp-1">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-[11px] font-medium text-[#4B5B52] dark:text-[#A3B5AA] line-clamp-2">
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
                        <span
                          style={effectiveDark ? undefined : { color: themeHex }}
                          className="text-sm font-black dark:text-[#BBF7D0]"
                        >
                          {getProductPriceDisplay(product, options)}
                        </span>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <span className="text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA] line-through">
                            {formatMoney(product.originalPrice, shop.country, undefined, isEn)}
                          </span>
                        )}
                      </div>

                      {inCartQty === 0 || options.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => openProductDetail(product)}
                          disabled={!shop.acceptOrders}
                          style={{ backgroundColor: themeHex }}
                          className="px-3.5 py-1.5 rounded-full disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1 tabular-nums text-white hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
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
                            style={{ backgroundColor: themeHex }}
                            className="w-6 h-6 rounded-full text-white flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-xs tabular-nums min-w-[14px] text-center">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => decrementCart(product.id)}
                            className="w-6 h-6 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
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
      <div className={`${maxWidthClass} mt-4 space-y-3`}>
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search
              className={`w-4 h-4 text-[#4B5B52] absolute ${
                isEn ? 'left-3.5' : 'right-3.5'
              } top-1/2 -translate-y-1/2`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tx(isEn, 'ابحث عن صنف', 'Search menu items')}
              className={`sf-inp ${isEn ? 'pl-10 pr-4' : 'pr-10 pl-4'}`}
            />
          </div>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-label={tx(isEn, 'عرض القائمة', 'List view')}
            style={
              viewMode === 'list'
                ? { backgroundColor: themeHex, color: '#FFFFFF', borderColor: themeHex }
                : undefined
            }
            className={`w-12 h-12 rounded-[16px] flex items-center justify-center transition-colors shrink-0 ${
              viewMode === 'list'
                ? ''
                : 'glass-btn text-[#4B5B52] dark:text-[#A3B5AA]'
            }`}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-label={tx(isEn, 'عرض الشبكة', 'Grid view')}
            style={
              viewMode === 'grid'
                ? { backgroundColor: themeHex, color: '#FFFFFF', borderColor: themeHex }
                : undefined
            }
            className={`w-12 h-12 rounded-[16px] flex items-center justify-center transition-colors shrink-0 ${
              viewMode === 'grid'
                ? ''
                : 'glass-btn text-[#4B5B52] dark:text-[#A3B5AA]'
            }`}
          >
            <Grid className="w-5 h-5" />
          </button>
        </div>

        {/* Categories Bar Styled By Active Template */}
        <div
          className={`flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5 ${
            templateId === 'minimal' ? 'border-b border-[#CFE3D5] dark:border-[#2C3D32] pb-2.5' : ''
          }`}
        >
          {offerProducts.length > 0 && (
            <button
              type="button"
              onClick={scrollToOffers}
              className="px-4 py-2 rounded-full bg-[#FACC15] text-[#14201A] text-sm font-black whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
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
                style={
                  active && templateId !== 'royal'
                    ? { backgroundColor: themeHex, borderColor: themeHex, color: '#FFFFFF' }
                    : undefined
                }
                className={`px-4 py-2 text-sm font-extrabold whitespace-nowrap shrink-0 transition-colors ${
                  templateId === 'royal' ? 'rounded-[10px]' : 'rounded-full'
                } ${
                  active
                    ? templateId === 'royal'
                      ? 'bg-[#A9813F] dark:bg-[#C9A35B] text-white dark:text-[#0E1526] border border-[#A9813F] dark:border-[#C9A35B]'
                      : ''
                    : templateStyles.categoryIdleClass
                }`}
              >
                {cat === ALL_CATEGORIES_KEY ? tx(isEn, 'الكل', 'All') : cat}
              </button>
            );
          })}
        </div>

        {/* Section Title */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="text-lg font-black">
            {selectedCategory === ALL_CATEGORIES_KEY
              ? tx(isEn, 'جميع الأصناف', 'All Menu Items')
              : selectedCategory}
          </h2>
          <span className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA] tabular-nums">
            {tx(isEn, `${filteredProducts.length} صنف`, `${filteredProducts.length} items`)}
          </span>
        </div>

        {/* Products Rendered According to Selected Menu Template & View Mode */}
        {filteredProducts.length === 0 ? (
          <div className="sf-card p-10 text-center space-y-2">
            <Utensils style={{ color: themeHex }} className="w-10 h-10 opacity-60 mx-auto" />
            <p className="text-base font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
              {activeProducts.length === 0
                ? tx(isEn, 'لا توجد أصناف مضافة في هذا المنيو حتى الآن.', 'No items have been added to this menu yet.')
                : tx(isEn, 'لا توجد أصناف في هذه الفئة', 'No items in this category')}
            </p>
          </div>
        ) : (
          <div
            className={
              templateId === 'royal'
                ? viewMode === 'list'
                  ? 'space-y-3'
                  : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5'
                : templateId === 'compact'
                  ? viewMode === 'list'
                    ? 'space-y-2'
                    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5'
                  : templateId === 'minimal'
                    ? 'divide-y divide-[#CFE3D5] dark:divide-[#2C3D32] bg-[#FFFFFF] dark:bg-[#141F19] rounded-[20px] border border-[#CFE3D5] dark:border-[#2C3D32] overflow-hidden'
                    : templateId === 'modern'
                      ? viewMode === 'list'
                        ? 'space-y-3'
                        : 'grid grid-cols-1 md:grid-cols-2 gap-4'
                      : viewMode === 'list'
                        ? 'space-y-3'
                        : 'grid grid-cols-2 md:grid-cols-3 gap-3'
            }
          >
            {filteredProducts.map((product) => {
              const inCartQty = getProductCartCount(product.id);
              const isFav = Boolean(favorites[product.id]);
              const options = getProductOptions(product);
              const displayPrice = getProductPriceDisplay(product, options);

              // Template 5: Royal Bistro Template (Zain El Sham style Navy/Ivory + Gold)
              if (templateId === 'royal') {
                return (
                  <div
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    className={`cursor-pointer group transition-all bg-[#FFFFFF] dark:bg-[#1B2540] border border-[#E3DCCB] dark:border-[#2A3550] hover:border-[#A9813F] dark:hover:border-[#C9A35B] rounded-[14px] overflow-hidden ${
                      viewMode === 'list'
                        ? 'flex items-center justify-between gap-3.5 p-3'
                        : 'flex flex-col justify-between p-3 gap-3 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className={viewMode === 'list' ? 'flex items-center gap-3.5 min-w-0 flex-1' : 'space-y-2.5'}>
                      <div
                        className={`relative overflow-hidden bg-[#EFE9DA] dark:bg-[#0A1120] border border-[#E3DCCB]/70 dark:border-[#2A3550] flex items-center justify-center shrink-0 ${
                          viewMode === 'list' ? 'w-24 h-24 rounded-[10px]' : 'h-44 rounded-[10px]'
                        }`}
                      >
                        {product.imageUrl && !brokenImages[product.id] ? (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [product.id]: true }))
                            }
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <Utensils className="w-9 h-9 text-[#A9813F] dark:text-[#C9A35B] opacity-70" />
                        )}

                        {product.isOffer && (
                          <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-[8px] bg-[#A9813F] dark:bg-[#C9A35B] text-white dark:text-[#0E1526] text-[10px] font-black shadow-xs">
                            {product.offerLabel || tx(isEn, 'عرض', 'Offer')}
                          </span>
                        )}

                        {showDishLogo && shop.logoUrl && (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={shop.logoUrl}
                            alt={displayShopName}
                            className="w-7 h-7 rounded-full object-cover border border-[#C9A35B] bg-white shadow-sm absolute top-2 left-2"
                          />
                        )}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-[#A9813F] dark:text-[#C9A35B] truncate">
                          {product.category}
                        </div>
                        <h3 className="font-extrabold text-sm sm:text-base text-[#20263A] dark:text-[#F5F1E8] line-clamp-2 leading-snug">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-xs font-medium text-[#6B6F7B] dark:text-[#8A93A6] line-clamp-2 leading-relaxed">
                            {product.description}
                          </p>
                        )}
                        {renderCardOptionChips(product, options)}
                      </div>
                    </div>

                    <div
                      className={`flex items-center justify-between gap-2 ${
                        viewMode === 'list' ? 'shrink-0' : 'pt-2 border-t border-[#E3DCCB]/60 dark:border-[#2A3550]'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-baseline gap-1.5 tabular-nums flex-wrap">
                        <span className="text-base font-black text-[#A9813F] dark:text-[#C9A35B]">
                          {displayPrice}
                        </span>
                        {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                          <span className="text-xs font-bold text-[#6B6F7B] dark:text-[#8A93A6] line-through">
                            {formatMoney(product.originalPrice, shop.country, undefined, isEn)}
                          </span>
                        )}
                      </div>

                      {inCartQty === 0 || options.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => openProductDetail(product)}
                          disabled={!shop.acceptOrders}
                          className="px-4 py-2 rounded-[10px] bg-[#A9813F] hover:bg-[#8E6A31] dark:bg-[#C9A35B] dark:hover:bg-[#DCB877] text-white dark:text-[#0E1526] disabled:opacity-40 text-xs font-black inline-flex items-center gap-1 tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {inCartQty > 0
                            ? tx(isEn, `في السلة (${inCartQty})`, `In Cart (${inCartQty})`)
                            : options.length > 0
                              ? tx(isEn, 'اختر', 'Select')
                              : tx(isEn, 'أضف للسلة', 'Add')}
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#E3DCCB] dark:border-[#2A3550] bg-[#F7F4ED] dark:bg-[#0E1526] px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="w-7 h-7 rounded-[8px] bg-[#A9813F] dark:bg-[#C9A35B] text-white dark:text-[#0E1526] flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-xs tabular-nums min-w-[16px] text-center">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => decrementCart(product.id)}
                            className="w-7 h-7 rounded-[8px] bg-[#EFE9DA] dark:bg-[#1B2540] text-[#20263A] dark:text-[#F5F1E8] flex items-center justify-center"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Template 4: Compact High-Density Template ("مكثف") OR Explicit List Mode for Classic
              if (templateId === 'compact' || (viewMode === 'list' && templateId === 'classic')) {
                return (
                  <div
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    className={`cursor-pointer flex items-center justify-between gap-2.5 transition-colors ${
                      templateId === 'compact'
                        ? 'bg-[#FFFFFF] dark:bg-[#18231C] rounded-[16px] p-2.5 border border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D]'
                        : 'bg-[#DCFCE7] dark:bg-[#173323] rounded-[20px] p-3 border border-[#CFE3D5]/70 dark:border-[#2C3D32]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`relative ${
                          templateId === 'compact' ? 'w-14 h-14' : 'w-16 h-16'
                        } rounded-[14px] bg-[#DCFCE7] dark:bg-[#173323] flex items-center justify-center shrink-0 overflow-hidden`}
                      >
                        {product.imageUrl && !brokenImages[product.id] ? (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [product.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Utensils className="w-6 h-6 text-[#15803D] opacity-60" />
                        )}
                        {showDishLogo && shop.logoUrl && (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={shop.logoUrl}
                            alt={shop.nameAr}
                            className="w-5 h-5 rounded-full object-cover border border-white bg-white shadow-xs absolute top-1 left-1"
                          />
                        )}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-sm text-[#14201A] dark:text-[#E8F2EB] truncate">
                            {product.name}
                          </h3>
                          {product.isOffer && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FEF9C3] dark:bg-amber-950/60 text-[#14201A] dark:text-amber-300 text-[10px] font-black">
                              {product.offerLabel || tx(isEn, 'عرض', 'Offer')}
                            </span>
                          )}
                        </div>
                        {product.description && (
                          <p
                            className={`text-xs text-[#4B5B52] dark:text-[#A3B5AA] ${
                              templateId === 'compact' ? 'line-clamp-1' : 'line-clamp-2'
                            }`}
                          >
                            {product.description}
                          </p>
                        )}
                        {renderCardOptionChips(product, options)}
                        <div className="flex items-baseline gap-1.5 tabular-nums pt-0.5">
                          <span
                            style={effectiveDark ? undefined : { color: themeHex }}
                            className="text-sm font-black dark:text-[#BBF7D0]"
                          >
                            {displayPrice}
                          </span>
                          {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA] line-through">
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
                          style={{ backgroundColor: themeHex }}
                          className={
                            options.length > 0
                              ? 'px-3 py-1.5 rounded-full disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1 tabular-nums text-white hover:opacity-90 whitespace-nowrap shrink-0'
                              : 'w-9 h-9 rounded-full disabled:opacity-40 flex items-center justify-center text-white hover:opacity-90 shrink-0'
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
                            style={{ backgroundColor: themeHex }}
                            className="w-7 h-7 rounded-full text-white flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-xs tabular-nums min-w-[16px] text-center">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => decrementCart(product.id)}
                            className="w-7 h-7 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
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
                    className="cursor-pointer flex items-start justify-between gap-3.5 p-4 bg-transparent hover:bg-[#F6FBF7]/80 dark:hover:bg-[#18231C]/80 transition-colors"
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-[14px] bg-[#F6FBF7] dark:bg-[#173323] border border-[#CFE3D5]/70 dark:border-[#2C3D32] flex items-center justify-center overflow-hidden shrink-0">
                        {product.imageUrl && !brokenImages[product.id] ? (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [product.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Utensils style={{ color: themeHex }} className="w-6 h-6 opacity-60" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-extrabold text-sm sm:text-base text-[#14201A] dark:text-[#E8F2EB] leading-snug">
                            {product.name}
                          </h3>
                          {product.isOffer && (
                            <span
                              style={{ color: effectiveDark ? '#FACC15' : themeHex }}
                              className="text-[11px] font-extrabold shrink-0"
                            >
                              {product.offerLabel || tx(isEn, 'عرض', 'Offer')}
                            </span>
                          )}
                        </div>
                        {product.description && (
                          <p className="text-xs font-normal text-[#4B5B52] dark:text-[#A3B5AA] line-clamp-2 leading-relaxed">
                            {product.description}
                          </p>
                        )}
                        {renderCardOptionChips(product, options)}
                        <div
                          className="flex items-center justify-between gap-2 pt-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-baseline gap-2 tabular-nums">
                            <span className="text-sm font-black text-[#14201A] dark:text-[#E8F2EB]">
                              {displayPrice}
                            </span>
                            {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                              <span className="text-[11px] font-medium text-[#4B5B52] dark:text-[#A3B5AA] line-through">
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
                              style={{
                                borderColor: themeHex,
                                color: effectiveDark ? '#BBF7D0' : themeHex,
                              }}
                              className="px-3.5 py-1.5 rounded-full border-[1.5px] bg-transparent hover:opacity-80 disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1 tabular-nums transition-opacity whitespace-nowrap shrink-0"
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
                            <div className="inline-flex items-center gap-1.5 border border-[#CFE3D5] dark:border-[#2C3D32] rounded-full px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={() => addToCart(product)}
                                style={{ backgroundColor: themeHex }}
                                className="w-6 h-6 rounded-full text-white flex items-center justify-center"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                              <span className="font-bold text-xs tabular-nums min-w-[14px] text-center">
                                {inCartQty}
                              </span>
                              <button
                                type="button"
                                onClick={() => decrementCart(product.id)}
                                className="w-6 h-6 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
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
                    className="cursor-pointer flex items-stretch justify-between gap-4 transition-all bg-[#FFFFFF] dark:bg-[#18231C] rounded-[24px] p-4 border border-[#CFE3D5] dark:border-[#2C3D32] shadow-sm hover:-translate-y-0.5"
                  >
                    <div className="flex-1 min-w-0 flex flex-col justify-between gap-2.5">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px] font-extrabold">
                          <span style={effectiveDark ? undefined : { color: themeHex }} className="dark:text-[#BBF7D0]">
                            {product.category}
                          </span>
                          {product.isOffer && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="px-2 py-0.5 rounded-full bg-[#FACC15] text-[#14201A] text-[10px] font-black">
                                {product.offerLabel || tx(isEn, 'عرض خاص', 'Special Offer')}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="font-extrabold text-base sm:text-lg text-[#14201A] dark:text-[#E8F2EB] line-clamp-2 leading-snug">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-xs font-medium text-[#4B5B52] dark:text-[#A3B5AA] line-clamp-2 leading-relaxed">
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
                          <span
                            style={effectiveDark ? undefined : { color: themeHex }}
                            className="text-base font-black dark:text-[#BBF7D0]"
                          >
                            {displayPrice}
                          </span>
                          {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA] line-through">
                              {formatMoney(product.originalPrice, shop.country, undefined, isEn)}
                            </span>
                          )}
                        </div>
                        {inCartQty === 0 || options.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => openProductDetail(product)}
                            disabled={!shop.acceptOrders}
                            style={{ backgroundColor: themeHex }}
                            className="px-4 py-2 rounded-full disabled:opacity-40 text-xs font-extrabold inline-flex items-center gap-1 tabular-nums text-white hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
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
                              style={{ backgroundColor: themeHex }}
                              className="w-7 h-7 rounded-full text-white flex items-center justify-center"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-extrabold text-xs tabular-nums min-w-[16px] text-center">
                              {inCartQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => decrementCart(product.id)}
                              className="w-7 h-7 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-[18px] bg-[#DCFCE7] dark:bg-[#173323] shrink-0 overflow-hidden flex items-center justify-center">
                      {product.imageUrl && !brokenImages[product.id] ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils style={{ color: themeHex }} className="w-9 h-9 opacity-60" />
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
                            isFav ? 'fill-[#15803D] text-[#15803D]' : 'text-[#4B5B52]'
                          }`}
                        />
                      </button>
                      {showDishLogo && shop.logoUrl && (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={shop.logoUrl}
                          alt={displayShopName}
                          className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute bottom-2 left-2"
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // Template 1 (Default): Classic Soft Mint Grid Card ("كلاسيكي")
              return (
                <div
                  key={product.id}
                  onClick={() => openProductDetail(product)}
                  className="cursor-pointer flex flex-col justify-between gap-3 transition-colors bg-[#DCFCE7] dark:bg-[#173323] rounded-[22px] p-2.5 sm:p-3 border border-[#CFE3D5]/70 dark:border-[#2C3D32]"
                >
                  <div className="space-y-2.5">
                    <div className="relative h-28 sm:h-32 rounded-[16px] bg-[#FFFFFF]/85 dark:bg-[#18231C] flex items-center justify-center overflow-hidden">
                      {product.imageUrl && !brokenImages[product.id] ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils style={{ color: themeHex }} className="w-10 h-10 opacity-60" />
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
                            isFav ? 'fill-[#15803D] text-[#15803D]' : 'text-[#4B5B52]'
                          }`}
                        />
                      </button>

                      {product.isOffer && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-[#FACC15] text-[#14201A] text-[10px] font-black shadow-xs">
                          {product.offerLabel || tx(isEn, 'عرض', 'Offer')}
                        </span>
                      )}

                      {showDishLogo && shop.logoUrl && (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={shop.logoUrl}
                          alt={displayShopName}
                          className="w-7 h-7 rounded-full object-cover border-2 border-white bg-white shadow-sm absolute top-2 left-2"
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-extrabold text-sm text-[#14201A] dark:text-[#E8F2EB] line-clamp-2">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-[11px] font-medium text-[#4B5B52] dark:text-[#A3B5AA] line-clamp-2">
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
                      <span
                        style={effectiveDark ? undefined : { color: themeHex }}
                        className="text-sm font-black dark:text-[#BBF7D0]"
                      >
                        {displayPrice}
                      </span>
                      {product.isOffer && product.originalPrice && product.originalPrice > product.price && (
                        <span className="text-[10px] font-bold text-[#4B5B52] dark:text-[#A3B5AA] line-through">
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
                        style={{ backgroundColor: themeHex }}
                        className={
                          options.length > 0
                            ? 'px-3 py-1.5 rounded-full disabled:opacity-40 text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 tabular-nums text-white hover:opacity-90 whitespace-nowrap'
                            : 'w-9 h-9 rounded-full disabled:opacity-40 flex items-center justify-center shrink-0 text-white hover:opacity-90'
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
                          style={{ backgroundColor: themeHex }}
                          className="w-6 h-6 rounded-full text-white flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-extrabold text-xs tabular-nums min-w-[14px] text-center">
                          {inCartQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => decrementCart(product.id)}
                          className="w-6 h-6 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
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

      {/* Store Location, Social Platforms & Table QR Strip */}
      <footer className={`${maxWidthClass} mt-8`}>
        <div
          className={`rounded-[22px] border p-4 sm:p-5 space-y-3 ${
            templateId === 'royal'
              ? 'bg-[#FFFFFF] dark:bg-[#1B2540] border-[#E3DCCB] dark:border-[#2A3550]'
              : 'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-extrabold text-sm">{displayShopName}</div>
              {(shop.city || shop.address) && (
                <div className="text-xs font-semibold opacity-75 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-[#15803D]" />
                  <span>{[shop.city, shop.address].filter(Boolean).join(' - ')}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-xs font-extrabold inline-flex items-center gap-1 hover:opacity-90"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{tx(isEn, 'الموقع على الخريطة', 'Google Maps')}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="px-3 py-1.5 rounded-full border border-[#CFE3D5] dark:border-[#2C3D32] text-xs font-extrabold inline-flex items-center gap-1 hover:border-[#15803D]"
              >
                <QrCode className="w-3.5 h-3.5 text-[#15803D]" />
                <span>{tx(isEn, 'باركود QR والطباعة', 'QR & Print')}</span>
              </button>
              <button
                type="button"
                onClick={() => setChefChatOpen(true)}
                className="px-3 py-1.5 rounded-full bg-[#15803D] text-white text-xs font-extrabold inline-flex items-center gap-1 hover:opacity-95"
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>{tx(isEn, 'استفسر من المساعد الذكي', 'Ask AI Chat')}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-current/10 text-xs font-bold">
            <a
              href={`https://wa.me/${toWhatsAppNumber(shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER)}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 rounded-full bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] text-[#15803D] dark:text-[#4ADE80] inline-flex items-center gap-1"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>
            {fbUrl && (
              <a
                href={fbUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 rounded-full bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] inline-flex items-center gap-1 hover:border-[#15803D]"
              >
                <span>Facebook</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {igUrl && (
              <a
                href={igUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 rounded-full bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] inline-flex items-center gap-1 hover:border-[#15803D]"
              >
                <span>Instagram</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {ttUrl && (
              <a
                href={ttUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 rounded-full bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] inline-flex items-center gap-1 hover:border-[#15803D]"
              >
                <span>TikTok</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </footer>

      {/* Bottom Floating Cart Bar */}
      {totalItemsCount > 0 && (
        <div
          className={`fixed bottom-4 ${
            templateId === 'royal' ? 'left-4 right-4 sm:left-24 sm:right-24' : 'left-4 right-4 sm:left-24 sm:right-24'
          } z-30 max-w-[560px] mx-auto`}
        >
          <div
            className={
              templateId === 'royal'
                ? 'rounded-[16px] p-1.5 bg-[#FFFFFF]/95 dark:bg-[#1B2540]/95 border border-[#E3DCCB] dark:border-[#C9A35B]/45 shadow-xl backdrop-blur-md'
                : 'glass-dock rounded-full p-1.5'
            }
          >
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              style={templateId === 'royal' ? undefined : { backgroundColor: themeHex, borderColor: themeHex }}
              className={`w-full py-3 px-6 shadow-md font-extrabold text-base flex items-center justify-between tabular-nums hover:opacity-95 transition-opacity ${
                templateId === 'royal'
                  ? 'rounded-[12px] bg-[#A9813F] dark:bg-[#C9A35B] text-white dark:text-[#0E1526]'
                  : 'rounded-full text-white'
              }`}
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

      {/* AI Chef & Customer Assistant across ALL templates */}
      <ChefAiAssistant
        variant={templateId === 'royal' ? 'royal' : 'emerald'}
        shop={shop}
        products={activeProducts}
        categories={categories}
        darkMode={effectiveDark}
        isEn={isEn}
        isOpen={chefChatOpen}
        onOpenChange={setChefChatOpen}
        onAddToCart={(prod) => addToCart(prod)}
        onOpenProductDetail={openProductDetail}
        hasBottomDock={totalItemsCount > 0}
        pendingQuestion={pendingChefQuestion}
        onPendingQuestionHandled={() => setPendingChefQuestion(null)}
      />

      {/* Share Toast */}
      {shareToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#14201A] border border-[#15803D] text-white px-5 py-2.5 rounded-[16px] text-xs font-bold shadow-lg text-center space-y-0.5 max-w-[90vw]">
          <div>{shareToast}</div>
          <div dir="ltr" className="text-[11px] text-[#BBF7D0] truncate max-w-xs mx-auto">
            {menuShareUrl}
          </div>
        </div>
      )}

      {/* Cart Slide-Up Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-[#F6FBF7] dark:bg-[#0F1712] w-full max-w-[560px] rounded-t-[24px] p-5 sm:p-6 max-h-[88vh] flex flex-col justify-between shadow-2xl border-t border-[#CFE3D5] dark:border-[#2C3D32]">
            <div className="flex items-center justify-between pb-3 border-b border-[#CFE3D5] dark:border-[#2C3D32]">
              <h2 className="text-xl font-black">{tx(isEn, 'السلة', 'Your Cart')}</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="w-9 h-9 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto py-4 space-y-5 flex-1">
              {cartItems.length === 0 ? (
                <p className="text-center text-sm font-bold text-[#4B5B52] dark:text-[#A3B5AA] py-8">
                  {tx(isEn, 'السلة فارغة', 'Your cart is empty')}
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(cart).map(([cartKey, { product, quantity, unitPrice, note }]) => (
                    <div
                      key={cartKey}
                      className="flex items-center justify-between gap-3 bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] rounded-[20px] p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-[14px] bg-[#DCFCE7] dark:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32] flex items-center justify-center shrink-0 overflow-hidden">
                          {product.imageUrl && !brokenImages[product.id] ? (
                            <img
                              loading="lazy"
                              decoding="async"
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Utensils className="w-5 h-5 text-[#15803D]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm truncate">{product.name}</div>
                          {note && (
                            <div className="text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA] truncate">
                              {note}
                            </div>
                          )}
                          <div className="text-xs font-black text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
                            {formatMoney(unitPrice * quantity, shop.country, undefined, isEn)}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(cartKey)}
                            className="text-xs font-bold text-[#4B5B52] hover:text-rose-600 mt-0.5"
                          >
                            {tx(isEn, 'حذف', 'Remove')}
                          </button>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-2 bg-[#F6FBF7] dark:bg-[#0F1712] rounded-full px-2 py-1 border border-[#CFE3D5] dark:border-[#2C3D32] shrink-0">
                        <button
                          type="button"
                          onClick={() => incrementCartKey(cartKey)}
                          className="w-7 h-7 rounded-full bg-[#15803D] text-white flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <span className="font-extrabold text-sm tabular-nums min-w-[16px] text-center">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => decrementCart(cartKey)}
                          className="w-7 h-7 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
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
                <h3 className="text-sm font-extrabold text-[#4B5B52] dark:text-[#A3B5AA]">
                  {tx(isEn, 'يكمل طلبك', 'Goes Great With')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {upsellSuggestions.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] rounded-[18px] p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate">{item.name}</div>
                        <div className="text-xs font-black text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
                          {formatMoney(item.price, shop.country, undefined, isEn)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="w-8 h-8 rounded-full bg-[#15803D] text-white flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#CFE3D5] dark:border-[#2C3D32] space-y-3">
              <div className="flex items-center justify-between font-black text-base">
                <span>{tx(isEn, 'الإجمالي', 'Subtotal')}</span>
                <span className="text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
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
                className="sf-btn-primary w-full disabled:opacity-40 text-base"
              >
                {tx(isEn, 'متابعة للتفاصيل', 'Continue to Checkout')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Details Drawer */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmOrder}
            className="bg-[#F6FBF7] dark:bg-[#0F1712] w-full max-w-[560px] rounded-t-[24px] p-5 sm:p-6 max-h-[92vh] overflow-y-auto space-y-4 shadow-2xl border-t border-[#CFE3D5] dark:border-[#2C3D32]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#CFE3D5] dark:border-[#2C3D32]">
              <h2 className="text-xl font-black">{tx(isEn, 'بيانات الطلب', 'Order Details')}</h2>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="w-9 h-9 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Type */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-[#4B5B52] dark:text-[#A3B5AA]">
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
                    className={`py-2.5 rounded-[14px] text-sm font-extrabold border-[1.5px] transition-colors ${
                      orderType === opt.id
                        ? 'bg-[#DCFCE7] dark:bg-[#173323] border-[#15803D] text-[#14532D] dark:text-[#BBF7D0]'
                        : 'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-[#4B5B52] dark:text-[#A3B5AA]">
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
                        className={`py-2.5 rounded-[14px] text-sm font-extrabold border-[1.5px] transition-colors ${
                          paymentMethod === pm
                            ? 'bg-[#DCFCE7] dark:bg-[#173323] border-[#15803D] text-[#14532D] dark:text-[#BBF7D0]'
                            : 'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32]'
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
                className="sf-inp"
              />
              <input
                type="tel"
                required
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={tx(isEn, 'الهاتف', 'Phone Number')}
                className={`sf-inp ${isEn ? 'text-left' : 'text-right'}`}
              />

              {orderType === 'pickup' ? (
                <div className="rounded-[16px] bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] p-3.5 text-sm font-bold text-[#14532D] dark:text-[#BBF7D0]">
                  {tx(isEn, 'الاستلام من: الفرع الرئيسي', 'Pickup from: Main Branch')}
                </div>
              ) : orderType === 'table' ? (
                <input
                  type="text"
                  value={tableLabel}
                  onChange={(e) => setTableLabel(e.target.value)}
                  placeholder={tx(isEn, 'رقم الطاولة (مثال: طاولة 3)', 'Table Number (e.g. Table 3)')}
                  className="sf-inp"
                />
              ) : orderType === 'delivery' ? (
                <>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={tx(isEn, 'العنوان', 'Delivery Address')}
                    className="sf-inp"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      placeholder={tx(isEn, 'الدور', 'Floor')}
                      className="sf-inp"
                    />
                    <input
                      type="text"
                      value={apartment}
                      onChange={(e) => setApartment(e.target.value)}
                      placeholder={tx(isEn, 'الشقة', 'Apartment')}
                      className="sf-inp"
                    />
                  </div>
                </>
              ) : null}

              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tx(isEn, 'اكتب أي طلب خاص', 'Any special instructions...')}
                className="sf-inp py-2.5"
              />
            </div>

            {/* Detailed Calculation: Food + Delivery (+ Optional Fees ONLY if enabled) */}
            <div className="bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] rounded-[20px] p-4 space-y-2 text-sm font-bold">
              <div className="flex justify-between">
                <span>{tx(isEn, 'سعر الأكل', 'Subtotal')}</span>
                <span className="tabular-nums">
                  {formatMoney(totals.subtotal, shop.country, undefined, isEn)}
                </span>
              </div>
              {orderType === 'delivery' && (
                <div className="flex justify-between text-[#4B5B52] dark:text-[#A3B5AA]">
                  <span>{tx(isEn, 'سعر التوصيل', 'Delivery Fee')}</span>
                  <span className="tabular-nums font-extrabold text-[#15803D] dark:text-[#BBF7D0]">
                    {totals.freeDeliveryApplied
                      ? tx(isEn, 'مجاناً', 'Free')
                      : formatMoney(totals.deliveryFee, shop.country, undefined, isEn)}
                  </span>
                </div>
              )}
              {totals.serviceFee > 0 && (
                <div className="flex justify-between text-[#4B5B52] dark:text-[#A3B5AA]">
                  <span>{tx(isEn, `رسوم الخدمة (${totals.serviceFeePct}%)`, `Service Fee (${totals.serviceFeePct}%)`)}</span>
                  <span className="tabular-nums">
                    {formatMoney(totals.serviceFee, shop.country, undefined, isEn)}
                  </span>
                </div>
              )}
              {totals.vat > 0 && (
                <div className="flex justify-between text-[#4B5B52] dark:text-[#A3B5AA]">
                  <span>{tx(isEn, `الضريبة (${totals.vatPct}%)`, `VAT (${totals.vatPct}%)`)}</span>
                  <span className="tabular-nums">
                    {formatMoney(totals.vat, shop.country, undefined, isEn)}
                  </span>
                </div>
              )}
              {totals.packagingFee > 0 && (
                <div className="flex justify-between text-[#4B5B52] dark:text-[#A3B5AA]">
                  <span>{tx(isEn, 'رسوم التغليف', 'Packaging Fee')}</span>
                  <span className="tabular-nums">
                    {formatMoney(totals.packagingFee, shop.country, undefined, isEn)}
                  </span>
                </div>
              )}
              {!totals.hasExtraFees && (
                <div className="text-[11px] font-extrabold text-[#15803D] dark:text-[#BBF7D0] pt-0.5">
                  {tx(isEn, 'السعر شامل، بدون اي رسوم اضافية', 'All-inclusive, no extra fees')}
                </div>
              )}
              <div className="flex justify-between text-base font-black pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32]">
                <span>{tx(isEn, 'الإجمالي', 'Total')}</span>
                <span className="text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
                  {formatMoney(totals.total, shop.country, undefined, isEn)}
                </span>
              </div>
            </div>

            {checkoutError && (
              <div className="rounded-[16px] bg-[#FEF9C3] border border-[#FACC15] p-3 text-xs font-bold text-[#14201A]">
                {checkoutError}
              </div>
            )}

            <div className="space-y-2">
              <button
                type="submit"
                disabled={submitting}
                className="sf-btn-primary w-full text-base tabular-nums"
              >
                {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
                <span>
                  {tx(isEn, 'تأكيد الطلب', 'Place Order')} - {formatMoney(totals.total, shop.country, undefined, isEn)}
                </span>
              </button>

              <a
                href={buildWhatsAppOrderUrl({
                  whatsappPhone: shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER,
                  shopName: displayShopName,
                  orderType,
                  customerName,
                  customerPhone,
                  address: orderType === 'pickup' ? tx(isEn, 'استلام من الفرع', 'Branch Pickup') : address,
                  floor,
                  apartment,
                  tableLabel,
                  notes,
                  paymentMethod,
                  itemsSummary: cartItems.map(
                    (c) =>
                      `${c.product.name}${c.note ? ` (${c.note})` : ''} × ${c.quantity} (${c.unitPrice * c.quantity})`
                  ),
                  subtotal: totals.subtotal,
                  deliveryFee: totals.deliveryFee,
                  serviceFee: totals.serviceFee,
                  vat: totals.vat,
                  packagingFee: totals.packagingFee,
                  total: totals.total,
                  isEn,
                })}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 px-5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] text-[#14532D] dark:text-[#BBF7D0] font-extrabold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {tx(isEn, 'إرسال الطلب مباشرة على واتساب', 'Send Order Directly via WhatsApp')}
                </span>
              </a>
            </div>
          </form>
        </div>
      )}

      {/* Order Confirmation Modal */}
      {placedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="sf-card max-w-md w-full p-6 text-center space-y-4 shadow-xl">
            <CheckCircle2 className="w-14 h-14 text-[#15803D] mx-auto" />
            <h3 className="text-xl font-black">
              {tx(isEn, 'تم استلام طلبك بنجاح!', 'Order Received Successfully!')}
            </h3>
            <p className="text-sm font-bold text-[#4B5B52] dark:text-[#A3B5AA] tabular-nums">
              {tx(isEn, `رقم الطلب: #${placedOrder.orderNumber}`, `Order Number: #${placedOrder.orderNumber}`)}
            </p>
            <p className="text-lg font-black text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
              {tx(isEn, 'الإجمالي:', 'Total:')} {formatMoney(placedOrder.total, shop.country, undefined, isEn)}
            </p>
            <a
              href={buildWhatsAppOrderUrl({
                whatsappPhone: shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER,
                shopName: displayShopName,
                orderNumber: placedOrder.orderNumber,
                orderType: placedOrder.orderType,
                customerName: placedOrder.customerName,
                customerPhone: placedOrder.customerPhone,
                address: placedOrder.address,
                floor: placedOrder.floor,
                apartment: placedOrder.apartment,
                tableLabel: placedOrder.tableLabel,
                notes: placedOrder.notes,
                paymentMethod: placedOrder.paymentMethod,
                itemsSummary: placedOrder.itemSummary || [],
                subtotal: placedOrder.subtotal,
                deliveryFee: placedOrder.deliveryFee,
                serviceFee: placedOrder.serviceFee,
                vat: placedOrder.vat,
                packagingFee: placedOrder.packagingFee,
                total: placedOrder.total,
                isEn,
              })}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3 px-4 rounded-full bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>
                {tx(isEn, 'إرسال نسخة من الطلب عبر واتساب', 'Send Order Copy via WhatsApp')}
              </span>
            </a>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPlacedOrder(null);
                  setOrdersPageOpen(true);
                }}
                className="sf-btn-mint flex-1 text-sm"
              >
                {tx(isEn, 'عرض طلباتي', 'View My Orders')}
              </button>
              <button
                type="button"
                onClick={() => setPlacedOrder(null)}
                className="sf-btn flex-1 text-sm"
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setSideMenuOpen(false)} />
          <div className="relative z-10 w-72 bg-[#F6FBF7] dark:bg-[#0F1712] h-full p-5 flex flex-col justify-between shadow-xl border-e border-[#CFE3D5] dark:border-[#2C3D32]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-black text-lg">{displayShopName}</span>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(false)}
                  className="w-9 h-9 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-2 text-sm font-extrabold">
                <button
                  type="button"
                  onClick={() => {
                    toggleLang();
                    setSideMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  <span className="inline-flex items-center gap-3">
                    <Globe className="w-4 h-4 text-[#15803D]" />
                    {tx(isEn, 'اللغة / Language', 'Language / اللغة')}
                  </span>
                  <span className="text-xs font-black text-[#15803D] dark:text-[#BBF7D0]">
                    {isEn ? 'عربي' : 'English'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    void handleShareMenu();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  <Share2 className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'نسخ رابط المنيو', 'Copy Menu Link')}
                </button>
                <a
                  href={getWhatsAppShareUrl(menuShareUrl)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setSideMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] text-start text-[#14532D] dark:text-[#BBF7D0]"
                >
                  <MessageCircle className="w-4 h-4" />
                  {tx(isEn, 'مشاركة على واتساب', 'Share via WhatsApp')}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleMenuTheme();
                    setSideMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  {effectiveDark ? <Sun className="w-4 h-4 text-[#15803D]" /> : <Moon className="w-4 h-4 text-[#15803D]" />}
                  {tx(isEn, 'تغيير المظهر', 'Toggle Theme')}
                </button>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  <Utensils className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'المنيو', 'Menu')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    setOrdersPageOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  <ClipboardList className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'الطلبات', 'My Orders')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    setAboutModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  <Info className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'عن المطعم', 'About Restaurant')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    setQrModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  <QrCode className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'باركود QR والطباعة', 'Menu QR & Print')}
                </button>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  <MapPin className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'موقعنا على الخريطة', 'Location on Maps')}
                </a>
                <a
                  href={`https://wa.me/${toWhatsAppNumber(shop.whatsapp || SUPPORT_CONTACT.WHATSAPP_NUMBER)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-start"
                >
                  <Phone className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'تواصل معنا', 'Contact Us')}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About Restaurant Modal */}
      {aboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="sf-card max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">
                {tx(isEn, `عن ${displayShopName}`, `About ${displayShopName}`)}
              </h3>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-medium text-[#4B5B52] dark:text-[#A3B5AA]">
              {shop.bio || tx(isEn, 'أشهى المأكولات والمشروبات الطازجة يومياً.', 'Freshly prepared food and drinks daily.')}
            </p>
            <div className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA] space-y-1.5">
              {shop.address && (
                <div>
                  {tx(isEn, 'العنوان:', 'Address:')} {shop.city} - {shop.address}
                </div>
              )}
              <div>
                {tx(isEn, 'ساعات العمل:', 'Opening Hours:')} {shop.workFrom || '4م'} - {shop.workTo || '2ص'}
              </div>
            </div>
            {typeof shop.latitude === 'number' &&
              typeof shop.longitude === 'number' &&
              Number.isFinite(shop.latitude) &&
              Number.isFinite(shop.longitude) && (
                <StoreLocationPicker
                  readOnly
                  latitude={shop.latitude}
                  longitude={shop.longitude}
                  googleMapsUrl={mapsUrl}
                  shopName={displayShopName}
                  city={shop.city}
                  address={shop.address}
                  isEn={isEn}
                  heightClass="h-44"
                />
              )}
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="sf-btn-primary min-h-[38px] px-3.5 text-xs"
              >
                <MapPin className="w-3.5 h-3.5" />
                {tx(isEn, 'افتح في خرائط جوجل', 'Open Google Maps')}
              </a>
              {fbUrl && (
                <a href={fbUrl} target="_blank" rel="noreferrer" className="sf-btn min-h-[38px] px-3 text-xs">
                  Facebook
                </a>
              )}
              {igUrl && (
                <a href={igUrl} target="_blank" rel="noreferrer" className="sf-btn min-h-[38px] px-3 text-xs">
                  Instagram
                </a>
              )}
              {ttUrl && (
                <a href={ttUrl} target="_blank" rel="noreferrer" className="sf-btn min-h-[38px] px-3 text-xs">
                  TikTok
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Storefront QR Share & Print Modal */}
      {qrModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sf-card max-w-sm w-full p-6 text-center space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">
                {tx(isEn, 'باركود QR للمنيو', 'Menu QR Code')}
              </h3>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="inline-block p-3 bg-white rounded-2xl border border-[#CFE3D5]">
              <QrCodeImage value={menuShareUrl} size={190} />
            </div>
            <p className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'وجّه كاميرا الموبايل للمنيو أو اطبع الكود للطاولات', 'Scan to open menu or print for tables')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void downloadQrPng(menuShareUrl, `${shop.nameAr}-qr.png`)}
                className="sf-btn-mint min-h-[40px] text-xs"
              >
                {tx(isEn, 'حفظ صورة', 'Download PNG')}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="sf-btn-primary min-h-[40px] text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                {tx(isEn, 'طباعة QR', 'Print QR')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Page / Modal */}
      {detailProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setDetailProduct(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#FFFFFF] dark:bg-[#18231C] w-full max-w-xl rounded-t-[24px] sm:rounded-[24px] max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-[#CFE3D5] dark:border-[#2C3D32]"
          >
            {/* Large Product Image */}
            <div className="relative h-60 sm:h-72 bg-[#DCFCE7] dark:bg-[#173323] shrink-0 overflow-hidden flex items-center justify-center">
              {detailProduct.imageUrl && !brokenImages[detailProduct.id] ? (
                <img
                  loading="lazy"
                  decoding="async"
                  src={detailProduct.imageUrl}
                  alt={detailProduct.name}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setBrokenImages((prev) => ({ ...prev, [detailProduct.id]: true }))
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <Utensils className="w-16 h-16 text-[#15803D] opacity-60" />
              )}

              <button
                type="button"
                onClick={() => setDetailProduct(null)}
                aria-label={tx(isEn, 'إغلاق', 'Close')}
                className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/95 dark:bg-[#18231C]/95 text-[#14201A] dark:text-[#E8F2EB] flex items-center justify-center shadow-md"
              >
                <X className="w-5 h-5" />
              </button>

              {showDishLogo && shop.logoUrl && (
                <img
                  loading="lazy"
                  decoding="async"
                  src={shop.logoUrl}
                  alt={displayShopName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-white bg-white shadow-md absolute top-3 right-3"
                />
              )}

              {detailProduct.isOffer && (
                <span className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-[#FACC15] text-[#14201A] text-xs font-black shadow-sm">
                  {detailProduct.offerLabel || tx(isEn, 'عرض خاص', 'Special Offer')}
                </span>
              )}
            </div>

            {/* Original Item Name, Full Description & Real Menu Options */}
            <div className="overflow-y-auto p-5 sm:p-6 space-y-4 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-extrabold text-[#15803D] dark:text-[#BBF7D0]">
                    {detailProduct.category}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black">
                    {detailProduct.name}
                  </h2>
                </div>
                <div className={`${isEn ? 'text-right' : 'text-left'} shrink-0 tabular-nums`}>
                  <div className="text-xl font-black text-[#15803D] dark:text-[#BBF7D0]">
                    {formatMoney(activeDetailUnitPrice, shop.country, undefined, isEn)}
                  </div>
                  {detailProduct.isOffer &&
                    detailProduct.originalPrice &&
                    detailProduct.originalPrice > activeDetailUnitPrice && (
                      <div className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA] line-through">
                        {formatMoney(detailProduct.originalPrice, shop.country, undefined, isEn)}
                      </div>
                    )}
                </div>
              </div>

              {detailProduct.description && (
                <p className="text-sm font-medium text-[#4B5B52] dark:text-[#A3B5AA] leading-relaxed whitespace-pre-line">
                  {detailProduct.description}
                </p>
              )}

              {/* ONLY shown when the uploaded menu/product actually contains options/weights/offers */}
              {detailOptions.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold">
                      {tx(isEn, 'اختر من الخيارات المتاحة في المنيو', 'Choose an option')}
                    </span>
                    <span className="text-xs font-bold text-[#15803D] dark:text-[#BBF7D0]">
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
                          className={`p-3 rounded-[16px] border-[1.5px] text-start transition-all flex items-center justify-between gap-2 ${
                            active
                              ? 'bg-[#DCFCE7] dark:bg-[#173323] border-[#15803D] ring-2 ring-[#15803D]/25'
                              : 'bg-[#F6FBF7] dark:bg-[#0F1712] border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                active
                                  ? 'bg-[#15803D] text-white'
                                  : 'border border-[#CFE3D5] dark:border-[#2C3D32]'
                              }`}
                            >
                              {active && <Check className="w-3 h-3" />}
                            </span>
                            <span className="font-extrabold text-sm truncate">
                              {opt.label}
                            </span>
                          </div>
                          <span className="text-sm font-black text-[#15803D] dark:text-[#BBF7D0] tabular-nums shrink-0">
                            {formatMoney(opt.price, shop.country, undefined, isEn)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const askedName = detailProduct.name;
                    setDetailProduct(null);
                    setPendingChefQuestion({
                      id: `${detailProduct.id}-${Date.now()}`,
                      text: tx(
                        isEn,
                        `ما هي مكونات صنف "${askedName}" وما تفاصيل أسعاره وأحجامه المتاحة؟`,
                        `What are the ingredients, sizes, and exact prices of "${askedName}"?`
                      ),
                    });
                    setChefChatOpen(true);
                  }}
                  className={`w-full py-2.5 px-4 rounded-[14px] text-xs font-extrabold border inline-flex items-center justify-center gap-2 transition-colors ${
                    templateId === 'royal'
                      ? effectiveDark
                        ? 'bg-[#1B2540] border-[#C9A35B]/55 text-[#DCB877] hover:border-[#C9A35B]'
                        : 'bg-[#FAF7F0] border-[#A9813F]/55 text-[#722914] hover:border-[#A9813F]'
                      : effectiveDark
                        ? 'bg-[#173323] border-[#2C3D32] text-[#BBF7D0] hover:border-[#4ADE80]'
                        : 'bg-[#DCFCE7]/70 border-[#86EFAC] text-[#14532D] hover:border-[#15803D]'
                  }`}
                >
                  <ChefHat className="w-4 h-4 shrink-0" />
                  <span>
                    {tx(
                      isEn,
                      'اسأل الشيف AI عن المكونات والسعر',
                      'Ask Chef AI: Ingredients & Price'
                    )}
                  </span>
                </button>
              </div>
            </div>

            {/* Footer: Quantity +/- & Add to Cart Button */}
            <div className="p-4 sm:p-5 bg-[#FFFFFF] dark:bg-[#18231C] border-t border-[#CFE3D5] dark:border-[#2C3D32] flex items-center gap-3 shrink-0">
              <div className="inline-flex items-center gap-2.5 bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] rounded-full px-2.5 py-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDetailQty((q) => q + 1)}
                  aria-label={tx(isEn, 'زيادة الكمية', 'Increase quantity')}
                  className="w-8 h-8 rounded-full bg-[#15803D] text-white flex items-center justify-center"
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
                  className="w-8 h-8 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center"
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

      {/* Printable Menu QR Code Poster */}
      <div className="hidden print-only bg-white text-[#14201A] p-8 text-center">
        <div className="max-w-md mx-auto border-[3px] border-[#15803D] rounded-[28px] p-8 space-y-5">
          {shop.logoUrl && (
            <img loading="lazy" decoding="async"
              src={shop.logoUrl}
              alt={displayShopName}
              className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-[#15803D]"
            />
          )}
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-[#14201A]">{displayShopName}</h2>
            <p className="text-sm font-bold text-[#15803D]">
              {tx(isEn, 'امسح الكود لتصفح المنيو والطلب أونلاين', 'Scan to browse menu & order')}
            </p>
          </div>
          <div className="inline-block p-3 bg-white border-2 border-[#CFE3D5] rounded-2xl">
            <QrCodeImage value={menuShareUrl} size={230} />
          </div>
          <div dir="ltr" className="text-xs font-bold text-[#4B5B52] break-all">
            {menuShareUrl}
          </div>
        </div>
      </div>
    </div>
  );
};
