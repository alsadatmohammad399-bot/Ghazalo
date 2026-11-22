import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart3,
  Bell,
  Boxes,
  Check,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  Globe,
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
import { auth } from '../firebase';
import {
  addProduct,
  addProductsBatch,
  backfillShopMissingPhotos,
  deleteProduct,
  updateProduct,
  updateShop,
} from '../services/firestoreService';
import {
  formatMoney,
  getShopAccessState,
  getShopThemeHex,
} from '../utils/calculations';
import { resolveDishPhotoClient } from '../utils/dishPhotoResolver';
import { compressCoverFile, compressLogoFile } from '../utils/logoUpload';
import { MENU_TEMPLATES } from '../utils/menuTemplates';
import { getCategoryCulinaryRank, sortProductsCulinary } from '../utils/menuSorting';
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
  const [selectedSubscriptionPlan, setSelectedSubscriptionPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [menuLinkCopied, setMenuLinkCopied] = useState(false);
  const { isEn, setLang } = useUiLang();
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

  // Settings (Design, Template, Brand Logo, Cover, Delivery & Optional Fees) form state
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [editNameAr, setEditNameAr] = useState(shop.nameAr);
  const [editWhatsapp, setEditWhatsapp] = useState(shop.whatsapp || '');
  const [editAddress, setEditAddress] = useState(shop.address || '');
  const [editTemplate, setEditTemplate] = useState<MenuTemplateId>(
    normalizeMenuTemplateId(shop.menuTemplate)
  );
  const [editThemeColor, setEditThemeColor] = useState(shop.themeColor || 'برتقالي');
  const [editLogoUrl, setEditLogoUrl] = useState(shop.logoUrl || '');
  const [editShowLogoOnItems, setEditShowLogoOnItems] = useState(
    shop.showLogoOnItems !== undefined ? shop.showLogoOnItems : true
  );
  const [logoError, setLogoError] = useState('');
  const [editCoverImage, setEditCoverImage] = useState(shop.coverImage || '');
  const [coverError, setCoverError] = useState('');

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
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!settingsModalOpen) return;
    setEditNameAr(shop.nameAr);
    setEditWhatsapp(shop.whatsapp || '');
    setEditAddress(shop.address || '');
    setEditTemplate(normalizeMenuTemplateId(shop.menuTemplate));
    setEditThemeColor(shop.themeColor || 'برتقالي');
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
    setDeliverySavedToast('');
    setLogoError('');
    setCoverError('');
  }, [settingsModalOpen, shop]);

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
    const updatedShop: Shop = { ...shop, ...updates };
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
        products
      )
    );
    void syncPublicStoreSnapshot(updatedShop, products);
    onShopUpdated?.(updatedShop);
    return updatedShop;
  };

  const persistProductsLocal = (nextProducts: Product[]) => {
    const existing = findLocalRestaurantBySlugOrShopId(shop.id) || findLocalRestaurantBySlugOrShopId(storeSlug);
    upsertLocalRestaurant(
      shopToDemoRecord(
        shop,
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
    void syncPublicStoreSnapshot(shop, nextProducts);
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
        const addedLocal: Product[] = data.items.map((item, idx) => ({
          id: `prod-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
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
        persistProductsLocal([...addedLocal, ...products]);
        if (canUseFirestore) {
          try {
            await addProductsBatch(shop.id, shop.ownerId, data.items);
          } catch {
            // persisted locally
          }
        }
        setAiMessage(
          tx(
            isEn,
            `تم استخراج ${data.items.length} صنف من ${selectedFiles.length} ملف بالذكاء الاصطناعي بنجاح`,
            `Successfully extracted ${data.items.length} items from ${selectedFiles.length} file(s) with AI`
          )
        );
      } else {
        setAiMessage(
          tx(
            isEn,
            'لم يتم العثور على أصناف في الملفات المرفوعة',
            'No menu items were found in the uploaded files'
          )
        );
      }
    } catch (err: unknown) {
      setAiMessage(
        err instanceof Error ? err.message : tx(isEn, 'حدث خطأ', 'An error occurred')
      );
    } finally {
      setAiBusy(false);
    }
  };

  const buildSettingsUpdates = (): Partial<Shop> => {
    const parsedDeliveryFee = editFreeDelivery
      ? 0
      : Math.max(0, Number(editDeliveryFee) || 0);
    return {
      nameAr: editNameAr.trim() || shop.nameAr,
      whatsapp: editWhatsapp.trim(),
      address: editAddress.trim(),
      menuTemplate: editTemplate,
      themeColor: editThemeColor,
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
    };
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
      persistShopLocal(updates);
      if (canUseFirestore) {
        try {
          await updateShop(shop.id, updates);
        } catch {
          // saved locally
        }
      }
      setSettingsModalOpen(false);
    } finally {
      setSavingSettings(false);
    }
  };

  const displayShopName = getShopDisplayName(shop, isEn);

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen bg-slate-50/50 dark:bg-slate-950 pb-20">
      {/* Top Ghazalo Subscription / 7-Day Trial Banner */}
      <div className="bg-gradient-to-l from-[#FF6A00] via-orange-500 to-amber-500 text-white px-4 py-2.5 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm font-extrabold">
          <div className="flex items-center gap-2 tabular-nums">
            <Sparkles className="w-4 h-4 shrink-0" />
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
                  `متبقي لك ${daysRemaining} ايام من التجربة المجانية`,
                  `${daysRemaining} days left in your free trial`
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
              className="px-3 py-1 rounded-full bg-white text-[#FF6A00] hover:bg-orange-50 text-xs font-extrabold transition-colors"
            >
              {tx(isEn, 'تفعيل شهري', 'Monthly')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSubscriptionPlan('yearly');
                setSubscriptionModalOpen(true);
              }}
              className="px-3 py-1 rounded-full bg-slate-900 text-white hover:bg-slate-800 text-xs font-extrabold transition-colors"
            >
              {tx(isEn, 'تفعيل سنوي', 'Yearly')}
            </button>
            <a
              href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                `مرحباً غزالة، أرغب في تفعيل اشتراك مطعم ${shop.nameAr} (${storeSlug})`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-extrabold inline-flex items-center gap-1 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {tx(isEn, 'تواصل للتفعيل', 'Activate via WhatsApp')}
            </a>
          </div>
        </div>
      </div>

      {/* 1-Day Expiration Urgent Alert */}
      {shopAccess.isExpiringSoon && (
        <div className="bg-amber-100 dark:bg-amber-950/60 border-b border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 px-4 py-2 text-center text-xs sm:text-sm font-extrabold flex flex-wrap items-center justify-center gap-2">
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
            className="px-3 py-1 rounded-full bg-[#FF6A00] text-white text-xs font-extrabold"
          >
            {tx(isEn, 'فعل الاشتراك الآن', 'Activate Now')}
          </button>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-orange-100 dark:border-slate-800 px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-400 flex items-center justify-center"
            aria-label={tx(isEn, 'القائمة', 'Menu')}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-extrabold text-base sm:text-lg">
            {tx(isEn, 'لوحة التحكم', 'Dashboard')}
          </span>
        </div>

        <div className="flex items-center gap-2 relative">
          <button
            type="button"
            onClick={() => setLang(isEn ? 'ar' : 'en')}
            className="px-3 h-9 rounded-full bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 text-[#FF6A00] dark:text-orange-300 font-extrabold text-xs inline-flex items-center gap-1.5"
            title={tx(isEn, 'تغيير اللغة إلى الإنجليزية', 'Switch to Arabic')}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isEn ? 'عربي' : 'EN'}</span>
          </button>

          <PWAInstallButton
            variant="compact"
            label={tx(isEn, 'تثبيت التطبيق', 'Install App')}
          />
          <button
            type="button"
            onClick={() => void handleToggleOpen()}
            className={`px-4 py-1.5 rounded-2xl text-xs font-extrabold transition-colors ${
              shop.isOpen
                ? 'bg-[#FF6A00] text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {shop.isOpen ? tx(isEn, 'مفتوح', 'Open') : tx(isEn, 'مغلق', 'Closed')}
          </button>

          <button
            type="button"
            onClick={() => setBellOpen((prev) => !prev)}
            className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-400 flex items-center justify-center relative"
            aria-label={tx(isEn, 'الإشعارات', 'Notifications')}
          >
            <Bell className="w-5 h-5" />
            <span
              className={`absolute -top-1 ${
                isEn ? '-right-1' : '-left-1'
              } w-5 h-5 rounded-full bg-[#FF6A00] text-white text-[11px] font-extrabold flex items-center justify-center tabular-nums`}
            >
              {Math.max(1, newOrders.length)}
            </span>
          </button>

          {bellOpen && (
            <div
              className={`absolute ${
                isEn ? 'right-0' : 'left-0'
              } top-12 w-72 bg-white dark:bg-slate-900 rounded-3xl p-4 border border-orange-100 dark:border-slate-800 shadow-xl z-40 space-y-2`}
            >
              <div className="flex items-center justify-between font-extrabold text-sm">
                <span>{tx(isEn, 'الإشعارات', 'Notifications')}</span>
                <button type="button" onClick={() => setBellOpen(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-2xl bg-orange-50/70 dark:bg-slate-800 p-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                {tx(
                  isEn,
                  'مرحباً بك في غزالة Ghazalo! متجرك جاهز لاستقبال الطلبات بدون أي عمولة.',
                  'Welcome to Ghazalo! Your store is ready to receive commission-free orders.'
                )}
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
                  {tx(isEn, 'طلب جديد', 'New Order')} #{ord.orderNumber} -{' '}
                  {formatMoney(ord.total, shop.country)}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Welcome */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {tx(isEn, `أهلاً بيك في ${displayShopName}`, `Welcome to ${displayShopName}`)}
            </h1>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {tx(
                isEn,
                'تابع المبيعات والطلبات من مكان واحد',
                'Track your sales, menu, and orders in one place'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-700 text-xs font-extrabold text-[#FF6A00] hover:bg-orange-50 inline-flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" />
            <span>{tx(isEn, 'اعدادات التوصيل والقالب', 'Delivery & Theme Settings')}</span>
          </button>
        </div>

        {/* QR Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-orange-100 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-extrabold">
                {tx(isEn, 'رمز QR ورابط المنيو المباشر', 'QR Code & Direct Menu Link')}
              </h2>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {tx(
                  isEn,
                  'شارك رابط المنيو أو رمز QR مباشرة مع عملائك',
                  'Share your menu link or QR code directly with customers'
                )}
              </p>
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyMenuUrl()}
                  className="px-4 py-2 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
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
                  className="px-3.5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{tx(isEn, 'مشاركة واتساب', 'WhatsApp')}</span>
                </a>
              </div>
              <div
                dir="ltr"
                className="text-[11px] font-bold text-[#FF6A00] bg-orange-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-orange-200/70 dark:border-slate-700 break-all text-left"
              >
                {menuUrl}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="shrink-0">
              <QrCodeImage value={menuUrl} size={150} />
            </div>
            <div className="grid grid-cols-2 gap-3 w-full sm:max-w-md">
              <button
                type="button"
                onClick={() => void downloadQrPng(menuUrl, `${shop.nameAr}-qr.png`)}
                className="py-3 px-4 rounded-2xl bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm transition-colors"
              >
                {tx(isEn, 'تحميل QR', 'Download QR')}
              </button>
              <button
                type="button"
                onClick={onOpenStorefront}
                className="py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-orange-50 border border-orange-200 dark:border-slate-700 font-extrabold text-sm transition-colors"
              >
                {tx(isEn, 'عرض المنيو', 'View Menu')}
              </button>
              <button
                type="button"
                onClick={onOpenShareQr}
                className="py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-orange-50 border border-orange-200 dark:border-slate-700 font-extrabold text-sm transition-colors"
              >
                {tx(isEn, 'رموز الطاولات', 'Table QRs')}
              </button>
              <button
                type="button"
                onClick={onOpenCashier}
                className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm transition-colors"
              >
                {tx(isEn, 'الكاشير POS', 'Cashier POS')}
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 shadow-xs space-y-1">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {tx(isEn, 'طلبات اليوم', "Today's Orders")}
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {orders.length}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 shadow-xs space-y-1">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {tx(isEn, 'مبيعات اليوم', "Today's Sales")}
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
              {formatMoney(todaySales, shop.country, 0)}
            </div>
          </div>

          <div
            onClick={() => setProductsModalOpen(true)}
            className="col-span-2 lg:col-span-1 cursor-pointer bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 shadow-xs space-y-1 hover:border-orange-300 transition-colors"
          >
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {tx(isEn, 'الأصناف النشطة', 'Active Items')}
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {activeProductsCount}
            </div>
          </div>
        </div>

        {/* Chart: الأصناف حسب التصنيف */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-orange-100 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">
              {tx(isEn, 'الأصناف حسب التصنيف', 'Items by Category')}
            </h2>
            <button
              type="button"
              onClick={() => setProductsModalOpen(true)}
              className="text-xs font-extrabold text-[#FF6A00] dark:text-orange-400 hover:underline"
            >
              {tx(isEn, 'إدارة الأصناف', 'Manage Items')}
            </button>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                {tx(
                  isEn,
                  'المتجر فارغ حالياً. أضف أصنافك يدوياً أو ارفع صورة المنيو بالذكاء الاصطناعي.',
                  'Your store is empty. Add items manually or upload a menu photo with AI.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setProductsModalOpen(true)}
                className="px-5 py-2.5 rounded-2xl bg-[#FF6A00] text-white font-bold text-xs"
              >
                {tx(isEn, 'إضافة أصناف الآن', 'Add Items Now')}
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
                      <span className="text-[#FF6A00] dark:text-orange-400 tabular-nums">
                        {cat.count}
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-orange-50 dark:bg-slate-800 overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className="h-full rounded-full bg-[#FF6A00]"
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
          <h2 className="text-base font-extrabold">{tx(isEn, 'خطوات سريعة', 'Quick Actions')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            <button
              type="button"
              onClick={onOpenCashier}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 text-start hover:border-orange-300 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                <Monitor className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base">{tx(isEn, 'الكاشير', 'Cashier')}</div>
              <div className="text-xs font-semibold text-slate-500">
                {tx(isEn, 'بيع من الصالة', 'In-store POS')}
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenOrders}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 text-start hover:border-orange-300 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base">{tx(isEn, 'الطلبات', 'Orders')}</div>
              <div className="text-xs font-semibold text-slate-500">
                {tx(isEn, 'متابعة طلبات اليوم', "Track today's orders")}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setProductsModalOpen(true)}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 text-start hover:border-orange-300 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center">
                <Boxes className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base">
                {tx(isEn, 'الأصناف والمنيو', 'Menu & Items')}
              </div>
              <div className="text-xs font-semibold text-slate-500">
                {tx(isEn, 'الأسعار ورفع الصور', 'Prices & dish photos')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setOffersModalOpen(true)}
              className="bg-orange-50/80 dark:bg-orange-950/30 rounded-3xl p-5 border border-orange-200 dark:border-orange-800 text-start hover:border-[#FF6A00] transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl glass-btn-primary flex items-center justify-center">
                <Tag className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base text-orange-950 dark:text-orange-200">
                {tx(isEn, `قائمة العروض (${offerProducts.length})`, `Offers (${offerProducts.length})`)}
              </div>
              <div className="text-xs font-semibold text-[#FF6A00] dark:text-orange-300">
                {tx(isEn, 'إضافة وإدارة الخصومات', 'Manage deals & discounts')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="col-span-2 lg:col-span-1 bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 text-start hover:border-orange-300 transition-colors space-y-1.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950 text-[#FF6A00] dark:text-orange-300 flex items-center justify-center">
                <Palette className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-base">
                {tx(isEn, 'القوالب والتوصيل', 'Templates & Delivery')}
              </div>
              <div className="text-xs font-semibold text-slate-500">
                {tx(isEn, 'الشكل وسعر التوصيل', 'Look & delivery fee')}
              </div>
            </button>
          </div>
        </div>

        {/* PWA App Install Banner for Android / iOS / Desktop POS */}
        <PWAInstallButton variant="card" />

        {/* Needs Attention + Recent Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 space-y-3">
            <h2 className="text-base font-extrabold">
              {tx(isEn, 'يحتاج انتباهك', 'Needs Attention')}
            </h2>
            {newOrders.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {tx(isEn, 'لا شيء ينتظرك الآن', 'Nothing pending right now')}
              </p>
            ) : (
              <div className="space-y-2">
                {newOrders.slice(0, 3).map((ord) => (
                  <div
                    key={ord.id}
                    onClick={onOpenOrders}
                    className="cursor-pointer rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center justify-between text-xs font-bold"
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

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-orange-100 dark:border-slate-800 space-y-3">
            <h2 className="text-base font-extrabold">{tx(isEn, 'آخر الطلبات', 'Recent Orders')}</h2>
            {orders.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {tx(isEn, 'لا توجد طلبات بعد', 'No orders yet')}
              </p>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 4).map((ord) => (
                  <div
                    key={ord.id}
                    onClick={onOpenOrders}
                    className="cursor-pointer rounded-2xl bg-orange-50/50 dark:bg-slate-800 p-3 flex items-center justify-between text-xs font-bold"
                  >
                    <span>
                      #{ord.orderNumber} - {ord.customerName || tx(isEn, 'عميل', 'Customer')}
                    </span>
                    <span className="text-[#FF6A00] dark:text-orange-400 tabular-nums">
                      {formatMoney(ord.total, shop.country)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Floating WhatsApp Support Button */}
      <a
        href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noreferrer"
        aria-label={tx(isEn, 'دعم واتساب', 'WhatsApp Support')}
        className={`fixed bottom-5 ${
          isEn ? 'right-5' : 'left-5'
        } z-30 w-14 h-14 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105`}
      >
        <MessageCircle className="w-7 h-7" />
      </a>

      {/* Side Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 w-80 max-w-[85vw] bg-white dark:bg-slate-900 h-full p-5 flex flex-col justify-between overflow-y-auto shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-orange-100 dark:border-slate-800">
                <span className="font-extrabold text-lg">{displayShopName}</span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
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
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Utensils className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'المنيو والأصناف', 'Menu & Items')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setOffersModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Tag className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, `قائمة العروض (${offerProducts.length})`, `Offers (${offerProducts.length})`)}
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 text-start"
                >
                  <Home className="w-4 h-4" />
                  {tx(isEn, 'الرئيسية', 'Home')}
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <LayoutGrid className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'نظرة عامة', 'Overview')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setBellOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Bell className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'الإشعارات', 'Notifications')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenShareQr();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Share2 className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'مشاركة المنيو', 'Share Menu & QR')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenOrders();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <ShoppingBag className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'الطلبات', 'Orders')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setReportsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <BarChart3 className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'التقارير', 'Reports')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setSettingsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800 text-start"
                >
                  <Settings className="w-4 h-4 text-[#FF6A00]" />
                  {tx(isEn, 'الإعدادات واعدادات التوصيل', 'Settings & Delivery')}
                </button>
                {isAdminUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onOpenAdmin();
                    }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-start"
                  >
                    <QrCode className="w-4 h-4" />
                    {tx(isEn, 'تفعيل المتاجر (Admin)', 'Admin Stores Portal')}
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Account & Preferences */}
            <div className="pt-4 mt-4 border-t border-orange-100 dark:border-slate-800 space-y-3 text-xs font-bold">
              <div className="bg-orange-50/70 dark:bg-slate-800 rounded-2xl p-3">
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
                className="w-full text-start px-2 py-1.5 hover:text-[#FF6A00]"
              >
                {tx(isEn, 'الإعدادات', 'Settings')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setSubscriptionModalOpen(true);
                }}
                className="w-full text-start px-2 py-1.5 hover:text-[#FF6A00]"
              >
                {tx(isEn, 'الاشتراك والدفع', 'Subscription & Billing')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setBellOpen(true);
                }}
                className="w-full text-start px-2 py-1.5 hover:text-[#FF6A00]"
              >
                {tx(isEn, 'الإشعارات', 'Notifications')}
              </button>

              <div className="flex items-center justify-between px-2 py-1">
                <span>{tx(isEn, 'اللغة', 'Language')}</span>
                <div className="inline-flex gap-1 bg-orange-50 dark:bg-slate-800 p-1 rounded-xl">
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
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-colors ${
                          active ? 'bg-[#FF6A00] text-white' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between px-2 py-1">
                <span>{tx(isEn, 'المظهر', 'Theme')}</span>
                <div className="inline-flex gap-1 bg-orange-50 dark:bg-slate-800 p-1 rounded-xl">
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
                      className={`px-2 py-0.5 rounded-lg text-[11px] ${
                        themePref === m.id ? 'bg-[#FF6A00] text-white' : ''
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <PWAInstallButton
                variant="drawer"
                label={tx(isEn, 'تثبيت التطبيق (Android / iOS / PC)', 'Install App (Android / iOS / PC)')}
              />

              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-orange-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-amber-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-5 sm:p-6 max-h-[90vh] flex flex-col justify-between shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-orange-100 dark:border-slate-800">
              <h3 className="text-lg font-extrabold">
                {tx(isEn, 'إدارة الأصناف والأسعار', 'Manage Menu Items & Prices')}
              </h3>
              <button
                type="button"
                onClick={() => setProductsModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pe-1">
              {/* Gemini AI Quick Extract */}
              <div className="bg-orange-50/70 dark:bg-orange-950/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-orange-100 dark:border-orange-900">
                <div className="space-y-0.5">
                  <div className="font-extrabold text-sm flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#FF6A00]" />
                    {tx(isEn, 'استيراد سريع بالذكاء الاصطناعي', 'Quick AI Menu Import')}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    {tx(
                      isEn,
                      'ارفع صورة أو أكثر للمنيو أو ملف PDF أو Excel لإضافة الأصناف تلقائياً',
                      'Upload menu photos, PDF, or Excel files to auto-extract items'
                    )}
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
                    className="px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 text-[#FF6A00] dark:text-orange-300 font-bold text-xs inline-flex items-center gap-1.5"
                  >
                    <ImagePlus className="w-4 h-4" />
                    {tx(isEn, 'تعبئة صور حقيقية للأصناف', 'Auto-fill Dish Photos')}
                  </button>
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => aiFileRef.current?.click()}
                    className="px-4 py-2 rounded-2xl bg-[#FF6A00] hover:bg-[#e55f00] text-white font-bold text-xs inline-flex items-center gap-1.5"
                  >
                    {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {aiBusy
                      ? tx(isEn, 'جاري الاستخراج...', 'Extracting...')
                      : tx(isEn, 'رفع صور المنيو', 'Upload Menu Files')}
                  </button>
                </div>
                {aiMessage && (
                  <div className="w-full text-xs font-bold text-[#FF6A00] dark:text-orange-300">
                    {aiMessage}
                  </div>
                )}
              </div>

              {/* Add Product Form */}
              <form
                onSubmit={handleAddProduct}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-orange-100 dark:border-slate-700 space-y-3"
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
                    className="px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    required
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    placeholder={tx(isEn, 'التصنيف (مثال: مشويات)', 'Category (e.g. Grills)')}
                    className="px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
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
                    className="px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
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
                    className="px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    value={prodBarcode}
                    onChange={(e) => setProdBarcode(e.target.value)}
                    placeholder={tx(isEn, 'الباركود (اختياري)', 'Barcode (optional)')}
                    className="px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                </div>
                <input
                  type="text"
                  value={prodVariants}
                  onChange={(e) => setProdVariants(e.target.value)}
                  placeholder={tx(
                    isEn,
                    'خيارات وأسعار (اختياري، افصل بفاصلة: 2 فرخة - 550، 4 فرخة - 1000 أو نص كيلو - 215، كيلو - 420)',
                    'Options & prices (optional, comma-separated: Small - 80, Large - 140)'
                  )}
                  className="w-full px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                />
                <button
                  type="submit"
                  disabled={addingProd}
                  className="px-5 py-2.5 rounded-xl bg-[#FF6A00] hover:bg-[#e55f00] text-white font-bold text-xs inline-flex items-center gap-1.5"
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
                  <p className="text-center text-sm font-bold text-slate-500 py-6">
                    {tx(isEn, 'لا توجد أصناف مضافة حتى الآن.', 'No items added yet.')}
                  </p>
                ) : (
                  sortedProducts.map((p) => {
                    const pOptions = getProductOptions(p);
                    const isEditingThis = editingProdId === p.id;
                    return (
                    <div
                      key={p.id}
                      className="bg-orange-50/40 dark:bg-slate-800 rounded-2xl p-3 text-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative w-11 h-11 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center shrink-0 overflow-hidden border border-orange-100 dark:border-slate-700">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Utensils className="w-4 h-4 text-orange-400" />
                            )}
                            {shop.logoUrl && shop.showLogoOnItems && (
                              <img
                                src={shop.logoUrl}
                                alt={tx(isEn, 'شعار', 'Logo')}
                                className="w-4 h-4 rounded-full object-cover border border-white absolute top-0.5 right-0.5 bg-white"
                              />
                            )}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-extrabold truncate">{p.name}</div>
                            <div className="text-slate-500 font-semibold">
                              {p.category} · {formatMoney(p.price, shop.country)}
                              {p.isOffer && p.originalPrice
                                ? tx(isEn, ` (بدلاً من ${p.originalPrice})`, ` (was ${p.originalPrice})`)
                                : ''}
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
                                    className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-700 text-[#FF6A00] dark:text-orange-300 text-[10px] font-extrabold tabular-nums"
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
                                ? 'bg-[#FF6A00] text-white border-[#FF6A00]'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-orange-100 dark:border-slate-700'
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
                                ? 'bg-amber-400 text-slate-900'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-orange-100 dark:border-slate-700'
                            }`}
                          >
                            <Tag className="w-3 h-3" />
                            {tx(isEn, 'عرض', 'Offer')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleAvailability(p)}
                            className={`px-3 py-1 rounded-xl font-bold ${
                              p.available !== false
                                ? 'bg-orange-100 text-[#FF6A00]'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {p.available !== false
                              ? tx(isEn, 'متاح', 'In Stock')
                              : tx(isEn, 'نفد', 'Out')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteProductItem(p.id)}
                            className="p-1.5 text-slate-400 hover:text-amber-600"
                            aria-label={tx(isEn, 'حذف', 'Delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {isEditingThis && (
                        <div className="pt-2 border-t border-orange-200/70 dark:border-slate-700 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={editProdName}
                              onChange={(e) => setEditProdName(e.target.value)}
                              placeholder={tx(isEn, 'اسم الصنف', 'Item name')}
                              className="sm:col-span-2 px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                            />
                            <input
                              type="number"
                              min={0}
                              value={editProdPrice}
                              onChange={(e) => setEditProdPrice(e.target.value)}
                              placeholder={tx(isEn, 'السعر', 'Price')}
                              className="px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
                            />
                          </div>
                          <input
                            type="text"
                            value={editProdDesc}
                            onChange={(e) => setEditProdDesc(e.target.value)}
                            placeholder={tx(isEn, 'الوصف أو نص العرض', 'Description or offer text')}
                            className="w-full px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                          />
                          <input
                            type="text"
                            value={editProdVariants}
                            onChange={(e) => setEditProdVariants(e.target.value)}
                            placeholder={tx(
                              isEn,
                              'الخيارات والأسعار (افصل بفاصلة: 2 فرخة - 550، 4 فرخة - 1000)',
                              'Options & prices (comma-separated: Small - 80, Large - 140)'
                            )}
                            className="w-full px-3 py-2 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingProdId(null)}
                              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
                            >
                              {tx(isEn, 'إلغاء', 'Cancel')}
                            </button>
                            <button
                              type="button"
                              disabled={savingProdEdit}
                              onClick={() => void handleSaveProductEdit(p.id)}
                              className="px-4 py-1.5 rounded-xl bg-[#FF6A00] text-white font-bold inline-flex items-center gap-1"
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

      {/* Offers Manager Modal ("قائمة العروض") */}
      {offersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-5 sm:p-6 max-h-[90vh] flex flex-col justify-between shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-orange-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#FF6A00]" />
                <h3 className="text-lg font-extrabold">
                  {tx(isEn, 'إدارة قائمة العروض والخصومات', 'Manage Offers & Discounts')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOffersModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pe-1">
              {/* Create Standalone Offer Box */}
              <form
                onSubmit={handleAddOffer}
                className="bg-orange-50/60 dark:bg-slate-800 rounded-2xl p-4 border border-orange-200 dark:border-slate-700 space-y-3"
              >
                <div className="font-extrabold text-sm text-orange-950 dark:text-orange-200">
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
                    className="px-3 py-2.5 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    value={offerCategory}
                    onChange={(e) => setOfferCategory(e.target.value)}
                    placeholder={tx(isEn, 'القسم (مثال: عروض خاصة)', 'Category (e.g. Special Offers)')}
                    className="px-3 py-2.5 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
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
                    className="px-3 py-2.5 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
                  />
                  <input
                    type="number"
                    required
                    min={0}
                    value={offerSalePrice}
                    onChange={(e) => setOfferSalePrice(e.target.value)}
                    placeholder={tx(isEn, 'سعر العرض بعد الخصم', 'Sale price')}
                    className="px-3 py-2.5 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
                  />
                  <input
                    type="text"
                    value={offerLabel}
                    onChange={(e) => setOfferLabel(e.target.value)}
                    placeholder={tx(isEn, 'شارة (مثال: عرض اليوم)', 'Badge (e.g. Hot Deal)')}
                    className="px-3 py-2.5 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingOffer}
                  className="px-5 py-2.5 rounded-full glass-btn-primary font-extrabold text-xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {addingOffer
                    ? tx(isEn, 'جاري إضافة العرض...', 'Publishing offer...')
                    : tx(isEn, 'نشر العرض في المنيو', 'Publish Offer')}
                </button>
              </form>

              {/* Active Offers List */}
              <div className="space-y-2">
                <div className="font-extrabold text-sm">
                  {tx(
                    isEn,
                    `العروض النشطة حالياً (${offerProducts.length})`,
                    `Active Offers (${offerProducts.length})`
                  )}
                </div>
                {offerProducts.length === 0 ? (
                  <div className="text-center text-xs font-bold text-slate-500 py-4 bg-white dark:bg-slate-800 rounded-2xl border border-orange-100 dark:border-slate-700">
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
                      className="flex items-center justify-between gap-3 bg-orange-50/70 dark:bg-slate-800 rounded-2xl p-3 border border-orange-200 dark:border-slate-700 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-extrabold truncate">
                          {p.name}{' '}
                          <span className="text-[#FF6A00] dark:text-orange-300">
                            · {p.offerLabel || tx(isEn, 'عرض خاص', 'Special Offer')}
                          </span>
                        </div>
                        <div className="font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                          {p.originalPrice ? (
                            <span className="line-through opacity-60 me-2">
                              {formatMoney(p.originalPrice, shop.country, 0)}
                            </span>
                          ) : null}
                          <span className="text-[#FF6A00] dark:text-orange-400 font-extrabold">
                            {formatMoney(p.price, shop.country, 0)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleProductOffer(p)}
                        className="px-3 py-1.5 rounded-full glass-btn text-amber-900 dark:text-amber-200 font-bold shrink-0"
                      >
                        {tx(isEn, 'إيقاف العرض', 'Disable Offer')}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Promote Existing Dishes */}
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
                          className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 rounded-2xl p-2.5 border border-orange-100 dark:border-slate-700 text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <form
            onSubmit={handleSaveSettings}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 border border-orange-100 dark:border-slate-800 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {tx(isEn, 'إعدادات المتجر والتوصيل والقالب', 'Store, Delivery & Template Settings')}
              </h3>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Interface Language Switch inside Settings */}
            <div className="flex items-center justify-between rounded-2xl border border-orange-100 dark:border-slate-700 bg-orange-50/30 dark:bg-slate-800/50 px-4 py-2.5">
              <span className="text-xs font-extrabold">{tx(isEn, 'لغة لوحة التحكم', 'Interface Language')}</span>
              <div className="inline-flex gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-orange-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setLang('ar')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    !isEn ? 'bg-[#FF6A00] text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  عربي
                </button>
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    isEn ? 'bg-[#FF6A00] text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* Section 5: اعدادات التوصيل */}
            <div className="rounded-2xl border-2 border-orange-200 dark:border-orange-900/60 bg-orange-50/40 dark:bg-slate-800/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-sm text-[#FF6A00]">
                  {tx(isEn, 'اعدادات التوصيل', 'Delivery Settings')}
                </h4>
                <button
                  type="button"
                  onClick={() => setEditFreeDelivery((v) => !v)}
                  className={`px-3 py-1 rounded-full text-xs font-extrabold transition-colors ${
                    editFreeDelivery
                      ? 'bg-[#FF6A00] text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
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
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold tabular-nums disabled:opacity-60"
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
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold"
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
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold tabular-nums"
                />
              </div>

              <button
                type="button"
                disabled={savingSettings}
                onClick={() => void handleSaveDeliveryOnly()}
                className="w-full py-2.5 rounded-2xl bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-xs transition-colors"
              >
                {savingSettings
                  ? tx(isEn, 'جاري الحفظ...', 'Saving...')
                  : tx(isEn, 'حفظ اعدادات التوصيل', 'Save Delivery Settings')}
              </button>
              {deliverySavedToast && (
                <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 text-center">
                  {deliverySavedToast}
                </div>
              )}
            </div>

            {/* Section 5B: Fees & Taxes (All OFF by default) */}
            <div className="rounded-2xl border border-orange-100 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-extrabold text-sm">
                  {tx(isEn, 'الرسوم والضرائب (معطلة افتراضياً)', 'Fees & Taxes (OFF by default)')}
                </h4>
                <span className="text-[11px] font-bold text-[#FF6A00]">
                  {tx(isEn, 'سعر الأكل + التوصيل = الإجمالي', 'Subtotal + Delivery = Total')}
                </span>
              </div>

              {forceZeroFeesGlobally && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-[11px] font-extrabold text-amber-900 dark:text-amber-200">
                  {tx(
                    isEn,
                    'تنبيه: تم إلغاء جميع الرسوم والضرائب لكل المطاعم على مستوى المنصة من لوحة الأدمن.',
                    'Note: All fees & taxes are globally disabled across the platform by Admin.'
                  )}
                </div>
              )}

              {/* Service Fee Toggle */}
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
                      className="w-16 px-2 py-1 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-center tabular-nums"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditEnableServiceFee((v) => !v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${
                      editEnableServiceFee
                        ? 'bg-[#FF6A00] text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {editEnableServiceFee ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* VAT Toggle */}
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
                      className="w-16 px-2 py-1 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-center tabular-nums"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditEnableVat((v) => !v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${
                      editEnableVat
                        ? 'bg-[#FF6A00] text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {editEnableVat ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Packaging Fee Toggle */}
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
                      className="w-16 px-2 py-1 rounded-xl border border-orange-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-center tabular-nums"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditEnablePackagingFee((v) => !v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${
                      editEnablePackagingFee
                        ? 'bg-[#FF6A00] text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
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
                className="w-full px-3.5 py-2.5 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
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
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
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
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                />
              </div>
            </div>

            {/* Template Switcher */}
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-extrabold">
                {tx(isEn, 'شكل وقالب المنيو', 'Menu Template')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MENU_TEMPLATES.map((tpl) => {
                  const tplMeta = translateTemplateMeta(tpl.id, tpl.name, tpl.tagline, isEn);
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setEditTemplate(tpl.id)}
                      className={`p-2.5 rounded-2xl border text-start text-xs transition-colors ${
                        editTemplate === tpl.id
                          ? 'bg-orange-50 dark:bg-orange-950/60 border-[#FF6A00] font-extrabold'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold'
                      }`}
                    >
                      <div>{tplMeta.name}</div>
                      <div className="text-[11px] font-medium text-slate-500 truncate">
                        {tplMeta.tagline}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Picker */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold">
                {tx(isEn, 'لون الهوية', 'Brand Accent Color')}
              </label>
              <div className="flex flex-wrap gap-2">
                {['برتقالي', 'أخضر', 'أحمر', 'أزرق مخضر', 'أسود', 'لون آخر'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditThemeColor(c)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 ${
                      editThemeColor === c
                        ? 'border-[#FF6A00] bg-orange-50 dark:bg-orange-950/50'
                        : 'border-slate-200 dark:border-slate-700'
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

            {/* Brand Logo Editor */}
            <div className="rounded-2xl border border-orange-100 dark:border-slate-700 bg-orange-50/40 dark:bg-slate-800 p-3.5 space-y-2.5">
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
                    className="px-3 py-1.5 rounded-full glass-btn-primary text-xs font-bold inline-flex items-center gap-1"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {editLogoUrl ? tx(isEn, 'تغيير', 'Change') : tx(isEn, 'رفع لوجو', 'Upload Logo')}
                  </button>
                  {editLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setEditLogoUrl('')}
                      className="px-2.5 py-1.5 rounded-full glass-btn text-xs font-bold text-amber-800"
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
                    <img
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
                        ? 'bg-[#FF6A00] text-white'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    {editShowLogoOnItems ? tx(isEn, 'مفعل', 'Active') : tx(isEn, 'متوقف', 'Paused')}
                  </button>
                </div>
              )}
            </div>

            {/* Restaurant Cover / Background Behind Name & Logo */}
            <div className="rounded-2xl border border-orange-100 dark:border-slate-700 bg-orange-50/40 dark:bg-slate-800 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-extrabold">
                    {tx(isEn, 'خلفية المطعم (ورا الاسم واللوجو)', 'Store Cover Banner')}
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                    className="px-3 py-1.5 rounded-full glass-btn-primary text-xs font-bold inline-flex items-center gap-1"
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
                      className="px-2.5 py-1.5 rounded-full glass-btn text-xs font-bold text-amber-800"
                    >
                      {tx(isEn, 'حذف', 'Remove')}
                    </button>
                  )}
                </div>
              </div>
              {coverError && <p className="text-xs font-bold text-amber-800">{coverError}</p>}
              <div className="relative h-24 rounded-2xl overflow-hidden border border-orange-200/70 dark:border-slate-700 flex items-end p-3">
                {editCoverImage ? (
                  <>
                    <img
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
                    <img
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
                        editCoverImage ? 'text-white' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {editNameAr || displayShopName}
                    </div>
                    <div
                      className={`text-[10px] font-bold ${
                        editCoverImage ? 'text-orange-200' : 'text-[#FF6A00] dark:text-orange-300'
                      }`}
                    >
                      {tx(isEn, 'معاينة الخلفية واللوجو', 'Cover & Logo Preview')}
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
              {savingSettings
                ? tx(isEn, 'جاري الحفظ...', 'Saving...')
                : tx(isEn, 'حفظ التعديلات', 'Save Changes')}
            </button>
          </form>
        </div>
      )}

      {/* Reports Modal */}
      {reportsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 border border-orange-100 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">{tx(isEn, 'ملخص التقارير', 'Reports Summary')}</h3>
              <button
                type="button"
                onClick={() => setReportsModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 text-sm font-bold">
              <div className="flex justify-between p-3 rounded-2xl bg-orange-50/60 dark:bg-slate-800">
                <span>{tx(isEn, 'إجمالي الطلبات', 'Total Orders')}</span>
                <span className="tabular-nums">{orders.length}</span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-orange-50/60 dark:bg-slate-800">
                <span>{tx(isEn, 'طلبات الكاشير', 'Cashier POS Orders')}</span>
                <span className="tabular-nums">
                  {orders.filter((o) => o.source === 'cashier').length}
                </span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-orange-50/60 dark:bg-slate-800">
                <span>{tx(isEn, 'طلبات المنيو', 'Online Menu Orders')}</span>
                <span className="tabular-nums">
                  {orders.filter((o) => o.source === 'menu').length}
                </span>
              </div>
              <div className="flex justify-between p-3 rounded-2xl bg-orange-100 dark:bg-orange-950/60">
                <span>{tx(isEn, 'إجمالي المبيعات', 'Total Sales')}</span>
                <span className="text-[#FF6A00] dark:text-orange-300 tabular-nums">
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
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 border border-orange-100 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {tx(isEn, 'الاشتراك والتفعيل — غزالة Ghazalo', 'Subscription & Activation — Ghazalo')}
              </h3>
              <button
                type="button"
                onClick={() => setSubscriptionModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-2xl p-4 space-y-1">
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
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
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
                    ? 'border-2 border-[#FF6A00] bg-orange-50/70 dark:bg-orange-950/35 shadow-sm'
                    : 'border border-orange-200 dark:border-slate-700 hover:border-[#FF6A00]/60 bg-white dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  {selectedSubscriptionPlan === 'monthly' && (
                    <span className="w-4 h-4 rounded-full bg-[#FF6A00] text-white inline-flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                  <span
                    className={`text-xs font-bold ${
                      selectedSubscriptionPlan === 'monthly'
                        ? 'text-[#FF6A00] dark:text-orange-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tx(isEn, 'اشتراك شهري (30 يوم)', 'Monthly Plan (30 days)')}
                  </span>
                </div>
                <div className="text-base font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
                  {SUBSCRIPTION_PRICING.MONTHLY_EGP} {tx(isEn, 'جنيه / شهري', 'EGP / mo')}
                </div>
                <div
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    selectedSubscriptionPlan === 'monthly'
                      ? 'bg-[#FF6A00] text-white'
                      : 'bg-orange-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {selectedSubscriptionPlan === 'monthly'
                    ? tx(isEn, 'الباقة المحددة', 'Selected Plan')
                    : tx(isEn, 'تفعيل شهري', 'Select Monthly')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSubscriptionPlan('yearly')}
                aria-pressed={selectedSubscriptionPlan === 'yearly'}
                className={`relative rounded-2xl p-3 space-y-1 transition-all cursor-pointer text-center ${
                  selectedSubscriptionPlan === 'yearly'
                    ? 'border-2 border-[#FF6A00] bg-orange-50/70 dark:bg-orange-950/35 shadow-sm'
                    : 'border border-orange-200 dark:border-slate-700 hover:border-[#FF6A00]/60 bg-white dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  {selectedSubscriptionPlan === 'yearly' && (
                    <span className="w-4 h-4 rounded-full bg-[#FF6A00] text-white inline-flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                  <span
                    className={`text-xs font-bold ${
                      selectedSubscriptionPlan === 'yearly'
                        ? 'text-[#FF6A00] dark:text-orange-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tx(isEn, 'اشتراك سنوي (365 يوم)', 'Yearly Plan (365 days)')}
                  </span>
                </div>
                <div className="text-base font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
                  {SUBSCRIPTION_PRICING.YEARLY_EGP} {tx(isEn, 'جنيه / سنوي', 'EGP / yr')}
                </div>
                <div className="inline-block px-2 py-0.5 rounded-full bg-amber-300 text-slate-900 text-[10px] font-extrabold">
                  {tx(
                    isEn,
                    `وفّر ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه`,
                    `Save ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} EGP`
                  )}
                </div>
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {tx(
                isEn,
                `لتجديد اشتراكك وتفعيل المنيو فوراً (${selectedSubscriptionPlan === 'monthly' ? 'اشتراك شهري 600 جنيه' : 'اشتراك سنوي 3000 جنيه'})، تواصل مباشرة مع إدارة غزالة عبر واتساب أو الإيميل:`,
                `To renew and activate immediately (${selectedSubscriptionPlan === 'monthly' ? 'Monthly 600 EGP' : 'Yearly 3000 EGP'}), contact Ghazalo team via WhatsApp or Email:`
              )}
            </p>
            <div className="space-y-2">
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  `مرحباً إدارة غزالة، أرغب في تفعيل ${
                    selectedSubscriptionPlan === 'monthly'
                      ? `الاشتراك الشهري (${SUBSCRIPTION_PRICING.MONTHLY_EGP} جنيه / 30 يوم)`
                      : `الاشتراك السنوي (${SUBSCRIPTION_PRICING.YEARLY_EGP} جنيه / 365 يوم)`
                  } لمطعم ${shop.nameAr} (${storeSlug})`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 rounded-full glass-btn-primary font-bold text-sm flex items-center justify-center gap-2"
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
                className="w-full py-3 rounded-full glass-btn text-[#FF6A00] dark:text-orange-300 font-bold text-xs flex items-center justify-center gap-2"
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
