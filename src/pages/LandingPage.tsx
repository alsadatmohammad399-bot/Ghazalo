import React, { useState } from 'react';
import {
  ChevronDown,
  Menu,
  Moon,
  Sun,
  User,
  X,
  QrCode,
  ShoppingBag,
  Monitor,
  Boxes,
  TrendingUp,
  ShieldCheck,
  Users,
  Check,
  MessageCircle,
  Sparkles,
  Phone,
  Mail,
  ArrowLeft,
} from 'lucide-react';
import { GhazaloLogo } from '../components/BrandLogo';
import { DEMO_PROJECTS } from '../data/demoProjects';
import { QrCodeImage, downloadQrPng, downloadQrSvg, downloadQrPdf } from '../components/QrToolkit';
import type { DemoProject } from '../types';

interface LandingPageProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  isAuthenticated: boolean;
  isAdminUser?: boolean;
  onNavigateAuth: (mode: 'signup' | 'login') => void;
  onNavigateDashboard: () => void;
  onOpenAdminPanel?: () => void;
  onOpenDemoMenu: (demo: DemoProject, planName?: string) => void;
}

const FEATURE_CARDS = [
  {
    title: 'الطلب من الطاولة',
    desc: 'العميل يمسح رمز QR على الطاولة ويطلب مباشرة دون انتظار الويتر.',
    icon: QrCode,
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconBg: 'bg-emerald-600 text-white',
    border: 'border-emerald-100 dark:border-emerald-900/60',
  },
  {
    title: 'كاشير لا يتوقف',
    desc: 'نقطة بيع سريعة تدعم الصالة والتيك أواي والدليفري وحساب الضريبة والخدمة بدقة.',
    icon: Monitor,
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    iconBg: 'bg-amber-500 text-white',
    border: 'border-amber-100 dark:border-amber-900/50',
  },
  {
    title: 'مخزون يخصم تلقائياً',
    desc: 'راقب الكميات المتاحة وأوقف الأصناف المنتهية بضغطة زر لحظياً.',
    icon: Boxes,
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    iconBg: 'bg-teal-600 text-white',
    border: 'border-teal-100 dark:border-teal-900/50',
  },
  {
    title: 'الربح والخسارة',
    desc: 'ملخص فوري لمبيعات اليوم وعدد الطلبات وأكثر الأقسام مبيعاً.',
    icon: TrendingUp,
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    iconBg: 'bg-sky-600 text-white',
    border: 'border-sky-100 dark:border-sky-900/50',
  },
  {
    title: 'صلاحيات ونقدية',
    desc: 'فصل كامل بين كاشير الصالة وطلبات المنيو مع تسجيل المبالغ المدفوعة.',
    icon: ShieldCheck,
    bg: 'bg-lime-50 dark:bg-lime-950/30',
    iconBg: 'bg-lime-600 text-white',
    border: 'border-lime-100 dark:border-lime-900/50',
  },
  {
    title: 'عملاء يعودون',
    desc: 'قائمة سريعة وتجربة طلب سلسة تشجع عملاءك على تكرار الطلب بدون عمولة.',
    icon: Users,
    bg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    iconBg: 'bg-emerald-700 text-white',
    border: 'border-emerald-100 dark:border-emerald-900/50',
  },
];

const PRICING_PLANS = [
  {
    id: 'starter',
    name: 'بداية (7 أيام مجاناً)',
    monthlyPrice: 0,
    yearlyTotal: 0,
    periodLabel: 'تجربة مجانية كاملة',
    subtitle: 'ابدأ فوراً وصوّر المنيو لتجربة كل المزايا 7 أيام',
    highlighted: false,
    features: [
      'تجربة كاملة لمدة 7 أيام بدون بطاقة',
      'رفع عدة صور للمنيو بالذكاء الاصطناعي',
      'إضافة صور حقيقية وترتيب ذكي للأصناف',
      'قوالب متعددة وإضافة لوجو على الأصناف',
    ],
  },
  {
    id: 'monthly',
    name: 'الباقة الشهرية المتكاملة',
    monthlyPrice: 600,
    yearlyTotal: 6000,
    periodLabel: '/ شهرياً',
    subtitle: 'اشتراك شهري شامل المنيو والكاشير والعروض',
    highlighted: true,
    features: [
      'تجديد شهري مرن بـ 600 ج فقط',
      'استقبال طلبات غير محدود بدون عمولة',
      'قائمة عروض خاصة وتصميم القالب باللوجو',
      'نظام كاشير POS ورموز طاولات QR',
    ],
  },
  {
    id: 'yearly',
    name: 'الباقة السنوية الشاملة',
    monthlyPrice: 600,
    yearlyTotal: 6000,
    forceAnnual: true,
    periodLabel: '/ سنوياً',
    subtitle: 'سنة كاملة بـ 6,000 ج بدلاً من 7,200 ج (شهرين مجاناً)',
    highlighted: false,
    features: [
      'توفير 1,200 جنيه سنوياً مقارنة بالاشتراك الشهري',
      'تفعيل فوري لمدة 365 يوماً بعد المراجعة',
      'أولوية في الدعم الفني والتحديثات',
      'كافة القوالب والأزرار الزجاجية والعروض',
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: 'هل أحتاج أدخل المنيو صنف صنف؟',
    a: 'لا إطلاقاً! ارفع عدة صور للمنيو الورقي أو ملف PDF أو Excel دفعة واحدة، وسيقوم الذكاء الاصطناعي بقراءة الأقسام وترتيبها وإضافة صور حقيقية للأصناف في دقائق.',
  },
  {
    q: 'هل أحتاج بطاقة ائتمان؟',
    a: 'لا، تبدأ تجربتك المجانية لمدة 7 أيام بدون إدخال أي بيانات بطاقة وبدون أي خصم تلقائي.',
  },
  {
    q: 'ماذا يحدث بعد 7 أيام؟',
    a: 'تبقى بياناتك وأصنافك محفوظة تماماً، ويتوقف الحساب لحين اختيار الباقة (600 ج شهرياً أو 6,000 ج سنوياً) وتأكيد التفعيل من الإدارة.',
  },
  {
    q: 'هل يمكن للعملاء الطلب من المنيو؟',
    a: 'نعم، يدعم المنيو استقبال الطلبات للتوصيل أو الاستلام من الفرع أو الطلب من الطاولة مباشرة مع إرسال الطلب فوراً للوحة التحكم بدون أي عمولة.',
  },
  {
    q: 'موظفيني ليسوا تقنيين هل هيعرفوا يستخدموه؟',
    a: 'نعم، تم تصميم شاشة الكاشير ولوحة التحكم باللغة العربية بالكامل وبخطوات واضحة وبسيطة لا تحتاج لأي خبرة تقنية سابقة.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  darkMode,
  onToggleDarkMode,
  isAuthenticated,
  isAdminUser = false,
  onNavigateAuth,
  onNavigateDashboard,
  onOpenAdminPanel,
  onOpenDemoMenu,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [annualBilling, setAnnualBilling] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [qrToolOpen, setQrToolOpen] = useState(false);
  const [qrToolUrl, setQrToolUrl] = useState('https://ghazalo.app/menu/demo');
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'refund' | null>(null);

  return (
    <div dir="rtl" className="min-h-screen bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-emerald-100/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-right focus:outline-none"
          >
            <GhazaloLogo />
          </button>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-bold text-slate-600 dark:text-slate-300">
            <a href="#demos" className="hover:text-emerald-600 transition-colors whitespace-nowrap">
              نماذج المنيو
            </a>
            <a href="#features" className="hover:text-emerald-600 transition-colors whitespace-nowrap">
              المزايا
            </a>
            <a href="#pricing" className="hover:text-emerald-600 transition-colors whitespace-nowrap">
              الأسعار
            </a>
            <a href="#faq" className="hover:text-emerald-600 transition-colors whitespace-nowrap">
              الأسئلة الشائعة
            </a>
          </nav>

          {/* Login / Admin quick actions + 3 icons on left */}
          <div className="flex items-center gap-2 shrink-0">
            {isAuthenticated && isAdminUser && onOpenAdminPanel && (
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="px-3.5 h-9 rounded-full glass-btn-amber font-extrabold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>بوابة الإدارة</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => (isAuthenticated ? onNavigateDashboard() : onNavigateAuth('login'))}
              className="px-3.5 h-9 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 font-extrabold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5" />
              <span>{isAuthenticated ? 'لوحة التحكم' : 'تسجيل الدخول'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label="تبديل المظهر"
              className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => (isAuthenticated ? onNavigateDashboard() : onNavigateAuth('login'))}
              aria-label="حسابي"
              className="hidden sm:flex w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-slate-700 items-center justify-center transition-colors"
            >
              <User className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="القائمة"
              className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sticky 2-button bar directly below header with glassmorphic styling */}
        <div className="bg-emerald-50/80 dark:bg-slate-900/90 border-t border-emerald-100/80 dark:border-slate-800 py-2 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setContactModalOpen(true)}
              className="flex-1 sm:flex-none sm:px-7 h-10 rounded-full glass-btn-primary font-bold text-sm whitespace-nowrap"
            >
              تواصل معنا
            </button>
            <button
              type="button"
              onClick={() => (isAuthenticated ? onNavigateDashboard() : onNavigateAuth('signup'))}
              className="flex-1 sm:flex-none sm:px-7 h-10 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 font-bold text-sm whitespace-nowrap"
            >
              {isAuthenticated ? 'لوحة التحكم' : 'جرّب 7 أيام مجاناً'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-emerald-50/60 via-white to-white dark:from-slate-900 dark:via-slate-950 dark:to-slate-950 py-10 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 space-y-5 text-center lg:text-right">
            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white leading-tight [text-wrap:balance]">
              استقبل طلباتك من المنيو الإلكتروني بدون عمولة
            </h1>
            <p className="text-base sm:text-lg font-medium text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
              ارفع صور المنيو والذكاء الاصطناعي هيعملها في دقائق بالترتيب والصور، ثم شاركها برمز QR
            </p>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2">
              <button
                type="button"
                onClick={() => (isAuthenticated ? onNavigateDashboard() : onNavigateAuth('signup'))}
                className="px-7 py-3.5 rounded-full glass-btn-primary font-bold text-base whitespace-nowrap"
              >
                ابدأ تجربة 7 أيام مجاناً
              </button>
              <a
                href="#demos"
                className="px-6 py-3.5 rounded-full glass-btn text-emerald-700 dark:text-emerald-300 font-bold text-base whitespace-nowrap"
              >
                شاهد منيو تجريبي
              </a>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-2.5 border border-emerald-100 dark:border-slate-800 shadow-sm">
              <img
                src="/src/assets/images/hero_qr_merchant_1795080804619.jpg"
                alt="صاحب مطعم يحمل هاتفاً يعرض المنيو الإلكتروني وبجانبه رمز QR"
                referrerPolicy="no-referrer"
                className="w-full h-64 sm:h-96 object-cover rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Proof Numbers */}
      <section className="py-6 sm:py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-emerald-50/70 dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-emerald-100 dark:border-slate-800 text-center">
            <div className="text-3xl sm:text-4xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
              7,500+
            </div>
            <p className="mt-1.5 text-base font-bold text-slate-700 dark:text-slate-200">
              طلب في آخر 30 يوم
            </p>
          </div>
          <div className="bg-emerald-50/70 dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-emerald-100 dark:border-slate-800 text-center">
            <div className="text-3xl sm:text-4xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
              150,000+
            </div>
            <p className="mt-1.5 text-base font-bold text-slate-700 dark:text-slate-200">
              زيارة للمنيوهات
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: 8 Project Types + Demo Menus */}
      <section id="demos" className="py-12 sm:py-16 bg-emerald-50/40 dark:bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white [text-wrap:balance]">
              اختر نوع مشروعك وشاهد منيو تجريبي
            </h2>
            <p className="text-sm sm:text-base font-medium text-slate-600 dark:text-slate-300">
              تصفح تجربة العميل الكاملة بالطلب والسلة لأي نشاط خلال ثوانٍ
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {DEMO_PROJECTS.map((demo) => (
              <div
                key={demo.id}
                className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-emerald-100 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-4 hover:border-emerald-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-2xl bg-emerald-50 dark:bg-slate-800">
                    <img
                      src={demo.image}
                      alt={demo.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {demo.title}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                      {demo.subtitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenDemoMenu(demo)}
                  className="w-full py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors whitespace-nowrap"
                >
                  افتح المنيو التجريبي
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: 6 Colored Feature Cards */}
      <section id="features" className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center max-w-3xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white [text-wrap:balance]">
              أكثر من منيو: الطلبات والكاشير والمخزون في نظام واحد
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className={`${card.bg} rounded-3xl p-6 border ${card.border} space-y-3`}
                >
                  <div className={`w-12 h-12 rounded-2xl ${card.iconBg} flex items-center justify-center shadow-xs`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {card.title}
                  </h3>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 5: Pricing */}
      <section id="pricing" className="py-12 sm:py-16 bg-emerald-50/40 dark:bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              خطط أسعار تناسب حجم مشروعك
            </h2>

            {/* Toggle شهري / سنوي وفّر 20% */}
            <div className="inline-flex items-center gap-1 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setAnnualBilling(false)}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors whitespace-nowrap ${
                  !annualBilling
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700'
                }`}
              >
                شهري
              </button>
              <button
                type="button"
                onClick={() => setAnnualBilling(true)}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors whitespace-nowrap ${
                  annualBilling
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700'
                }`}
              >
                سنوي (شهرين مجاناً)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch max-w-5xl mx-auto">
            {PRICING_PLANS.map((plan) => {
              const showAnnual = Boolean(plan.forceAnnual || (annualBilling && plan.yearlyTotal > 0));
              const displayPrice =
                plan.monthlyPrice === 0
                  ? 0
                  : showAnnual
                    ? plan.yearlyTotal
                    : plan.monthlyPrice;
              const periodText =
                plan.monthlyPrice === 0
                  ? 'لأول 7 أيام'
                  : showAnnual
                    ? '/ سنوياً (365 يوم)'
                    : '/ شهرياً (30 يوم)';

              return (
                <div
                  key={plan.id}
                  className={`rounded-3xl p-6 flex flex-col justify-between gap-6 border transition-transform ${
                    plan.highlighted
                      ? 'bg-[#0F291E] text-white border-emerald-700 shadow-lg'
                      : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-emerald-100 dark:border-slate-800 shadow-xs'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xl font-extrabold">{plan.name}</h3>
                        {plan.highlighted && (
                          <span className="text-xs font-bold text-emerald-300">الأكثر طلباً</span>
                        )}
                      </div>
                      <p
                        className={`text-xs font-medium ${
                          plan.highlighted ? 'text-emerald-100/80' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {plan.subtitle}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-3xl font-extrabold">
                        {displayPrice === 0 ? 'مجاناً' : `${displayPrice.toLocaleString('en-US')} ج`}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          plan.highlighted ? 'text-emerald-200' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {periodText}
                      </span>
                    </div>

                    <ul className="space-y-2.5 text-sm font-medium">
                      {plan.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2">
                          <Check
                            className={`w-4 h-4 mt-1 shrink-0 ${
                              plan.highlighted ? 'text-emerald-400' : 'text-emerald-600'
                            }`}
                          />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('signup')}
                      className={`w-full py-3 px-4 rounded-full font-bold text-sm transition-colors whitespace-nowrap ${
                        plan.highlighted
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-[#0F291E] shadow-md'
                          : 'glass-btn-primary'
                      }`}
                    >
                      ابدأ تجربة 7 أيام مجاناً
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDemoMenu(DEMO_PROJECTS[0], plan.name)}
                      className={`w-full py-3 px-4 rounded-full font-bold text-sm border transition-colors whitespace-nowrap ${
                        plan.highlighted
                          ? 'bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md'
                          : 'glass-btn text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      شاهد المنيو بهذه الباقة
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 6: FAQ */}
      <section id="faq" className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-slate-900 dark:text-white">
            الأسئلة الشائعة
          </h2>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={item.q}
                  className="bg-white dark:bg-slate-900 rounded-3xl border border-emerald-100 dark:border-slate-800 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="w-full px-6 py-4 flex items-center justify-between gap-4 text-right font-extrabold text-slate-900 dark:text-white"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-emerald-600 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Last Section: Big Green CTA Card */}
      <section className="py-8 sm:py-14 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto bg-emerald-600 rounded-3xl p-8 sm:p-12 text-center text-white space-y-5 shadow-md">
          <h2 className="text-2xl sm:text-4xl font-extrabold [text-wrap:balance]">
            صوّر المنيو الآن، وابدأ اليوم
          </h2>
          <div>
            <button
              type="button"
              onClick={() => (isAuthenticated ? onNavigateDashboard() : onNavigateAuth('signup'))}
              className="px-8 py-4 rounded-2xl bg-[#0F291E] hover:bg-[#173d2d] text-white font-extrabold text-base shadow-sm transition-colors whitespace-nowrap"
            >
              ابدأ تجربة 7 أيام مجاناً بكل المزايا
            </button>
          </div>
          <p className="text-sm font-semibold text-emerald-50">
            بدون بطاقة، بدون خصم تلقائي، بياناتك محفوظة
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-emerald-50/60 dark:bg-slate-900 border-t border-emerald-100 dark:border-slate-800 py-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <GhazaloLogo />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
              منصة Ghazalo العربية للمطاعم والمتاجر لإنشاء المنيو الإلكتروني واستقبال الطلبات بدون عمولة.
            </p>
          </div>

          <div className="space-y-2.5 text-sm font-bold">
            <div className="text-slate-900 dark:text-white mb-3">المنتج</div>
            <a href="#features" className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600">
              المزايا
            </a>
            <button
              type="button"
              onClick={() => onNavigateAuth('signup')}
              className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600"
            >
              رفع المنيو بالذكاء الاصطناعي
            </button>
            <a href="#pricing" className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600">
              الأسعار
            </a>
            <a href="#demos" className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600">
              نماذج المنيو
            </a>
            <button
              type="button"
              onClick={() => setQrToolOpen(true)}
              className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600"
            >
              أداة QR
            </button>
            <a href="#faq" className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600">
              الأسئلة الشائعة
            </a>
          </div>

          <div className="space-y-2.5 text-sm font-bold">
            <div className="text-slate-900 dark:text-white mb-3">القانونية</div>
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600"
            >
              سياسة الخصوصية
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600"
            >
              شروط الاستخدام
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('refund')}
              className="block text-slate-600 dark:text-slate-300 hover:text-emerald-600"
            >
              سياسة الاسترجاع
            </button>
          </div>

          <div className="space-y-2.5 text-sm font-bold">
            <div className="text-slate-900 dark:text-white mb-3">تواصل معنا</div>
            <button
              type="button"
              onClick={() => setContactModalOpen(true)}
              className="block text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              تواصل معنا مباشرة
            </button>
            <a
              href="mailto:support@ghazalo.app"
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600"
            >
              <Mail className="w-4 h-4 text-emerald-600" />
              <span>support@ghazalo.app</span>
            </a>
            <a
              href="tel:+201000000000"
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600 tabular-nums"
              dir="ltr"
            >
              <Phone className="w-4 h-4 text-emerald-600" />
              <span>+20 100 000 0000</span>
            </a>
          </div>
        </div>
      </footer>

      {/* Side Drawer Menu */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 w-80 max-w-[85vw] bg-white dark:bg-slate-900 h-full p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <GhazaloLogo />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-2 text-base font-bold">
                <a
                  href="#demos"
                  onClick={() => setDrawerOpen(false)}
                  className="block px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800"
                >
                  نماذج المنيو التجريبية
                </a>
                <a
                  href="#features"
                  onClick={() => setDrawerOpen(false)}
                  className="block px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800"
                >
                  المزايا والكاشير
                </a>
                <a
                  href="#pricing"
                  onClick={() => setDrawerOpen(false)}
                  className="block px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800"
                >
                  الأسعار والباقات
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setQrToolOpen(true);
                  }}
                  className="w-full text-right px-4 py-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-slate-800"
                >
                  أداة QR المجانية
                </button>
              </div>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onNavigateAuth('signup');
                }}
                className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
              >
                جرّب 7 أيام مجاناً
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onNavigateAuth('login');
                }}
                className="w-full py-3 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 font-bold text-sm"
              >
                تسجيل الدخول
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-5 border border-emerald-100 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">تواصل معنا</h3>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              فريق Ghazalo جاهز لمساعدتك في رفع منيوك وإعداد الكاشير خلال دقائق.
            </p>
            <div className="space-y-3">
              <a
                href="https://wa.me/201000000000"
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                تواصل عبر واتساب
              </a>
              <a
                href="mailto:support@ghazalo.app"
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-50 dark:bg-slate-800 text-emerald-800 dark:text-emerald-200 font-bold text-sm flex items-center justify-center gap-2"
              >
                <Mail className="w-5 h-5" />
                support@ghazalo.app
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Free QR Tool Modal */}
      {qrToolOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-5 border border-emerald-100 dark:border-slate-800 shadow-xl text-center">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">أداة إنشاء رمز QR</h3>
              <button
                type="button"
                onClick={() => setQrToolOpen(false)}
                className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="url"
              dir="ltr"
              value={qrToolUrl}
              onChange={(e) => setQrToolUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-emerald-50/30 dark:bg-slate-800 text-sm font-semibold"
              placeholder="https://..."
            />
            <div className="flex justify-center">
              <QrCodeImage value={qrToolUrl || 'https://ghazalo.app'} size={190} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void downloadQrPng(qrToolUrl)}
                className="py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
              >
                PNG
              </button>
              <button
                type="button"
                onClick={() => void downloadQrSvg(qrToolUrl)}
                className="py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 font-bold text-sm"
              >
                SVG
              </button>
              <button
                type="button"
                onClick={() => void downloadQrPdf(qrToolUrl, 'Ghazalo QR')}
                className="py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 font-bold text-sm"
              >
                PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-emerald-100 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">
                {legalModal === 'privacy'
                  ? 'سياسة الخصوصية'
                  : legalModal === 'terms'
                    ? 'شروط الاستخدام'
                    : 'سياسة الاسترجاع'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
              {legalModal === 'privacy'
                ? 'نلتزم في منصة Ghazalo بحماية بيانات نشاطك التجاري وطلبات عملائك بأعلى معايير الأمان، ولا تتم مشاركة بياناتك مع أي طرف ثالث.'
                : legalModal === 'terms'
                  ? 'يُمنح كل متجر فترة تجريبية مجانية لمدة 7 أيام كاملة بدون قيود، ويتم تجديد الاشتراك يدوياً أو عبر التواصل مع الإدارة حسب الباقة المختارة.'
                  : 'يمكنك إلغاء الاشتراك أو طلب استرجاع المبلغ خلال 14 يوماً من تاريخ التفعيل في حال عدم رضاك عن الخدمة.'}
            </p>
            <button
              type="button"
              onClick={() => setLegalModal(null)}
              className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
            >
              فهمت
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
