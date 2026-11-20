import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart3,
  Bell,
  Boxes,
  Check,
  CreditCard,
  Edit3,
  ExternalLink,
  Home,
  ImagePlus,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  Palette,
  Plus,
  QrCode,
  Settings,
  Share2,
  ShoppingBag,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { QrCodeImage, downloadQrPng } from '../components/QrToolkit';
import {
  addProduct,
  addProductsBatch,
  backfillShopMissingPhotos,
  deleteProduct,
  updateProduct,
  updateShop,
} from '../services/firestoreService';
import { formatMoney, getShopThemeHex } from '../utils/calculations';
import { resolveDishPhotoClient } from '../utils/dishPhotoResolver';
import { compressCoverFile, compressLogoFile } from '../utils/logoUpload';
import { MENU_TEMPLATES } from '../utils/menuTemplates';
import { getCategoryCulinaryRank, sortProductsCulinary } from '../utils/menuSorting';
import { getProductOptions, parseVariantsInput } from '../utils/productVariants';
import {
  ADMIN_EMAIL,
  SUBSCRIPTION_PRICING,
  SUPPORT_CONTACT,
  type ExtractedMenuItem,
  type MenuTemplateId,
  type Order,
  type Product,
  type Shop,
} from '../types';

interface DashboardPageProps {
  shop: Shop;
  products: Product[];
  orders: Order[];
  userName: string;
  userEmail: string;
  isAdminUser?: boolean;
  darkMode: boolean;
  onSetThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  onOpenStorefront: () => void;
  onOpenCashier: () => void;
  onOpenOrders: () => void;
  onOpenShareQr: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  shop,
  products,
  orders,
  userName,
  userEmail,
  isAdminUser = false,
  darkMode,
  onSetThemeMode,
  onOpenStorefront,
  onOpenCashier,
  onOpenOrders,
  onOpenShareQr,
  onOpenAdmin,
  onLogout,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [productsModalOpen, setProductsModalOpen] = useState(false);
  const [offersModalOpen, setOffersModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [uiLang, setUiLang] = useState<'عربي' | 'English'>('عربي');
  const [themePref, setThemePref] = useState<'فاتح' | 'داكن' | 'النظام'>(darkMode ? 'داكن' : 'فاتح');

  // Product Form State
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodVariants, setProdVariants] = useState('');
  const [prodBarcode, setProdBarcode] = useState('');
  const [addingProd, setAddingProd] = useState(false);

  // Inline Edit Product State
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [editProdName, setEditProdName] = useState('');
  const [editProdPrice, setEditProdPrice] = useState('');
  const [editProdDesc, setEditProdDesc] = useState('');
  const [editProdVariants, setEditProdVariants] = useState('');
  const [savingProdEdit, setSavingProdEdit] = useState(false);

  // Offer Form State
  const [offerName, setOfferName] = useState('');
  const [offerCategory, setOfferCategory] = useState('عروض خاصة');
  const [offerOriginalPrice, setOfferOriginalPrice] = useState('');
  const [offerSalePrice, setOfferSalePrice] = useState('');
  const [offerLabel, setOfferLabel] = useState('عرض خاص');
  const [addingOffer, setAddingOffer] = useState(false);

  // AI Upload inside Products Manager
  const aiFileRef = useRef<HTMLInputElement | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  // Settings (Design, Template, Brand Logo & Cover Background) form state
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [editNameAr, setEditNameAr] = useState(shop.nameAr);
  const [editWhatsapp, setEditWhatsapp] = useState(shop.whatsapp || '');
  const [editAddress, setEditAddress] = useState(shop.address || '');
  const [editTemplate, setEditTemplate] = useState<MenuTemplateId>(shop.menuTemplate || 'classic');
  const [editThemeColor, setEditThemeColor] = useState(shop.themeColor || 'أخضر');
  const [editLogoUrl, setEditLogoUrl] = useState(shop.logoUrl || '');
  const [editShowLogoOnItems, setEditShowLogoOnItems] = useState(
    shop.showLogoOnItems !== undefined ? shop.showLogoOnItems : true
  );
  const [logoError, setLogoError] = useState('');
  const [editCoverImage, setEditCoverImage] = useState(shop.coverImage || '');
  const [coverError, setCoverError] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!settingsModalOpen) return;
    setEditNameAr(shop.nameAr);
    setEditWhatsapp(shop.whatsapp || '');
    setEditAddress(shop.address || '');
    setEditTemplate(shop.menuTemplate || 'classic');
    setEditThemeColor(shop.themeColor || 'أخضر');
    setEditLogoUrl(shop.logoUrl || '');
    setEditShowLogoOnItems(shop.showLogoOnItems !== undefined ? shop.showLogoOnItems : true);
    setEditCoverImage(shop.coverImage || '');
    setLogoError('');
    setCoverError('');
  }, [settingsModalOpen, shop]);

  const menuUrl = `${window.location.origin}/?shop=${shop.id}`;

  const daysRemaining = useMemo(() => {
    const target =
      shop.subscriptionStatus === 'active'
        ? shop.subscriptionExpiresAt
        : shop.trialEndsAt;
    if (!target) return 7;
    const diff = Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, diff);
  }, [shop.subscriptionStatus, shop.subscriptionExpiresAt, shop.trialEndsAt]);

  const activeProductsCount = useMemo(
    () => products.filter((p) => p.available !== false).length,
    [products]
  );

  const todaySales = useMemo(
    () => orders.reduce((sum, ord) => sum + (Number(ord.total) || 0), 0),
    [orders]
  );

  const sortedProducts = useMemo(() => sortProductsCulinary(products), [products]);
  const offerProducts = useMemo(
    () => sortedProducts.filter((p) => Boolean(p.isOffer)),
    [sortedProducts]
  );

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of sortedProducts) {
      const cat = p.category || 'أصناف متنوعة';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => getCategoryCulinaryRank(a.name) - getCategoryCulinaryRank(b.name));
  }, [sortedProducts]);

  const maxCatCount = useMemo(
    () => Math.max(1, ...categoryBreakdown.map((c) => c.count)),
    [categoryBreakdown]
  );

  const newOrders = useMemo(
    () => orders.filter((o) => o.status === 'new'),
    [orders]
  );

  const handleToggleOpen = async () => {
    await updateShop(shop.id, { isOpen: !shop.isOpen });
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodCategory.trim()) return;
    setAddingProd(true);
    try {
      const variantsList = parseVariantsInput(prodVariants);
      const parsedOptions = getProductOptions({ price: Number(prodPrice) || 0, variants: variantsList });
      const explicitPrices = parsedOptions
        .filter((o) => o.hasExplicitPrice && o.price > 0)
        .map((o) => o.price);
      const basePrice =
        Number(prodPrice) > 0
          ? Number(prodPrice)
          : explicitPrices.length > 0
            ? Math.min(...explicitPrices)
            : 0;

      await addProduct(shop.id, shop.ownerId, {
        name: prodName.trim(),
        category: prodCategory.trim(),
        price: basePrice,
        description: prodDesc.trim(),
        variants: variantsList,
        barcode: prodBarcode.trim(),
        imageUrl: resolveDishPhotoClient(prodName.trim(), prodCategory.trim()),
      });
      setProdName('');
      setProdPrice('');
      setProdDesc('');
      setProdVariants('');
      setProdBarcode('');
    } finally {
      setAddingProd(false);
    }
  };

  const startEditProduct = (product: Product) => {
    if (editingProdId === product.id) {
      setEditingProdId(null);
      return;
    }
    setEditingProdId(product.id);
    setEditProdName(product.name);
    setEditProdPrice(String(product.price ?? 0));
    setEditProdDesc(product.description || '');
    setEditProdVariants((product.variants || []).join('، '));
  };

  const handleSaveProductEdit = async (productId: string) => {
    if (!editProdName.trim()) return;
    setSavingProdEdit(true);
    try {
      const variantsList = parseVariantsInput(editProdVariants);
      const parsedOptions = getProductOptions({
        price: Number(editProdPrice) || 0,
        variants: variantsList,
      });
      const explicitPrices = parsedOptions
        .filter((o) => o.hasExplicitPrice && o.price > 0)
        .map((o) => o.price);
      const resolvedPrice =
        Number(editProdPrice) > 0
          ? Number(editProdPrice)
          : explicitPrices.length > 0
            ? Math.min(...explicitPrices)
            : 0;

      await updateProduct(shop.id, productId, {
        name: editProdName.trim(),
        price: resolvedPrice,
        description: editProdDesc.trim(),
        variants: variantsList,
      });
      setEditingProdId(null);
    } finally {
      setSavingProdEdit(false);
    }
  };

  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerName.trim()) return;
    const sale = Math.max(0, Number(offerSalePrice) || 0);
    const orig = Math.max(sale, Number(offerOriginalPrice) || Math.round(sale * 1.25));
    setAddingOffer(true);
    try {
      await addProduct(shop.id, shop.ownerId, {
        name: offerName.trim(),
        category: offerCategory.trim() || 'عروض خاصة',
        price: sale,
        originalPrice: orig,
        isOffer: true,
        offerLabel: offerLabel.trim() || 'عرض خاص',
        imageUrl: resolveDishPhotoClient(offerName.trim(), offerCategory.trim() || 'عروض خاصة'),
      });
      setOfferName('');
      setOfferOriginalPrice('');
      setOfferSalePrice('');
      setOfferLabel('عرض خاص');
    } finally {
      setAddingOffer(false);
    }
  };

  const handleBackfillShopPhotos = async () => {
    setAiBusy(true);
    setAiMessage('');
    try {
      const updatedCount = await backfillShopMissingPhotos(shop.id);
      setAiMessage(
        updatedCount > 0
          ? `تمت إضافة صور حقيقية لـ ${updatedCount} صنف بنجاح.`
          : 'جميع أصنافك تمتلك صوراً حقيقية بالفعل.'
      );
    } catch {
      setAiMessage('تعذر تحديث الصور حالياً، يرجى المحاولة مرة أخرى.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleToggleProductOffer = async (product: Product) => {
    const enabling = !product.isOffer;
    await updateProduct(shop.id, product.id, {
      isOffer: enabling,
      originalPrice: enabling
        ? product.originalPrice && product.originalPrice > product.price
          ? product.originalPrice
          : Math.round((product.price || 100) * 1.2)
        : 0,
      offerLabel: enabling ? product.offerLabel || 'عرض خاص' : '',
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');
    try {
      const compressed = await compressLogoFile(file);
      setEditLogoUrl(compressed);
      setEditShowLogoOnItems(true);
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : 'تعذر رفع اللوجو');
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverError('');
    try {
      const compressed = await compressCoverFile(file);
      setEditCoverImage(compressed);
    } catch (err: unknown) {
      setCoverError(err instanceof Error ? err.message : 'تعذر رفع صورة الخلفية');
    }
  };

  const handleAiMenuUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;
    setAiBusy(true);
    setAiMessage('');

    try {
      const preparedFiles = await Promise.all(
        selectedFiles.map(async (file) => {
          const lowerName = file.name.toLowerCase();
          if (
            lowerName.endsWith('.xlsx') ||
            lowerName.endsWith('.xls') ||
            lowerName.endsWith('.csv')
          ) {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const csvText = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
            return { fileName: file.name, textContent: csvText };
          }
          if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
            const base64Data = await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => {
                const s = String(r.result || '');
                resolve(s.includes(',') ? s.split(',')[1] : s);
              };
              r.onerror = reject;
              r.readAsDataURL(file);
            });
            return { fileName: file.name, mimeType: 'application/pdf', base64Data };
          }

          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result || ''));
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          const compressedUrl = await new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 2000;
              if (img.width <= maxDim && img.height <= maxDim) {
                resolve(dataUrl);
                return;
              }
              const scale = Math.min(maxDim / img.width, maxDim / img.height);
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(dataUrl);
                return;
              }
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
          });
          const mimeMatch = compressedUrl.match(/^data:([^;]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : file.type || 'image/jpeg';
          const commaIdx = compressedUrl.indexOf(',');
          const base64Data = commaIdx >= 0 ? compressedUrl.slice(commaIdx + 1) : compressedUrl;
          return { fileName: file.name, mimeType, base64Data };
        })
      );

      const res = await fetch('/api/ai/extract-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: preparedFiles,
          businessName: shop.nameAr,
          language: shop.menuLanguage || 'العربية',
        }),
      });
      const data = (await res.json()) as { items?: ExtractedMenuItem[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'تعذر قراءة المنيو');
      if (data.items && data.items.length > 0) {
        await addProductsBatch(shop.id, shop.ownerId, data.items);
        setAiMessage(
          `تم استخراج ${data.items.length} صنف من ${selectedFiles.length} ملف بالذكاء الاصطناعي بنجاح`
        );
      } else {
        setAiMessage('لم يتم العثور على أصناف في الملفات المرفوعة');
      }
    } catch (err: unknown) {
      setAiMessage(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await updateShop(shop.id, {
        nameAr: editNameAr.trim() || shop.nameAr,
        whatsapp: editWhatsapp.trim(),
        address: editAddress.trim(),
        menuTemplate: editTemplate,
        themeColor: editThemeColor,
        logoUrl: editLogoUrl,
        showLogoOnItems: Boolean(editLogoUrl && editShowLogoOnItems),
        coverImage: editCoverImage,
      });
      setSettingsModalOpen(false);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-emerald-50/30 dark:bg-slate-950 pb-20">
      {/* Top Yellow Trial / Subscription Banner */}
      <div className="bg-amber-300 text-slate-900 px-4 py-2 text-center text-xs sm:text-sm font-extrabold tabular-nums">
        {shop.subscriptionStatus === 'active'
          ? `اشتراك مفعل - باقي ${daysRemaining} يوم`
          : `تجربة مجانية - باقي ${daysRemaining} أيام`}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-emerald-100 dark:border-slate-800 px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"
            aria-label="القائمة"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-extrabold text-base sm:text-lg">لوحة التحكم</span>
        </div>

        <div className="flex items-center gap-2 relative">
          <PWAInstallButton variant="compact" label="تثبيت التطبيق" />
          <button
            type="button"
            onClick={() => void handleToggleOpen()}
            className={`px-4 py-1.5 rounded-2xl text-xs font-extrabold transition-colors ${
              shop.isOpen
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {shop.isOpen ? 'مفتوح' : 'مغلق'}
          </button>

          <button
            type="button"
            onClick={() => setBellOpen((prev) => !prev)}
            className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center relative"
            aria-label="الإشعارات"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-extrabold flex items-center justify-center tabular-nums">
              {Math.max(1, newOrders.length)}
            </span>
          </button>

          {bellOpen && (
            <div className="absolute left-0 top-12 w-72 bg-white dark:bg-slate-900 rounded-3xl p-4 border border-emerald-100 dark:border-slate-800 shadow-xl z-40 space-y-2">
              <div className="flex items-center justify-between font-extrabold text-sm">
                <span>الإشعارات</span>
                <button type="button" onClick={() => setBellOpen(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-2xl bg-emerald-50/70 dark:bg-slate-800 p-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                مرحباً بك في Ghazalo! باقتك التجريبية مفعلة لمدة 7 أيام.
              </div>
              {newOrders.slice(0, 3).map((ord) => (
                <div
                  key={ord.id}
                  onClick={() => {
                    setBellOpen(false);
                    onOpenOrders();
                  }}
                  className="cursor-pointer rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-3 text-xs font-bold"
                >
                  طلب جديد #{ord.orderNumber} - {formatMoney(ord.total, shop.country)}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Welcome */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            أهلاً بيك في {shop.nameAr}
          </h1>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            تابع المبيعات والطلبات من مكان واحد
          </p>
        </div>

        {/* QR Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-emerald-100 dark:border-slate-800 shadow-xs">
          <h2 className="text-base font-extrabold mb-4">رمز QR للمنيو</h2>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="shrink-0">
              <QrCodeImage value={menuUrl} size={150} />
            </div>
            <div className="grid grid-cols-2 gap-3 w-full sm:max-w-md">
              <button
                type="button"
                onClick={() => void downloadQrPng(menuUrl, `${shop.nameAr}-qr.png`)}
                className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition-colors"
              >
                تحميل
              </button>
              <button
                type="button"
                onClick={onOpenStorefront}
                className="py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-emerald-50 border border-emerald-200 dark:border-slate-700 font-extrabold text-sm transition-colors"
              >
                عرض المنيو
              </button>
              <button
                type="button"
                onClick={onOpenShareQr}
                className="py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-emerald-50 border border-emerald-200 dark:border-slate-700 font-extrabold text-sm transition-colors"
              >
                رموز الطاولات
              </button>
              <button
                type="button"
                onClick={onOpenCashier}
                className="py-3 px-4 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-extrabold text-sm transition-colors"
              >
                الكاشير
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 shadow-xs space-y-1">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">طلبات اليوم</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {orders.length}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 shadow-xs space-y-1">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">مبيعات اليوم</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatMoney(todaySales, shop.country, 0)}
            </div>
          </div>

          <div
            onClick={() => setProductsModalOpen(true)}
            className="col-span-2 lg:col-span-1 cursor-pointer bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 shadow-xs space-y-1 hover:border-emerald-300 transition-colors"
          >
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">الأصناف النشطة</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {activeProductsCount}
            </div>
          </div>
        </div>

        {/* Chart: الأصناف حسب التصنيف */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-emerald-100 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">الأصناف حسب التصنيف</h2>
            <button
              type="button"
              onClick={() => setProductsModalOpen(true)}
              className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              إدارة الأصناف
            </button>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                المتجر فارغ حالياً. أضف أصنافك يدوياً أو ارفع صورة المنيو بالذكاء الاصطناعي.
              </p>
              <button
                type="button"
                onClick={() => setProductsModalOpen(true)}
                className="px-5 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-xs"
              >
                إضافة أصناف الآن
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {categoryBreakdown.map((cat) => {
                const widthPct = Math.round((cat.count / maxCatCount) * 100);
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-extrabold">
                      <span>{cat.name}</span>
                      <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {cat.count}
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-emerald-50 dark:bg-slate-800 overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className="h-full rounded-full bg-emerald-600"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Steps */}
        <div className="space-y-3">
          <h2 className="text-base font-extrabold">خطوات سريعة</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            <button
              type="button"
              onClick={onOpenCashier}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 text-right hover:border-amber-400 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center">
                <Monitor className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base">الكاشير</div>
              <div className="text-xs font-semibold text-slate-500">بيع من الصالة</div>
            </button>

            <button
              type="button"
              onClick={onOpenOrders}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 text-right hover:border-emerald-300 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base">الطلبات</div>
              <div className="text-xs font-semibold text-slate-500">متابعة طلبات اليوم</div>
            </button>

            <button
              type="button"
              onClick={() => setProductsModalOpen(true)}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 text-right hover:border-emerald-300 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <Boxes className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base">الأصناف والمنيو</div>
              <div className="text-xs font-semibold text-slate-500">الأسعار ورفع الصور</div>
            </button>

            <button
              type="button"
              onClick={() => setOffersModalOpen(true)}
              className="bg-emerald-50/80 dark:bg-emerald-950/30 rounded-3xl p-5 border border-emerald-200 dark:border-emerald-800 text-right hover:border-emerald-400 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl glass-btn-primary flex items-center justify-center">
                <Tag className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base text-emerald-900 dark:text-emerald-200">
                قائمة العروض ({offerProducts.length})
              </div>
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                إضافة وإدارة الخصومات
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="col-span-2 lg:col-span-1 bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 text-right hover:border-emerald-300 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <Palette className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base">القوالب واللوجو</div>
              <div className="text-xs font-semibold text-slate-500">شكل المنيو والشعار</div>
            </button>
          </div>
        </div>

        {/* PWA App Install Banner for Android / iOS / Desktop POS */}
        <PWAInstallButton variant="card" />

        {/* Needs Attention + Recent Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 space-y-3">
            <h2 className="text-base font-extrabold">يحتاج انتباهك</h2>
            {newOrders.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                لا شيء ينتظرك الآن
              </p>
            ) : (
              <div className="space-y-2">
                {newOrders.slice(0, 3).map((ord) => (
                  <div
                    key={ord.id}
                    onClick={onOpenOrders}
                    className="cursor-pointer rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center justify-between text-xs font-bold"
                  >
                    <span>طلب جديد #{ord.orderNumber}</span>
                    <span className="tabular-nums">{formatMoney(ord.total, shop.country)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-emerald-100 dark:border-slate-800 space-y-3">
            <h2 className="text-base font-extrabold">آخر الطلبات</h2>
            {orders.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                لا توجد طلبات بعد
              </p>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 4).map((ord) => (
                  <div
                    key={ord.id}
                    onClick={onOpenOrders}
                    className="cursor-pointer rounded-2xl bg-emerald-50/50 dark:bg-slate-800 p-3 flex items-center justify-between text-xs font-bold"
                  >
                    <span>
                      #{ord.orderNumber} - {ord.customerName || 'عميل'}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatMoney(ord.total, shop.country)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Floating Green WhatsApp Button Bottom Left */}
      <a
        href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noreferrer"
        aria-label="دعم واتساب"
        className="fixed bottom-5 left-5 z-30 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105"
      >
        <MessageCircle className="w-7 h-7" />
      </a>

      {/* Right Side Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 w-80 max-w-[85vw] bg-white dark:bg-slate-900 h-full p-5 flex flex-col justify-between overflow-y-auto shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-100 dark:border-slate-800">
                <span className="font-extrabold text-lg">{shop.nameAr}</span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setProductsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Utensils className="w-4 h-4 text-emerald-600" />
                  المنيو والأصناف
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setOffersModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Tag className="w-4 h-4 text-emerald-600" />
                  قائمة العروض ({offerProducts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 text-right"
                >
                  <Home className="w-4 h-4" />
                  الرئيسية
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <LayoutGrid className="w-4 h-4 text-emerald-600" />
                  نظرة عامة
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setBellOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Bell className="w-4 h-4 text-emerald-600" />
                  الإشعارات
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenShareQr();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Share2 className="w-4 h-4 text-emerald-600" />
                  مشاركة المنيو
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenOrders();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  الطلبات
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setReportsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  التقارير
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setSettingsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-right"
                >
                  <Settings className="w-4 h-4 text-emerald-600" />
                  الإعدادات
                </button>
                {isAdminUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onOpenAdmin();
                    }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-right"
                  >
                    <QrCode className="w-4 h-4" />
                    تفعيل المتاجر (Admin)
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Account & Preferences */}
            <div className="pt-4 mt-4 border-t border-emerald-100 dark:border-slate-800 space-y-3 text-xs font-bold">
              <div className="bg-emerald-50/70 dark:bg-slate-800 rounded-2xl p-3">
                <div className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                  {userName}
                </div>
                <div className="text-slate-500 dark:text-slate-400 truncate" dir="ltr">
                  {userEmail}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setSettingsModalOpen(true);
                }}
                className="w-full text-right px-2 py-1.5 hover:text-emerald-600"
              >
                الإعدادات
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setSubscriptionModalOpen(true);
                }}
                className="w-full text-right px-2 py-1.5 hover:text-emerald-600"
              >
                الاشتراك والدفع
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setBellOpen(true);
                }}
                className="w-full text-right px-2 py-1.5 hover:text-emerald-600"
              >
                الإشعارات
              </button>

              <div className="flex items-center justify-between px-2 py-1">
                <span>اللغة</span>
                <div className="inline-flex gap-1 bg-emerald-50 dark:bg-slate-800 p-1 rounded-xl">
                  {(['عربي', 'English'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setUiLang(l)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] ${
                        uiLang === l ? 'bg-emerald-600 text-white' : ''
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between px-2 py-1">
                <span>المظهر</span>
                <div className="inline-flex gap-1 bg-emerald-50 dark:bg-slate-800 p-1 rounded-xl">
                  {(['فاتح', 'داكن', 'النظام'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setThemePref(m);
                        onSetThemeMode(m === 'فاتح' ? 'light' : m === 'داكن' ? 'dark' : 'system');
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[11px] ${
                        themePref === m ? 'bg-emerald-600 text-white' : ''
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <PWAInstallButton variant="drawer" label="تثبيت التطبيق (Android / iOS / PC)" />

              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-emerald-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-amber-50"
              >
                <LogOut className="w-4 h-4" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Products Manager + Gemini AI Modal */}
      {productsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-5 sm:p-6 max-h-[90vh] flex flex-col justify-between shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-100 dark:border-slate-800">
              <h3 className="text-lg font-extrabold">إدارة الأصناف والأسعار</h3>
              <button
                type="button"
                onClick={() => setProductsModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1">
              {/* Gemini AI Quick Extract */}
              <div className="bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-emerald-100 dark:border-emerald-900">
                <div className="space-y-0.5">
                  <div className="font-extrabold text-sm flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    استيراد سريع بالذكاء الاصطناعي
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    ارفع صورة أو أكثر للمنيو أو ملف PDF أو Excel لإضافة الأصناف تلقائياً
                  </div>
                </div>
                <input
                  ref={aiFileRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.xlsx,.xls,.csv"
                  onChange={handleAiMenuUpload}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void handleBackfillShopPhotos()}
                    className="px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 text-emerald-800 dark:text-emerald-200 font-bold text-xs inline-flex items-center gap-1.5"
                  >
                    <ImagePlus className="w-4 h-4" />
                    تعبئة صور حقيقية للأصناف
                  </button>
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => aiFileRef.current?.click()}
                    className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5"
                  >
                    {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {aiBusy ? 'جاري الاستخراج...' : 'رفع صور المنيو'}
                  </button>
                </div>
                {aiMessage && (
                  <div className="w-full text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {aiMessage}
                  </div>
                )}
              </div>

              {/* Add Product Form */}
              <form
                onSubmit={handleAddProduct}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-emerald-100 dark:border-slate-700 space-y-3"
              >
                <div className="font-extrabold text-sm">إضافة صنف يدوي</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="اسم الصنف"
                    className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    required
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    placeholder="التصنيف (مثال: مشويات)"
                    className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                  <input
                    type="number"
                    required={!prodVariants.trim()}
                    min={0}
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    placeholder={prodVariants.trim() ? 'السعر الأساسي (تلقائي)' : 'السعر'}
                    className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    placeholder="وصف أو تفاصيل العرض كما هي في المنيو"
                    className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    value={prodBarcode}
                    onChange={(e) => setProdBarcode(e.target.value)}
                    placeholder="الباركود (اختياري)"
                    className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                </div>
                <input
                  type="text"
                  value={prodVariants}
                  onChange={(e) => setProdVariants(e.target.value)}
                  placeholder="خيارات وأسعار (اختياري، افصل بفاصلة: 2 فرخة - 550، 4 فرخة - 1000 أو نص كيلو - 215، كيلو - 420)"
                  className="w-full px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                />
                <button
                  type="submit"
                  disabled={addingProd}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {addingProd ? 'جاري الإضافة...' : 'إضافة الصنف'}
                </button>
              </form>

              {/* Products List */}
              <div className="space-y-2">
                {sortedProducts.length === 0 ? (
                  <p className="text-center text-sm font-bold text-slate-500 py-6">
                    لا توجد أصناف مضافة حتى الآن.
                  </p>
                ) : (
                  sortedProducts.map((p) => {
                    const pOptions = getProductOptions(p);
                    const isEditingThis = editingProdId === p.id;
                    return (
                    <div
                      key={p.id}
                      className="bg-emerald-50/40 dark:bg-slate-800 rounded-2xl p-3 text-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative w-11 h-11 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center shrink-0 overflow-hidden border border-emerald-100 dark:border-slate-700">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Utensils className="w-4 h-4 text-emerald-400" />
                            )}
                            {shop.logoUrl && shop.showLogoOnItems && (
                              <img
                                src={shop.logoUrl}
                                alt="شعار"
                                className="w-4 h-4 rounded-full object-cover border border-white absolute top-0.5 right-0.5 bg-white"
                              />
                            )}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-extrabold truncate">{p.name}</div>
                            <div className="text-slate-500 font-semibold">
                              {p.category} · {formatMoney(p.price, shop.country)}
                              {p.isOffer && p.originalPrice ? ` (بدلاً من ${p.originalPrice})` : ''}
                            </div>
                            {p.description && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                {p.description}
                              </div>
                            )}
                            {pOptions.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {pOptions.map((opt) => (
                                  <span
                                    key={opt.raw}
                                    className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold tabular-nums"
                                  >
                                    {opt.label}
                                    {opt.hasExplicitPrice ? ` · ${opt.price}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditProduct(p)}
                            className={`p-1.5 rounded-xl border ${
                              isEditingThis
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-emerald-100 dark:border-slate-700'
                            }`}
                            aria-label="تعديل"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleProductOffer(p)}
                            className={`px-2.5 py-1 rounded-xl font-bold inline-flex items-center gap-1 ${
                              p.isOffer
                                ? 'bg-amber-400 text-slate-900'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-emerald-100 dark:border-slate-700'
                            }`}
                          >
                            <Tag className="w-3 h-3" />
                            عرض
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void updateProduct(shop.id, p.id, { available: !p.available })
                            }
                            className={`px-3 py-1 rounded-xl font-bold ${
                              p.available !== false
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {p.available !== false ? 'متاح' : 'نفد'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteProduct(shop.id, p.id)}
                            className="p-1.5 text-slate-400 hover:text-amber-600"
                            aria-label="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {isEditingThis && (
                        <div className="pt-2 border-t border-emerald-200/70 dark:border-slate-700 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={editProdName}
                              onChange={(e) => setEditProdName(e.target.value)}
                              placeholder="اسم الصنف"
                              className="sm:col-span-2 px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                            />
                            <input
                              type="number"
                              min={0}
                              value={editProdPrice}
                              onChange={(e) => setEditProdPrice(e.target.value)}
                              placeholder="السعر"
                              className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
                            />
                          </div>
                          <input
                            type="text"
                            value={editProdDesc}
                            onChange={(e) => setEditProdDesc(e.target.value)}
                            placeholder="الوصف أو نص العرض"
                            className="w-full px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                          />
                          <input
                            type="text"
                            value={editProdVariants}
                            onChange={(e) => setEditProdVariants(e.target.value)}
                            placeholder="الخيارات والأسعار (افصل بفاصلة: 2 فرخة - 550، 4 فرخة - 1000)"
                            className="w-full px-3 py-2 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingProdId(null)}
                              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              disabled={savingProdEdit}
                              onClick={() => void handleSaveProductEdit(p.id)}
                              className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white font-bold inline-flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {savingProdEdit ? 'جاري الحفظ...' : 'حفظ التعديل'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offers Manager Modal ("قائمة العروض") */}
      {offersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-5 sm:p-6 max-h-[90vh] flex flex-col justify-between shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-extrabold">إدارة قائمة العروض والخصومات</h3>
              </div>
              <button
                type="button"
                onClick={() => setOffersModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1">
              {/* Create Standalone Offer Box */}
              <form
                onSubmit={handleAddOffer}
                className="bg-emerald-50/60 dark:bg-slate-800 rounded-2xl p-4 border border-emerald-200 dark:border-slate-700 space-y-3"
              >
                <div className="font-extrabold text-sm text-emerald-900 dark:text-emerald-200">
                  إضافة عرض جديد لقائمة العروض
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={offerName}
                    onChange={(e) => setOfferName(e.target.value)}
                    placeholder="اسم العرض (مثال: بوكس المشويات العائلي)"
                    className="px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    value={offerCategory}
                    onChange={(e) => setOfferCategory(e.target.value)}
                    placeholder="القسم (مثال: عروض خاصة)"
                    className="px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="number"
                    required
                    min={1}
                    value={offerOriginalPrice}
                    onChange={(e) => setOfferOriginalPrice(e.target.value)}
                    placeholder="السعر قبل الخصم"
                    className="px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
                  />
                  <input
                    type="number"
                    required
                    min={0}
                    value={offerSalePrice}
                    onChange={(e) => setOfferSalePrice(e.target.value)}
                    placeholder="سعر العرض بعد الخصم"
                    className="px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
                  />
                  <input
                    type="text"
                    value={offerLabel}
                    onChange={(e) => setOfferLabel(e.target.value)}
                    placeholder="شارة (مثال: عرض اليوم)"
                    className="px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingOffer}
                  className="px-5 py-2.5 rounded-full glass-btn-primary font-extrabold text-xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {addingOffer ? 'جاري إضافة العرض...' : 'نشر العرض في المنيو'}
                </button>
              </form>

              {/* Active Offers List */}
              <div className="space-y-2">
                <div className="font-extrabold text-sm">
                  العروض النشطة حالياً ({offerProducts.length})
                </div>
                {offerProducts.length === 0 ? (
                  <div className="text-center text-xs font-bold text-slate-500 py-4 bg-white dark:bg-slate-800 rounded-2xl border border-emerald-100 dark:border-slate-700">
                    لا توجد عروض مفعلة بعد. أضف عرضاً جديداً أو اختر صنفاً من بالأسفل.
                  </div>
                ) : (
                  offerProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 bg-emerald-50/70 dark:bg-slate-800 rounded-2xl p-3 border border-emerald-200 dark:border-slate-700 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-extrabold truncate">
                          {p.name}{' '}
                          <span className="text-emerald-700 dark:text-emerald-300">
                            · {p.offerLabel || 'عرض خاص'}
                          </span>
                        </div>
                        <div className="font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                          {p.originalPrice ? (
                            <span className="line-through opacity-60 ml-2">
                              {formatMoney(p.originalPrice, shop.country, 0)}
                            </span>
                          ) : null}
                          <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">
                            {formatMoney(p.price, shop.country, 0)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleProductOffer(p)}
                        className="px-3 py-1.5 rounded-full glass-btn text-amber-900 dark:text-amber-200 font-bold shrink-0"
                      >
                        إيقاف العرض
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Promote Existing Dishes */}
              {sortedProducts.filter((p) => !p.isOffer).length > 0 && (
                <div className="space-y-2">
                  <div className="font-extrabold text-sm">
                    أو أضف أصنافاً من المنيو إلى قائمة العروض:
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {sortedProducts
                      .filter((p) => !p.isOffer)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 rounded-2xl p-2.5 border border-emerald-100 dark:border-slate-700 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold truncate">{p.name}</div>
                            <div className="text-slate-500 tabular-nums">
                              {formatMoney(p.price, shop.country, 0)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleToggleProductOffer(p)}
                            className="px-3 py-1.5 rounded-full glass-btn-primary font-bold shrink-0"
                          >
                            + إضافة للعروض
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings, Templates & Brand Logo Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <form
            onSubmit={handleSaveSettings}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 border border-emerald-100 dark:border-slate-800 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">إعدادات المتجر والقالب واللوجو</h3>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">اسم النشاط</label>
              <input
                type="text"
                value={editNameAr}
                onChange={(e) => setEditNameAr(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">رقم واتساب الطلبات</label>
                <input
                  type="text"
                  dir="ltr"
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                  placeholder={SUPPORT_CONTACT.WHATSAPP_NUMBER}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">العنوان</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                />
              </div>
            </div>

            {/* Template Switcher */}
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-extrabold">شكل وقالب المنيو</label>
              <div className="grid grid-cols-2 gap-2">
                {MENU_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setEditTemplate(tpl.id)}
                    className={`p-2.5 rounded-2xl border text-right text-xs transition-colors ${
                      editTemplate === tpl.id
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 font-extrabold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold'
                    }`}
                  >
                    <div>{tpl.name}</div>
                    <div className="text-[11px] font-medium text-slate-500 truncate">
                      {tpl.tagline}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Color Picker */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold">لون الهوية</label>
              <div className="flex flex-wrap gap-2">
                {['أخضر', 'أحمر', 'أزرق مخضر', 'أسود', 'لون آخر'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditThemeColor(c)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 ${
                      editThemeColor === c
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span
                      style={{ backgroundColor: getShopThemeHex(c) }}
                      className="w-3 h-3 rounded-full"
                    />
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand Logo Editor */}
            <div className="rounded-2xl border border-emerald-100 dark:border-slate-700 bg-emerald-50/40 dark:bg-slate-800 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">لوجو المطعم على الأصناف</span>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleLogoUpload(e)}
                  className="hidden"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-full glass-btn-primary text-xs font-bold inline-flex items-center gap-1"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {editLogoUrl ? 'تغيير' : 'رفع لوجو'}
                  </button>
                  {editLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setEditLogoUrl('')}
                      className="px-2.5 py-1.5 rounded-full glass-btn text-xs font-bold text-amber-800"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
              {logoError && <p className="text-xs font-bold text-amber-800">{logoError}</p>}
              {editLogoUrl && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <img
                      src={editLogoUrl}
                      alt="شعار"
                      className="w-9 h-9 rounded-full object-cover border border-white bg-white shadow-xs"
                    />
                    <span className="text-xs font-semibold">
                      شارة دائرية على زاوية كل صنف
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditShowLogoOnItems((v) => !v)}
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      editShowLogoOnItems
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    {editShowLogoOnItems ? 'مفعل' : 'متوقف'}
                  </button>
                </div>
              )}
            </div>

            {/* Restaurant Cover / Background Behind Name & Logo */}
            <div className="rounded-2xl border border-emerald-100 dark:border-slate-700 bg-emerald-50/40 dark:bg-slate-800 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-extrabold">خلفية المطعم (ورا الاسم واللوجو)</div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    صورة تظهر خلف اسم مطعمك واللوجو في أعلى المنيو
                  </div>
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleCoverUpload(e)}
                  className="hidden"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-full glass-btn-primary text-xs font-bold inline-flex items-center gap-1"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {editCoverImage ? 'تغيير' : 'رفع خلفية'}
                  </button>
                  {editCoverImage && (
                    <button
                      type="button"
                      onClick={() => setEditCoverImage('')}
                      className="px-2.5 py-1.5 rounded-full glass-btn text-xs font-bold text-amber-800"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
              {coverError && <p className="text-xs font-bold text-amber-800">{coverError}</p>}
              <div className="relative h-24 rounded-2xl overflow-hidden border border-emerald-200/70 dark:border-slate-700 flex items-end p-3">
                {editCoverImage ? (
                  <>
                    <img
                      src={editCoverImage}
                      alt="خلفية المطعم"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-slate-950/15" />
                  </>
                ) : (
                  <div
                    style={{ backgroundColor: `${getShopThemeHex(editThemeColor)}18` }}
                    className="absolute inset-0"
                  />
                )}
                <div className="relative z-10 flex items-center gap-2.5 min-w-0">
                  {editLogoUrl ? (
                    <img
                      src={editLogoUrl}
                      alt="شعار"
                      className="w-10 h-10 rounded-xl object-cover border-2 border-white bg-white shadow-xs shrink-0"
                    />
                  ) : (
                    <div
                      style={{ backgroundColor: getShopThemeHex(editThemeColor) }}
                      className="w-10 h-10 rounded-xl text-white font-extrabold text-sm flex items-center justify-center shrink-0"
                    >
                      {(editNameAr || 'م').trim().slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div
                      className={`font-extrabold text-xs truncate ${
                        editCoverImage ? 'text-white' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {editNameAr || shop.nameAr}
                    </div>
                    <div
                      className={`text-[10px] font-bold ${
                        editCoverImage ? 'text-emerald-200' : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      معاينة الخلفية واللوجو
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full py-3 rounded-full glass-btn-primary font-extrabold text-sm"
            >
              {savingSettings ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </form>
        </div>
      )}

      {/* Reports Modal */}
      {reportsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 border border-emerald-100 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">ملخص التقارير</h3>
              <button
                type="button"
                onClick={() => setReportsModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 text-sm font-bold">
              <div className="flex justify-between p-3 rounded-2xl bg-emerald-50/60 dark:bg-slate-800">
                <span>إجمالي الطلبات</span>
                <span className="tabular-nums">{orders.length}</span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-emerald-50/60 dark:bg-slate-800">
                <span>طلبات الكاشير</span>
                <span className="tabular-nums">
                  {orders.filter((o) => o.source === 'cashier').length}
                </span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-emerald-50/60 dark:bg-slate-800">
                <span>طلبات المنيو</span>
                <span className="tabular-nums">
                  {orders.filter((o) => o.source === 'menu').length}
                </span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60">
                <span>إجمالي المبيعات</span>
                <span className="text-emerald-800 dark:text-emerald-300 tabular-nums">
                  {formatMoney(todaySales, shop.country)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      {subscriptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 border border-emerald-100 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">الاشتراك والدفع</h3>
              <button
                type="button"
                onClick={() => setSubscriptionModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-1">
              <div className="font-extrabold text-sm">
                الحالة الحالية:{' '}
                {shop.subscriptionStatus === 'active' ? 'باقة مفعلة' : 'فترة تجريبية مجانية'}
              </div>
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                الأيام المتبقية: {daysRemaining} يوم
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-center">
              <div className="rounded-2xl border border-emerald-200 dark:border-slate-700 p-3 space-y-0.5">
                <div className="text-xs font-bold text-slate-500">اشتراك شهري</div>
                <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {SUBSCRIPTION_PRICING.MONTHLY_EGP} جنيه / شهري
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 space-y-1">
                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  اشتراك سنوي
                </div>
                <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {SUBSCRIPTION_PRICING.YEARLY_EGP} جنيه / سنوي
                </div>
                <div className="inline-block px-2 py-0.5 rounded-full bg-amber-300 text-slate-900 text-[10px] font-extrabold">
                  وفّر {SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه
                </div>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              لتجديد اشتراكك وتفعيل المنيو، تواصل مباشرة مع إدارة غزالو (التفعيل يتم عن طريق الإدارة فقط):
            </p>
            <div className="space-y-2">
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  `مرحباً إدارة غزالو، أرغب في تفعيل اشتراك متجر ${shop.nameAr}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 rounded-full glass-btn-primary font-bold text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>تواصل واتساب: {SUPPORT_CONTACT.PHONE_DISPLAY}</span>
              </a>
              <a
                href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${encodeURIComponent(
                  `تفعيل اشتراك متجر ${shop.nameAr}`
                )}`}
                className="w-full py-3 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 font-bold text-xs flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
