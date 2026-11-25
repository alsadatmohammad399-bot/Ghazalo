import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Boxes,
  Bell,
  Check,
  ChefHat,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  Globe,
  Home,
  ImagePlus,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  Palette,
  Phone,
  Plus,
  Printer,
  QrCode,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  Utensils,
  X,
} from 'lucide-react';
import { MenuTemplateShowcase } from '../components/MenuTemplateShowcase';
import { MultiMenuUploader } from '../components/MultiMenuUploader';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { QrCodeImage, downloadQrPng } from '../components/QrToolkit';
import { StoreLocationPicker } from '../components/StoreLocationPicker';
import { StorefrontPage } from './StorefrontPage';
import { auth } from '../firebase';
import {
  addProduct,
  addProductsBatch,
  backfillShopMissingPhotos,
  deleteProduct,
  renameShopCategory,
  updateProduct,
  updateShop,
} from '../services/firestoreService';
import { parseCoordinatesFromGoogleMapsUrl, sanitizeExternalUrl } from '../utils/adsTracking';
import {
  formatMoney,
  getShopAccessState,
  getShopThemeHex,
} from '../utils/calculations';
import { resolveDishPhotoClient } from '../utils/dishPhotoResolver';
import { compressCoverFile, compressLogoFile } from '../utils/logoUpload';
import { getCategoryCulinaryRank, sortProductsCulinary } from '../utils/menuSorting';
import { MENU_TEMPLATES } from '../utils/menuTemplates';
import { getProductOptions, parseVariantsInput } from '../utils/productVariants';
import {
  copyMenuLink,
  getAbsoluteMenuUrl,
  getWhatsAppShareUrl,
  syncPublicStoreSnapshot,
} from '../utils/menuLink';
import {
  deriveShopSlug,
  findLocalRestaurantBySlugOrShopId,
  shopToDemoRecord,
  upsertLocalRestaurant,
} from '../utils/storeRegistry';
import {
  getShopDisplayName,
  translateTemplateMeta,
  translateThemeColor,
  tx,
  useUiLang,
} from '../utils/uiLang';
import {
  SUBSCRIPTION_PRICING,
  SUPPORT_CONTACT,
  getMenuTemplateConfig,
  normalizeMenuTemplateId,
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
  forceZeroFeesGlobally?: boolean;
  darkMode: boolean;
  onSetThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  onShopUpdated?: (updated: Shop) => void;
  onProductsUpdated?: (products: Product[]) => void;
  onOpenStorefront: () => void;
  onTryDemoWithStyle?: (options: {
    templateId: MenuTemplateId;
    themeColor: string;
    themeMode: 'light' | 'dark';
  }) => void;
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
  forceZeroFeesGlobally = false,
  darkMode,
  onSetThemeMode,
  onShopUpdated,
  onProductsUpdated,
  onOpenStorefront,
  onTryDemoWithStyle,
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
  const [designModalOpen, setDesignModalOpen] = useState(false);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedSubscriptionPlan, setSelectedSubscriptionPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [menuLinkCopied, setMenuLinkCopied] = useState(false);
  const { isEn, setLang } = useUiLang();
  const [themePref, setThemePref] = useState<'فاتح' | 'داكن' | 'النظام'>(darkMode ? 'داكن' : 'فاتح');

  const latestProductsRef = useRef<Product[]>(products);
  useEffect(() => {
    latestProductsRef.current = products;
  }, [products]);

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

  // Photo Backfill message inside Products Manager
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  // Settings (Design, Template, Brand Logo, Cover, Delivery & Optional Fees) form state
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [editNameAr, setEditNameAr] = useState(shop.nameAr);
  const [editWhatsapp, setEditWhatsapp] = useState(shop.whatsapp || '');
  const [editAddress, setEditAddress] = useState(shop.address || '');
  const [editTemplate, setEditTemplate] = useState<MenuTemplateId>(
    normalizeMenuTemplateId(shop.menuTemplate)
  );
  const [editThemeColor, setEditThemeColor] = useState(shop.themeColor || 'أخضر');
  const [editThemeMode, setEditThemeMode] = useState<'light' | 'dark'>(
    shop.themeMode === 'dark' ? 'dark' : 'light'
  );
  const [editLogoUrl, setEditLogoUrl] = useState(shop.logoUrl || '');
  const [editShowLogoOnItems, setEditShowLogoOnItems] = useState(
    shop.showLogoOnItems !== undefined ? shop.showLogoOnItems : true
  );
  const [logoError, setLogoError] = useState('');
  const [editCoverImage, setEditCoverImage] = useState(shop.coverImage || '');
  const [coverError, setCoverError] = useState('');
  const [designSavedToast, setDesignSavedToast] = useState('');

  // Delivery & Optional Fees (All OFF by default)
  const [editDeliveryFee, setEditDeliveryFee] = useState(String(shop.deliveryFee ?? 0));
  const [editFreeDelivery, setEditFreeDelivery] = useState(Boolean(shop.freeDelivery));
  const [editFreeDeliveryMinOrder, setEditFreeDeliveryMinOrder] = useState(
    shop.freeDeliveryMinOrder ? String(shop.freeDeliveryMinOrder) : ''
  );
  const [editDeliveryTime, setEditDeliveryTime] = useState(shop.deliveryTime || '30-45 دقيقة');
  const [editEnableServiceFee, setEditEnableServiceFee] = useState(Boolean(shop.enableServiceFee));
  const [editServiceFeePct, setEditServiceFeePct] = useState(
    shop.serviceFeePct ? String(shop.serviceFeePct) : '0'
  );
  const [editEnableVat, setEditEnableVat] = useState(Boolean(shop.enableVat));
  const [editVatPct, setEditVatPct] = useState(shop.vatPct ? String(shop.vatPct) : '0');
  const [editEnablePackagingFee, setEditEnablePackagingFee] = useState(
    Boolean(shop.enablePackagingFee)
  );
  const [editPackagingFee, setEditPackagingFee] = useState(
    shop.packagingFee ? String(shop.packagingFee) : '0'
  );
  const [deliverySavedToast, setDeliverySavedToast] = useState('');
  const [editFacebookUrl, setEditFacebookUrl] = useState(shop.facebookUrl || '');
  const [editInstagramUrl, setEditInstagramUrl] = useState(shop.instagramUrl || '');
  const [editTiktokUrl, setEditTiktokUrl] = useState(shop.tiktokUrl || '');
  const [editGoogleMapsUrl, setEditGoogleMapsUrl] = useState(shop.googleMapsUrl || '');
  const [editCity, setEditCity] = useState(shop.city || '');
  const [editLatitude, setEditLatitude] = useState<number | undefined>(shop.latitude);
  const [editLongitude, setEditLongitude] = useState<number | undefined>(shop.longitude);
  const [editGoogleAdsId, setEditGoogleAdsId] = useState(shop.googleAdsId || '');
  const [editGoogleAdsConversionLabel, setEditGoogleAdsConversionLabel] = useState(
    shop.googleAdsConversionLabel || ''
  );

  // Quick Rename & Location Map Modals
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameArInput, setRenameArInput] = useState(shop.nameAr);
  const [renameEnInput, setRenameEnInput] = useState(shop.nameEn || '');
  const [savingRename, setSavingRename] = useState(false);
  const [renameSavedToast, setRenameSavedToast] = useState('');

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationSavedToast, setLocationSavedToast] = useState('');

  // Unlimited Categories Manager state
  const [newCatInput, setNewCatInput] = useState('');
  const [editingCatTarget, setEditingCatTarget] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<string | null>(null);
  const [promoCopied, setPromoCopied] = useState(false);

  const [savingSettings, setSavingSettings] = useState(false);
  const [activatingRoyal, setActivatingRoyal] = useState(false);
  const [activatingTemplateId, setActivatingTemplateId] = useState<MenuTemplateId | null>(null);
  const [quickSelectedTemplate, setQuickSelectedTemplate] = useState<MenuTemplateId>(() =>
    normalizeMenuTemplateId(shop.menuTemplate)
  );
  const [royalActivatedToast, setRoyalActivatedToast] = useState('');
  const [templateCardToast, setTemplateCardToast] = useState('');
  const [templatePreviewConfig, setTemplatePreviewConfig] = useState<{
    templateId: MenuTemplateId;
    themeColor: string;
    themeMode: 'light' | 'dark';
  } | null>(null);
  const presetTemplateOnOpenRef = useRef<MenuTemplateId | null>(null);

  useEffect(() => {
    setQuickSelectedTemplate(normalizeMenuTemplateId(shop.menuTemplate));
  }, [shop.menuTemplate]);

  useEffect(() => {
    if (!settingsModalOpen && !designModalOpen && !locationModalOpen) return;
    const presetTpl = presetTemplateOnOpenRef.current;
    presetTemplateOnOpenRef.current = null;
    setEditNameAr(shop.nameAr);
    setEditWhatsapp(shop.whatsapp || '');
    setEditCity(shop.city || '');
    setEditAddress(shop.address || '');
    setEditTemplate(presetTpl || normalizeMenuTemplateId(shop.menuTemplate));
    setEditThemeColor(shop.themeColor || 'أخضر');
    setEditThemeMode(shop.themeMode === 'dark' ? 'dark' : 'light');
    setEditLogoUrl(shop.logoUrl || '');
    setEditShowLogoOnItems(shop.showLogoOnItems !== undefined ? shop.showLogoOnItems : true);
    setEditCoverImage(shop.coverImage || '');
    setEditDeliveryFee(String(shop.deliveryFee ?? 0));
    setEditFreeDelivery(Boolean(shop.freeDelivery));
    setEditFreeDeliveryMinOrder(
      shop.freeDeliveryMinOrder ? String(shop.freeDeliveryMinOrder) : ''
    );
    setEditDeliveryTime(shop.deliveryTime || '30-45 دقيقة');
    setEditEnableServiceFee(Boolean(shop.enableServiceFee));
    setEditServiceFeePct(shop.serviceFeePct ? String(shop.serviceFeePct) : '0');
    setEditEnableVat(Boolean(shop.enableVat));
    setEditVatPct(shop.vatPct ? String(shop.vatPct) : '0');
    setEditEnablePackagingFee(Boolean(shop.enablePackagingFee));
    setEditPackagingFee(shop.packagingFee ? String(shop.packagingFee) : '0');
    setEditFacebookUrl(shop.facebookUrl || '');
    setEditInstagramUrl(shop.instagramUrl || '');
    setEditTiktokUrl(shop.tiktokUrl || '');
    setEditGoogleMapsUrl(shop.googleMapsUrl || '');
    const parsedFromUrl = parseCoordinatesFromGoogleMapsUrl(shop.googleMapsUrl);
    setEditLatitude(
      typeof shop.latitude === 'number' && Number.isFinite(shop.latitude)
        ? shop.latitude
        : parsedFromUrl?.lat
    );
    setEditLongitude(
      typeof shop.longitude === 'number' && Number.isFinite(shop.longitude)
        ? shop.longitude
        : parsedFromUrl?.lng
    );
    setEditGoogleAdsId(shop.googleAdsId || '');
    setEditGoogleAdsConversionLabel(shop.googleAdsConversionLabel || '');
    setDeliverySavedToast('');
    setDesignSavedToast('');
    setLocationSavedToast('');
    setLogoError('');
    setCoverError('');
  }, [settingsModalOpen, designModalOpen, locationModalOpen, shop]);

  useEffect(() => {
    if (!renameModalOpen) return;
    setRenameArInput(shop.nameAr);
    setRenameEnInput(shop.nameEn || '');
    setRenameSavedToast('');
  }, [renameModalOpen, shop.nameAr, shop.nameEn]);

  const storeSlug = useMemo(() => deriveShopSlug(shop), [shop]);
  const menuUrl = getAbsoluteMenuUrl(shop);
  const handleCopyMenuUrl = async () => {
    const ok = await copyMenuLink(menuUrl);
    if (ok) {
      setMenuLinkCopied(true);
      setTimeout(() => setMenuLinkCopied(false), 2600);
    }
  };
  const shopAccess = useMemo(() => getShopAccessState(shop), [shop]);
  const isPaidSubscription =
    shopAccess.reason === 'monthly' ||
    shopAccess.reason === 'yearly' ||
    shopAccess.reason === 'active';
  const daysRemaining = shopAccess.daysLeft;

  const canUseFirestore = Boolean(
    auth.currentUser && auth.currentUser.uid === shop.ownerId
  );

  const persistShopLocal = (updates: Partial<Shop>): Shop => {
    const updatedShop: Shop = { ...shop, ...updates, updatedAt: Date.now() };
    const existing = findLocalRestaurantBySlugOrShopId(shop.id) || findLocalRestaurantBySlugOrShopId(storeSlug);
    upsertLocalRestaurant(
      shopToDemoRecord(
        updatedShop,
        {
          email: existing?.email || userEmail,
          phone: existing?.phone || updatedShop.whatsapp || '',
          password: existing?.password,
          resetCode: existing?.resetCode,
          resetCodeExpiresAt: existing?.resetCodeExpiresAt,
        },
        latestProductsRef.current
      )
    );
    void syncPublicStoreSnapshot(updatedShop, latestProductsRef.current);
    onShopUpdated?.(updatedShop);
    return updatedShop;
  };

  const persistProductsLocal = (nextProducts: Product[]) => {
    latestProductsRef.current = nextProducts;
    const updatedShop: Shop = { ...shop, updatedAt: Date.now() };
    const existing = findLocalRestaurantBySlugOrShopId(shop.id) || findLocalRestaurantBySlugOrShopId(storeSlug);
    upsertLocalRestaurant(
      shopToDemoRecord(
        updatedShop,
        {
          email: existing?.email || userEmail,
          phone: existing?.phone || shop.whatsapp || '',
          password: existing?.password,
          resetCode: existing?.resetCode,
          resetCodeExpiresAt: existing?.resetCodeExpiresAt,
        },
        nextProducts
      )
    );
    void syncPublicStoreSnapshot(updatedShop, nextProducts);
    onProductsUpdated?.(nextProducts);
  };

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
    const nextOpen = !shop.isOpen;
    persistShopLocal({ isOpen: nextOpen });
    if (canUseFirestore) {
      try {
        await updateShop(shop.id, { isOpen: nextOpen });
      } catch {
        // local state updated
      }
    }
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

      const payload = {
        name: prodName.trim(),
        category: prodCategory.trim(),
        price: basePrice,
        description: prodDesc.trim(),
        variants: variantsList,
        barcode: prodBarcode.trim(),
        imageUrl: resolveDishPhotoClient(prodName.trim(), prodCategory.trim()),
      };
      const localItem: Product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shopId: shop.id,
        shopOwnerId: shop.ownerId,
        available: true,
        ...payload,
      };
      persistProductsLocal([localItem, ...products]);
      if (canUseFirestore) {
        try {
          await addProduct(shop.id, shop.ownerId, payload);
        } catch {
          // persisted locally
        }
      }
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

      const updates = {
        name: editProdName.trim(),
        price: resolvedPrice,
        description: editProdDesc.trim(),
        variants: variantsList,
      };
      persistProductsLocal(
        products.map((p) => (p.id === productId ? { ...p, ...updates } : p))
      );
      if (canUseFirestore) {
        try {
          await updateProduct(shop.id, productId, updates);
        } catch {
          // updated locally
        }
      }
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
      const payload = {
        name: offerName.trim(),
        category: offerCategory.trim() || 'عروض خاصة',
        price: sale,
        originalPrice: orig,
        isOffer: true,
        offerLabel: offerLabel.trim() || 'عرض خاص',
        imageUrl: resolveDishPhotoClient(offerName.trim(), offerCategory.trim() || 'عروض خاصة'),
      };
      const localOffer: Product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shopId: shop.id,
        shopOwnerId: shop.ownerId,
        available: true,
        ...payload,
      };
      persistProductsLocal([localOffer, ...products]);
      if (canUseFirestore) {
        try {
          await addProduct(shop.id, shop.ownerId, payload);
        } catch {
          // persisted locally
        }
      }
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
      let updatedCount = 0;
      const updatedLocal = products.map((p) => {
        if (!p.imageUrl || !p.imageUrl.trim()) {
          updatedCount += 1;
          return { ...p, imageUrl: resolveDishPhotoClient(p.name, p.category) };
        }
        return p;
      });
      if (updatedCount > 0) {
        persistProductsLocal(updatedLocal);
      }
      if (canUseFirestore) {
        try {
          const fsCount = await backfillShopMissingPhotos(shop.id);
          updatedCount = Math.max(updatedCount, fsCount);
        } catch {
          // local fallback succeeded
        }
      }
      setAiMessage(
        updatedCount > 0
          ? tx(
              isEn,
              `تمت إضافة صور حقيقية لـ ${updatedCount} صنف بنجاح.`,
              `Added real dish photos to ${updatedCount} items successfully.`
            )
          : tx(isEn, 'جميع أصنافك تمتلك صوراً حقيقية بالفعل.', 'All menu items already have photos.')
      );
    } catch {
      setAiMessage(
        tx(
          isEn,
          'تعذر تحديث الصور حالياً، يرجى المحاولة مرة أخرى.',
          'Could not update photos right now. Please try again.'
        )
      );
    } finally {
      setAiBusy(false);
    }
  };

  const handleToggleProductOffer = async (product: Product) => {
    const enabling = !product.isOffer;
    const updates = {
      isOffer: enabling,
      originalPrice: enabling
        ? product.originalPrice && product.originalPrice > product.price
          ? product.originalPrice
          : Math.round((product.price || 100) * 1.2)
        : 0,
      offerLabel: enabling ? product.offerLabel || 'عرض خاص' : '',
    };
    persistProductsLocal(
      products.map((p) => (p.id === product.id ? { ...p, ...updates } : p))
    );
    if (canUseFirestore) {
      try {
        await updateProduct(shop.id, product.id, updates);
      } catch {
        // updated locally
      }
    }
  };

  const handleToggleAvailability = async (product: Product) => {
    const nextAvail = !product.available;
    persistProductsLocal(
      products.map((p) => (p.id === product.id ? { ...p, available: nextAvail } : p))
    );
    if (canUseFirestore) {
      try {
        await updateProduct(shop.id, product.id, { available: nextAvail });
      } catch {
        // updated locally
      }
    }
  };

  const handleDeleteProductItem = async (productId: string) => {
    persistProductsLocal(products.filter((p) => p.id !== productId));
    if (canUseFirestore) {
      try {
        await deleteProduct(shop.id, productId);
      } catch {
        // deleted locally
      }
    }
  };

  const handleRenameCategory = async (oldCat: string, nextCatRaw: string) => {
    const nextCat = nextCatRaw.trim();
    if (!nextCat || nextCat === oldCat) {
      setEditingCatTarget(null);
      return;
    }
    setCatBusy(true);
    try {
      persistProductsLocal(
        products.map((p) => ((p.category || 'أصناف متنوعة') === oldCat ? { ...p, category: nextCat } : p))
      );
      if (canUseFirestore) {
        try {
          await renameShopCategory(shop.id, oldCat, nextCat);
        } catch {
          // updated locally
        }
      }
      setEditingCatTarget(null);
    } finally {
      setCatBusy(false);
    }
  };

  const handleDeleteCategory = async (catName: string, mode: 'move' | 'remove') => {
    setCatBusy(true);
    try {
      const targetFallbackCat = tx(isEn, 'أصناف متنوعة', 'General');
      if (mode === 'move') {
        persistProductsLocal(
          products.map((p) =>
            (p.category || 'أصناف متنوعة') === catName ? { ...p, category: targetFallbackCat } : p
          )
        );
        if (canUseFirestore) {
          try {
            await renameShopCategory(shop.id, catName, targetFallbackCat);
          } catch {
            // updated locally
          }
        }
      } else {
        const idsToRemove = products
          .filter((p) => (p.category || 'أصناف متنوعة') === catName)
          .map((p) => p.id);
        persistProductsLocal(
          products.filter((p) => (p.category || 'أصناف متنوعة') !== catName)
        );
        if (canUseFirestore) {
          await Promise.allSettled(idsToRemove.map((id) => deleteProduct(shop.id, id)));
        }
      }
      setConfirmDeleteCat(null);
    } finally {
      setCatBusy(false);
    }
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
      setLogoError(
        err instanceof Error ? err.message : tx(isEn, 'تعذر رفع اللوجو', 'Failed to upload logo')
      );
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
      setCoverError(
        err instanceof Error
          ? err.message
          : tx(isEn, 'تعذر رفع صورة الخلفية', 'Failed to upload cover photo')
      );
    }
  };

  const handleExtractedProductsChunk = async (items: ExtractedMenuItem[]) => {
    if (!items || items.length === 0) return;
    const addedLocal: Product[] = items.map((item, idx) => ({
      id: `prod-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      shopId: shop.id,
      shopOwnerId: shop.ownerId,
      name: item.name,
      category: item.category || 'أصناف متنوعة',
      price: Number(item.price) || 0,
      description: item.description || '',
      variants: item.variants || [],
      imageUrl: item.imageUrl || resolveDishPhotoClient(item.name, item.category || ''),
      available: true,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx,
      isOffer: Boolean(item.isOffer),
      originalPrice: item.originalPrice,
      offerLabel: item.offerLabel,
    }));
    const merged = [...addedLocal, ...latestProductsRef.current];
    persistProductsLocal(merged);
    if (canUseFirestore) {
      try {
        await addProductsBatch(shop.id, shop.ownerId, items);
      } catch {
        // persisted locally and synced to public snapshot
      }
    }
  };

  const buildSettingsUpdates = (): Partial<Shop> => {
    const parsedDeliveryFee = editFreeDelivery
      ? 0
      : Math.max(0, Number(editDeliveryFee) || 0);
    return {
      nameAr: editNameAr.trim() || shop.nameAr,
      whatsapp: editWhatsapp.trim(),
      city: editCity.trim(),
      address: editAddress.trim(),
      menuTemplate: editTemplate,
      themeColor: editThemeColor,
      themeMode: editThemeMode,
      logoUrl: editLogoUrl,
      showLogoOnItems: Boolean(editLogoUrl && editShowLogoOnItems),
      coverImage: editCoverImage,
      deliveryFee: parsedDeliveryFee,
      freeDelivery: Boolean(editFreeDelivery),
      freeDeliveryMinOrder: Math.max(0, Number(editFreeDeliveryMinOrder) || 0),
      deliveryTime: editDeliveryTime.trim() || '30-45 دقيقة',
      enableServiceFee: Boolean(editEnableServiceFee),
      serviceFeePct: editEnableServiceFee
        ? Math.max(0, Math.min(100, Number(editServiceFeePct) || 0))
        : 0,
      enableVat: Boolean(editEnableVat),
      vatPct: editEnableVat ? Math.max(0, Math.min(100, Number(editVatPct) || 0)) : 0,
      enablePackagingFee: Boolean(editEnablePackagingFee),
      packagingFee: editEnablePackagingFee ? Math.max(0, Number(editPackagingFee) || 0) : 0,
      facebookUrl: sanitizeExternalUrl(editFacebookUrl),
      instagramUrl: sanitizeExternalUrl(editInstagramUrl),
      tiktokUrl: sanitizeExternalUrl(editTiktokUrl),
      googleMapsUrl: sanitizeExternalUrl(editGoogleMapsUrl),
      ...(typeof editLatitude === 'number' &&
      typeof editLongitude === 'number' &&
      Number.isFinite(editLatitude) &&
      Number.isFinite(editLongitude)
        ? { latitude: Number(editLatitude.toFixed(6)), longitude: Number(editLongitude.toFixed(6)) }
        : {}),
      googleAdsId: editGoogleAdsId.trim(),
      googleAdsConversionLabel: editGoogleAdsConversionLabel.trim(),
    };
  };

  const activateTemplate = async (
    templateId: MenuTemplateId,
    themeOptions?: { themeColor?: string; themeMode?: 'light' | 'dark' }
  ) => {
    const normalized = normalizeMenuTemplateId(templateId);
    setActivatingTemplateId(normalized);
    setActivatingRoyal(normalized === 'royal');
    setSavingSettings(true);
    setDesignSavedToast('');
    setRoyalActivatedToast('');
    setTemplateCardToast('');
    try {
      const updates: Partial<Shop> = {
        menuTemplate: normalized,
        ...(themeOptions?.themeColor ? { themeColor: themeOptions.themeColor } : {}),
        ...(themeOptions?.themeMode ? { themeMode: themeOptions.themeMode } : {}),
      };
      setEditTemplate(normalized);
      setQuickSelectedTemplate(normalized);
      if (themeOptions?.themeColor) setEditThemeColor(themeOptions.themeColor);
      if (themeOptions?.themeMode) setEditThemeMode(themeOptions.themeMode);

      const updatedShop = persistShopLocal(updates);
      if (canUseFirestore) {
        try {
          await updateShop(shop.id, updates);
        } catch {
          // local Shop state + public snapshot already synced
        }
      }
      await syncPublicStoreSnapshot(updatedShop, latestProductsRef.current);

      const tplName = translateTemplateMeta(
        normalized,
        getMenuTemplateConfig(normalized).name,
        '',
        isEn
      ).name;
      const doneMsg = tx(
        isEn,
        `تم تفعيل "${tplName}" وتحديث منيو متجرك فوراً ✅`,
        `"${tplName}" template activated immediately ✅`
      );
      setDesignSavedToast(doneMsg);
      setTemplateCardToast(doneMsg);
      window.setTimeout(() => setTemplateCardToast(''), 4000);
      if (normalized === 'royal') {
        setRoyalActivatedToast(
          tx(
            isEn,
            'تم تفعيل القالب الملكي وشيف الذكاء الاصطناعي على منيوك الآن ✅',
            'Royal Template & AI Chef activated on your menu ✅'
          )
        );
        window.setTimeout(() => setRoyalActivatedToast(''), 4000);
      }
    } finally {
      setActivatingTemplateId(null);
      setActivatingRoyal(false);
      setSavingSettings(false);
    }
  };

  const handleSaveDesignOnly = async () => {
    await activateTemplate(editTemplate, {
      themeColor: editThemeColor,
      themeMode: editThemeMode,
    });
  };

  const handleQuickActivateRoyal = async () => {
    await activateTemplate('royal');
  };

  const handleOpenTemplateStudioFor = (templateId?: MenuTemplateId) => {
    if (templateId) {
      presetTemplateOnOpenRef.current = templateId;
      setEditTemplate(templateId);
    }
    setDesignModalOpen(true);
  };

  const openTemplatePreview = (
    templateId: MenuTemplateId,
    themeColor = editThemeColor || shop.themeColor || 'أخضر',
    themeMode: 'light' | 'dark' = shop.themeMode === 'dark' ? 'dark' : 'light'
  ) => {
    setTemplatePreviewConfig({
      templateId: normalizeMenuTemplateId(templateId),
      themeColor,
      themeMode,
    });
  };

  const handleLaunchDemoWithStyle = (
    templateId: MenuTemplateId,
    themeColor = editThemeColor || shop.themeColor || 'أخضر',
    themeMode: 'light' | 'dark' = editThemeMode
  ) => {
    setDesignModalOpen(false);
    setSettingsModalOpen(false);
    onTryDemoWithStyle?.({
      templateId,
      themeColor,
      themeMode,
    });
  };

  const handleSaveDeliveryOnly = async () => {
    setSavingSettings(true);
    try {
      const updates = buildSettingsUpdates();
      persistShopLocal(updates);
      if (canUseFirestore) {
        try {
          await updateShop(shop.id, updates);
        } catch {
          // saved locally
        }
      }
      setDeliverySavedToast(
        tx(isEn, 'تم حفظ اعدادات التوصيل بنجاح', 'Delivery settings saved successfully')
      );
      setTimeout(() => setDeliverySavedToast(''), 3000);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updates = buildSettingsUpdates();
      const updatedShop = persistShopLocal(updates);
      if (canUseFirestore) {
        try {
          await updateShop(shop.id, updates);
        } catch {
          // saved locally
        }
      }
      await syncPublicStoreSnapshot(updatedShop, latestProductsRef.current);
      setSettingsModalOpen(false);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveQuickRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAr = renameArInput.trim();
    const cleanEn = renameEnInput.trim();
    if (!cleanAr) return;
    setSavingRename(true);
    setRenameSavedToast('');
    try {
      const updates: Partial<Shop> = {
        nameAr: cleanAr,
        nameEn: cleanEn,
      };
      setEditNameAr(cleanAr);
      const updatedShop = persistShopLocal(updates);
      if (canUseFirestore) {
        try {
          await updateShop(shop.id, updates);
        } catch {
          // saved locally
        }
      }
      await syncPublicStoreSnapshot(updatedShop, latestProductsRef.current);
      setRenameSavedToast(
        tx(isEn, 'تم تغيير اسم المطعم بنجاح ✅', 'Restaurant name updated ✅')
      );
      window.setTimeout(() => {
        setRenameModalOpen(false);
        setRenameSavedToast('');
      }, 850);
    } finally {
      setSavingRename(false);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLocation(true);
    setLocationSavedToast('');
    try {
      const hasCoords =
        typeof editLatitude === 'number' &&
        typeof editLongitude === 'number' &&
        Number.isFinite(editLatitude) &&
        Number.isFinite(editLongitude);
      const updates: Partial<Shop> = {
        city: editCity.trim(),
        address: editAddress.trim(),
        googleMapsUrl: sanitizeExternalUrl(editGoogleMapsUrl),
        ...(hasCoords
          ? {
              latitude: Number((editLatitude as number).toFixed(6)),
              longitude: Number((editLongitude as number).toFixed(6)),
            }
          : {}),
      };
      const updatedShop = persistShopLocal(updates);
      if (canUseFirestore) {
        try {
          await updateShop(shop.id, updates);
        } catch {
          // saved locally
        }
      }
      await syncPublicStoreSnapshot(updatedShop, latestProductsRef.current);
      setLocationSavedToast(
        tx(isEn, 'تم حفظ موقع المطعم على الخريطة ✅', 'Restaurant map location saved ✅')
      );
      window.setTimeout(() => {
        setLocationModalOpen(false);
        setLocationSavedToast('');
      }, 900);
    } finally {
      setSavingLocation(false);
    }
  };

  const displayShopName = getShopDisplayName(shop, isEn);

  if (templatePreviewConfig) {
    const previewShop: Shop = {
      ...shop,
      menuTemplate: templatePreviewConfig.templateId,
      themeColor: templatePreviewConfig.themeColor,
      themeMode: templatePreviewConfig.themeMode,
    };
    const previewTplMeta = translateTemplateMeta(
      templatePreviewConfig.templateId,
      getMenuTemplateConfig(templatePreviewConfig.templateId).name,
      '',
      isEn
    );
    const isAlreadyActive =
      normalizeMenuTemplateId(shop.menuTemplate) === templatePreviewConfig.templateId &&
      (shop.themeColor || 'أخضر') === templatePreviewConfig.themeColor &&
      (shop.themeMode === 'dark' ? 'dark' : 'light') === templatePreviewConfig.themeMode;

    return (
      <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen">
        {/* Live Merchant Store Template Preview Bar */}
        <div className="bg-[#0E1526] text-[#F5F1E8] border-b border-[#C9A35B]/45 px-4 py-3">
          <div className="max-w-[960px] mx-auto space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4 text-[#C9A35B] shrink-0" />
                <span className="text-xs sm:text-sm font-black truncate">
                  {tx(
                    isEn,
                    `معاينة القالب على منيو "${displayShopName}" — ${previewTplMeta.name}`,
                    `Template Preview on "${displayShopName}" — ${previewTplMeta.name}`
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={Boolean(activatingTemplateId) || isAlreadyActive}
                  onClick={async () => {
                    await activateTemplate(templatePreviewConfig.templateId, {
                      themeColor: templatePreviewConfig.themeColor,
                      themeMode: templatePreviewConfig.themeMode,
                    });
                    setTemplatePreviewConfig(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#C9A35B] hover:opacity-95 disabled:opacity-60 text-[#0E1526] text-xs font-black inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-opacity"
                >
                  {activatingTemplateId === templatePreviewConfig.templateId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {isAlreadyActive
                    ? tx(isEn, 'مفعّل على متجرك', 'Already Active')
                    : tx(isEn, 'تأكيد وتفعيل القالب', 'Confirm & Activate')}
                </button>
                <button
                  type="button"
                  onClick={() => setTemplatePreviewConfig(null)}
                  className="px-3 py-1.5 rounded-xl bg-[#1B2540] hover:bg-[#233052] text-[#F5F1E8] border border-[#2A3550] text-xs font-extrabold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  {tx(isEn, 'إغلاق المعاينة', 'Close Preview')}
                </button>
              </div>
            </div>

            {/* Switch live between all templates on the owner's actual menu */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {MENU_TEMPLATES.map((tpl) => {
                const selected = templatePreviewConfig.templateId === tpl.id;
                const meta = translateTemplateMeta(tpl.id, tpl.name, '', isEn);
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() =>
                      setTemplatePreviewConfig((prev) =>
                        prev ? { ...prev, templateId: tpl.id } : null
                      )
                    }
                    className={`px-3 py-1 rounded-full text-[11px] font-extrabold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      selected
                        ? 'bg-[#C9A35B] border-[#C9A35B] text-[#0E1526]'
                        : 'bg-[#1B2540] border-[#2A3550] text-[#F5F1E8]/85 hover:border-[#C9A35B]/60'
                    }`}
                  >
                    {meta.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <StorefrontPage
          key={`preview-${previewShop.id}-${previewShop.menuTemplate}-${previewShop.themeColor}-${previewShop.themeMode}`}
          shop={previewShop}
          products={products}
          isDemo
          hideDemoBanner
          forceZeroFeesGlobally={forceZeroFeesGlobally}
          darkMode={templatePreviewConfig.themeMode === 'dark'}
          onToggleDarkMode={() =>
            setTemplatePreviewConfig((prev) =>
              prev ? { ...prev, themeMode: prev.themeMode === 'dark' ? 'light' : 'dark' } : null
            )
          }
          onBack={() => setTemplatePreviewConfig(null)}
          backLabel={tx(isEn, 'العودة للوحة التحكم', 'Back to Dashboard')}
        />
      </div>
    );
  }

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] pb-24">
      <div className="no-print">
      {/* Top Sofrtek Trial / Paid Subscription Yellow Banner (#FEF9C3 matching HTML prototype) */}
      <div className="bg-[#FEF9C3] border-b border-[#FACC15]/50 text-[#14201A] px-4 py-2.5">
        <div className="max-w-[560px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold">
          <div className="flex items-center gap-1.5 tabular-nums">
            <Sparkles className="w-4 h-4 text-[#15803D] shrink-0" />
            {isPaidSubscription ? (
              <span>
                {tx(
                  isEn,
                  `مفعل حتى تاريخ ${shopAccess.expirationDateFormatted} (متبقي ${daysRemaining} يوم)`,
                  `Active until ${shopAccess.expirationDateFormatted} (${daysRemaining} days left)`
                )}
              </span>
            ) : (
              <span>
                {tx(
                  isEn,
                  `تجربة مجانية - باقي ${daysRemaining} أيام`,
                  `Free trial - ${daysRemaining} days left`
                )}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedSubscriptionPlan('monthly');
                setSubscriptionModalOpen(true);
              }}
              className="px-3 py-1 rounded-full bg-[#15803D] text-white text-[11px] font-extrabold"
            >
              {tx(isEn, `شهري ${SUBSCRIPTION_PRICING.MONTHLY_EGP}ج`, `Monthly ${SUBSCRIPTION_PRICING.MONTHLY_EGP}`)}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSubscriptionPlan('yearly');
                setSubscriptionModalOpen(true);
              }}
              className="px-3 py-1 rounded-full bg-[#14201A] text-white text-[11px] font-extrabold"
            >
              {tx(isEn, `سنوي ${SUBSCRIPTION_PRICING.YEARLY_EGP}ج`, `Yearly ${SUBSCRIPTION_PRICING.YEARLY_EGP}`)}
            </button>
            <a
              href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                `مرحباً Ghazalo، أرغب في تفعيل اشتراك مطعم ${shop.nameAr} (${storeSlug})`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 rounded-full bg-[#FFFFFF] border border-[#CFE3D5] text-[#14532D] text-[11px] font-extrabold inline-flex items-center gap-1"
            >
              <MessageCircle className="w-3 h-3" />
              {tx(isEn, 'واتساب', 'WhatsApp')}
            </a>
          </div>
        </div>
      </div>

      {/* 1-Day Expiration Urgent Alert */}
      {shopAccess.isExpiringSoon && (
        <div className="bg-[#FEF9C3] border-b border-[#FACC15] text-[#14201A] px-4 py-2 text-center text-xs font-extrabold flex flex-wrap items-center justify-center gap-2">
          <span>
            {tx(
              isEn,
              'باقي يوم واحد، فعل دلوقتي عشان المنيو ميوقفش',
              'Only 1 day left! Activate now so your menu stays live'
            )}
          </span>
          <button
            type="button"
            onClick={() => setSubscriptionModalOpen(true)}
            className="px-3 py-1 rounded-full bg-[#15803D] text-white text-xs font-extrabold"
          >
            {tx(isEn, 'فعل الاشتراك الآن', 'Activate Now')}
          </button>
        </div>
      )}

      {/* Sticky Header — Centered 560px Sofrtek rhythm */}
      <header className="sticky top-0 z-30 bg-[#FFFFFF] dark:bg-[#18231C] border-b border-[#CFE3D5] dark:border-[#2C3D32]">
        <div className="max-w-[560px] mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="sf-btn min-h-[44px] w-11 px-0"
              aria-label={tx(isEn, 'القائمة', 'Menu')}
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => void handleToggleOpen()}
              className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold border-[1.5px] transition-colors ${
                shop.isOpen
                  ? 'bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] border-[#86EFAC] dark:border-[#15803D]'
                  : 'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] text-[#4B5B52]'
              }`}
            >
              {tx(isEn, 'لوحة التحكم · ', 'Dashboard · ')}
              {shop.isOpen ? tx(isEn, 'مفتوح', 'Open') : tx(isEn, 'مغلق', 'Closed')}
            </button>
          </div>

          <div className="flex items-center gap-1.5 relative">
            <button
              type="button"
              onClick={() => setLang(isEn ? 'ar' : 'en')}
              className="sf-btn min-h-[40px] px-2.5 text-xs"
              title={tx(isEn, 'تغيير اللغة إلى الإنجليزية', 'Switch to Arabic')}
            >
              <Globe className="w-3.5 h-3.5 text-[#15803D]" />
              <span>{isEn ? 'عربي' : 'EN'}</span>
            </button>

            <PWAInstallButton
              variant="compact"
              label={tx(isEn, 'التطبيق', 'App')}
            />

            <button
              type="button"
              onClick={() => setBellOpen((prev) => !prev)}
              className="sf-btn min-h-[44px] w-11 px-0 relative"
              aria-label={tx(isEn, 'الإشعارات', 'Notifications')}
            >
              <Bell className="w-5 h-5" />
              <span
                className={`absolute -top-1 ${
                  isEn ? '-right-1' : '-left-1'
                } w-5 h-5 rounded-full bg-[#15803D] text-white text-[11px] font-extrabold flex items-center justify-center tabular-nums`}
              >
                {Math.max(1, newOrders.length)}
              </span>
            </button>

            {bellOpen && (
              <div
                className={`absolute ${
                  isEn ? 'right-0' : 'left-0'
                } top-12 w-72 sf-card shadow-xl z-40 space-y-2`}
              >
                <div className="flex items-center justify-between font-extrabold text-sm">
                  <span>{tx(isEn, 'الإشعارات', 'Notifications')}</span>
                  <button type="button" onClick={() => setBellOpen(false)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="rounded-2xl bg-[#DCFCE7] dark:bg-[#173323] p-3 text-xs font-bold text-[#14532D] dark:text-[#BBF7D0]">
                  {tx(
                    isEn,
                    'مرحباً بك! متجرك جاهز لاستقبال الطلبات بدون أي عمولة.',
                    'Welcome! Your store is ready to receive commission-free orders.'
                  )}
                </div>
                {newOrders.slice(0, 3).map((ord) => (
                  <div
                    key={ord.id}
                    onClick={() => {
                      setBellOpen(false);
                      onOpenOrders();
                    }}
                    className="cursor-pointer rounded-2xl bg-[#FEF9C3] p-3 text-xs font-bold text-[#14201A]"
                  >
                    {tx(isEn, 'طلب جديد', 'New Order')} #{ord.orderNumber} -{' '}
                    {formatMoney(ord.total, shop.country)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Centered 560px Sofrtek Stack */}
      <main className="max-w-[560px] mx-auto px-4 pt-3.5 space-y-3.5">
        {/* Welcome Heading */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[26px] sm:text-[30px] font-extrabold text-[#14201A] dark:text-[#E8F2EB] leading-snug">
              {tx(isEn, `أهلاً بيك في ${displayShopName}`, `Welcome to ${displayShopName}`)}
            </h1>
            <p className="text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'تابع المبيعات والطلبات من مكان واحد',
                'Track your sales, menu, and orders in one place'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRenameModalOpen(true)}
              className="sf-btn min-h-[42px] px-3 text-xs text-[#14532D] dark:text-[#BBF7D0] border-[#86EFAC] bg-[#DCFCE7]/60 dark:bg-[#173323]"
            >
              <Edit3 className="w-4 h-4 text-[#15803D]" />
              <span>{tx(isEn, 'تغيير اسم المطعم', 'Rename Store')}</span>
            </button>
            <button
              type="button"
              onClick={() => setLocationModalOpen(true)}
              className="sf-btn min-h-[42px] px-3 text-xs text-[#15803D] dark:text-[#BBF7D0]"
            >
              <MapPin className="w-4 h-4" />
              <span>{tx(isEn, 'موقعي على الخريطة', 'Store Map')}</span>
              {(typeof shop.latitude === 'number' && typeof shop.longitude === 'number') ||
              shop.googleMapsUrl ? (
                <span className="w-2 h-2 rounded-full bg-[#15803D] shrink-0" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="sf-btn min-h-[42px] px-3 text-xs text-[#15803D] dark:text-[#BBF7D0]"
            >
              <Settings className="w-4 h-4" />
              <span>{tx(isEn, 'التوصيل والقالب', 'Settings')}</span>
            </button>
          </div>
        </div>

        {/* QR & Direct Menu Link Card + Yellow Cashier POS Button (exact Sofrtek `dash()` rhythm) */}
        <div className="sf-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <b className="text-base font-extrabold">{tx(isEn, 'رمز QR للمنيو', 'Menu QR Code')}</b>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleCopyMenuUrl()}
                className="px-3 py-1.5 rounded-full bg-[#15803D] text-white text-xs font-extrabold inline-flex items-center gap-1"
              >
                {menuLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>
                  {menuLinkCopied
                    ? tx(isEn, 'تم نسخ اللينك ✅', 'Copied ✅')
                    : tx(isEn, 'نسخ اللينك', 'Copy Link')}
                </span>
              </button>
              <a
                href={getWhatsAppShareUrl(menuUrl)}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-xs font-extrabold inline-flex items-center gap-1"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{tx(isEn, 'مشاركة', 'Share')}</span>
              </a>
            </div>
          </div>

          <div
            dir="ltr"
            className="text-[11px] font-bold text-[#15803D] dark:text-[#BBF7D0] bg-[#F6FBF7] dark:bg-[#0F1712] px-3 py-2 rounded-xl border border-[#CFE3D5] dark:border-[#2C3D32] break-all text-left"
          >
            {menuUrl}
          </div>

          <div className="flex items-center gap-3">
            <div className="shrink-0 bg-white p-1.5 rounded-2xl border border-[#CFE3D5]">
              <QrCodeImage value={menuUrl} size={130} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => void downloadQrPng(menuUrl, `${shop.nameAr}-qr.png`)}
                  className="sf-btn-primary w-full min-h-[42px] text-xs sm:text-sm"
                >
                  {tx(isEn, 'تحميل PNG', 'Download')}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="sf-btn w-full min-h-[42px] text-xs sm:text-sm text-[#15803D] dark:text-[#BBF7D0]"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {tx(isEn, 'طباعة QR', 'Print QR')}
                </button>
              </div>
              <button
                type="button"
                onClick={onOpenStorefront}
                className="sf-btn w-full min-h-[42px] text-sm"
              >
                {tx(isEn, 'عرض المنيو', 'View Menu')}
              </button>
              <button
                type="button"
                onClick={onOpenShareQr}
                className="sf-btn w-full min-h-[42px] text-sm"
              >
                {tx(isEn, 'رموز الطاولات', 'Table QRs')}
              </button>
              <button
                type="button"
                onClick={onOpenCashier}
                className="sf-btn-yellow w-full min-h-[42px] text-sm"
              >
                {tx(isEn, 'الكاشير', 'Cashier POS')}
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards: 2-column grid + Active Items card */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="sf-card space-y-1">
            <span className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'طلبات اليوم', "Today's Orders")}
            </span>
            <h2 className="text-2xl font-extrabold text-[#14201A] dark:text-[#E8F2EB] tabular-nums">
              {orders.length}
            </h2>
          </div>

          <div className="sf-card space-y-1">
            <span className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'مبيعات اليوم', "Today's Sales")}
            </span>
            <h2 className="text-2xl font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
              {formatMoney(todaySales, shop.country, 0)}
            </h2>
          </div>
        </div>

        <div
          onClick={() => setProductsModalOpen(true)}
          className="sf-card cursor-pointer hover:border-[#15803D] transition-colors space-y-1"
        >
          <span className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
            {tx(isEn, 'الأصناف النشطة', 'Active Items')}
          </span>
          <h2 className="text-2xl font-extrabold text-[#14201A] dark:text-[#E8F2EB] tabular-nums">
            {activeProductsCount}
          </h2>
        </div>

        {/* Category Breakdown Horizontal Bar Chart */}
        <div className="sf-card space-y-3">
          <div className="flex items-center justify-between">
            <b className="text-base font-extrabold">
              {tx(isEn, 'الأصناف حسب التصنيف', 'Items by Category')}
            </b>
            <button
              type="button"
              onClick={() => setProductsModalOpen(true)}
              className="text-xs font-extrabold text-[#15803D] dark:text-[#4ADE80] hover:underline"
            >
              {tx(isEn, 'إدارة الأصناف', 'Manage Items')}
            </button>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="text-center py-5 space-y-3">
              <p className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
                {tx(
                  isEn,
                  'المتجر فارغ حالياً. أضف أصنافك يدوياً أو ارفع صورة المنيو بالذكاء الاصطناعي.',
                  'Your store is empty. Add items manually or upload a menu photo with AI.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setProductsModalOpen(true)}
                className="sf-btn-primary text-xs px-5"
              >
                {tx(isEn, 'إضافة أصناف الآن', 'Add Items Now')}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {categoryBreakdown.slice(0, 6).map((cat) => {
                const widthPct = Math.max(12, Math.round((cat.count / maxCatCount) * 100));
                return (
                  <div key={cat.name} className="flex items-center gap-2.5">
                    <span className="w-24 text-xs font-bold truncate shrink-0">{cat.name}</span>
                    <div className="flex-1">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className="h-3.5 rounded-full bg-[#15803D]"
                      />
                    </div>
                    <span className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA] tabular-nums w-6 text-end">
                      {cat.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Actions Grid */}
        <b className="block text-base font-extrabold">{tx(isEn, 'خطوات سريعة', 'Quick Actions')}</b>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onOpenCashier}
            className="sf-card text-start hover:border-[#15803D] transition-colors space-y-1 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[#FACC15] text-[#14201A] flex items-center justify-center">
              <Monitor className="w-4 h-4" />
            </div>
            <div className="font-extrabold text-sm">{tx(isEn, 'الكاشير', 'Cashier')}</div>
            <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'بيع من الصالة', 'In-store POS')}
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenOrders}
            className="sf-card text-start hover:border-[#15803D] transition-colors space-y-1 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div className="font-extrabold text-sm">{tx(isEn, 'الطلبات', 'Orders')}</div>
            <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'متابعة طلبات اليوم', "Track today's orders")}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setProductsModalOpen(true)}
            className="sf-card text-start hover:border-[#15803D] transition-colors space-y-1 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
            <div className="font-extrabold text-sm">{tx(isEn, 'الأصناف', 'Items & Menu')}</div>
            <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'الأسعار والتوفر والصور', 'Prices & dish photos')}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setOffersModalOpen(true)}
            className="sf-card text-start bg-[#DCFCE7]/50 dark:bg-[#173323]/60 hover:border-[#15803D] transition-colors space-y-1 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[#15803D] text-white flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
            <div className="font-extrabold text-sm">
              {tx(isEn, `قائمة العروض (${offerProducts.length})`, `Offers (${offerProducts.length})`)}
            </div>
            <div className="text-xs font-semibold text-[#14532D] dark:text-[#BBF7D0]">
              {tx(isEn, 'إضافة وإدارة الخصومات', 'Deals & discounts')}
            </div>
          </button>

          {/* Featured New Template Card: Royal VIP + AI Chef */}
          <div className="col-span-2 rounded-[22px] bg-[#0E1526] text-[#F5F1E8] border-[1.5px] border-[#C9A35B]/65 p-4 sm:p-5 space-y-3.5 shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-2xl bg-[#1B2540] border border-[#C9A35B]/60 text-[#C9A35B] flex items-center justify-center shrink-0">
                  <ChefHat className="w-6 h-6" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-sm sm:text-base text-[#F5F1E8]">
                      {tx(isEn, 'القالب الملكي الجديد + شيف الذكاء الاصطناعي', 'New Royal VIP Template + AI Chef')}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#C9A35B] text-[#0E1526] whitespace-nowrap">
                      {normalizeMenuTemplateId(shop.menuTemplate) === 'royal'
                        ? tx(isEn, 'مفعّل حالياً', 'Active Now')
                        : tx(isEn, 'جديد', 'New')}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#F5F1E8]/80 leading-relaxed">
                    {tx(
                      isEn,
                      'تصميم فاخر مع شات شيف ذكي يرد على عملائك عن المكونات والأسعار والعروض مباشرة.',
                      'Luxury layout with built-in AI Chef chat answering customer ingredient & pricing questions.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            {royalActivatedToast && (
              <div className="rounded-xl bg-[#1B2540] border border-[#C9A35B] px-3.5 py-2 text-xs font-extrabold text-[#DCB877] text-center">
                {royalActivatedToast}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  openTemplatePreview(
                    'royal',
                    shop.themeColor || 'أخضر',
                    shop.themeMode === 'dark' ? 'dark' : 'light'
                  )
                }
                className="min-h-[40px] px-3.5 rounded-xl bg-[#1B2540] hover:bg-[#233052] text-[#F5F1E8] border border-[#C9A35B]/45 text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Eye className="w-3.5 h-3.5 text-[#C9A35B]" />
                {tx(isEn, 'معاينة القالب', 'Preview Template')}
              </button>

              {normalizeMenuTemplateId(shop.menuTemplate) === 'royal' ? (
                <button
                  type="button"
                  onClick={onOpenStorefront}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#C9A35B] hover:opacity-95 text-[#0E1526] text-xs font-black inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-opacity"
                >
                  <Check className="w-3.5 h-3.5" />
                  {tx(isEn, 'مفعّل · فتح منيو متجري', 'Active · Open My Menu')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={activatingRoyal}
                  onClick={() => void handleQuickActivateRoyal()}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#C9A35B] hover:opacity-95 disabled:opacity-60 text-[#0E1526] text-xs font-black inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-opacity"
                >
                  {activatingRoyal ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {activatingRoyal
                    ? tx(isEn, 'جاري التفعيل...', 'Activating...')
                    : tx(isEn, 'تفعيل القالب', 'Activate Template')}
                </button>
              )}

              {onTryDemoWithStyle && (
                <button
                  type="button"
                  onClick={() =>
                    handleLaunchDemoWithStyle(
                      'royal',
                      shop.themeColor || 'أخضر',
                      shop.themeMode === 'dark' ? 'dark' : 'light'
                    )
                  }
                  className="min-h-[40px] px-3.5 rounded-xl bg-transparent hover:bg-[#1B2540] text-[#DCB877] border border-[#C9A35B]/60 text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {tx(isEn, 'تجربة المنيو التجريبي', 'Try Demo Menu')}
                </button>
              )}
            </div>
          </div>

          {/* Active Template Studio & Direct Template Switcher Card */}
          <div className="col-span-2 sf-card space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleOpenTemplateStudioFor(quickSelectedTemplate)}
                className="flex items-center gap-3 text-start flex-1 min-w-[200px] cursor-pointer"
              >
                <div
                  style={{ backgroundColor: `${getShopThemeHex(shop.themeColor)}18` }}
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-[#CFE3D5] dark:border-[#2C3D32]"
                >
                  <Palette style={{ color: getShopThemeHex(shop.themeColor) }} className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm flex items-center gap-2 flex-wrap">
                    <span>{tx(isEn, 'قالب ومظهر المنيو', 'Menu Template & Theme')}</span>
                    <span className="text-xs font-black text-[#15803D] dark:text-[#BBF7D0]">
                      ·{' '}
                      {translateTemplateMeta(
                        getMenuTemplateConfig(shop.menuTemplate).id,
                        getMenuTemplateConfig(shop.menuTemplate).name,
                        '',
                        isEn
                      ).name}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA] flex items-center gap-2">
                    <span
                      style={{ backgroundColor: getShopThemeHex(shop.themeColor) }}
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                    />
                    <span>
                      {translateThemeColor(shop.themeColor || 'أخضر', isEn)} ·{' '}
                      {shop.themeMode === 'dark' ? tx(isEn, 'داكن', 'Dark') : tx(isEn, 'فاتح', 'Light')}
                    </span>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleOpenTemplateStudioFor(quickSelectedTemplate)}
                className="sf-btn min-h-[38px] px-3 text-xs whitespace-nowrap shrink-0"
              >
                <Palette className="w-3.5 h-3.5" />
                {tx(isEn, 'تخصيص المظهر', 'Customize Style')}
              </button>
            </div>

            {/* Instant Template Selector Pills */}
            <div className="flex flex-wrap gap-1.5">
              {MENU_TEMPLATES.map((tpl) => {
                const isSelected = quickSelectedTemplate === tpl.id;
                const isActiveOnShop = normalizeMenuTemplateId(shop.menuTemplate) === tpl.id;
                const meta = translateTemplateMeta(tpl.id, tpl.name, '', isEn);
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setQuickSelectedTemplate(tpl.id)}
                    aria-pressed={isSelected}
                    className={`px-3 py-1.5 rounded-full text-xs font-extrabold border inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                      isSelected
                        ? tpl.id === 'royal'
                          ? 'bg-[#0E1526] border-[#C9A35B] text-[#DCB877]'
                          : 'bg-[#DCFCE7] dark:bg-[#173323] border-[#15803D] text-[#14532D] dark:text-[#BBF7D0]'
                        : 'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32] text-[#4B5B52] dark:text-[#A3B5AA] hover:border-[#15803D]'
                    }`}
                  >
                    {isActiveOnShop && <Check className="w-3 h-3 text-[#15803D] dark:text-[#4ADE80]" />}
                    <span>{meta.name}</span>
                  </button>
                );
              })}
            </div>

            {templateCardToast && (
              <div className="rounded-xl bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] px-3.5 py-2 text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] text-center">
                {templateCardToast}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  openTemplatePreview(
                    quickSelectedTemplate,
                    shop.themeColor || 'أخضر',
                    shop.themeMode === 'dark' ? 'dark' : 'light'
                  )
                }
                className="sf-btn min-h-[40px] px-3.5 text-xs whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5" />
                {tx(isEn, 'معاينة القالب', 'Preview Template')}
              </button>
              <button
                type="button"
                disabled={Boolean(activatingTemplateId)}
                onClick={() => void activateTemplate(quickSelectedTemplate)}
                className="sf-btn-primary min-h-[40px] px-4 text-xs whitespace-nowrap"
              >
                {activatingTemplateId === quickSelectedTemplate ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                {activatingTemplateId === quickSelectedTemplate
                  ? tx(isEn, 'جاري التفعيل...', 'Activating...')
                  : tx(isEn, 'تفعيل القالب', 'Activate Template')}
              </button>
              {onTryDemoWithStyle && (
                <button
                  type="button"
                  onClick={() =>
                    handleLaunchDemoWithStyle(
                      quickSelectedTemplate,
                      shop.themeColor || 'أخضر',
                      shop.themeMode === 'dark' ? 'dark' : 'light'
                    )
                  }
                  className="sf-btn-mint min-h-[40px] px-3.5 text-xs whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {tx(isEn, 'تجربة المنيو التجريبي', 'Try Demo')}
                </button>
              )}
              <button
                type="button"
                onClick={onOpenStorefront}
                className="sf-btn min-h-[40px] px-3.5 text-xs whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5" />
                {tx(isEn, 'منيوك الحالي', 'Live Menu')}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            className="col-span-2 sf-card text-start hover:border-[#15803D] transition-colors flex flex-row items-center gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm">
                {tx(isEn, 'التوصيل والروابط وإعلانات Google', 'Delivery, Social Links, Maps & Google Ads')}
              </div>
              <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                {tx(isEn, 'سعر التوصيل، فيسبوك وإنستجرام وتيك توك، خرائط جوجل، وتتبع Google Ads', 'Delivery fees, Facebook/IG/TikTok, Google Maps location & Ads conversion')}
              </div>
            </div>
          </button>
        </div>

        {/* Self-Marketing & Google Ads Readiness Card */}
        <div className="sf-card space-y-3 border-[#86EFAC]/70 dark:border-[#2C3D32]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <b className="text-sm font-extrabold block">
                  {tx(isEn, 'التسويق الذاتي ومضاعفة المبيعات (Google Ads)', 'Self-Marketing & Google Ads Boost')}
                </b>
                <span className="text-[11px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                  {tx(
                    isEn,
                    'منيوك متوافق مع حملات جوجل ويحسب تحويلات الطلبات تلقائياً',
                    'Your menu tracks ad leads & purchases cleanly for higher sales'
                  )}
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] text-[10px] font-black shrink-0 inline-flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {shop.googleAdsId ? tx(isEn, 'Ads متصل', 'Ads Connected') : tx(isEn, 'جاهز لـ Ads', 'Ads Ready')}
            </span>
          </div>

          <div className="rounded-xl bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] p-3 text-xs font-semibold text-[#14201A] dark:text-[#E8F2EB] leading-relaxed">
            {tx(
              isEn,
              `اطلب الآن أونلاين من منيو ${displayShopName} وتصفح كل الأطباق والأسعار والعروض الحصرية بدون تطبيقات! 🍽️👇\n${menuUrl}`,
              `Order online directly from ${displayShopName}! Browse all dishes, prices, and special deals in seconds: 🍽️👇\n${menuUrl}`
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const postText = tx(
                  isEn,
                  `اطلب الآن أونلاين من منيو ${displayShopName} وتصفح كل الأطباق والأسعار والعروض الحصرية! 🍽️👇\n${menuUrl}`,
                  `Order online directly from ${displayShopName}! Browse all dishes, prices, and special deals in seconds: 🍽️👇\n${menuUrl}`
                );
                const ok = await copyMenuLink(postText);
                if (ok) {
                  setPromoCopied(true);
                  window.setTimeout(() => setPromoCopied(false), 2600);
                }
              }}
              className="sf-btn-primary min-h-[38px] px-3.5 text-xs flex-1"
            >
              {promoCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {promoCopied
                ? tx(isEn, 'تم نسخ بوست التسويق ✅', 'Promo Post Copied ✅')
                : tx(isEn, 'نسخ بوست التسويق لمنصاتك', 'Copy Promo Post')}
            </button>
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="sf-btn min-h-[38px] px-3 text-xs"
            >
              <TrendingUp className="w-3.5 h-3.5 text-[#15803D]" />
              {tx(isEn, 'ربط Google Ads', 'Setup Google Ads')}
            </button>
          </div>
        </div>

        {/* Continuous Technical Support After Delivery Card */}
        <div className="sf-card flex flex-wrap items-center justify-between gap-3 bg-[#DCFCE7]/40 dark:bg-[#173323]/40">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#15803D] text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <b className="text-sm font-extrabold block">
                {tx(isEn, 'دعم فني مستمر بعد التسليم', 'Continuous Technical Support')}
              </b>
              <p className="text-[11px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                {tx(
                  isEn,
                  'فريق غزالو معك يومياً لتحديث المنيو، ربط الدومين، وحل أي استفسار فوراً.',
                  'Our team stays with you daily for menu updates, QR printing, and live assistance.'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                `مرحباً دعم Ghazalo الفني، أحتاج مساعدة بخصوص متجر ${shop.nameAr} (${storeSlug})`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="sf-btn-primary min-h-[36px] px-3 text-xs"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {tx(isEn, 'دعم فوري', 'Live Support')}
            </a>
          </div>
        </div>

        {/* PWA App Install Banner */}
        <PWAInstallButton variant="card" />

        {/* Needs Attention + Recent Orders */}
        <div className="sf-card space-y-2.5">
          <b className="text-base font-extrabold">{tx(isEn, 'يحتاج انتباهك', 'Needs Attention')}</b>
          {newOrders.length === 0 ? (
            <p className="text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'لا شيء ينتظرك الآن. ستظهر هنا الطلبات الجديدة والأصناف التي نفدت',
                'Nothing pending right now'
              )}
            </p>
          ) : (
            <div className="space-y-2">
              {newOrders.slice(0, 3).map((ord) => (
                <div
                  key={ord.id}
                  onClick={onOpenOrders}
                  className="cursor-pointer rounded-2xl bg-[#FEF9C3] p-3 flex items-center justify-between text-xs font-bold text-[#14201A]"
                >
                  <span>
                    {tx(isEn, 'طلب جديد', 'New Order')} #{ord.orderNumber}
                  </span>
                  <span className="tabular-nums">{formatMoney(ord.total, shop.country)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sf-card space-y-2.5">
          <b className="text-base font-extrabold">{tx(isEn, 'آخر الطلبات', 'Recent Orders')}</b>
          {orders.length === 0 ? (
            <p className="text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'لا توجد طلبات بعد. ستظهر هنا أول ما يطلب زبائنك من المنيو',
                'No orders yet'
              )}
            </p>
          ) : (
            <div className="space-y-2">
              {orders.slice(0, 4).map((ord) => (
                <div
                  key={ord.id}
                  onClick={onOpenOrders}
                  className="cursor-pointer rounded-2xl bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] p-3 flex items-center justify-between text-xs font-bold"
                >
                  <span>
                    #{ord.orderNumber} · {ord.customerName || tx(isEn, 'عميل', 'Customer')}
                  </span>
                  <span className="text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                    {formatMoney(ord.total, shop.country)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Floating Green WhatsApp Support Button (.wa from Sofrtek) */}
      <a
        href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noreferrer"
        aria-label={tx(isEn, 'واتساب', 'WhatsApp Support')}
        className={`fixed bottom-5 ${
          isEn ? 'right-4' : 'left-4'
        } z-30 min-h-[52px] px-4 rounded-full bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-sm shadow-lg inline-flex items-center gap-1.5`}
      >
        <MessageCircle className="w-5 h-5" />
        <span>{tx(isEn, 'واتساب', 'WhatsApp')}</span>
      </a>

      {/* Side Drawer (`sideM()` from Sofrtek) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-[#14201A]/50 backdrop-blur-xs" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 w-[290px] max-w-[85vw] bg-[#F6FBF7] dark:bg-[#0F1712] h-full p-4 flex flex-col justify-between overflow-y-auto shadow-2xl">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between pb-2">
                <b className="text-xl font-extrabold">{tx(isEn, 'القائمة', 'Menu')}</b>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="sf-btn min-h-[40px] w-10 px-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenStorefront();
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <Utensils className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'المنيو', 'Store Menu')}
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="sf-btn-mint w-full justify-start"
                >
                  <Home className="w-4 h-4" />
                  {tx(isEn, 'الرئيسية', 'Home')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setProductsModalOpen(true);
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <LayoutGrid className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'الأصناف والمنيو AI', 'Items & AI Menu')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setOffersModalOpen(true);
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <Tag className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, `قائمة العروض (${offerProducts.length})`, `Offers (${offerProducts.length})`)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setBellOpen(true);
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <Bell className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'الإشعارات', 'Notifications')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenShareQr();
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <Share2 className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'مشاركة المنيو', 'Share Menu & QR')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenOrders();
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <ShoppingBag className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'الطلبات', 'Orders')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setReportsModalOpen(true);
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <BarChart3 className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'التقارير', 'Reports')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setSettingsModalOpen(true);
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <Settings className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'الإعدادات والتوصيل', 'Settings & Delivery')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setContactModalOpen(true);
                  }}
                  className="sf-btn w-full justify-start"
                >
                  <Phone className="w-4 h-4 text-[#15803D]" />
                  {tx(isEn, 'تواصل معانا', 'Contact Us')}
                </button>
              </div>
            </div>

            {/* Bottom Account Card inside Drawer */}
            <div className="sf-card mt-4 space-y-2.5 text-xs font-bold">
              <div>
                <div className="font-extrabold text-sm text-[#14201A] dark:text-[#E8F2EB] truncate">
                  {userName}
                </div>
                <div className="text-[#4B5B52] dark:text-[#A3B5AA] truncate" dir="ltr">
                  {userEmail}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setSubscriptionModalOpen(true);
                }}
                className="w-full text-start text-[#15803D] dark:text-[#BBF7D0] hover:underline"
              >
                {tx(isEn, 'الاشتراك والدفع', 'Subscription & Billing')}
              </button>

              <div className="flex items-center justify-between pt-1">
                <span>{tx(isEn, 'اللغة', 'Language')}</span>
                <div className="inline-flex gap-1">
                  {(
                    [
                      { code: 'ar' as const, label: 'عربي' },
                      { code: 'en' as const, label: 'English' },
                    ] as const
                  ).map((item) => {
                    const active = item.code === (isEn ? 'en' : 'ar');
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => setLang(item.code)}
                        className={active ? 'sf-chip-on px-2.5 py-1 text-[11px]' : 'sf-chip px-2.5 py-1 text-[11px]'}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span>{tx(isEn, 'المظهر', 'Theme')}</span>
                <div className="inline-flex gap-1">
                  {(
                    [
                      { id: 'فاتح' as const, label: tx(isEn, 'فاتح', 'Light'), mode: 'light' as const },
                      { id: 'داكن' as const, label: tx(isEn, 'داكن', 'Dark'), mode: 'dark' as const },
                      { id: 'النظام' as const, label: tx(isEn, 'النظام', 'Auto'), mode: 'system' as const },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setThemePref(m.id);
                        onSetThemeMode(m.mode);
                      }}
                      className={themePref === m.id ? 'sf-chip-on px-2 py-1 text-[11px]' : 'sf-chip px-2 py-1 text-[11px]'}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <PWAInstallButton
                variant="drawer"
                label={tx(isEn, 'تثبيت التطبيق', 'Install App')}
              />

              <button
                type="button"
                onClick={onLogout}
                className="sf-btn w-full min-h-[42px] text-xs"
              >
                <LogOut className="w-4 h-4" />
                {tx(isEn, 'تسجيل الخروج', 'Sign Out')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Products Manager + Gemini AI Modal */}
      {productsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/50 backdrop-blur-xs">
          <div className="sf-card max-w-2xl w-full p-5 sm:p-6 max-h-[90vh] flex flex-col justify-between shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#CFE3D5] dark:border-[#2C3D32]">
              <h3 className="text-lg font-extrabold">
                {tx(isEn, 'الأصناف والأسعار', 'Manage Menu Items & Prices')}
              </h3>
              <button
                type="button"
                onClick={() => setProductsModalOpen(false)}
                className="sf-btn min-h-[38px] w-10 px-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pe-1">
              {/* Multi-Image + File AI Extract */}
              <div className="bg-[#DCFCE7]/50 dark:bg-[#173323]/60 rounded-2xl p-4 border border-[#86EFAC] dark:border-[#2C3D32] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold text-sm text-[#14532D] dark:text-[#BBF7D0] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#15803D]" />
                    {tx(isEn, 'رفع صور المنيو (صورة أو عدة صفحات)', 'Upload Menu Photos (Single or Multiple Pages)')}
                  </div>
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void handleBackfillShopPhotos()}
                    className="sf-btn min-h-[38px] px-3 text-xs text-[#14532D]"
                  >
                    {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    {tx(isEn, 'تعبئة صور للأصناف', 'Auto-fill Dish Photos')}
                  </button>
                </div>

                <MultiMenuUploader
                  compact
                  businessName={shop.nameAr}
                  language={shop.menuLanguage || 'العربية'}
                  isEn={isEn}
                  onExtractedChunk={handleExtractedProductsChunk}
                />

                {aiMessage && (
                  <div className="w-full text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0]">
                    {aiMessage}
                  </div>
                )}
              </div>

              {/* Unlimited Categories Manager */}
              <div className="bg-[#FFFFFF] dark:bg-[#18231C] rounded-2xl p-4 border border-[#CFE3D5] dark:border-[#2C3D32] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm">
                      {tx(isEn, `إدارة الأقسام (${categoryBreakdown.length})`, `Manage Categories (${categoryBreakdown.length})`)}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] text-[10px] font-black">
                      {tx(isEn, 'أقسام وأصناف غير محدودة', 'Unlimited Items & Categories')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCatInput}
                    onChange={(e) => setNewCatInput(e.target.value)}
                    placeholder={tx(isEn, 'أضف قسماً جديداً (مثال: بيتزا إيطالي)', 'Add new category (e.g. Italian Pizza)')}
                    className="sf-inp min-h-[38px] text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = newCatInput.trim();
                      if (!val) return;
                      setProdCategory(val);
                      setNewCatInput('');
                    }}
                    className="sf-btn-primary min-h-[38px] px-3.5 text-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {tx(isEn, 'تحديد القسم', 'Use Category')}
                  </button>
                </div>

                {categoryBreakdown.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pe-1">
                    {categoryBreakdown.map((cat) => {
                      const isRenaming = editingCatTarget === cat.name;
                      const isConfirmDel = confirmDeleteCat === cat.name;
                      return (
                        <div
                          key={cat.name}
                          className="rounded-xl bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            {isRenaming ? (
                              <div className="flex items-center gap-1.5 flex-1">
                                <input
                                  type="text"
                                  value={editingCatValue}
                                  onChange={(e) => setEditingCatValue(e.target.value)}
                                  className="sf-inp min-h-[32px] py-1 text-xs flex-1"
                                />
                                <button
                                  type="button"
                                  disabled={catBusy}
                                  onClick={() => void handleRenameCategory(cat.name, editingCatValue)}
                                  className="px-2.5 py-1 rounded-lg bg-[#15803D] text-white font-bold"
                                >
                                  {tx(isEn, 'حفظ', 'Save')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCatTarget(null)}
                                  className="px-2 py-1 rounded-lg border border-[#CFE3D5] font-bold"
                                >
                                  {tx(isEn, 'إلغاء', 'Cancel')}
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setProdCategory(cat.name)}
                                  className="flex items-center gap-2 font-extrabold text-start min-w-0 hover:text-[#15803D]"
                                >
                                  <span className="truncate">{cat.name}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] text-[10px] font-black tabular-nums">
                                    {cat.count}
                                  </span>
                                </button>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCatTarget(cat.name);
                                      setEditingCatValue(cat.name);
                                      setConfirmDeleteCat(null);
                                    }}
                                    aria-label={tx(isEn, 'تعديل اسم القسم', 'Rename category')}
                                    className="p-1.5 rounded-lg bg-white dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-[#4B5B52] hover:text-[#15803D]"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmDeleteCat(isConfirmDel ? null : cat.name)
                                    }
                                    aria-label={tx(isEn, 'حذف القسم', 'Delete category')}
                                    className="p-1.5 rounded-lg bg-white dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-[#4B5B52] hover:text-rose-600"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {isConfirmDel && (
                            <div className="mt-2 pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <span className="font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
                                {tx(isEn, 'ماذا تفعل بالأصناف داخل القسم؟', 'Action for items in this category?')}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={catBusy}
                                  onClick={() => void handleDeleteCategory(cat.name, 'move')}
                                  className="px-2.5 py-1 rounded-lg bg-[#15803D] text-white font-bold"
                                >
                                  {tx(isEn, 'نقل إلى أصناف متنوعة', 'Move to General')}
                                </button>
                                <button
                                  type="button"
                                  disabled={catBusy}
                                  onClick={() => void handleDeleteCategory(cat.name, 'remove')}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold"
                                >
                                  {tx(isEn, 'حذف القسم وأصنافه', 'Delete All')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add Product Form */}
              <form
                onSubmit={handleAddProduct}
                className="bg-[#F6FBF7] dark:bg-[#0F1712] rounded-2xl p-4 border border-[#CFE3D5] dark:border-[#2C3D32] space-y-3"
              >
                <div className="font-extrabold text-sm">
                  {tx(isEn, 'إضافة صنف يدوي', 'Add Item Manually')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder={tx(isEn, 'اسم الصنف', 'Item name')}
                    className="sf-inp min-h-[42px] text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    placeholder={tx(isEn, 'التصنيف (مثال: مشويات)', 'Category (e.g. Grills)')}
                    className="sf-inp min-h-[42px] text-xs"
                  />
                  <input
                    type="number"
                    required={!prodVariants.trim()}
                    min={0}
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    placeholder={
                      prodVariants.trim()
                        ? tx(isEn, 'السعر الأساسي (تلقائي)', 'Base price (auto)')
                        : tx(isEn, 'السعر', 'Price')
                    }
                    className="sf-inp min-h-[42px] text-xs tabular-nums"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    placeholder={tx(
                      isEn,
                      'وصف أو تفاصيل العرض كما هي في المنيو',
                      'Description or meal details'
                    )}
                    className="sf-inp min-h-[42px] text-xs"
                  />
                  <input
                    type="text"
                    value={prodBarcode}
                    onChange={(e) => setProdBarcode(e.target.value)}
                    placeholder={tx(isEn, 'الباركود (اختياري)', 'Barcode (optional)')}
                    className="sf-inp min-h-[42px] text-xs"
                  />
                </div>
                <input
                  type="text"
                  value={prodVariants}
                  onChange={(e) => setProdVariants(e.target.value)}
                  placeholder={tx(
                    isEn,
                    'خيارات وأسعار (اختياري، افصل بفاصلة: 2 فرخة - 550، 4 فرخة - 1000)',
                    'Options & prices (optional, comma-separated: Small - 80, Large - 140)'
                  )}
                  className="sf-inp min-h-[42px] text-xs"
                />
                <button
                  type="submit"
                  disabled={addingProd}
                  className="sf-btn-primary min-h-[42px] px-5 text-xs"
                >
                  <Plus className="w-4 h-4" />
                  {addingProd
                    ? tx(isEn, 'جاري الإضافة...', 'Adding...')
                    : tx(isEn, 'إضافة الصنف', 'Add Item')}
                </button>
              </form>

              {/* Products List */}
              <div className="space-y-2">
                {sortedProducts.length === 0 ? (
                  <p className="text-center text-sm font-bold text-[#4B5B52] py-6">
                    {tx(isEn, 'لا توجد أصناف مضافة حتى الآن.', 'No items added yet.')}
                  </p>
                ) : (
                  sortedProducts.map((p) => {
                    const pOptions = getProductOptions(p);
                    const isEditingThis = editingProdId === p.id;
                    return (
                      <div
                        key={p.id}
                        className="bg-[#F6FBF7] dark:bg-[#0F1712] rounded-2xl p-3 text-xs space-y-2.5 border border-[#CFE3D5] dark:border-[#2C3D32]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative w-11 h-11 rounded-xl bg-[#FFFFFF] dark:bg-[#18231C] flex items-center justify-center shrink-0 overflow-hidden border border-[#CFE3D5] dark:border-[#2C3D32]">
                              {p.imageUrl ? (
                                <img loading="lazy" decoding="async"
                                  src={p.imageUrl}
                                  alt={p.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Utensils className="w-4 h-4 text-[#15803D]" />
                              )}
                              {shop.logoUrl && shop.showLogoOnItems && (
                                <img loading="lazy" decoding="async"
                                  src={shop.logoUrl}
                                  alt={tx(isEn, 'شعار', 'Logo')}
                                  className="w-4 h-4 rounded-full object-cover border border-white absolute top-0.5 right-0.5 bg-white"
                                />
                              )}
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="font-extrabold truncate">{p.name}</div>
                              <div className="text-[#4B5B52] dark:text-[#A3B5AA] font-semibold">
                                {p.category} · {formatMoney(p.price, shop.country)}
                                {p.isOffer && p.originalPrice
                                  ? tx(isEn, ` (بدلاً من ${p.originalPrice})`, ` (was ${p.originalPrice})`)
                                  : ''}
                              </div>
                              {p.description && (
                                <div className="text-[11px] text-[#4B5B52] dark:text-[#A3B5AA] line-clamp-1">
                                  {p.description}
                                </div>
                              )}
                              {pOptions.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {pOptions.map((opt) => (
                                    <span
                                      key={opt.raw}
                                      className="px-2 py-0.5 rounded-lg bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-[10px] font-extrabold tabular-nums"
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
                                  ? 'bg-[#15803D] text-white border-[#15803D]'
                                  : 'bg-[#FFFFFF] dark:bg-[#18231C] text-[#4B5B52] border-[#CFE3D5] dark:border-[#2C3D32]'
                              }`}
                              aria-label={tx(isEn, 'تعديل', 'Edit')}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleProductOffer(p)}
                              className={`px-2.5 py-1 rounded-xl font-bold inline-flex items-center gap-1 ${
                                p.isOffer
                                  ? 'bg-[#FACC15] text-[#14201A]'
                                  : 'bg-[#FFFFFF] dark:bg-[#18231C] text-[#4B5B52] border border-[#CFE3D5] dark:border-[#2C3D32]'
                              }`}
                            >
                              <Tag className="w-3 h-3" />
                              {tx(isEn, 'عرض', 'Offer')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleAvailability(p)}
                              className={`px-3 py-1 rounded-full font-extrabold ${
                                p.available !== false
                                  ? 'bg-[#15803D] text-white'
                                  : 'bg-[#FFFFFF] border border-[#CFE3D5] text-[#4B5B52]'
                              }`}
                            >
                              {p.available !== false
                                ? tx(isEn, 'متوفر', 'In Stock')
                                : tx(isEn, 'نفد', 'Out')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteProductItem(p.id)}
                              className="p-1.5 text-[#4B5B52] hover:text-amber-700"
                              aria-label={tx(isEn, 'حذف', 'Delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {isEditingThis && (
                          <div className="pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32] space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <input
                                type="text"
                                value={editProdName}
                                onChange={(e) => setEditProdName(e.target.value)}
                                placeholder={tx(isEn, 'اسم الصنف', 'Item name')}
                                className="sm:col-span-2 sf-inp min-h-[38px] text-xs"
                              />
                              <input
                                type="number"
                                min={0}
                                value={editProdPrice}
                                onChange={(e) => setEditProdPrice(e.target.value)}
                                placeholder={tx(isEn, 'السعر', 'Price')}
                                className="sf-inp min-h-[38px] text-xs tabular-nums"
                              />
                            </div>
                            <input
                              type="text"
                              value={editProdDesc}
                              onChange={(e) => setEditProdDesc(e.target.value)}
                              placeholder={tx(isEn, 'الوصف أو نص العرض', 'Description or offer text')}
                              className="sf-inp min-h-[38px] text-xs"
                            />
                            <input
                              type="text"
                              value={editProdVariants}
                              onChange={(e) => setEditProdVariants(e.target.value)}
                              placeholder={tx(
                                isEn,
                                'الخيارات والأسعار (افصل بفاصلة)',
                                'Options & prices (comma-separated)'
                              )}
                              className="sf-inp min-h-[38px] text-xs"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingProdId(null)}
                                className="sf-btn min-h-[36px] px-3 text-xs"
                              >
                                {tx(isEn, 'إلغاء', 'Cancel')}
                              </button>
                              <button
                                type="button"
                                disabled={savingProdEdit}
                                onClick={() => void handleSaveProductEdit(p.id)}
                                className="sf-btn-primary min-h-[36px] px-4 text-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {savingProdEdit
                                  ? tx(isEn, 'جاري الحفظ...', 'Saving...')
                                  : tx(isEn, 'حفظ التعديل', 'Save Changes')}
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

      {/* Offers Manager Modal */}
      {offersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/50 backdrop-blur-xs">
          <div className="sf-card max-w-2xl w-full p-5 sm:p-6 max-h-[90vh] flex flex-col justify-between shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#CFE3D5] dark:border-[#2C3D32]">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#15803D]" />
                <h3 className="text-lg font-extrabold">
                  {tx(isEn, 'إدارة قائمة العروض والخصومات', 'Manage Offers & Discounts')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOffersModalOpen(false)}
                className="sf-btn min-h-[38px] w-10 px-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pe-1">
              <form
                onSubmit={handleAddOffer}
                className="bg-[#DCFCE7] dark:bg-[#173323] rounded-2xl p-4 border border-[#86EFAC] dark:border-[#2C3D32] space-y-3"
              >
                <div className="font-extrabold text-sm text-[#14532D] dark:text-[#BBF7D0]">
                  {tx(isEn, 'إضافة عرض جديد لقائمة العروض', 'Add a New Offer')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={offerName}
                    onChange={(e) => setOfferName(e.target.value)}
                    placeholder={tx(
                      isEn,
                      'اسم العرض (مثال: بوكس المشويات العائلي)',
                      'Offer title (e.g. Family Grill Box)'
                    )}
                    className="sf-inp min-h-[42px] text-xs"
                  />
                  <input
                    type="text"
                    value={offerCategory}
                    onChange={(e) => setOfferCategory(e.target.value)}
                    placeholder={tx(isEn, 'القسم (مثال: عروض خاصة)', 'Category (e.g. Special Offers)')}
                    className="sf-inp min-h-[42px] text-xs"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="number"
                    required
                    min={1}
                    value={offerOriginalPrice}
                    onChange={(e) => setOfferOriginalPrice(e.target.value)}
                    placeholder={tx(isEn, 'السعر قبل الخصم', 'Original price')}
                    className="sf-inp min-h-[42px] text-xs tabular-nums"
                  />
                  <input
                    type="number"
                    required
                    min={0}
                    value={offerSalePrice}
                    onChange={(e) => setOfferSalePrice(e.target.value)}
                    placeholder={tx(isEn, 'سعر العرض بعد الخصم', 'Sale price')}
                    className="sf-inp min-h-[42px] text-xs tabular-nums"
                  />
                  <input
                    type="text"
                    value={offerLabel}
                    onChange={(e) => setOfferLabel(e.target.value)}
                    placeholder={tx(isEn, 'شارة (مثال: عرض اليوم)', 'Badge (e.g. Hot Deal)')}
                    className="sf-inp min-h-[42px] text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingOffer}
                  className="sf-btn-primary min-h-[42px] px-5 text-xs"
                >
                  <Plus className="w-4 h-4" />
                  {addingOffer
                    ? tx(isEn, 'جاري إضافة العرض...', 'Publishing offer...')
                    : tx(isEn, 'نشر العرض في المنيو', 'Publish Offer')}
                </button>
              </form>

              <div className="space-y-2">
                <div className="font-extrabold text-sm">
                  {tx(
                    isEn,
                    `العروض النشطة حالياً (${offerProducts.length})`,
                    `Active Offers (${offerProducts.length})`
                  )}
                </div>
                {offerProducts.length === 0 ? (
                  <div className="text-center text-xs font-bold text-[#4B5B52] py-4 bg-[#F6FBF7] dark:bg-[#0F1712] rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32]">
                    {tx(
                      isEn,
                      'لا توجد عروض مفعلة بعد. أضف عرضاً جديداً أو اختر صنفاً من بالأسفل.',
                      'No active offers yet. Create one above or promote an item below.'
                    )}
                  </div>
                ) : (
                  offerProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 bg-[#DCFCE7]/50 dark:bg-[#173323] rounded-2xl p-3 border border-[#86EFAC] dark:border-[#2C3D32] text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-extrabold truncate">
                          {p.name}{' '}
                          <span className="text-[#15803D] dark:text-[#4ADE80]">
                            · {p.offerLabel || tx(isEn, 'عرض خاص', 'Special Offer')}
                          </span>
                        </div>
                        <div className="font-bold text-[#4B5B52] dark:text-[#A3B5AA] tabular-nums">
                          {p.originalPrice ? (
                            <span className="line-through opacity-60 me-2">
                              {formatMoney(p.originalPrice, shop.country, 0)}
                            </span>
                          ) : null}
                          <span className="text-[#15803D] dark:text-[#4ADE80] font-extrabold">
                            {formatMoney(p.price, shop.country, 0)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleProductOffer(p)}
                        className="sf-btn min-h-[36px] px-3 text-xs shrink-0"
                      >
                        {tx(isEn, 'إيقاف العرض', 'Disable Offer')}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {sortedProducts.filter((p) => !p.isOffer).length > 0 && (
                <div className="space-y-2">
                  <div className="font-extrabold text-sm">
                    {tx(
                      isEn,
                      'أو أضف أصنافاً من المنيو إلى قائمة العروض:',
                      'Or promote existing menu items:'
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pe-1">
                    {sortedProducts
                      .filter((p) => !p.isOffer)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 bg-[#F6FBF7] dark:bg-[#0F1712] rounded-2xl p-2.5 border border-[#CFE3D5] dark:border-[#2C3D32] text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold truncate">{p.name}</div>
                            <div className="text-[#4B5B52] tabular-nums">
                              {formatMoney(p.price, shop.country, 0)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleToggleProductOffer(p)}
                            className="sf-btn-primary min-h-[34px] px-3 text-xs shrink-0"
                          >
                            {tx(isEn, '+ إضافة للعروض', '+ Add to Offers')}
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

      {/* Settings, Delivery, Fees & Design Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/50 backdrop-blur-xs">
          <form
            onSubmit={handleSaveSettings}
            className="sf-card max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {tx(isEn, 'إعدادات المتجر والتوصيل والقالب', 'Store, Delivery & Template Settings')}
              </h3>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="sf-btn min-h-[36px] w-9 px-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Interface Language Switch inside Settings */}
            <div className="flex items-center justify-between rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] px-4 py-2.5">
              <span className="text-xs font-extrabold">{tx(isEn, 'لغة لوحة التحكم', 'Interface Language')}</span>
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => setLang('ar')}
                  className={!isEn ? 'sf-chip-on px-3 py-1 text-xs' : 'sf-chip px-3 py-1 text-xs'}
                >
                  عربي
                </button>
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={isEn ? 'sf-chip-on px-3 py-1 text-xs' : 'sf-chip px-3 py-1 text-xs'}
                >
                  English
                </button>
              </div>
            </div>

            {/* Delivery Settings */}
            <div className="rounded-2xl border-2 border-[#86EFAC] dark:border-[#2C3D32] bg-[#DCFCE7]/50 dark:bg-[#173323]/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-sm text-[#14532D] dark:text-[#BBF7D0]">
                  {tx(isEn, 'اعدادات التوصيل', 'Delivery Settings')}
                </h4>
                <button
                  type="button"
                  onClick={() => setEditFreeDelivery((v) => !v)}
                  className={`px-3 py-1 rounded-full text-xs font-extrabold transition-colors ${
                    editFreeDelivery
                      ? 'bg-[#15803D] text-white'
                      : 'bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32]'
                  }`}
                >
                  {tx(isEn, 'التوصيل مجاني', 'Free Delivery')}: {editFreeDelivery ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {tx(isEn, 'سعر التوصيل (جنيه)', 'Delivery Fee (EGP)')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={editFreeDelivery}
                    value={editFreeDelivery ? '0' : editDeliveryFee}
                    onChange={(e) => setEditDeliveryFee(e.target.value)}
                    placeholder={tx(isEn, 'مثال: 20', 'e.g. 20')}
                    className="sf-inp min-h-[42px] text-sm tabular-nums disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {tx(isEn, 'وقت التوصيل المتوقع', 'Estimated Delivery Time')}
                  </label>
                  <input
                    type="text"
                    value={editDeliveryTime}
                    onChange={(e) => setEditDeliveryTime(e.target.value)}
                    placeholder={tx(isEn, '30-45 دقيقة', '30-45 mins')}
                    className="sf-inp min-h-[42px] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">
                  {tx(
                    isEn,
                    'الحد الأدنى للطلب للتوصيل المجاني (اختياري)',
                    'Minimum Order for Free Delivery (optional)'
                  )}
                </label>
                <input
                  type="number"
                  min={0}
                  value={editFreeDeliveryMinOrder}
                  onChange={(e) => setEditFreeDeliveryMinOrder(e.target.value)}
                  placeholder={tx(
                    isEn,
                    'مثال: 200 (لو الطلب فوق 200 جنيه التوصيل مجاني)',
                    'e.g. 200 (free delivery on orders above 200)'
                  )}
                  className="sf-inp min-h-[42px] text-sm tabular-nums"
                />
              </div>

              <button
                type="button"
                disabled={savingSettings}
                onClick={() => void handleSaveDeliveryOnly()}
                className="sf-btn-primary w-full min-h-[42px] text-xs"
              >
                {savingSettings
                  ? tx(isEn, 'جاري الحفظ...', 'Saving...')
                  : tx(isEn, 'حفظ اعدادات التوصيل', 'Save Delivery Settings')}
              </button>
              {deliverySavedToast && (
                <div className="text-xs font-extrabold text-[#15803D] dark:text-[#4ADE80] text-center">
                  {deliverySavedToast}
                </div>
              )}
            </div>

            {/* Fees & Taxes (All OFF by default) */}
            <div className="rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-extrabold text-sm">
                  {tx(isEn, 'الرسوم والضرائب (معطلة افتراضياً)', 'Fees & Taxes (OFF by default)')}
                </h4>
                <span className="text-[11px] font-bold text-[#15803D]">
                  {tx(isEn, 'سعر الأكل + التوصيل = الإجمالي', 'Subtotal + Delivery = Total')}
                </span>
              </div>

              {forceZeroFeesGlobally && (
                <div className="rounded-xl bg-[#FEF9C3] border border-[#FACC15] px-3 py-2 text-[11px] font-extrabold text-[#14201A]">
                  {tx(
                    isEn,
                    'تنبيه: تم إلغاء جميع الرسوم والضرائب لكل المطاعم على مستوى المنصة من لوحة الأدمن.',
                    'Note: All fees & taxes are globally disabled across the platform by Admin.'
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-xs font-bold py-1">
                <span>{tx(isEn, 'تفعيل رسوم الخدمة', 'Enable Service Fee')}</span>
                <div className="flex items-center gap-2">
                  {editEnableServiceFee && (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editServiceFeePct}
                      onChange={(e) => setEditServiceFeePct(e.target.value)}
                      placeholder="%"
                      className="w-16 px-2 py-1 rounded-xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C] text-center tabular-nums"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditEnableServiceFee((v) => !v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${
                      editEnableServiceFee
                        ? 'bg-[#15803D] text-white'
                        : 'bg-[#FFFFFF] border border-[#CFE3D5] text-[#4B5B52]'
                    }`}
                  >
                    {editEnableServiceFee ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs font-bold py-1">
                <span>{tx(isEn, 'تفعيل الضريبة / VAT', 'Enable VAT / Tax')}</span>
                <div className="flex items-center gap-2">
                  {editEnableVat && (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editVatPct}
                      onChange={(e) => setEditVatPct(e.target.value)}
                      placeholder="%"
                      className="w-16 px-2 py-1 rounded-xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C] text-center tabular-nums"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditEnableVat((v) => !v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${
                      editEnableVat
                        ? 'bg-[#15803D] text-white'
                        : 'bg-[#FFFFFF] border border-[#CFE3D5] text-[#4B5B52]'
                    }`}
                  >
                    {editEnableVat ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs font-bold py-1">
                <span>{tx(isEn, 'تفعيل رسوم التغليف', 'Enable Packaging Fee')}</span>
                <div className="flex items-center gap-2">
                  {editEnablePackagingFee && (
                    <input
                      type="number"
                      min={0}
                      value={editPackagingFee}
                      onChange={(e) => setEditPackagingFee(e.target.value)}
                      placeholder={tx(isEn, 'ج', 'EGP')}
                      className="w-16 px-2 py-1 rounded-xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C] text-center tabular-nums"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditEnablePackagingFee((v) => !v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${
                      editEnablePackagingFee
                        ? 'bg-[#15803D] text-white'
                        : 'bg-[#FFFFFF] border border-[#CFE3D5] text-[#4B5B52]'
                    }`}
                  >
                    {editEnablePackagingFee ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">
                {tx(isEn, 'اسم النشاط', 'Restaurant Name')}
              </label>
              <input
                type="text"
                value={editNameAr}
                onChange={(e) => setEditNameAr(e.target.value)}
                className="sf-inp"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">
                  {tx(isEn, 'رقم واتساب الطلبات', 'Orders WhatsApp Number')}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                  placeholder={SUPPORT_CONTACT.WHATSAPP_NUMBER}
                  className="sf-inp"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">
                  {tx(isEn, 'العنوان', 'Address')}
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="sf-inp"
                />
              </div>
            </div>

            {/* Template Switcher + Live Preview */}
            <div className="space-y-2.5 pt-1">
              <label className="block text-xs font-extrabold">
                {tx(isEn, 'شكل وقالب المنيو', 'Menu Template & Live Preview')}
              </label>
              <MenuTemplateShowcase
                selectedTemplate={editTemplate}
                activeShopTemplate={normalizeMenuTemplateId(shop.menuTemplate)}
                onSelectTemplate={setEditTemplate}
                onPreviewMyStore={(tpl) =>
                  openTemplatePreview(tpl, editThemeColor, editThemeMode)
                }
                onActivateTemplate={(tpl) =>
                  void activateTemplate(tpl, {
                    themeColor: editThemeColor,
                    themeMode: editThemeMode,
                  })
                }
                activatingTemplate={Boolean(activatingTemplateId)}
                onTryDemo={
                  onTryDemoWithStyle
                    ? (tpl) => handleLaunchDemoWithStyle(tpl, editThemeColor, editThemeMode)
                    : undefined
                }
                themeColor={editThemeColor}
                themeMode={editThemeMode}
                shopName={editNameAr || displayShopName}
                logoUrl={editLogoUrl}
                showLogoOnItems={editShowLogoOnItems}
                coverImage={editCoverImage}
                isEn={isEn}
                sampleItemName={sortedProducts[0]?.name}
                sampleItemCategory={sortedProducts[0]?.category}
                sampleItemPrice={sortedProducts[0]?.price}
              />
            </div>

            {/* Color Picker + Display Mode */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold">
                  {tx(isEn, 'لون الهوية', 'Brand Accent Color')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {['أخضر', 'برتقالي', 'أحمر', 'أزرق مخضر', 'أسود', 'لون آخر'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditThemeColor(c)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 ${
                        editThemeColor === c
                          ? 'border-[#15803D] bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0]'
                          : 'border-[#CFE3D5] dark:border-[#2C3D32]'
                      }`}
                    >
                      <span
                        style={{ backgroundColor: getShopThemeHex(c) }}
                        className="w-3 h-3 rounded-full"
                      />
                      {translateThemeColor(c, isEn)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] px-4 py-2.5">
                <span className="text-xs font-extrabold">
                  {tx(isEn, 'مظهر عرض المنيو للعملاء', 'Public Menu Display Mode')}
                </span>
                <div className="inline-flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditThemeMode('light')}
                    className={`${
                      editThemeMode === 'light' ? 'sf-chip-on' : 'sf-chip'
                    } px-3 py-1 text-xs inline-flex items-center gap-1`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    {tx(isEn, 'فاتح', 'Light')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditThemeMode('dark')}
                    className={`${
                      editThemeMode === 'dark' ? 'sf-chip-on' : 'sf-chip'
                    } px-3 py-1 text-xs inline-flex items-center gap-1`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    {tx(isEn, 'داكن', 'Dark')}
                  </button>
                </div>
              </div>
            </div>

            {/* Brand Logo Editor */}
            <div className="rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">
                  {tx(isEn, 'لوجو المطعم على الأصناف', 'Store Logo on Dish Cards')}
                </span>
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
                    className="sf-btn-primary min-h-[36px] px-3 text-xs"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {editLogoUrl ? tx(isEn, 'تغيير', 'Change') : tx(isEn, 'رفع لوجو', 'Upload Logo')}
                  </button>
                  {editLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setEditLogoUrl('')}
                      className="sf-btn min-h-[36px] px-2.5 text-xs"
                    >
                      {tx(isEn, 'حذف', 'Remove')}
                    </button>
                  )}
                </div>
              </div>
              {logoError && <p className="text-xs font-bold text-amber-800">{logoError}</p>}
              {editLogoUrl && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <img loading="lazy" decoding="async"
                      src={editLogoUrl}
                      alt={tx(isEn, 'شعار', 'Logo')}
                      className="w-9 h-9 rounded-full object-cover border border-white bg-white shadow-xs"
                    />
                    <span className="text-xs font-semibold">
                      {tx(isEn, 'شارة دائرية على زاوية كل صنف', 'Circular badge on each item corner')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditShowLogoOnItems((v) => !v)}
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      editShowLogoOnItems
                        ? 'bg-[#15803D] text-white'
                        : 'bg-[#FFFFFF] border border-[#CFE3D5]'
                    }`}
                  >
                    {editShowLogoOnItems ? tx(isEn, 'مفعل', 'Active') : tx(isEn, 'متوقف', 'Paused')}
                  </button>
                </div>
              )}
            </div>

            {/* Restaurant Cover */}
            <div className="rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-extrabold">
                    {tx(isEn, 'خلفية المطعم (ورا الاسم واللوجو)', 'Store Cover Banner')}
                  </div>
                  <div className="text-[11px] font-medium text-[#4B5B52] dark:text-[#A3B5AA]">
                    {tx(
                      isEn,
                      'صورة تظهر خلف اسم مطعمك واللوجو في أعلى المنيو',
                      'Displayed behind your logo & name at the top of the menu'
                    )}
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
                    className="sf-btn-primary min-h-[36px] px-3 text-xs"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {editCoverImage
                      ? tx(isEn, 'تغيير', 'Change')
                      : tx(isEn, 'رفع خلفية', 'Upload Cover')}
                  </button>
                  {editCoverImage && (
                    <button
                      type="button"
                      onClick={() => setEditCoverImage('')}
                      className="sf-btn min-h-[36px] px-2.5 text-xs"
                    >
                      {tx(isEn, 'حذف', 'Remove')}
                    </button>
                  )}
                </div>
              </div>
              {coverError && <p className="text-xs font-bold text-amber-800">{coverError}</p>}
              <div className="relative h-24 rounded-2xl overflow-hidden border border-[#CFE3D5] dark:border-[#2C3D32] flex items-end p-3">
                {editCoverImage ? (
                  <>
                    <img loading="lazy" decoding="async"
                      src={editCoverImage}
                      alt={tx(isEn, 'خلفية المطعم', 'Restaurant Cover')}
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
                    <img loading="lazy" decoding="async"
                      src={editLogoUrl}
                      alt={tx(isEn, 'شعار', 'Logo')}
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
                        editCoverImage ? 'text-white' : 'text-[#14201A] dark:text-[#E8F2EB]'
                      }`}
                    >
                      {editNameAr || displayShopName}
                    </div>
                    <div
                      className={`text-[10px] font-bold ${
                        editCoverImage ? 'text-[#BBF7D0]' : 'text-[#15803D]'
                      }`}
                    >
                      {tx(isEn, 'معاينة الخلفية واللوجو', 'Cover & Logo Preview')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Social Media + Google Maps + Google Ads Integration */}
            <div className="rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] p-4 space-y-3">
              <div className="font-extrabold text-sm flex items-center gap-2 text-[#14532D] dark:text-[#BBF7D0]">
                <Share2 className="w-4 h-4 text-[#15803D]" />
                {tx(isEn, 'ربط منصات التواصل والموقع الجغرافي', 'Social Platforms & Google Maps Location')}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold mb-1">
                    {tx(isEn, 'رابط صفحة Facebook', 'Facebook URL')}
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={editFacebookUrl}
                    onChange={(e) => setEditFacebookUrl(e.target.value)}
                    placeholder="https://facebook.com/yourpage"
                    className="sf-inp min-h-[40px] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">
                    {tx(isEn, 'رابط حساب Instagram', 'Instagram URL')}
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={editInstagramUrl}
                    onChange={(e) => setEditInstagramUrl(e.target.value)}
                    placeholder="https://instagram.com/youraccount"
                    className="sf-inp min-h-[40px] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">
                    {tx(isEn, 'رابط حساب TikTok', 'TikTok URL')}
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={editTiktokUrl}
                    onChange={(e) => setEditTiktokUrl(e.target.value)}
                    placeholder="https://tiktok.com/@youraccount"
                    className="sf-inp min-h-[40px] text-xs"
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32] space-y-2">
                <div className="font-extrabold text-xs flex items-center gap-1.5 text-[#14532D] dark:text-[#BBF7D0]">
                  <MapPin className="w-3.5 h-3.5 text-[#15803D]" />
                  {tx(isEn, 'تحديد موقع المطعم على الخريطة', 'Pin Restaurant Location on Map')}
                </div>
                <StoreLocationPicker
                  latitude={editLatitude}
                  longitude={editLongitude}
                  googleMapsUrl={editGoogleMapsUrl}
                  shopName={editNameAr || displayShopName}
                  city={editCity}
                  address={editAddress}
                  isEn={isEn}
                  heightClass="h-52"
                  onChange={(next) => {
                    setEditLatitude(next.latitude);
                    setEditLongitude(next.longitude);
                    setEditGoogleMapsUrl(next.googleMapsUrl);
                  }}
                />
              </div>

              <div className="pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32] space-y-2">
                <div className="font-extrabold text-xs flex items-center gap-1.5 text-[#14532D] dark:text-[#BBF7D0]">
                  <TrendingUp className="w-3.5 h-3.5 text-[#15803D]" />
                  {tx(isEn, 'تتبع حملات إعلانات جوجل (Google Ads Ready)', 'Google Ads Conversion Tracking (Optional)')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    dir="ltr"
                    value={editGoogleAdsId}
                    onChange={(e) => setEditGoogleAdsId(e.target.value)}
                    placeholder="Google Ads ID (e.g. AW-123456789)"
                    className="sf-inp min-h-[38px] text-xs"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={editGoogleAdsConversionLabel}
                    onChange={(e) => setEditGoogleAdsConversionLabel(e.target.value)}
                    placeholder={tx(isEn, 'تسمية التحويل (Conversion Label)', 'Conversion Label (optional)')}
                    className="sf-inp min-h-[38px] text-xs"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="sf-btn-primary w-full text-sm"
            >
              {savingSettings
                ? tx(isEn, 'جاري الحفظ...', 'Saving...')
                : tx(isEn, 'حفظ التعديلات', 'Save Changes')}
            </button>
          </form>
        </div>
      )}

      {/* Quick Design & Templates Studio Modal */}
      {designModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/55 backdrop-blur-xs">
          <div className="sf-card max-w-xl w-full max-h-[92vh] flex flex-col justify-between p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#CFE3D5] dark:border-[#2C3D32]">
              <div className="flex items-center gap-2">
                <Palette style={{ color: getShopThemeHex(editThemeColor) }} className="w-5 h-5" />
                <h3 className="text-lg font-extrabold">
                  {tx(isEn, 'استوديو قوالب ومظهر المنيو', 'Menu Template & Theme Studio')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDesignModalOpen(false)}
                className="sf-btn min-h-[36px] w-9 px-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pe-1">
              <MenuTemplateShowcase
                selectedTemplate={editTemplate}
                activeShopTemplate={normalizeMenuTemplateId(shop.menuTemplate)}
                onSelectTemplate={setEditTemplate}
                onPreviewMyStore={(tpl) =>
                  openTemplatePreview(tpl, editThemeColor, editThemeMode)
                }
                onActivateTemplate={(tpl) =>
                  void activateTemplate(tpl, {
                    themeColor: editThemeColor,
                    themeMode: editThemeMode,
                  })
                }
                activatingTemplate={Boolean(activatingTemplateId)}
                onTryDemo={
                  onTryDemoWithStyle
                    ? (tpl) => handleLaunchDemoWithStyle(tpl, editThemeColor, editThemeMode)
                    : undefined
                }
                themeColor={editThemeColor}
                themeMode={editThemeMode}
                shopName={displayShopName}
                logoUrl={shop.logoUrl || ''}
                showLogoOnItems={Boolean(shop.showLogoOnItems)}
                coverImage={shop.coverImage || ''}
                isEn={isEn}
                sampleItemName={sortedProducts[0]?.name}
                sampleItemCategory={sortedProducts[0]?.category}
                sampleItemPrice={sortedProducts[0]?.price}
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold">
                  {tx(isEn, 'لون الهوية الرئيسي في المنيو', 'Menu Brand Accent Color')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {['أخضر', 'برتقالي', 'أحمر', 'أزرق مخضر', 'أسود', 'لون آخر'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditThemeColor(c)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 cursor-pointer ${
                        editThemeColor === c
                          ? 'border-[#15803D] bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0]'
                          : 'border-[#CFE3D5] dark:border-[#2C3D32]'
                      }`}
                    >
                      <span
                        style={{ backgroundColor: getShopThemeHex(c) }}
                        className="w-3 h-3 rounded-full"
                      />
                      {translateThemeColor(c, isEn)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] px-4 py-2.5">
                <span className="text-xs font-extrabold">
                  {tx(isEn, 'وضع إضاءة المنيو للعملاء', 'Menu Lighting Mode')}
                </span>
                <div className="inline-flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditThemeMode('light')}
                    className={`${
                      editThemeMode === 'light' ? 'sf-chip-on' : 'sf-chip'
                    } px-3 py-1 text-xs inline-flex items-center gap-1`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    {tx(isEn, 'فاتح', 'Light')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditThemeMode('dark')}
                    className={`${
                      editThemeMode === 'dark' ? 'sf-chip-on' : 'sf-chip'
                    } px-3 py-1 text-xs inline-flex items-center gap-1`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    {tx(isEn, 'داكن', 'Dark')}
                  </button>
                </div>
              </div>

              {designSavedToast && (
                <div className="rounded-2xl bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] px-4 py-2.5 text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] text-center">
                  {designSavedToast}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32] flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openTemplatePreview(editTemplate, editThemeColor, editThemeMode)}
                className="sf-btn min-h-[44px] px-3.5 text-xs sm:text-sm whitespace-nowrap"
              >
                <Eye className="w-4 h-4 shrink-0" />
                {tx(isEn, 'معاينة القالب', 'Preview Template')}
              </button>
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => void handleSaveDesignOnly()}
                className="sf-btn-primary flex-1 min-h-[44px] text-xs sm:text-sm whitespace-nowrap"
              >
                <Check className="w-4 h-4 shrink-0" />
                {savingSettings
                  ? tx(isEn, 'جاري التفعيل...', 'Applying...')
                  : tx(isEn, 'تفعيل القالب', 'Activate Template')}
              </button>
              {onTryDemoWithStyle && (
                <button
                  type="button"
                  onClick={() =>
                    handleLaunchDemoWithStyle(editTemplate, editThemeColor, editThemeMode)
                  }
                  className="sf-btn-mint min-h-[44px] px-3.5 text-xs sm:text-sm whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  {tx(isEn, 'تجربة المنيو التجريبي', 'Try Demo Menu')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reports Modal */}
      {reportsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/50 backdrop-blur-xs">
          <div className="sf-card max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">{tx(isEn, 'ملخص التقارير', 'Reports Summary')}</h3>
              <button
                type="button"
                onClick={() => setReportsModalOpen(false)}
                className="sf-btn min-h-[36px] w-9 px-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 text-sm font-bold">
              <div className="flex justify-between p-3 rounded-2xl bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32]">
                <span>{tx(isEn, 'إجمالي الطلبات', 'Total Orders')}</span>
                <span className="tabular-nums">{orders.length}</span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32]">
                <span>{tx(isEn, 'طلبات الكاشير', 'Cashier POS Orders')}</span>
                <span className="tabular-nums">
                  {orders.filter((o) => o.source === 'cashier').length}
                </span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32]">
                <span>{tx(isEn, 'طلبات المنيو', 'Online Menu Orders')}</span>
                <span className="tabular-nums">
                  {orders.filter((o) => o.source === 'menu').length}
                </span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-[#DCFCE7] dark:bg-[#173323]">
                <span>{tx(isEn, 'إجمالي المبيعات', 'Total Sales')}</span>
                <span className="text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
                  {formatMoney(todaySales, shop.country)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Modal (Strictly Admin-only activation via WhatsApp/Gmail) */}
      {subscriptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/50 backdrop-blur-xs">
          <div className="sf-card max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {tx(isEn, 'الاشتراك والتفعيل — Ghazalo', 'Subscription & Activation — Ghazalo')}
              </h3>
              <button
                type="button"
                onClick={() => setSubscriptionModalOpen(false)}
                className="sf-btn min-h-[36px] w-9 px-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] rounded-2xl p-4 space-y-1 text-[#14532D] dark:text-[#BBF7D0]">
              <div className="font-extrabold text-sm">
                {tx(isEn, 'الحالة الحالية:', 'Current Status:')}{' '}
                {isPaidSubscription
                  ? tx(
                      isEn,
                      `مفعل حتى تاريخ ${shopAccess.expirationDateFormatted}`,
                      `Active until ${shopAccess.expirationDateFormatted}`
                    )
                  : tx(isEn, 'فترة تجريبية مجانية (7 أيام)', '7-Day Free Trial')}
              </div>
              <div className="text-xs font-bold tabular-nums">
                {tx(isEn, `الأيام المتبقية: ${daysRemaining} يوم`, `Days remaining: ${daysRemaining} days`)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-center">
              <button
                type="button"
                onClick={() => setSelectedSubscriptionPlan('monthly')}
                aria-pressed={selectedSubscriptionPlan === 'monthly'}
                className={`relative rounded-2xl p-3 space-y-1 transition-all cursor-pointer text-center ${
                  selectedSubscriptionPlan === 'monthly'
                    ? 'border-2 border-[#15803D] bg-[#DCFCE7]/70 dark:bg-[#173323] shadow-sm'
                    : 'border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C]'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  {selectedSubscriptionPlan === 'monthly' && (
                    <span className="w-4 h-4 rounded-full bg-[#15803D] text-white inline-flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                  <span className="text-xs font-bold">
                    {tx(isEn, 'اشتراك شهري (30 يوم)', 'Monthly Plan (30 days)')}
                  </span>
                </div>
                <div className="text-base font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                  {SUBSCRIPTION_PRICING.MONTHLY_EGP} {tx(isEn, 'جنيه / شهري', 'EGP / mo')}
                </div>
                <div className="inline-block px-2 py-0.5 rounded-full bg-[#F6FBF7] dark:bg-[#0F1712] text-[10px] font-extrabold">
                  {selectedSubscriptionPlan === 'monthly'
                    ? tx(isEn, 'الباقة المحددة', 'Selected')
                    : tx(isEn, 'تفعيل شهري', 'Select Monthly')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSubscriptionPlan('yearly')}
                aria-pressed={selectedSubscriptionPlan === 'yearly'}
                className={`relative rounded-2xl p-3 space-y-1 transition-all cursor-pointer text-center ${
                  selectedSubscriptionPlan === 'yearly'
                    ? 'border-2 border-[#15803D] bg-[#14201A] text-white shadow-sm'
                    : 'border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C]'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  {selectedSubscriptionPlan === 'yearly' && (
                    <span className="w-4 h-4 rounded-full bg-[#15803D] text-white inline-flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                  <span className="text-xs font-bold">
                    {tx(isEn, 'اشتراك سنوي (365 يوم)', 'Yearly Plan (365 days)')}
                  </span>
                </div>
                <div className="text-base font-extrabold text-[#4ADE80] tabular-nums">
                  {SUBSCRIPTION_PRICING.YEARLY_EGP} {tx(isEn, 'جنيه / سنوي', 'EGP / yr')}
                </div>
                <div className="inline-block px-2 py-0.5 rounded-full bg-[#FACC15] text-[#14201A] text-[10px] font-extrabold">
                  {tx(
                    isEn,
                    `وفّر ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه`,
                    `Save ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} EGP`
                  )}
                </div>
              </button>
            </div>

            <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                `التفعيل يتم عن طريق الإدارة فقط — لتفعيل ${selectedSubscriptionPlan === 'monthly' ? 'الاشتراك الشهري (600 جنيه / 30 يوم)' : 'الاشتراك السنوي (3000 جنيه / 365 يوم)'}، تواصل مباشرة عبر واتساب أو الجيميل:`,
                `Activation is handled by admin only — to activate (${selectedSubscriptionPlan === 'monthly' ? 'Monthly 600 EGP / 30d' : 'Yearly 3000 EGP / 365d'}), contact us via WhatsApp or Gmail:`
              )}
            </p>
            <div className="space-y-2">
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  `مرحباً إدارة Ghazalo، أرغب في تفعيل ${
                    selectedSubscriptionPlan === 'monthly'
                      ? `الاشتراك الشهري (${SUBSCRIPTION_PRICING.MONTHLY_EGP} جنيه / 30 يوم)`
                      : `الاشتراك السنوي (${SUBSCRIPTION_PRICING.YEARLY_EGP} جنيه / 365 يوم)`
                  } لمطعم ${shop.nameAr} (${storeSlug})`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="sf-btn-primary w-full text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {tx(isEn, 'تواصل للتفعيل واتساب:', 'Activate via WhatsApp:')}{' '}
                  {SUPPORT_CONTACT.PHONE_DISPLAY}
                </span>
              </a>
              <a
                href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${encodeURIComponent(
                  `تفعيل ${selectedSubscriptionPlan === 'monthly' ? 'اشتراك شهري' : 'اشتراك سنوي'} لمتجر ${shop.nameAr}`
                )}`}
                className="sf-btn w-full text-xs text-[#15803D] dark:text-[#BBF7D0]"
              >
                <Mail className="w-4 h-4" />
                <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Contact Us Modal */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/50 backdrop-blur-xs">
          <div className="sf-card max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {tx(isEn, 'تواصل معانا — خدمة العملاء', 'Contact Support Team')}
              </h3>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="sf-btn min-h-[36px] w-9 px-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA] leading-relaxed">
              {tx(
                isEn,
                'للدعم الفني أو لتفعيل اشتراك مطعمك تواصل مباشرة معنا عبر الواتساب أو الجيميل:',
                'For support or menu subscription activation, contact us directly via WhatsApp or Gmail:'
              )}
            </p>
            <div className="space-y-2.5 rounded-2xl bg-[#F6FBF7] dark:bg-[#0F1712] p-4 border border-[#CFE3D5] dark:border-[#2C3D32] text-xs font-extrabold">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#4B5B52] dark:text-[#A3B5AA]">
                  {tx(isEn, 'رقم الموبايل:', 'Mobile:')}
                </span>
                <span dir="ltr" className="tabular-nums">
                  {SUPPORT_CONTACT.PHONE_DISPLAY}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#4B5B52] dark:text-[#A3B5AA]">
                  {tx(isEn, 'الجيميل:', 'Gmail:')}
                </span>
                <span dir="ltr" className="text-[#15803D] dark:text-[#4ADE80] truncate">
                  {SUPPORT_CONTACT.EMAIL}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  `مرحباً إدارة Ghazalo، أتواصل بخصوص مطعم ${shop.nameAr} (${storeSlug})`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="sf-btn-primary w-full text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {tx(isEn, 'فتح واتساب', 'Open WhatsApp')} ({SUPPORT_CONTACT.PHONE_DISPLAY})
                </span>
              </a>
              <a
                href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${encodeURIComponent(
                  `تواصل بخصوص متجر ${shop.nameAr}`
                )}`}
                className="sf-btn w-full text-xs text-[#15803D] dark:text-[#BBF7D0]"
              >
                <Mail className="w-4 h-4" />
                <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Quick Rename Restaurant Modal */}
      {renameModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/55 backdrop-blur-xs"
          onClick={() => setRenameModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveQuickRename}
            className="sf-card max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#15803D]" />
                <h3 className="text-lg font-extrabold">
                  {tx(isEn, 'تغيير اسم المطعم', 'Rename Restaurant')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRenameModalOpen(false)}
                className="sf-btn min-h-[36px] w-9 px-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'تقدر تغيّر اسم مطعمك في أي وقت وهيظهر فوراً في المنيو والفواتير ولوحة التحكم.',
                'Update your restaurant name anytime and it syncs immediately across your menu and receipts.'
              )}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-extrabold mb-1">
                  {tx(isEn, 'اسم المطعم بالعربي', 'Restaurant Name (Arabic)')}
                </label>
                <input
                  type="text"
                  required
                  value={renameArInput}
                  onChange={(e) => setRenameArInput(e.target.value)}
                  placeholder={tx(isEn, 'مثال: مشويات الأصيل', 'Restaurant Arabic Name')}
                  className="sf-inp"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold mb-1">
                  {tx(isEn, 'اسم المطعم بالإنجليزي (اختياري)', 'Restaurant Name (English - optional)')}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={renameEnInput}
                  onChange={(e) => setRenameEnInput(e.target.value)}
                  placeholder="El Aseel Grill"
                  className="sf-inp text-left"
                />
              </div>
            </div>

            {renameSavedToast && (
              <div className="rounded-2xl bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] px-3 py-2 text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] text-center">
                {renameSavedToast}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={savingRename || !renameArInput.trim()}
                className="sf-btn-primary flex-1 text-sm"
              >
                {savingRename ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{tx(isEn, 'حفظ الاسم الجديد', 'Save New Name')}</span>
              </button>
              <button
                type="button"
                onClick={() => setRenameModalOpen(false)}
                className="sf-btn px-4 text-sm"
              >
                {tx(isEn, 'إلغاء', 'Cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Interactive Map Location Picker Modal */}
      {locationModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14201A]/55 backdrop-blur-xs"
          onClick={() => setLocationModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveLocation}
            className="sf-card max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#CFE3D5] dark:border-[#2C3D32]">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#15803D]" />
                <h3 className="text-lg font-extrabold">
                  {tx(isEn, 'تحديد موقع المطعم على الخريطة', 'Pin Restaurant on Google Maps')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLocationModalOpen(false)}
                className="sf-btn min-h-[36px] w-9 px-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-extrabold mb-1">
                  {tx(isEn, 'المدينة / المحافظة', 'City')}
                </label>
                <input
                  type="text"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  placeholder={tx(isEn, 'مثال: القاهرة', 'e.g. Cairo')}
                  className="sf-inp min-h-[42px] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold mb-1">
                  {tx(isEn, 'العنوان التفصيلي', 'Street Address')}
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder={tx(isEn, 'الشارع والمنطقة وبجوار...', 'Street & landmark')}
                  className="sf-inp min-h-[42px] text-sm"
                />
              </div>
            </div>

            <StoreLocationPicker
              latitude={editLatitude}
              longitude={editLongitude}
              googleMapsUrl={editGoogleMapsUrl}
              shopName={displayShopName}
              city={editCity}
              address={editAddress}
              isEn={isEn}
              heightClass="h-64 sm:h-72"
              onChange={(next) => {
                setEditLatitude(next.latitude);
                setEditLongitude(next.longitude);
                setEditGoogleMapsUrl(next.googleMapsUrl);
              }}
            />

            {locationSavedToast && (
              <div className="rounded-2xl bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] px-3 py-2 text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] text-center">
                {locationSavedToast}
              </div>
            )}

            <button
              type="submit"
              disabled={savingLocation}
              className="sf-btn-primary w-full text-sm"
            >
              {savingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{tx(isEn, 'حفظ موقع المطعم على الخريطة', 'Save Map Location')}</span>
            </button>
          </form>
        </div>
      )}
      </div>

      {/* Printable Menu Table / Counter QR Poster */}
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
              {tx(isEn, 'امسح الكود بكاميرا الموبايل لتصفح المنيو والطلب فوراً', 'Scan to view our digital menu & order')}
            </p>
          </div>
          <div className="inline-block p-3 bg-white border-2 border-[#CFE3D5] rounded-2xl">
            <QrCodeImage value={menuUrl} size={230} />
          </div>
          <div dir="ltr" className="text-xs font-bold text-[#4B5B52] break-all">
            {menuUrl}
          </div>
          <div className="text-[11px] font-extrabold text-[#15803D] border-t border-[#CFE3D5] pt-3">
            Powered by GHAZALO Digital Menu
          </div>
        </div>
      </div>
    </div>
  );
};
