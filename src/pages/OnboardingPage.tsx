import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Check,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Utensils,
  X,
  ChevronRight,
  ImagePlus,
} from 'lucide-react';
import { GhazaloLogo } from '../components/BrandLogo';
import { createShop, saveUserProfile } from '../services/firestoreService';
import { compressLogoFile } from '../utils/logoUpload';
import { getShopThemeHex } from '../utils/calculations';
import { MENU_TEMPLATES } from '../utils/menuTemplates';
import { sortExtractedMenuItems, sortMenuCategories } from '../utils/menuSorting';
import type { ExtractedMenuItem, MenuTemplateId, Shop } from '../types';

interface OnboardingPageProps {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  initialBusinessName?: string;
  initialCountry?: string;
  onCancel: () => void;
  onCompleted: (shop: Shop) => void;
}

const COUNTRIES = ['مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'دولة أخرى'];
const MENU_LANGUAGES = ['العربية', 'English', 'العربية والإنجليزية', 'الفرنسية'];
const WORK_DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const THEME_COLORS = [
  { name: 'أخضر', swatch: '#16A34A' },
  { name: 'أحمر', swatch: '#B45309' },
  { name: 'أزرق مخضر', swatch: '#0D9488' },
  { name: 'أسود', swatch: '#1E293B' },
  { name: 'لون آخر', swatch: '#059669' },
];
const PAYMENT_METHODS = ['نقداً', 'بطاقة', 'فودافون كاش', 'انستاباي', 'فوري'];

const AI_STAGES = [
  'قراءة الملف',
  'استخراج الأقسام',
  'استخراج الأصناف والأسعار',
  'استخراج المتغيرات',
];

export const OnboardingPage: React.FC<OnboardingPageProps> = ({
  ownerId,
  ownerName,
  ownerEmail,
  initialBusinessName = '',
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

  // Step 3
  const [branchCount, setBranchCount] = useState<'فرع واحد' | 'أكثر من فرع'>('فرع واحد');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [workFrom, setWorkFrom] = useState('4م');
  const [workTo, setWorkTo] = useState('2ص');
  const [workDays, setWorkDays] = useState<string[]>([...WORK_DAYS]);

  // Step 4: Appearance, Templates & Logo
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [themeColor, setThemeColor] = useState('أخضر');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [menuTemplate, setMenuTemplate] = useState<MenuTemplateId>('classic');
  const [logoUrl, setLogoUrl] = useState('');
  const [showLogoOnItems, setShowLogoOnItems] = useState(true);
  const [logoError, setLogoError] = useState('');

  // Step 5
  const [acceptOrders, setAcceptOrders] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['نقداً', 'فودافون كاش']);
  const [bio, setBio] = useState('');

  // Step 6 (AI Extraction)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedPreviews, setUploadedPreviews] = useState<
    Array<{ id: string; name: string; previewUrl?: string; isPdf?: boolean; isSheet?: boolean }>
  >([]);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiStageIndex, setAiStageIndex] = useState(-1);
  const [aiError, setAiError] = useState('');
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

  const prepareFileForAi = async (
    file: File
  ): Promise<{
    filePayload: { fileName: string; mimeType?: string; base64Data?: string; textContent?: string };
    preview: { id: string; name: string; previewUrl?: string; isPdf?: boolean; isSheet?: boolean };
  }> => {
    const lowerName = file.name.toLowerCase();
    const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const csvText = XLSX.utils.sheet_to_csv(firstSheet);
      return {
        filePayload: { fileName: file.name, textContent: csvText },
        preview: { id, name: file.name, isSheet: true },
      };
    }

    if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const commaIdx = result.indexOf(',');
          resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return {
        filePayload: { fileName: file.name, mimeType: 'application/pdf', base64Data },
        preview: { id, name: file.name, isPdf: true },
      };
    }

    // Image file: compress gently if very large so multiple menu photos upload swiftly
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const compressedDataUrl = await new Promise<string>((resolve) => {
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

    const commaIdx = compressedDataUrl.indexOf(',');
    const mimeMatch = compressedDataUrl.match(/^data:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : file.type || 'image/jpeg';
    const base64Data = commaIdx >= 0 ? compressedDataUrl.slice(commaIdx + 1) : compressedDataUrl;

    return {
      filePayload: { fileName: file.name, mimeType, base64Data },
      preview: { id, name: file.name, previewUrl: compressedDataUrl },
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    setAiError('');
    setAiProcessing(true);
    setAiStageIndex(0);

    const stageTimer = window.setInterval(() => {
      setAiStageIndex((prev) => (prev < 3 ? prev + 1 : prev));
    }, 1100);

    try {
      const prepared = await Promise.all(selectedFiles.map((f) => prepareFileForAi(f)));
      setUploadedPreviews((prev) => [...prev, ...prepared.map((p) => p.preview)]);

      const res = await fetch('/api/ai/extract-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: prepared.map((p) => p.filePayload),
          businessName: nameAr || 'متجري',
          language: menuLanguage,
        }),
      });

      const data = (await res.json()) as {
        categories?: string[];
        items?: ExtractedMenuItem[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'تعذر تحليل المنيو بالذكاء الاصطناعي.');
      }

      setAiStageIndex(3);

      // Merge new categories & items cleanly and keep culinary sort (grills -> mains -> drinks -> water)
      const newItems = data.items || [];
      setExtractedItems((prev) => {
        const existingKeys = new Set(prev.map((it) => `${it.name.trim()}|${it.category.trim()}`));
        const uniqueNew = newItems.filter(
          (it) => !existingKeys.has(`${it.name.trim()}|${it.category.trim()}`)
        );
        return sortExtractedMenuItems([...prev, ...uniqueNew]);
      });
      setExtractedCategories((prev) => {
        const merged = new Set([...prev, ...(data.categories || [])]);
        return sortMenuCategories(Array.from(merged));
      });
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'حدث خطأ أثناء قراءة المنيو');
    } finally {
      window.clearInterval(stageTimer);
      setAiProcessing(false);
    }
  };

  const handleFinish = async (skipItems: boolean) => {
    setSavingShop(true);
    setAiError('');
    try {
      const itemsToSave = skipItems ? [] : extractedItems;
      const newShop = await createShop(
        {
          ownerId,
          nameAr: nameAr.trim() || 'متجري الجديد',
          nameEn: nameEn.trim(),
          country,
          menuLanguage,
          branchCount,
          city: city.trim(),
          address: address.trim(),
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
          whatsapp: '',
          coverImage: '',
          isOpen: true,
          plan: 'بداية',
        },
        itemsToSave
      );

      await saveUserProfile({
        uid: ownerId,
        fullName: ownerName || 'تاجر',
        email: ownerEmail,
        country,
        defaultShopId: newShop.id,
      });

      onCompleted(newShop);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'تعذر حفظ المتجر');
    } finally {
      setSavingShop(false);
    }
  };

  const progressPct = Math.round((step / 6) * 100);

  return (
    <div dir="rtl" className="min-h-screen bg-emerald-50/40 dark:bg-slate-950 flex flex-col">
      {/* Top Progress Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-emerald-100 dark:border-slate-800 px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex items-center justify-between">
            <GhazaloLogo />
            <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
              الخطوة {step} من 6
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-emerald-100 dark:bg-slate-800 overflow-hidden">
            <div
              style={{ width: `${progressPct}%` }}
              className="h-full bg-emerald-600 rounded-full transition-all duration-300"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-6">
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center space-y-6 py-4">
              <div className="flex justify-center">
                <GhazaloLogo />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white [text-wrap:balance]">
                خلال دقائق قليلة هنعمل المنيو الخاص بيك
              </h1>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                أجب عن 5 أسئلة سريعة وارفع صورة المنيو ليجهز متجرك فوراً.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full sm:w-44 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base transition-colors"
                >
                  لنبدأ
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full sm:w-44 py-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-emerald-200 dark:border-slate-700 font-bold text-base transition-colors"
                >
                  إيقاف
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Business Data */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl sm:text-2xl font-extrabold">بيانات النشاط</h2>

              <div className="space-y-2">
                <label className="block text-sm font-bold">في أي دولة نشاطك؟</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCountry(c)}
                      className={`py-2.5 px-3 rounded-2xl text-sm font-bold border transition-colors ${
                        country === c
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold">بأي لغة يظهر المنيو؟</label>
                <div className="flex flex-wrap gap-2.5">
                  {(showMoreLangs ? MENU_LANGUAGES : MENU_LANGUAGES.slice(0, 2)).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setMenuLanguage(lang)}
                      className={`py-2.5 px-4 rounded-2xl text-sm font-bold border transition-colors ${
                        menuLanguage === lang
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                  {!showMoreLangs && (
                    <button
                      type="button"
                      onClick={() => setShowMoreLangs(true)}
                      className="py-2.5 px-4 rounded-2xl text-sm font-bold border border-dashed border-emerald-300 text-emerald-700 dark:text-emerald-300"
                    >
                      عرض المزيد
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">اسم النشاط بالعربي</label>
                  <input
                    type="text"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="مثال: البرنس"
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">اسم النشاط بالإنجليزي</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Al Prince"
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Address and Hours */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl sm:text-2xl font-extrabold">العنوان وساعات العمل</h2>

              <div className="space-y-2">
                <label className="block text-sm font-bold">كم فرع لديك؟</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['فرع واحد', 'أكثر من فرع'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setBranchCount(option)}
                      className={`py-3 rounded-2xl text-sm font-bold border transition-colors ${
                        branchCount === option
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">المدينة</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="القاهرة"
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">العنوان</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="الشارع والمنطقة"
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">وقت العمل من</label>
                  <input
                    type="text"
                    value={workFrom}
                    onChange={(e) => setWorkFrom(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">إلى</label>
                  <input
                    type="text"
                    value={workTo}
                    onChange={(e) => setWorkTo(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold">أيام العمل</label>
                <div className="flex flex-wrap gap-2">
                  {WORK_DAYS.map((day) => {
                    const checked = workDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWorkDay(day)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold border transition-colors ${
                          checked
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Appearance, Templates & Dish Logo */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl sm:text-2xl font-extrabold">تصميم وقالب المنيو</h2>

              {/* Template Picker */}
              <div className="space-y-2.5">
                <label className="block text-sm font-bold">اختر شكل وقالب المنيو</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MENU_TEMPLATES.map((tpl) => {
                    const selected = menuTemplate === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setMenuTemplate(tpl.id)}
                        className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col justify-between gap-2 ${
                          selected
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 ring-2 ring-emerald-500/20'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                            {tpl.name}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-100/80 dark:bg-slate-700 text-emerald-800 dark:text-emerald-200">
                            {tpl.badge}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                          {tpl.tagline}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brand Logo Upload & Dish Badge Toggle */}
              <div className="rounded-2xl border border-emerald-100 dark:border-slate-700 bg-emerald-50/40 dark:bg-slate-800/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-extrabold">لوجو المطعم على الأصناف</div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      أضف شعار مطعمك ليظهر كشارة دائرية أنيقة على صور الأصناف وفي أعلى المنيو
                    </p>
                  </div>

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleLogoUpload(e)}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="px-4 py-2 rounded-full glass-btn-primary text-xs font-extrabold inline-flex items-center gap-1.5"
                    >
                      <ImagePlus className="w-4 h-4" />
                      {logoUrl ? 'تغيير اللوجو' : 'رفع اللوجو'}
                    </button>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="px-3 py-2 rounded-full glass-btn text-xs font-bold text-amber-800"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </div>

                {logoError && (
                  <p className="text-xs font-bold text-amber-800">{logoError}</p>
                )}

                {logoUrl && (
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-emerald-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <img
                        src={logoUrl}
                        alt="لوجو المطعم"
                        className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-sm bg-white"
                      />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        إظهار اللوجو كشارة دائرية على زاوية كل صنف
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLogoOnItems((v) => !v)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-colors ${
                        showLogoOnItems
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {showLogoOnItems ? 'مفعل' : 'متوقف'}
                    </button>
                  </div>
                )}

                {/* Live Dish Card Preview */}
                <div className="pt-2">
                  <div className="text-[11px] font-bold text-slate-500 mb-2">
                    معاينة مباشرة لشكل الصنف بالقالب المختار:
                  </div>
                  <div
                    className={`rounded-2xl p-3 border flex items-center gap-3 ${
                      menuTemplate === 'luxury'
                        ? 'bg-[#17211C] border-amber-400/50 text-amber-50'
                        : themeMode === 'dark'
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-white border-emerald-100 text-slate-900'
                    }`}
                  >
                    <div className="relative w-16 h-16 rounded-2xl bg-emerald-100/70 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                      <Utensils
                        style={{ color: getShopThemeHex(themeColor) }}
                        className="w-6 h-6 opacity-70"
                      />
                      {logoUrl && showLogoOnItems && (
                        <img
                          src={logoUrl}
                          alt="شعار"
                          className="w-6 h-6 rounded-full object-cover border-2 border-white shadow-xs absolute top-1 right-1 bg-white"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-extrabold text-sm truncate">طبق كباب وكفتة مشوي</div>
                      <div className="text-[11px] opacity-70">المشويات · {nameAr || 'مطعمك'}</div>
                      <div
                        style={{
                          color:
                            menuTemplate === 'luxury' ? '#FBBF24' : getShopThemeHex(themeColor),
                        }}
                        className="text-xs font-extrabold tabular-nums"
                      >
                        240.00 ج.م
                      </div>
                    </div>
                    <span className="w-8 h-8 rounded-full glass-btn-primary flex items-center justify-center shrink-0">
                      <Plus className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold">لون المنيو</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {THEME_COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setThemeColor(color.name)}
                      className={`p-3 rounded-2xl border flex items-center gap-2.5 text-sm font-bold transition-colors ${
                        themeColor === color.name
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span
                        style={{ backgroundColor: color.swatch }}
                        className="w-5 h-5 rounded-full shrink-0"
                      />
                      <span>{color.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold">وضع المنيو</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'light', label: 'فاتح' },
                    { id: 'dark', label: 'داكن' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setThemeMode(m.id as 'light' | 'dark')}
                      className={`py-3 rounded-2xl border text-sm font-bold transition-colors ${
                        themeMode === m.id
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
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
            <div className="space-y-5">
              <h2 className="text-xl sm:text-2xl font-extrabold">الطلبات وطرق الدفع</h2>

              <div className="space-y-2">
                <label className="block text-sm font-bold">هل يطلب عملاؤك من المنيو؟</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAcceptOrders(true)}
                    className={`py-3 px-4 rounded-2xl border text-sm font-bold transition-colors ${
                      acceptOrders
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    نعم أقبل الطلبات
                  </button>
                  <button
                    type="button"
                    onClick={() => setAcceptOrders(false)}
                    className={`py-3 px-4 rounded-2xl border text-sm font-bold transition-colors ${
                      !acceptOrders
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    لا للعرض فقط
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold">كيف يدفع عملاؤك؟</label>
                <div className="flex flex-wrap gap-2.5">
                  {PAYMENT_METHODS.map((pm) => {
                    const selected = paymentMethods.includes(pm);
                    return (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => togglePaymentMethod(pm)}
                        className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border text-sm font-bold transition-colors ${
                          selected
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {selected && <Check className="w-4 h-4" />}
                        {pm}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1">نبذة عن نشاطك</label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="وصف مختصر لمطعمك أو متجرك يظهر للعملاء..."
                  className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                />
              </div>
            </div>
          )}

          {/* Step 6: AI Menu Extraction */}
          {step === 6 && (
            <div className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 mx-auto flex items-center justify-center">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold">المنيو بالذكاء الاصطناعي</h2>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  ارفع صورة أو أكثر للمنيو أو ملف PDF أو Excel
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                type="button"
                disabled={aiProcessing || savingShop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-5 px-6 rounded-3xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base flex items-center justify-center gap-3 shadow-sm transition-colors"
              >
                {aiProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : extractedItems.length > 0 ? (
                  <Plus className="w-5 h-5" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
                <span>
                  {aiProcessing
                    ? 'جاري تحليل صور المنيو بالذكاء الاصطناعي...'
                    : extractedItems.length > 0
                      ? 'إضافة صور أو صفحات أخرى للمنيو'
                      : 'ارفع صور المنيو (صورة أو أكثر)'}
                </span>
              </button>

              {/* Uploaded Pages Preview Strip */}
              {uploadedPreviews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>صور وملفات المنيو المرفوعة ({uploadedPreviews.length})</span>
                    {!aiProcessing && (
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedPreviews([]);
                          setExtractedItems([]);
                          setExtractedCategories([]);
                        }}
                        className="text-amber-700 hover:underline"
                      >
                        مسح الكل
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1">
                    {uploadedPreviews.map((fileItem) => (
                      <div
                        key={fileItem.id}
                        className="w-20 h-20 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-emerald-50/50 dark:bg-slate-800 shrink-0 overflow-hidden flex flex-col items-center justify-center p-1 relative"
                      >
                        {!aiProcessing && (
                          <button
                            type="button"
                            onClick={() =>
                              setUploadedPreviews((prev) =>
                                prev.filter((p) => p.id !== fileItem.id)
                              )
                            }
                            aria-label="إزالة الملف"
                            className="absolute top-1 left-1 w-5 h-5 rounded-full bg-slate-900/75 text-white flex items-center justify-center z-10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        {fileItem.previewUrl ? (
                          <img
                            src={fileItem.previewUrl}
                            alt={fileItem.name}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : fileItem.isSheet ? (
                          <>
                            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                            <span className="text-[10px] font-bold truncate w-full text-center mt-1">
                              {fileItem.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-6 h-6 text-emerald-600" />
                            <span className="text-[10px] font-bold truncate w-full text-center mt-1">
                              {fileItem.name}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Progress Stages */}
              {(aiProcessing || extractedItems.length > 0) && (
                <div className="bg-emerald-50/60 dark:bg-slate-800 rounded-2xl p-4 space-y-2 border border-emerald-100 dark:border-slate-700">
                  {AI_STAGES.map((label, idx) => {
                    const done = !aiProcessing || idx < aiStageIndex;
                    const active = aiProcessing && idx === aiStageIndex;
                    return (
                      <div key={label} className="flex items-center gap-2.5 text-sm font-bold">
                        {done ? (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : active ? (
                          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                        )}
                        <span className={done || active ? 'text-slate-900 dark:text-white' : 'text-slate-400'}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {aiError && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 text-xs font-bold text-amber-800 dark:text-amber-200">
                  {aiError}
                </div>
              )}

              {/* Review Extracted Items */}
              {extractedItems.length > 0 && !aiProcessing && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-emerald-100/70 dark:bg-emerald-950/50 rounded-2xl px-4 py-3">
                    <span className="text-sm font-extrabold text-emerald-900 dark:text-emerald-200 tabular-nums">
                      {extractedCategories.length} أقسام، {extractedItems.length} صنف
                    </span>
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      مرتبة تلقائياً بالصور
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {extractedItems.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 rounded-2xl p-2.5 text-sm"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="relative w-12 h-12 rounded-xl bg-emerald-50 dark:bg-slate-900 flex items-center justify-center shrink-0 overflow-hidden">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Utensils className="w-5 h-5 text-emerald-400" />
                            )}
                            {logoUrl && showLogoOnItems && (
                              <img
                                src={logoUrl}
                                alt="شعار"
                                className="w-4 h-4 rounded-full object-cover border border-white absolute top-0.5 right-0.5 bg-white"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold truncate">{item.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {item.category}
                              {item.isOffer ? ' · عرض خاص' : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
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
                            title="تحديد كعرض"
                            className={`px-2 py-1 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 ${
                              item.isOffer
                                ? 'bg-amber-400 text-slate-900'
                                : 'bg-emerald-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
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
                            className="w-20 px-2 py-1 rounded-xl border border-emerald-200 dark:border-slate-600 bg-emerald-50/40 dark:bg-slate-900 text-center font-bold tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setExtractedItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1.5 rounded-xl text-slate-400 hover:text-amber-600"
                            aria-label="حذف الصنف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={savingShop}
                    onClick={() => void handleFinish(false)}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base flex items-center justify-center gap-2"
                  >
                    {savingShop && <Loader2 className="w-5 h-5 animate-spin" />}
                    <span>حفظ وإنهاء الإعداد</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={savingShop || aiProcessing}
                onClick={() => void handleFinish(true)}
                className="w-full py-3 rounded-2xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-emerald-200 dark:border-slate-700 font-bold text-sm"
              >
                {savingShop ? 'جاري إنشاء المتجر...' : 'تخطي إضافة الأصناف يدوياً'}
              </button>
            </div>
          )}

          {/* Step Navigation Footer (Steps 2–5) */}
          {step >= 2 && step <= 5 && (
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-emerald-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 font-bold text-sm inline-flex items-center gap-1.5"
              >
                <ChevronRight className="w-4 h-4" />
                السابق
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm"
              >
                التالي
              </button>
            </div>
          )}

          {step === 6 && (
            <div className="pt-2 border-t border-emerald-100 dark:border-slate-800 flex justify-start">
              <button
                type="button"
                onClick={() => setStep(5)}
                className="px-5 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 font-bold text-xs inline-flex items-center gap-1"
              >
                <ChevronRight className="w-4 h-4" />
                الخطوة السابقة
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
