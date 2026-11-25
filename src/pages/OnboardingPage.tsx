import React, { useRef, useState } from 'react';
import {
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Utensils,
  ChevronRight,
} from 'lucide-react';
import { SofrtekLogo } from '../components/BrandLogo';
import { MenuTemplateShowcase } from '../components/MenuTemplateShowcase';
import { MultiMenuUploader } from '../components/MultiMenuUploader';
import { StoreLocationPicker } from '../components/StoreLocationPicker';
import {
  createShopWithProducts,
  saveStoreCredentialRecord,
  saveUserProfile,
} from '../services/firestoreService';
import { compressCoverFile, compressLogoFile } from '../utils/logoUpload';
import { sortExtractedMenuItems, sortMenuCategories } from '../utils/menuSorting';
import { notifyAdminStoreSync, syncPublicStoreSnapshot } from '../utils/menuLink';
import { trackAdsConversion } from '../utils/adsTracking';
import { getProductOptions } from '../utils/productVariants';
import { setStoredUiLang } from '../utils/uiLang';
import {
  savePhoneEmailMapping,
  setAuthSessionStorage,
  shopToDemoRecord,
  upsertLocalRestaurant,
} from '../utils/storeRegistry';
import {
  normalizeStoreSlug,
  type ExtractedMenuItem,
  type MenuTemplateId,
  type Product,
  type Shop,
} from '../types';

interface OnboardingPageProps {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  initialBusinessName?: string;
  initialStoreSlug?: string;
  initialContact?: string;
  initialPassword?: string;
  initialCountry?: string;
  onCancel: () => void;
  onCompleted: (shop: Shop, products?: Product[]) => void;
}

const COUNTRIES = ['مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'دولة أخرى'];
const MENU_LANGUAGES = ['العربية', 'English', 'العربية والإنجليزية', 'الفرنسية'];
const WORK_DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const THEME_COLORS = [
  { name: 'أخضر', swatch: '#15803D' },
  { name: 'برتقالي', swatch: '#FF6A00' },
  { name: 'أحمر', swatch: '#B91C1C' },
  { name: 'أزرق مخضر', swatch: '#0D9488' },
  { name: 'أسود', swatch: '#14201A' },
];
const PAYMENT_METHODS = ['نقداً', 'بطاقة', 'فودافون كاش', 'انستاباي', 'فوري'];

export const OnboardingPage: React.FC<OnboardingPageProps> = ({
  ownerId,
  ownerName,
  ownerEmail,
  initialBusinessName = '',
  initialStoreSlug = '',
  initialContact = '',
  initialPassword = '',
  initialCountry = 'مصر',
  onCancel,
  onCompleted,
}) => {
  const [step, setStep] = useState(1);

  // Step 2
  const [country, setCountry] = useState(initialCountry || 'مصر');
  const [menuLanguage, setMenuLanguage] = useState('العربية');
  const [showMoreLangs, setShowMoreLangs] = useState(false);
  const [nameAr, setNameAr] = useState(initialBusinessName || '');
  const [nameEn, setNameEn] = useState('');
  const [storeSlug, setStoreSlug] = useState(() => normalizeStoreSlug(initialStoreSlug || ''));
  const [slugTouched, setSlugTouched] = useState(Boolean(initialStoreSlug));

  // Step 3
  const [branchCount, setBranchCount] = useState<'فرع واحد' | 'أكثر من فرع'>('فرع واحد');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [workFrom, setWorkFrom] = useState('4م');
  const [workTo, setWorkTo] = useState('2ص');
  const [workDays, setWorkDays] = useState<string[]>([...WORK_DAYS]);

  // Step 4: Appearance, Templates & Logo
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [themeColor, setThemeColor] = useState('أخضر');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [menuTemplate, setMenuTemplate] = useState<MenuTemplateId>('classic');
  const [logoUrl, setLogoUrl] = useState('');
  const [showLogoOnItems, setShowLogoOnItems] = useState(true);
  const [logoError, setLogoError] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [coverError, setCoverError] = useState('');

  // Step 5
  const [acceptOrders, setAcceptOrders] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['نقداً', 'فودافون كاش']);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState('20');
  const [deliveryTimeInput, setDeliveryTimeInput] = useState('30-45 دقيقة');
  const [bio, setBio] = useState('');

  // Step 6 (AI Extraction)
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [stepError, setStepError] = useState('');
  const [extractedCategories, setExtractedCategories] = useState<string[]>([]);
  const [extractedItems, setExtractedItems] = useState<ExtractedMenuItem[]>([]);
  const [savingShop, setSavingShop] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');
    try {
      const compressed = await compressLogoFile(file);
      setLogoUrl(compressed);
      setShowLogoOnItems(true);
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
      setCoverImage(compressed);
    } catch (err: unknown) {
      setCoverError(err instanceof Error ? err.message : 'تعذر رفع صورة الخلفية');
    }
  };

  const toggleWorkDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const togglePaymentMethod = (method: string) => {
    setPaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  const handleExtractedChunk = (newItems: ExtractedMenuItem[], newCats: string[]) => {
    setExtractedItems((prev) => {
      const existingKeys = new Set(prev.map((it) => `${it.name.trim()}|${it.category.trim()}`));
      const uniqueNew = newItems.filter(
        (it) => !existingKeys.has(`${it.name.trim()}|${it.category.trim()}`)
      );
      return sortExtractedMenuItems([...prev, ...uniqueNew]);
    });
    setExtractedCategories((prev) => {
      const merged = new Set([...prev, ...newCats]);
      return sortMenuCategories(Array.from(merged));
    });
  };

  const handleFinish = async (skipItems: boolean) => {
    setSavingShop(true);
    setAiError('');
    try {
      const itemsToSave = skipItems ? [] : extractedItems;
      const derivedSlug =
        normalizeStoreSlug(storeSlug) ||
        normalizeStoreSlug(nameEn) ||
        normalizeStoreSlug(nameAr) ||
        `store-${Date.now().toString().slice(-5)}`;
      const cleanPhone =
        initialContact && !initialContact.includes('@') ? initialContact.trim() : '';
      const parsedDeliveryFee = Math.max(0, Number(deliveryFeeInput) || 0);

      const { shop: newShop, products: createdProducts } = await createShopWithProducts(
        {
          ownerId,
          storeSlug: derivedSlug,
          nameAr: nameAr.trim() || 'متجري الجديد',
          nameEn: nameEn.trim(),
          country,
          menuLanguage,
          branchCount,
          city: city.trim(),
          address: address.trim(),
          googleMapsUrl: googleMapsUrl.trim(),
          ...(typeof latitude === 'number' &&
          typeof longitude === 'number' &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude)
            ? { latitude, longitude }
            : {}),
          workFrom,
          workTo,
          workDays,
          themeColor,
          themeMode,
          menuTemplate,
          logoUrl,
          showLogoOnItems: Boolean(logoUrl && showLogoOnItems),
          acceptOrders,
          paymentMethods: paymentMethods.length ? paymentMethods : ['نقداً'],
          bio: bio.trim(),
          whatsapp: cleanPhone,
          coverImage,
          isOpen: true,
          plan: 'تجريبي 7 أيام',
          deliveryFee: parsedDeliveryFee,
          freeDelivery: parsedDeliveryFee === 0,
          freeDeliveryMinOrder: 0,
          deliveryTime: deliveryTimeInput.trim() || '30-45 دقيقة',
          enableServiceFee: false,
          serviceFeePct: 0,
          enableVat: false,
          vatPct: 0,
          enablePackagingFee: false,
          packagingFee: 0,
        },
        itemsToSave
      );

      await saveUserProfile({
        uid: ownerId,
        fullName: ownerName || 'تاجر',
        email: ownerEmail,
        phone: cleanPhone,
        country,
        defaultShopId: newShop.id,
      });

      const finalSlug = newShop.storeSlug || derivedSlug;
      try {
        await saveStoreCredentialRecord({
          shopId: newShop.id,
          storeSlug: finalSlug,
          ownerId,
          nameAr: newShop.nameAr,
          email: ownerEmail,
          phone: cleanPhone,
        });
      } catch {
        // optional
      }

      upsertLocalRestaurant(
        shopToDemoRecord(
          newShop,
          {
            email: ownerEmail,
            phone: cleanPhone,
            password: initialPassword || undefined,
          },
          createdProducts
        )
      );
      setAuthSessionStorage(finalSlug, `gh-store-${newShop.id}-${Date.now()}`);
      if (cleanPhone && ownerEmail) {
        savePhoneEmailMapping(cleanPhone, ownerEmail);
      }

      try {
        await fetch('/api/store-auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: newShop.id,
            storeSlug: finalSlug,
            ownerId,
            nameAr: newShop.nameAr,
            email: ownerEmail,
            phone: cleanPhone,
            ...(initialPassword ? { password: initialPassword } : {}),
          }),
        });
      } catch {
        // non-blocking
      }

      await syncPublicStoreSnapshot(newShop, createdProducts);
      notifyAdminStoreSync('store-onboarded');
      trackAdsConversion('generate_lead', { currency: 'EGP', value: 0 });

      onCompleted(newShop, createdProducts);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'تعذر حفظ المتجر');
    } finally {
      setSavingShop(false);
    }
  };

  const progressPct = Math.round((step / 6) * 100);

  return (
    <div dir="rtl" className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB] flex flex-col">
      {/* Green Top Step Strip matching Sofrtek setup() */}
      <div className="bg-[#15803D] text-white px-4 py-2.5">
        <div className="max-w-[560px] mx-auto flex items-center justify-between">
          <span className="text-sm font-extrabold tabular-nums">الخطوة {step} من 6</span>
          <span className="text-xs font-bold text-[#DCFCE7]">إعداد منيو مطعمك</span>
        </div>
      </div>
      <div className="h-2 bg-[#DCFCE7] dark:bg-[#173323]">
        <div
          style={{ width: `${progressPct}%` }}
          className="h-2 bg-[#15803D] rounded-l-full transition-all duration-300"
        />
      </div>

      <main className="flex-1 w-full max-w-[560px] mx-auto px-4 py-4 pb-20 flex flex-col gap-3.5">
        <div className="sf-card p-5 sm:p-6 space-y-5">
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center space-y-4 pt-4">
              <div className="flex justify-center">
                <SofrtekLogo />
              </div>
              <h1 className="text-[28px] font-extrabold leading-tight">أهلاً بيك</h1>
              <p className="text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                خلال دقائق قليلة هنعمل المنيو الخاص بيك بتجربة مجانية 7 أيام.
              </p>
              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="sf-btn-primary w-full min-h-[54px] text-base"
                >
                  لنبدأ
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="sf-btn w-full text-sm"
                >
                  إيقاف
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Business Data */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-[22px] font-extrabold">بيانات النشاط</h2>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">في أي دولة نشاطك؟</label>
                <div className="flex flex-wrap gap-2">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCountry(c)}
                      className={country === c ? 'sf-chip-on' : 'sf-chip'}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">بأي لغة يظهر المنيو؟</label>
                <div className="flex flex-wrap gap-2">
                  {(showMoreLangs ? MENU_LANGUAGES : MENU_LANGUAGES.slice(0, 2)).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => {
                        setMenuLanguage(lang);
                        if (lang === 'English') setStoredUiLang('en');
                        else if (lang === 'العربية') setStoredUiLang('ar');
                      }}
                      className={menuLanguage === lang ? 'sf-chip-on' : 'sf-chip'}
                    >
                      {lang}
                    </button>
                  ))}
                  {!showMoreLangs && (
                    <button
                      type="button"
                      onClick={() => setShowMoreLangs(true)}
                      className="sf-chip text-[#15803D]"
                    >
                      عرض المزيد
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-extrabold mb-1">اسم النشاط بالعربي</label>
                  <input
                    type="text"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="مثال: ركن الكشري"
                    className="sf-inp"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">اسم النشاط بالإنجليزي</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={nameEn}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNameEn(val);
                      if (!slugTouched) {
                        setStoreSlug(normalizeStoreSlug(val));
                      }
                    }}
                    placeholder="Koshary Corner"
                    className="sf-inp text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">عنوان المتجر (رابط المنيو)</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      dir="ltr"
                      value={storeSlug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      }}
                      placeholder="kebda-masr"
                      className="sf-inp pl-20 text-left font-extrabold"
                    />
                    <span
                      dir="ltr"
                      className="absolute left-2.5 px-2 py-1 rounded-lg bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-xs font-extrabold"
                    >
                      /menu/
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Address and Hours */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-[22px] font-extrabold">العنوان والأوقات</h2>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">كم فرع لديك؟</label>
                <div className="flex flex-wrap gap-2">
                  {(['فرع واحد', 'أكثر من فرع'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setBranchCount(option)}
                      className={branchCount === option ? 'sf-chip-on' : 'sf-chip'}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-extrabold mb-1">المدينة</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="القاهرة"
                    className="sf-inp"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">العنوان</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="الشارع والمنطقة"
                    className="sf-inp"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-extrabold mb-1">وقت العمل من</label>
                    <input
                      type="text"
                      value={workFrom}
                      onChange={(e) => setWorkFrom(e.target.value)}
                      className="sf-inp"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold mb-1">إلى</label>
                    <input
                      type="text"
                      value={workTo}
                      onChange={(e) => setWorkTo(e.target.value)}
                      className="sf-inp"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">أيام العمل</label>
                <div className="flex flex-wrap gap-2">
                  {WORK_DAYS.map((day) => {
                    const checked = workDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWorkDay(day)}
                        className={checked ? 'sf-chip-on text-xs' : 'sf-chip text-xs'}
                      >
                        {checked && '✓ '}
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[18px] border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#173323]/60 p-3.5 space-y-2.5">
                <div className="text-xs font-extrabold">
                  تحديد موقع المطعم على الخريطة (اختياري)
                </div>
                <StoreLocationPicker
                  latitude={latitude}
                  longitude={longitude}
                  googleMapsUrl={googleMapsUrl}
                  shopName={nameAr}
                  city={city}
                  address={address}
                  heightClass="h-56 sm:h-64"
                  onChange={(next) => {
                    setLatitude(next.latitude);
                    setLongitude(next.longitude);
                    setGoogleMapsUrl(next.googleMapsUrl);
                  }}
                />
              </div>
            </div>
          )}

          {/* Step 4: Appearance, Templates & Logo */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-[22px] font-extrabold">المظهر وقالب المنيو</h2>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">اختر شكل وقالب المنيو</label>
                <MenuTemplateShowcase
                  selectedTemplate={menuTemplate}
                  onSelectTemplate={setMenuTemplate}
                  themeColor={themeColor}
                  themeMode={themeMode}
                  shopName={nameAr.trim() || 'اسم مطعمك'}
                  logoUrl={logoUrl}
                  showLogoOnItems={showLogoOnItems}
                  coverImage={coverImage}
                />
              </div>

              {/* Brand Logo Upload */}
              <div className="rounded-[18px] border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#173323]/60 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold">لوجو المطعم على الأصناف</div>
                    <p className="text-[11px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                      شعار مطعمك أعلى المنيو وعلى صور الأطباق
                    </p>
                  </div>
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
                      className="sf-btn-primary !min-h-[38px] !rounded-[12px] px-3 text-xs"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      {logoUrl ? 'تغيير' : 'رفع اللوجو'}
                    </button>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="sf-btn !min-h-[38px] !rounded-[12px] px-2.5 text-xs"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </div>

                {logoError && <p className="text-xs font-bold text-amber-800">{logoError}</p>}

                {logoUrl && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32]">
                    <div className="flex items-center gap-2">
                      <img loading="lazy" decoding="async"
                        src={logoUrl}
                        alt="لوجو"
                        className="w-9 h-9 rounded-full object-cover border border-white bg-white"
                      />
                      <span className="text-[11px] font-bold">إظهار الشعار على كل صنف</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLogoOnItems((v) => !v)}
                      className={showLogoOnItems ? 'sf-chip-on text-xs' : 'sf-chip text-xs'}
                    >
                      {showLogoOnItems ? 'مفعل' : 'متوقف'}
                    </button>
                  </div>
                )}
              </div>

              {/* Cover Upload */}
              <div className="rounded-[18px] border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#173323]/60 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold">صورة غلاف المطعم</div>
                    <p className="text-[11px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                      خلفية تظهر أعلى صفحة المنيو
                    </p>
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleCoverUpload(e)}
                    className="hidden"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="sf-btn-primary !min-h-[38px] !rounded-[12px] px-3 text-xs"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      {coverImage ? 'تغيير' : 'رفع خلفية'}
                    </button>
                    {coverImage && (
                      <button
                        type="button"
                        onClick={() => setCoverImage('')}
                        className="sf-btn !min-h-[38px] !rounded-[12px] px-2.5 text-xs"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </div>
                {coverError && <p className="text-xs font-bold text-amber-800">{coverError}</p>}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">لون المنيو</label>
                <div className="flex flex-wrap gap-2">
                  {THEME_COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setThemeColor(color.name)}
                      className={`inline-flex items-center gap-1.5 ${
                        themeColor === color.name ? 'sf-chip-on' : 'sf-chip'
                      }`}
                    >
                      <span
                        style={{ backgroundColor: color.swatch }}
                        className="w-3.5 h-3.5 rounded-full border border-white/60 shrink-0"
                      />
                      <span>{color.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">وضع المنيو</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'light', label: 'فاتح' },
                    { id: 'dark', label: 'داكن' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setThemeMode(m.id as 'light' | 'dark')}
                      className={themeMode === m.id ? 'sf-chip-on' : 'sf-chip'}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Orders and Payment */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-[22px] font-extrabold">الطلبات والدفع</h2>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">هل يطلب عملاؤك من المنيو؟</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAcceptOrders(true)}
                    className={acceptOrders ? 'sf-chip-on' : 'sf-chip'}
                  >
                    نعم، أقبل الطلبات
                  </button>
                  <button
                    type="button"
                    onClick={() => setAcceptOrders(false)}
                    className={!acceptOrders ? 'sf-chip-on' : 'sf-chip'}
                  >
                    لا، للعرض فقط
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-extrabold">كيف يدفع عملاؤك؟</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHODS.map((pm) => {
                    const selected = paymentMethods.includes(pm);
                    return (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => togglePaymentMethod(pm)}
                        className={selected ? 'sf-chip-on' : 'sf-chip'}
                      >
                        {selected && '✓ '}
                        {pm}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 rounded-[18px] bg-[#DCFCE7]/50 dark:bg-[#173323] p-3 border border-[#CFE3D5] dark:border-[#2C3D32]">
                <div>
                  <label className="block text-xs font-extrabold mb-1">سعر التوصيل (جنيه)</label>
                  <input
                    type="number"
                    min={0}
                    value={deliveryFeeInput}
                    onChange={(e) => setDeliveryFeeInput(e.target.value)}
                    placeholder="20"
                    className="sf-inp tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">وقت التوصيل</label>
                  <input
                    type="text"
                    value={deliveryTimeInput}
                    onChange={(e) => setDeliveryTimeInput(e.target.value)}
                    placeholder="30-45 دقيقة"
                    className="sf-inp"
                  />
                </div>
                <p className="col-span-2 text-[11px] font-bold text-[#14532D] dark:text-[#BBF7D0]">
                  بدون رسوم خدمة أو ضرائب إضافية افتراضياً — السعر شامل الأكل + التوصيل فقط.
                </p>
              </div>

              <div>
                <label className="block text-sm font-extrabold mb-1">عرّف عملاءك بنشاطك</label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="نبذة عن نشاطك..."
                  className="sf-inp py-3"
                />
              </div>
            </div>
          )}

          {/* Step 6: AI Menu Extraction (Multi-Image & File Queue) */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-xs font-extrabold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>المنيو بالذكاء الاصطناعي</span>
                </div>
                <h2 className="text-[22px] font-extrabold">ارفع صور المنيو</h2>
                <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                  ارفع صورة واحدة أو عدة صفحات للمنيو معاً أو على دفعات — أو ملف PDF أو Excel
                </p>
              </div>

              <MultiMenuUploader
                businessName={nameAr || 'متجري'}
                language={menuLanguage}
                disabled={savingShop}
                onExtractedChunk={handleExtractedChunk}
                onBusyChange={setAiProcessing}
              />

              {aiError && (
                <div className="rounded-[16px] bg-[#FEF9C3] border border-[#FACC15] p-3 text-xs font-extrabold text-[#14201A]">
                  {aiError}
                </div>
              )}

              {extractedItems.length > 0 && !aiProcessing && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-[18px] p-3 bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0]">
                      <div className="text-xl font-extrabold tabular-nums">
                        {extractedCategories.length}
                      </div>
                      <div className="text-xs font-bold">أقسام</div>
                    </div>
                    <div className="rounded-[18px] p-3 bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0]">
                      <div className="text-xl font-extrabold tabular-nums">
                        {extractedItems.length}
                      </div>
                      <div className="text-xs font-bold">صنف</div>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {extractedItems.map((item, idx) => {
                      const itemOptions = getProductOptions(item);
                      return (
                        <div
                          key={`${item.name}-${idx}`}
                          className="flex items-center justify-between gap-2 bg-[#F6FBF7] dark:bg-[#173323]/60 border border-[#CFE3D5] dark:border-[#2C3D32] rounded-[16px] p-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-[12px] bg-[#DCFCE7] dark:bg-[#18231C] flex items-center justify-center shrink-0 overflow-hidden">
                              {item.imageUrl ? (
                                <img loading="lazy" decoding="async"
                                  src={item.imageUrl}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Utensils className="w-4 h-4 text-[#15803D]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-extrabold truncate">{item.name}</div>
                              <div className="text-[11px] text-[#4B5B52] dark:text-[#A3B5AA] truncate">
                                {item.category}
                              </div>
                              {itemOptions.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {itemOptions.map((opt) => (
                                    <span
                                      key={opt.raw}
                                      className="px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#14532D] text-[10px] font-extrabold"
                                    >
                                      {opt.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExtractedItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx
                                      ? {
                                          ...it,
                                          isOffer: !it.isOffer,
                                          originalPrice: !it.isOffer
                                            ? Math.round((it.price || 100) * 1.2)
                                            : undefined,
                                          offerLabel: !it.isOffer ? 'عرض خاص' : undefined,
                                        }
                                      : it
                                  )
                                )
                              }
                              className={`px-2 py-1 rounded-lg text-[10px] font-extrabold inline-flex items-center gap-0.5 ${
                                item.isOffer
                                  ? 'bg-[#FACC15] text-[#14201A]'
                                  : 'bg-[#FFFFFF] dark:bg-[#18231C] text-[#4B5B52]'
                              }`}
                            >
                              <Tag className="w-3 h-3" />
                              عرض
                            </button>
                            <input
                              type="number"
                              value={item.price}
                              onChange={(e) => {
                                const nextVal = Number(e.target.value) || 0;
                                setExtractedItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, price: nextVal } : it))
                                );
                              }}
                              className="w-16 px-1.5 py-1 rounded-lg border border-[#CFE3D5] dark:border-[#2C3D32] bg-white dark:bg-[#18231C] text-center font-extrabold tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setExtractedItems((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1 text-[#4B5B52] hover:text-amber-700"
                              aria-label="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={savingShop}
                    onClick={() => void handleFinish(false)}
                    className="sf-btn-primary w-full min-h-[54px] text-sm"
                  >
                    {savingShop && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>حفظ وإنهاء الإعداد</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={savingShop || aiProcessing}
                onClick={() => void handleFinish(true)}
                className="sf-btn w-full text-sm"
              >
                {savingShop ? 'جاري إنشاء المتجر...' : 'تخطي، إضافة الأصناف يدوياً'}
              </button>
            </div>
          )}

          {stepError && (
            <div className="rounded-[16px] bg-[#FEF9C3] border border-[#FACC15] p-3 text-xs font-extrabold text-[#14201A]">
              {stepError}
            </div>
          )}

          {/* Step Navigation Footer (Steps 2-5) */}
          {step >= 2 && step <= 5 && (
            <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-[#CFE3D5] dark:border-[#2C3D32]">
              <button
                type="button"
                onClick={() => {
                  setStepError('');
                  setStep((s) => s - 1);
                }}
                className="sf-btn px-4 text-sm"
              >
                <ChevronRight className="w-4 h-4" />
                السابق
              </button>
              <button
                type="button"
                onClick={() => {
                  if (step === 2 && !nameAr.trim()) {
                    setStepError('يرجى إدخال اسم النشاط أو المطعم بالعربي أولاً.');
                    return;
                  }
                  setStepError('');
                  setStep((s) => s + 1);
                }}
                className="sf-btn-primary flex-1 text-sm"
              >
                التالي
              </button>
            </div>
          )}

          {step === 6 && (
            <div className="pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32] flex justify-start">
              <button
                type="button"
                onClick={() => setStep(5)}
                className="sf-btn !min-h-[40px] px-4 text-xs"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                الخطوة السابقة
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
