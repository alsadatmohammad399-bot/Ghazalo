import React, { useState } from 'react';
import {
  Check,
  ExternalLink,
  Languages,
  Mail,
  Menu,
  MessageCircle,
  Minus,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Utensils,
  X,
} from 'lucide-react';
import { GhazaloLogo } from '../components/BrandLogo';
import { AuthFormPanel, type AuthSuccessMeta } from '../components/AuthFormPanel';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { DEMO_PROJECTS } from '../data/demoProjects';
import {
  SUBSCRIPTION_PRICING,
  SUPPORT_CONTACT,
  type DemoProject,
  type DemoRestaurantRecord,
} from '../types';
import { setStoredUiLang, tx, useUiLang } from '../utils/uiLang';

interface LandingPageProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  isAuthenticated: boolean;
  isAdminUser?: boolean;
  onNavigateAuth: (mode: 'signup' | 'login') => void;
  onNavigateDashboard: () => void;
  onOpenAdminPanel?: () => void;
  onOpenDemoMenu: (demo: DemoProject, planName?: string) => void;
  onOpenStoreMenu?: (storeSlug: string) => void;
  onAuthComplete?: (draftMeta: AuthSuccessMeta) => void;
  onStoreLoginSuccess?: (payload: {
    storeSlug: string;
    shopId: string;
    token: string;
    record?: DemoRestaurantRecord | null;
  }) => void;
}

const FEATURES_LIST = [
  {
    titleAr: 'الأكل بالصور والأسعار',
    titleEn: 'Visual Dishes & Clear Pricing',
    descAr: 'منيو واضح وسهل على الموبايل، الزبون يلاقي كل صنف وسعره في ثانية.',
    descEn: 'Crisp mobile menu so guests browse photos, sizes, and prices effortlessly.',
    span: 'md:col-span-3',
  },
  {
    titleAr: 'طلب أونلاين يوصلك على الواتساب',
    titleEn: 'Direct WhatsApp & Dashboard Orders',
    descAr: 'الطلب يجيلك على واتسابك وكاشير المطعم على طول، بدون أي عمولة.',
    descEn: 'Receive complete orders directly on WhatsApp and POS with zero commission.',
    span: 'md:col-span-3',
  },
  {
    titleAr: 'رموز QR لكل ترابيزة',
    titleEn: 'Per-Table QR Ordering',
    descAr: 'اطبع رمز QR لكل طاولة والعميل يطلب مباشرة برقم طاولته.',
    descEn: 'Print a dedicated QR code for every table linked directly to dine-in orders.',
    span: 'md:col-span-2',
  },
  {
    titleAr: 'كاشير POS ورفع بالذكاء الاصطناعي',
    titleEn: 'Integrated POS & AI Menu Import',
    descAr: 'ارفع صورة المنيو والذكاء الاصطناعي يجهز الأصناف والأسعار في دقائق.',
    descEn: 'Upload a menu photo or PDF and structure all categories & prices in minutes.',
    span: 'md:col-span-2',
  },
  {
    titleAr: 'لوحة تحكم تغيّر منها الأسعار في ثانية',
    titleEn: 'Instant Menu & Offer Updates',
    descAr: 'من موبايلك، غيّر سعر، ضيف صنف، أو فعّل عرض خاص فوراً.',
    descEn: 'Edit prices, availability, and special offers anytime straight from your phone.',
    span: 'md:col-span-2',
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    num: '01',
    titleAr: 'سجل بالجيميل أو رقم الموبايل',
    titleEn: 'Register with Gmail & Mobile',
    descAr: 'افتح حساب مطعمك في أقل من دقيقة وأكّد الجيميل بدون بطاقة بنكية.',
    descEn: 'Create your store account in under a minute with Gmail verification.',
  },
  {
    num: '02',
    titleAr: 'ضيف أصنافك وصورك وأسعارك',
    titleEn: 'Upload Menu or Add Dishes',
    descAr: 'ارفع صورة المنيو أو أضف أصنافك بالصور والأسعار والعروض بسهولة.',
    descEn: 'Upload your menu photo for instant AI extraction or add dishes manually.',
  },
  {
    num: '03',
    titleAr: 'خد لينك المنيو وانشره',
    titleEn: 'Share Your Link & QR Code',
    descAr: 'مثال: /menu/kebda-masr — شاركه على واتساب وإنستجرام وعلى الترابيزات.',
    descEn: 'Share /menu/kebda-masr across WhatsApp, social media, and table QR cards.',
    exampleSlug: 'kebda-masr',
  },
];

const MOCKUP_MENU_ITEMS = [
  {
    id: 'm1',
    nameAr: 'ساندوتش كبدة إسكندراني',
    nameEn: 'Alexandrian Liver Sandwich',
    descAr: 'عيش بلدي طازج مع فلفل حار وطحينة',
    descEn: 'Fresh baladi bread with spiced peppers & tahini',
    price: 65,
    image: '/src/assets/images/dish_liver_sausage_1795092514076.jpg',
  },
  {
    id: 'm2',
    nameAr: 'طبق كفتة مشوية على الفحم',
    nameEn: 'Charcoal Grilled Kofta Plate',
    descAr: 'أرز بسمتي وسلطة طحينة وعيش سخن',
    descEn: 'Basmati rice, tahini salad & warm bread',
    price: 140,
    image: '/src/assets/images/dish_kebab_kofta_1795092513923.jpg',
  },
  {
    id: 'm3',
    nameAr: 'موهيتو ليمون ونعناع فريش',
    nameEn: 'Fresh Mint Lemon Mojito',
    descAr: 'مشروب بارد منعش',
    descEn: 'Chilled sparkling mint & lime',
    price: 35,
    image: '/src/assets/images/dish_mint_mojito_1795092514106.jpg',
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
  onOpenStoreMenu,
  onAuthComplete,
  onStoreLoginSuccess,
}) => {
  const { isEn } = useUiLang();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signup' | 'login'>('signup');
  const [selectedPlanPreview, setSelectedPlanPreview] = useState<'monthly' | 'yearly'>('yearly');

  const [mockupCounts, setMockupCounts] = useState<Record<string, number>>({
    m1: 1,
    m2: 0,
    m3: 1,
  });

  const mockupTotal = MOCKUP_MENU_ITEMS.reduce(
    (sum, item) => sum + item.price * (mockupCounts[item.id] || 0),
    0
  );
  const mockupQty = Object.values(mockupCounts).reduce((a, b) => a + b, 0);

  const openSignupModal = () => {
    setAuthModalMode('signup');
    setAuthModalOpen(true);
    setDrawerOpen(false);
  };

  const openLoginModal = () => {
    setAuthModalMode('login');
    setAuthModalOpen(true);
    setDrawerOpen(false);
  };

  const handleOpenDemo = (demo: DemoProject) => {
    const slug = demo.shop.storeSlug || demo.id;
    if (onOpenStoreMenu) {
      onOpenStoreMenu(slug);
      return;
    }
    onOpenDemoMenu(demo);
  };

  const openLiveDemo = () => {
    handleOpenDemo(DEMO_PROJECTS[0]);
  };

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      className="min-h-screen bg-[#FFFFFF] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB]"
    >
      {/* Top Navbar: 3 Clean Zones */}
      <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 dark:bg-[#0F1712]/95 backdrop-blur-md border-b border-[#CFE3D5] dark:border-[#2C3D32]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Ghazalo Brand Logo */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="focus:outline-none whitespace-nowrap shrink-0"
          >
            <GhazaloLogo />
          </button>

          {/* Zone 2: Center Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
            <a
              href="#why-ghazalo"
              className="hover:text-[#15803D] dark:hover:text-[#4ADE80] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {tx(isEn, 'ليه غزالو؟', 'Why Ghazalo?')}
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#15803D] dark:hover:text-[#4ADE80] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {tx(isEn, 'كيف يعمل؟', 'How It Works')}
            </a>
            <a
              href="#pricing"
              className="hover:text-[#15803D] dark:hover:text-[#4ADE80] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {tx(isEn, 'الأسعار والتفعيل', 'Pricing')}
            </a>
            <a
              href="#contact-us"
              className="hover:text-[#15803D] dark:hover:text-[#4ADE80] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {tx(isEn, 'تواصل معانا', 'Contact Us')}
            </a>
          </nav>

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setStoredUiLang(isEn ? 'ar' : 'en')}
              aria-label={tx(isEn, 'تغيير اللغة', 'Switch language')}
              className="hidden sm:inline-flex h-10 px-3 rounded-full border border-[#CFE3D5] dark:border-[#2C3D32] text-[#14201A] dark:text-[#E8F2EB] font-extrabold text-xs items-center gap-1 hover:border-[#15803D] transition-colors whitespace-nowrap shrink-0"
            >
              <Languages className="w-3.5 h-3.5 text-[#15803D]" />
              <span>{isEn ? 'عربي' : 'EN'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label={tx(isEn, 'تبديل المظهر', 'Toggle theme')}
              className="hidden sm:flex w-10 h-10 rounded-full border border-[#CFE3D5] dark:border-[#2C3D32] text-[#4B5B52] dark:text-[#A3B5AA] hover:border-[#15803D] hover:text-[#15803D] items-center justify-center transition-colors shrink-0"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => (isAuthenticated ? onNavigateDashboard() : openLoginModal())}
              className="px-4 h-10 rounded-full border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C] hover:border-[#15803D] text-[#14201A] dark:text-[#E8F2EB] font-extrabold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? tx(isEn, 'لوحة التحكم', 'Dashboard') : tx(isEn, 'دخول', 'Login')}
            </button>

            {!isAuthenticated && (
              <button
                type="button"
                onClick={openSignupModal}
                className="px-4 sm:px-5 h-10 rounded-full bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-xs sm:text-sm shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                {tx(isEn, 'ابدأ مجاناً', 'Start Free')}
              </button>
            )}

            {isAuthenticated && isAdminUser && onOpenAdminPanel && (
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="hidden sm:inline-flex px-3.5 h-10 rounded-full bg-[#14201A] text-white font-bold text-xs items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-4 h-4 text-[#FACC15]" />
                <span>{tx(isEn, 'الإدارة', 'Admin')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={tx(isEn, 'القائمة', 'Menu')}
              className="lg:hidden w-10 h-10 rounded-full border border-[#CFE3D5] dark:border-[#2C3D32] text-[#15803D] flex items-center justify-center shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* GREEN HERO SECTION RIGHT ON ENTRY */}
      <section className="py-10 sm:py-16 lg:py-20 bg-gradient-to-b from-[#DCFCE7] via-[#F6FBF7] to-[#FFFFFF] dark:from-[#173323] dark:via-[#0F1712] dark:to-[#0F1712] border-b border-[#CFE3D5]/70 dark:border-[#2C3D32]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Copy Column */}
          <div className="lg:col-span-6 space-y-6 text-center lg:text-start">
            <div className="flex items-center justify-center lg:justify-start gap-2 text-xs font-extrabold text-[#15803D] dark:text-[#4ADE80]">
              <span>Ghazalo غزالو</span>
              <span aria-hidden="true">·</span>
              <span>{tx(isEn, 'تجربة مجانية 7 أيام', '7-Day Free Trial')}</span>
              <span aria-hidden="true">·</span>
              <span>{tx(isEn, 'بدون عمولة', 'Zero Commission')}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#14201A] dark:text-white leading-[1.28] [text-wrap:balance]">
              {tx(
                isEn,
                'صاحب مطعم أو كافيه؟ المنيو بتاعك لسه PDF على الواتساب؟',
                'Own a Restaurant or Cafe? Still Using a PDF Menu on WhatsApp?'
              )}
            </h1>

            <p className="text-base sm:text-lg font-semibold text-[#14532D] dark:text-[#BBF7D0] leading-relaxed max-w-2xl mx-auto lg:mx-0">
              {tx(
                isEn,
                'زبونك بيكبّر ويصغّر ومش لاقي الأسعار.. وفي الآخر يطلب من غيرك. مع Ghazalo، منيو مطعمك يبقى موقع كامل برابط شايل اسمك مع نظام كاشير وطلبات مباشرة.',
                'Your guests pinch and zoom PDF menus and give up. With Ghazalo, your restaurant gets a fast branded digital menu, WhatsApp ordering, and POS cashier.'
              )}
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3.5 pt-1">
              <button
                type="button"
                onClick={() => (isAuthenticated ? onNavigateDashboard() : openSignupModal())}
                className="px-7 py-4 rounded-full bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-sm sm:text-base shadow-[0_12px_30px_rgba(21,128,61,0.28)] transition-all whitespace-nowrap shrink-0"
              >
                {isAuthenticated
                  ? tx(isEn, 'افتح لوحة التحكم', 'Open Dashboard')
                  : tx(isEn, 'اعمل منيو مطعمك مجاناً - 7 أيام', 'Create Your Menu Free - 7 Days')}
              </button>

              <button
                type="button"
                onClick={openLiveDemo}
                className="px-7 py-4 rounded-full bg-[#FFFFFF] dark:bg-[#18231C] hover:bg-[#DCFCE7] dark:hover:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] border-2 border-[#15803D] font-extrabold text-sm sm:text-base transition-colors whitespace-nowrap shrink-0"
              >
                {tx(isEn, 'شوف نموذج حي', 'View Live Demo')}
              </button>
            </div>

            <p className="text-xs sm:text-sm font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'من غير بطاقة بنكية · تأكيد سريع بالجيميل · بدون عمولة على الطلبات',
                'No Credit Card · Instant Gmail Verification · Zero Order Commission'
              )}
            </p>
          </div>

          {/* Interactive Green Phone Mockup Column */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-[360px] rounded-[36px] bg-[#14201A] p-3 shadow-[0_24px_60px_rgba(21,128,61,0.22)] border-4 border-[#15803D]/30">
              <div className="rounded-[28px] bg-[#FFFFFF] dark:bg-[#18231C] overflow-hidden">
                {/* Phone Top Green Store Banner */}
                <div className="bg-[#15803D] text-white p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <Utensils className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-extrabold text-sm truncate">
                          {tx(isEn, 'كبدة مصر', 'Kebda Masr')}
                        </div>
                        <div className="text-[11px] font-bold text-[#DCFCE7] truncate" dir="ltr">
                          /menu/kebda-masr
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openLiveDemo}
                      className="px-3 py-1 rounded-full bg-white text-[#15803D] text-[11px] font-extrabold shrink-0"
                    >
                      {tx(isEn, 'افتح', 'Open')}
                    </button>
                  </div>
                </div>

                {/* Interactive Menu Items */}
                <div className="p-3.5 space-y-2.5 bg-[#F6FBF7] dark:bg-[#0F1712]">
                  {MOCKUP_MENU_ITEMS.map((item) => {
                    const count = mockupCounts[item.id] || 0;
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] p-2.5 flex items-center gap-2.5"
                      >
                        <img
                          src={item.image}
                          alt={isEn ? item.nameEn : item.nameAr}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-xl object-cover shrink-0 border border-[#CFE3D5]/70"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-extrabold text-xs text-[#14201A] dark:text-[#E8F2EB] truncate">
                            {isEn ? item.nameEn : item.nameAr}
                          </div>
                          <div className="text-[10px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA] truncate">
                            {isEn ? item.descEn : item.descAr}
                          </div>
                          <div className="text-xs font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                            {item.price} {tx(isEn, 'جنيه', 'EGP')}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setMockupCounts((prev) => ({
                                ...prev,
                                [item.id]: Math.max(0, (prev[item.id] || 0) - 1),
                              }))
                            }
                            aria-label="تقليل"
                            className="w-7 h-7 rounded-full border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#173323] text-[#14201A] dark:text-[#E8F2EB] flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-4 text-center text-xs font-extrabold tabular-nums">
                            {count}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setMockupCounts((prev) => ({
                                ...prev,
                                [item.id]: (prev[item.id] || 0) + 1,
                              }))
                            }
                            aria-label="إضافة"
                            className="w-7 h-7 rounded-full bg-[#15803D] text-white flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* WhatsApp Order CTA Inside Phone */}
                <div className="p-3.5 bg-[#FFFFFF] dark:bg-[#18231C] border-t border-[#CFE3D5] dark:border-[#2C3D32]">
                  <button
                    type="button"
                    onClick={openLiveDemo}
                    className="w-full py-3 px-4 rounded-2xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-xs flex items-center justify-between gap-2 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4" />
                      <span>{tx(isEn, 'اطلب على واتساب', 'Order via WhatsApp')}</span>
                    </span>
                    <span className="tabular-nums">
                      {mockupQty > 0
                        ? `${mockupTotal} ${tx(isEn, 'جنيه', 'EGP')}`
                        : tx(isEn, 'جرب المنيو', 'Try Menu')}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE DEMO RESTAURANTS GRID */}
      <section className="py-12 sm:py-16 bg-[#FFFFFF] dark:bg-[#0F1712]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-7">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#14201A] dark:text-white">
              {tx(isEn, 'جرب منيوهات مطاعم وكافيهات حقيقية الآن', 'Try Live Restaurant & Cafe Menus')}
            </h2>
            <p className="text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'افتح أي منيو تجريبي وشاهد تجربة العميل كاملة بدون تسجيل دخول',
                'Open any demo menu and experience customer ordering instantly'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {DEMO_PROJECTS.map((demo) => (
              <div
                key={demo.id}
                className="rounded-3xl p-4 bg-[#F6FBF7] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] flex flex-col justify-between gap-4 hover:border-[#15803D] transition-colors"
              >
                <div className="space-y-3">
                  <div className="h-36 rounded-2xl overflow-hidden bg-[#DCFCE7] dark:bg-[#173323]">
                    <img
                      src={demo.image}
                      alt={demo.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="font-extrabold text-base text-[#14201A] dark:text-white truncate">
                      {demo.shop.nameAr}
                    </div>
                    <div className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA] truncate">
                      {demo.subtitle}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenDemo(demo)}
                  className="w-full py-2.5 px-4 rounded-2xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-xs transition-colors"
                >
                  {tx(isEn, 'افتح المنيو التجريبي', 'Open Demo Menu')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES SECTION: ليه غزالو؟ (5 Cards) */}
      <section
        id="why-ghazalo"
        className="py-14 sm:py-20 bg-[#F6FBF7] dark:bg-[#18231C]/50 border-y border-[#CFE3D5] dark:border-[#2C3D32]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#14201A] dark:text-white [text-wrap:balance]">
              {tx(isEn, 'ليه غزالو؟', 'Why Ghazalo?')}
            </h2>
            <p className="text-sm sm:text-base font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'كل اللي مطعمك محتاجه عشان تحوّل الزائر لطلب فعلي من غير عمولات',
                'Everything your restaurant needs to turn menu views into zero-commission orders'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
            {FEATURES_LIST.map((feat, idx) => (
              <div
                key={feat.titleAr}
                className={`${feat.span} bg-[#FFFFFF] dark:bg-[#18231C] rounded-3xl p-6 sm:p-7 border border-[#CFE3D5] dark:border-[#2C3D32] space-y-3 hover:border-[#15803D] transition-colors`}
              >
                <div className="text-xs font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                  0{idx + 1}.
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-[#14201A] dark:text-white">
                  {tx(isEn, feat.titleAr, feat.titleEn)}
                </h3>
                <p className="text-sm sm:text-base font-medium text-[#4B5B52] dark:text-[#A3B5AA] leading-relaxed">
                  {tx(isEn, feat.descAr, feat.descEn)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS: 3 Steps */}
      <section id="how-it-works" className="py-14 sm:py-20 bg-[#FFFFFF] dark:bg-[#0F1712]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#14201A] dark:text-white">
              {tx(isEn, 'إزاي تبدأ في 3 خطوات؟', 'How to Start in 3 Simple Steps')}
            </h2>
            <p className="text-sm sm:text-base font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'جهّز منيو مطعمك في دقائق واستقبل أول طلب على واتساب اليوم',
                'Set up your restaurant menu in minutes and receive your first order today'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <div
                key={step.num}
                className="rounded-3xl p-6 sm:p-7 bg-[#F6FBF7] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] space-y-3"
              >
                <div className="text-2xl font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                  {step.num}
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-[#14201A] dark:text-white">
                  {tx(isEn, step.titleAr, step.titleEn)}
                </h3>
                <p className="text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA] leading-relaxed">
                  {tx(isEn, step.descAr, step.descEn)}
                </p>
                {step.exampleSlug && (
                  <button
                    type="button"
                    onClick={openLiveDemo}
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#15803D] dark:text-[#4ADE80] hover:underline"
                  >
                    <span>/menu/{step.exampleSlug}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING & ACTIVATION SECTION — MATCHING USER'S SCREENSHOT IN GREEN */}
      <section
        id="pricing"
        className="py-14 sm:py-20 bg-[#F6FBF7] dark:bg-[#18231C]/50 border-t border-[#CFE3D5] dark:border-[#2C3D32]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#14201A] dark:text-white">
              {tx(isEn, 'الاشتراك والتفعيل — غزالو Ghazalo', 'Subscription & Activation — Ghazalo')}
            </h2>
            <p className="text-sm sm:text-base font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'ابدأ مجاناً 7 أيام بكل المميزات بدون عمولة على الطلبات',
                'Start with a 7-day free trial with all features unlocked and zero commission'
              )}
            </p>
          </div>

          {/* Showcase Card modeled directly after the user's screenshot in green theme */}
          <div className="bg-[#FFFFFF] dark:bg-[#18231C] rounded-[28px] p-6 sm:p-8 border border-[#CFE3D5] dark:border-[#2C3D32] shadow-[0_12px_40px_rgba(21,128,61,0.08)] space-y-6">
            <div className="rounded-2xl bg-[#DCFCE7]/70 dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm sm:text-base font-extrabold text-[#14201A] dark:text-[#E8F2EB]">
                  {tx(
                    isEn,
                    'الحالة الحالية: فترة تجريبية مجانية (7 أيام)',
                    'Current Status: 7-Day Free Trial'
                  )}
                </div>
                <div className="text-xs font-bold text-[#14532D] dark:text-[#BBF7D0]">
                  {tx(
                    isEn,
                    'الأيام المتبقية: 7 يوم · بدون بطاقة بنكية وبدون عمولة',
                    '7 days full access · No credit card · Zero commission'
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={openSignupModal}
                className="px-5 py-2.5 rounded-full bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-colors"
              >
                {tx(isEn, 'ابدأ 7 أيام مجاناً', 'Start 7-Day Free Trial')}
              </button>
            </div>

            {/* Monthly & Yearly Plans matching the screenshot layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
              {/* Trial */}
              <div className="rounded-2xl p-5 bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] flex flex-col justify-between gap-4 text-center">
                <div className="space-y-1.5">
                  <div className="text-sm font-extrabold text-[#4B5B52] dark:text-[#A3B5AA]">
                    {tx(isEn, 'فترة تجريبية (7 أيام)', 'Free Trial (7 days)')}
                  </div>
                  <div className="text-2xl font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                    {tx(isEn, '0 جنيه / أسبوع', '0 EGP / 7d')}
                  </div>
                  <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                    {tx(isEn, 'منيو إلكتروني + QR + كاشير POS', 'Digital Menu + QR + Cashier POS')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openSignupModal}
                  className="w-full py-2.5 rounded-full border-2 border-[#15803D] text-[#15803D] dark:text-[#BBF7D0] font-extrabold text-xs hover:bg-[#15803D] hover:text-white transition-colors"
                >
                  {tx(isEn, 'سجّل وابدأ مجاناً', 'Register Free')}
                </button>
              </div>

              {/* Monthly 600 EGP */}
              <button
                type="button"
                onClick={() => setSelectedPlanPreview('monthly')}
                className={`rounded-2xl p-5 flex flex-col justify-between gap-4 text-center transition-all cursor-pointer ${
                  selectedPlanPreview === 'monthly'
                    ? 'bg-[#DCFCE7]/80 dark:bg-[#173323] border-2 border-[#15803D] shadow-sm'
                    : 'bg-[#FFFFFF] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32]'
                }`}
              >
                <div className="space-y-1.5 w-full">
                  <div className="text-sm font-extrabold text-[#4B5B52] dark:text-[#A3B5AA]">
                    {tx(isEn, 'اشتراك شهري (30 يوم)', 'Monthly Plan (30 days)')}
                  </div>
                  <div className="text-2xl font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                    {SUBSCRIPTION_PRICING.MONTHLY_EGP} {tx(isEn, 'جنيه / شهري', 'EGP / month')}
                  </div>
                  <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                    {tx(isEn, 'طلبات غير محدودة بدون أي عمولة', 'Unlimited zero-commission orders')}
                  </p>
                </div>
                <div className="text-xs font-extrabold text-[#15803D] dark:text-[#BBF7D0]">
                  {selectedPlanPreview === 'monthly'
                    ? tx(isEn, '✓ الباقة المحددة', '✓ Selected Plan')
                    : tx(isEn, 'اختيار الباقة الشهرية', 'Select Monthly')}
                </div>
              </button>

              {/* Yearly 3000 EGP with Save 4200 EGP */}
              <button
                type="button"
                onClick={() => setSelectedPlanPreview('yearly')}
                className={`rounded-2xl p-5 flex flex-col justify-between gap-4 text-center transition-all cursor-pointer ${
                  selectedPlanPreview === 'yearly'
                    ? 'bg-[#DCFCE7]/80 dark:bg-[#173323] border-2 border-[#15803D] shadow-sm'
                    : 'bg-[#FFFFFF] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32]'
                }`}
              >
                <div className="space-y-2 w-full">
                  <div className="text-sm font-extrabold text-[#15803D] dark:text-[#4ADE80]">
                    {tx(isEn, 'اشتراك سنوي (365 يوم)', 'Yearly Plan (365 days)')}
                  </div>
                  <div className="text-2xl font-extrabold text-[#15803D] dark:text-[#4ADE80] tabular-nums">
                    {SUBSCRIPTION_PRICING.YEARLY_EGP} {tx(isEn, 'جنيه / سنوي', 'EGP / year')}
                  </div>
                  <div className="inline-block px-3 py-1 rounded-full bg-[#FACC15] text-[#14201A] text-xs font-extrabold">
                    {tx(
                      isEn,
                      `وفّر ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه`,
                      `Save ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} EGP`
                    )}
                  </div>
                </div>
                <div className="text-xs font-extrabold text-[#15803D] dark:text-[#BBF7D0]">
                  {selectedPlanPreview === 'yearly'
                    ? tx(isEn, '✓ الباقة المحددة', '✓ Selected Plan')
                    : tx(isEn, 'اختيار الباقة السنوية', 'Select Yearly')}
                </div>
              </button>
            </div>

            {/* Activation WhatsApp + Gmail buttons matching the screenshot */}
            <div className="pt-2 space-y-3 max-w-xl mx-auto text-center">
              <p className="text-xs sm:text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                {tx(
                  isEn,
                  'لتجديد اشتراكك وتفعيل المنيو فوراً، تواصل مباشرة مع إدارة غزالو عبر واتساب أو الإيميل:',
                  'To activate your monthly or yearly menu subscription immediately, contact Ghazalo via WhatsApp or Gmail:'
                )}
              </p>
              <div className="space-y-2.5">
                <a
                  href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                    `مرحباً إدارة غزالو Ghazalo، أرغب في تفعيل ${
                      selectedPlanPreview === 'monthly'
                        ? `الاشتراك الشهري (${SUBSCRIPTION_PRICING.MONTHLY_EGP} جنيه / 30 يوم)`
                        : `الاشتراك السنوي (${SUBSCRIPTION_PRICING.YEARLY_EGP} جنيه / 365 يوم)`
                    }`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3.5 px-5 rounded-full bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>
                    {tx(isEn, 'تواصل للتفعيل واتساب:', 'Activate via WhatsApp:')}{' '}
                    <span dir="ltr" className="tabular-nums">
                      {SUPPORT_CONTACT.PHONE_DISPLAY}
                    </span>
                  </span>
                </a>
                <a
                  href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${encodeURIComponent(
                    'استفسار / تفعيل منيو - Ghazalo'
                  )}`}
                  className="w-full py-3 px-5 rounded-full bg-[#FFFFFF] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D] text-[#15803D] dark:text-[#BBF7D0] font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
                </a>
              </div>
            </div>
          </div>

          <PWAInstallButton variant="card" />
        </div>
      </section>

      {/* CONTACT US + CLEAN FOOTER */}
      <footer
        id="contact-us"
        className="bg-[#FFFFFF] dark:bg-[#0F1712] border-t border-[#CFE3D5] dark:border-[#2C3D32] py-10"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-start">
            <GhazaloLogo />
            <span className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(
                isEn,
                'منصة غزالو Ghazalo للمنيو الإلكتروني والكاشير بدون عمولة',
                'Ghazalo Digital Menu & Zero-Commission POS Platform'
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-extrabold">
            <a
              href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[#15803D] dark:text-[#4ADE80] hover:underline"
            >
              <MessageCircle className="w-4 h-4" />
              <span dir="ltr">{SUPPORT_CONTACT.PHONE_DISPLAY}</span>
            </a>
            <a
              href={`mailto:${SUPPORT_CONTACT.EMAIL}`}
              className="inline-flex items-center gap-1.5 text-[#15803D] dark:text-[#4ADE80] hover:underline"
            >
              <Mail className="w-4 h-4" />
              <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
            </a>
            <button
              type="button"
              onClick={openLoginModal}
              className="text-[#14201A] dark:text-[#E8F2EB] hover:text-[#15803D] underline"
            >
              {tx(isEn, 'دخول المطاعم', 'Store Login')}
            </button>
          </div>
        </div>
      </footer>

      {/* MOBILE DRAWER */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#14201A]/50 backdrop-blur-xs lg:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`fixed top-0 bottom-0 ${
              isEn ? 'left-0' : 'right-0'
            } w-72 bg-[#FFFFFF] dark:bg-[#18231C] p-5 flex flex-col justify-between shadow-2xl border-[#CFE3D5] dark:border-[#2C3D32]`}
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <GhazaloLogo />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-9 h-9 rounded-xl border border-[#CFE3D5] dark:border-[#2C3D32] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="flex flex-col gap-2 text-sm font-extrabold">
                <a
                  href="#why-ghazalo"
                  onClick={() => setDrawerOpen(false)}
                  className="px-3 py-2.5 rounded-xl hover:bg-[#DCFCE7] dark:hover:bg-[#173323]"
                >
                  {tx(isEn, 'ليه غزالو؟', 'Why Ghazalo?')}
                </a>
                <a
                  href="#how-it-works"
                  onClick={() => setDrawerOpen(false)}
                  className="px-3 py-2.5 rounded-xl hover:bg-[#DCFCE7] dark:hover:bg-[#173323]"
                >
                  {tx(isEn, 'كيف يعمل؟', 'How It Works')}
                </a>
                <a
                  href="#pricing"
                  onClick={() => setDrawerOpen(false)}
                  className="px-3 py-2.5 rounded-xl hover:bg-[#DCFCE7] dark:hover:bg-[#173323]"
                >
                  {tx(isEn, 'الأسعار والتفعيل', 'Pricing')}
                </a>
                <a
                  href="#contact-us"
                  onClick={() => setDrawerOpen(false)}
                  className="px-3 py-2.5 rounded-xl hover:bg-[#DCFCE7] dark:hover:bg-[#173323]"
                >
                  {tx(isEn, 'تواصل معانا', 'Contact Us')}
                </a>
              </nav>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={openLoginModal}
                className="sf-btn w-full text-sm"
              >
                {tx(isEn, 'دخول', 'Login')}
              </button>
              <button
                type="button"
                onClick={openSignupModal}
                className="sf-btn-primary w-full text-sm"
              >
                {tx(isEn, 'ابدأ 7 أيام مجاناً', 'Start 7 Days Free')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNIFIED AUTH MODAL */}
      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#14201A]/60 backdrop-blur-xs"
          onClick={() => setAuthModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#F6FBF7] dark:bg-[#0F1712] rounded-t-[24px] sm:rounded-[24px] max-w-[540px] w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 border border-[#CFE3D5] dark:border-[#2C3D32] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <GhazaloLogo />
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="w-10 h-10 rounded-[14px] bg-[#FFFFFF] dark:bg-[#18231C] border-[1.5px] border-[#CFE3D5] dark:border-[#2C3D32] flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <AuthFormPanel
              compact
              mode={authModalMode}
              onModeChange={setAuthModalMode}
              onAuthComplete={(meta) => {
                setAuthModalOpen(false);
                if (onAuthComplete) {
                  onAuthComplete(meta);
                } else {
                  onNavigateAuth(authModalMode);
                }
              }}
              onStoreLoginSuccess={(payload) => {
                setAuthModalOpen(false);
                onStoreLoginSuccess?.(payload);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
