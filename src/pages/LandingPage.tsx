import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  Minus,
  Phone,
  ShieldCheck,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { GhazaloLogo } from '../components/BrandLogo';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { DEMO_PROJECTS } from '../data/demoProjects';
import { SUPPORT_CONTACT, type DemoProject, type DemoRestaurantRecord } from '../types';
import { phoneToAuthEmail, toAsciiDigits } from '../utils/authHelpers';
import {
  copyMenuLink,
  getAbsoluteMenuUrl,
  getWhatsAppShareUrl,
  syncPublicStoreSnapshot,
} from '../utils/menuLink';
import {
  findLocalRestaurantByIdentifier,
  findLocalUserByEmailOrPhone,
  getLocalRestaurants,
  getLocalUsers,
  normalizeEgyptianPhone,
  registerDemoAccount,
  saveLocalRestaurants,
  saveLocalUsers,
  setAuthSessionStorage,
  setGhazaloUser,
  type GhazaloUserSession,
} from '../utils/storeRegistry';

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
  onStoreLoginSuccess?: (payload: {
    storeSlug: string;
    shopId: string;
    token: string;
    record?: DemoRestaurantRecord | null;
    userSession?: GhazaloUserSession;
  }) => void;
}

const FEATURES_LIST = [
  {
    emoji: '🍔',
    title: 'الأكل بالصور والأسعار',
    desc: 'منيو واضح وسهل، الزبون يلاقي كل حاجة في ثانية',
    span: 'md:col-span-3',
  },
  {
    emoji: '🛒',
    title: 'طلب أونلاين يوصلك على الواتساب',
    desc: 'الطلب يجيلك على واتسابك على طول، من غير عمولة',
    span: 'md:col-span-3',
  },
  {
    emoji: '📅',
    title: 'حجز ترابيزات بضغطة',
    desc: 'الزبون يحجز ترابيزته من المنيو نفسه',
    span: 'md:col-span-2',
  },
  {
    emoji: '⭐',
    title: 'تقييمات عملاءك وداتا ترجعلهم بيها',
    desc: 'شوف ارقام عملاءك وابعتلهم عروض',
    span: 'md:col-span-2',
  },
  {
    emoji: '📱',
    title: 'لوحة تحكم تغيّر منها الأسعار والعروض في ثانية',
    desc: 'من موبايلك، غير سعر، ضيف صنف، وقف صنف',
    span: 'md:col-span-2',
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    num: '01',
    title: 'سجل بالايميل او رقم الموبايل',
    desc: 'افتح حساب مطعمك في أقل من دقيقة بدون بطاقة بنكية.',
  },
  {
    num: '02',
    title: 'ضيف اصنافك وصورك واسعارك',
    desc: 'رتّب أقسام المنيو بالصور والأسعار والعروض بسهولة من موبايلك.',
  },
  {
    num: '03',
    title: 'خد لينك المنيو وانشره',
    desc: 'مثال: /menu/kebda-masr — شاركه على واتساب وإنستجرام وعلى الترابيزات.',
    exampleSlug: 'kebda-masr',
  },
];

const MOCKUP_MENU_ITEMS = [
  {
    id: 'm1',
    name: 'ساندوتش كبدة إسكندراني',
    desc: 'عيش بلدي طازج مع فلفل حار وطحينة',
    price: 65,
    image: '/src/assets/images/dish_liver_sausage_1795092514076.jpg',
  },
  {
    id: 'm2',
    name: 'طبق كفتة مشوية على الفحم',
    desc: 'أرز بسمتي وسلطة طحينة وعيش سخن',
    price: 140,
    image: '/src/assets/images/dish_kebab_kofta_1795092513923.jpg',
  },
  {
    id: 'm3',
    name: 'موهيتو ليمون ونعناع فريش',
    desc: 'مشروب بارد منعش',
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
  onStoreLoginSuccess,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Interactive Phone Mockup Cart State
  const [mockupCounts, setMockupCounts] = useState<Record<string, number>>({
    m1: 1,
    m2: 0,
    m3: 1,
  });

  // Modals: Signup | Login | Forgot Password
  const [signupModalOpen, setSignupModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'trial' | 'monthly' | 'yearly'>('trial');
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  // Signup Form State
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupSuccessData, setSignupSuccessData] = useState<{
    storeSlug: string;
    shopId: string;
    token: string;
    record?: DemoRestaurantRecord | null;
  } | null>(null);
  const [copiedNewLink, setCopiedNewLink] = useState(false);

  // Login Form State (Email OR Phone ONLY)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Forgot Password State (2-Step: Email/Phone + 6-digit Admin Code)
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [showForgotPass, setShowForgotPass] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  const mockupTotal = MOCKUP_MENU_ITEMS.reduce(
    (sum, item) => sum + item.price * (mockupCounts[item.id] || 0),
    0
  );
  const mockupQty = Object.values(mockupCounts).reduce((a, b) => a + b, 0);

  const openSignupModal = (plan: 'trial' | 'monthly' | 'yearly' = 'trial') => {
    setSelectedPlan(plan);
    setSignupError('');
    setSignupSuccessData(null);
    setCopiedNewLink(false);
    setSignupModalOpen(true);
    setLoginModalOpen(false);
  };

  const openLoginModal = () => {
    setLoginError('');
    setLoginModalOpen(true);
    setSignupModalOpen(false);
  };

  const openForgotModal = () => {
    setForgotError('');
    setForgotSuccess('');
    setForgotStep(1);
    setForgotIdentifier(loginIdentifier || '');
    setForgotCode('');
    setForgotNewPass('');
    setForgotConfirmPass('');
    setForgotModalOpen(true);
  };

  const openLiveDemo = () => {
    if (onOpenStoreMenu) {
      onOpenStoreMenu('mshwyat-al-ghazal');
      return;
    }
    onOpenDemoMenu(DEMO_PROJECTS[0]);
  };

  const handleModalGoogleLogin = async () => {
    setLoginError('');
    setLoginLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const u = cred.user;
      const userSession: GhazaloUserSession = {
        uid: u.uid,
        name: u.displayName || u.email?.split('@')[0] || 'مستخدم جوجل',
        email: u.email || '',
        phone: u.phoneNumber || '',
        photo: u.photoURL || '',
        isGuest: false,
        loginMethod: 'google',
      };
      const token = `fb-google-${u.uid}-${Date.now()}`;
      setGhazaloUser(userSession);
      setAuthSessionStorage('mshwyat-al-ghazal', token);
      setLoginModalOpen(false);
      onStoreLoginSuccess?.({
        storeSlug: 'mshwyat-al-ghazal',
        shopId: 'mshwyat-al-ghazal',
        token,
        userSession,
      });
    } catch {
      setLoginError('تعذر تسجيل الدخول بجوجل هنا. يمكنك الدخول برقم الموبايل أو كضيف.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleModalGuestLogin = () => {
    const userSession: GhazaloUserSession = {
      uid: 'guest',
      name: 'ضيف غزالو',
      email: '',
      phone: '',
      photo: '',
      isGuest: true,
      loginMethod: 'guest',
    };
    const token = `ghz-guest-${Date.now()}`;
    setGhazaloUser(userSession);
    setAuthSessionStorage('mshwyat-al-ghazal', token);
    setLoginModalOpen(false);
    onStoreLoginSuccess?.({
      storeSlug: 'mshwyat-al-ghazal',
      shopId: 'mshwyat-al-ghazal',
      token,
      userSession,
    });
  };

  const handleMockupWhatsapp = () => {
    const picked = MOCKUP_MENU_ITEMS.filter((i) => (mockupCounts[i.id] || 0) > 0);
    const lines =
      picked.length > 0
        ? picked.map((i) => `- ${i.name} × ${mockupCounts[i.id]} = ${i.price * mockupCounts[i.id]} ج`)
        : ['- ساندوتش كبدة إسكندراني × 1 = 65 ج'];
    const total = picked.length > 0 ? mockupTotal : 65;
    const text = encodeURIComponent(
      `طلب تجريبي من منيو كبدة مصر (/menu/kebda-masr):\n${lines.join('\n')}\nالإجمالي: ${total} جنيه`
    );
    window.location.href = `https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${text}`;
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');

    if (signupPassword.length < 6) {
      setSignupError('كلمة السر يجب أن تكون 6 أحرف أو أرقام على الأقل.');
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setSignupError('كلمة السر وتأكيد كلمة السر غير متطابقتين.');
      return;
    }

    setSignupLoading(true);
    try {
      const normalizedPhone = normalizeEgyptianPhone(signupPhone);
      const res = registerDemoAccount({
        restaurantName: signupName,
        email: signupEmail,
        phone: normalizedPhone,
        password: signupPassword,
        plan: selectedPlan,
      });

      if (!res.ok || !res.user || !res.token) {
        setSignupError(res.error || 'يرجى التأكد من البيانات المدخلة.');
        return;
      }

      // Sync with backend credential store for admin password management & 6-digit recovery
      try {
        await fetch('/api/store-auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: res.user.shopId,
            storeSlug: res.user.storeSlug,
            nameAr: res.user.restaurantName,
            email: res.user.email,
            phone: res.user.phone,
            password: signupPassword,
          }),
        });
      } catch {
        // non-blocking localStorage demo works offline
      }

      if (res.record) {
        void syncPublicStoreSnapshot(res.record.shop, res.record.products);
      }

      setSignupSuccessData({
        storeSlug: res.user.storeSlug,
        shopId: res.user.shopId,
        token: res.token,
        record: res.record,
      });
    } finally {
      setSignupLoading(false);
    }
  };

  const handleEnterDashboardAfterSignup = () => {
    if (!signupSuccessData) return;
    setSignupModalOpen(false);
    if (onStoreLoginSuccess) {
      onStoreLoginSuccess({
        storeSlug: signupSuccessData.storeSlug,
        shopId: signupSuccessData.shopId,
        token: signupSuccessData.token,
        record: signupSuccessData.record,
      });
    } else {
      onNavigateDashboard();
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const idf = loginIdentifier.trim();
    const pass = loginPassword;
    if (!idf || !pass) {
      setLoginError('يرجى إدخال البريد الإلكتروني أو رقم الموبايل وكلمة السر.');
      return;
    }

    setLoginLoading(true);
    try {
      // 1) Check localStorage users & restaurants first
      const userMatch = findLocalUserByEmailOrPhone(idf);
      const restMatch = findLocalRestaurantByIdentifier(idf);

      if (userMatch && userMatch.password === pass) {
        const token = `ghz-token-${userMatch.storeSlug}-${Date.now()}`;
        setAuthSessionStorage(userMatch.storeSlug, token);
        setLoginModalOpen(false);
        onStoreLoginSuccess?.({
          storeSlug: userMatch.storeSlug,
          shopId: userMatch.shopId,
          token,
          record: restMatch,
        });
        return;
      }

      if (restMatch && restMatch.password === pass) {
        const token = `ghz-token-${restMatch.storeSlug}-${Date.now()}`;
        setAuthSessionStorage(restMatch.storeSlug, token);
        setLoginModalOpen(false);
        onStoreLoginSuccess?.({
          storeSlug: restMatch.storeSlug,
          shopId: restMatch.shopId,
          token,
          record: restMatch,
        });
        return;
      }

      // 2) Check backend scrypt store-auth (if store password was updated by admin)
      if (userMatch || restMatch) {
        const slugToCheck = userMatch?.storeSlug || restMatch?.storeSlug || '';
        if (slugToCheck) {
          try {
            const srvRes = await fetch('/api/store-auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ storeSlug: slugToCheck, password: pass }),
            });
            const srvData = (await srvRes.json()) as {
              ok?: boolean;
              token?: string;
              storeSlug?: string;
              shopId?: string;
            };
            if (srvRes.ok && srvData.ok && srvData.token) {
              const finalSlug = srvData.storeSlug || slugToCheck;
              setAuthSessionStorage(finalSlug, srvData.token);
              setLoginModalOpen(false);
              onStoreLoginSuccess?.({
                storeSlug: finalSlug,
                shopId: srvData.shopId || finalSlug,
                token: srvData.token,
                record: restMatch,
              });
              return;
            }
          } catch {
            // fallback below
          }
        }
      }

      // 3) Fallback Firebase Email / Phone Auth
      try {
        const cleanEmail = idf.includes('@')
          ? idf
          : phoneToAuthEmail(toAsciiDigits(normalizeEgyptianPhone(idf)));
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
        const token = `fb-${cred.user.uid}-${Date.now()}`;
        const slug = restMatch?.storeSlug || userMatch?.storeSlug || 'kebda-masr';
        setAuthSessionStorage(slug, token);
        setLoginModalOpen(false);
        onStoreLoginSuccess?.({
          storeSlug: slug,
          shopId: restMatch?.shopId || slug,
          token,
          record: restMatch,
        });
        return;
      } catch {
        // show error below
      }

      setLoginError(
        'البريد الإلكتروني / رقم الموبايل أو كلمة السر غير صحيحة. (للتجربة: kebda@menu.eg أو 01015861991 وكلمة السر 123456)'
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    const idf = forgotIdentifier.trim();
    if (!idf) {
      setForgotError('يرجى إدخال البريد الإلكتروني أو رقم الموبايل.');
      return;
    }

    setForgotBusy(true);
    try {
      try {
        await fetch('/api/store-auth/forgot-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: idf }),
        });
      } catch {
        // non-blocking
      }
      setForgotStep(2);
      setForgotSuccess(
        'أدخل كود الاستعادة المكون من 6 أرقام الصادر من الأدمن، أو تواصل عبر واتساب للحصول عليه فوراً.'
      );
    } finally {
      setForgotBusy(false);
    }
  };

  const handleForgotStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    const idf = forgotIdentifier.trim();
    const code = toAsciiDigits(forgotCode.trim());
    const newPass = forgotNewPass.trim();
    const confirmPass = forgotConfirmPass.trim();

    if (code.length !== 6) {
      setForgotError('يرجى إدخال كود الاستعادة المكون من 6 أرقام.');
      return;
    }
    if (newPass.length < 4) {
      setForgotError('كلمة السر الجديدة يجب أن تكون 4 أحرف على الأقل.');
      return;
    }
    if (newPass !== confirmPass) {
      setForgotError('كلمة السر الجديدة وتأكيدها غير متطابقتين.');
      return;
    }

    setForgotBusy(true);
    try {
      let backendOk = false;
      let serverMsg = '';
      try {
        const res = await fetch('/api/store-auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: idf, code, newPassword: newPass }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (res.ok && data.ok) {
          backendOk = true;
        } else {
          serverMsg = data.error || '';
        }
      } catch {
        // check localStorage below
      }

      const restMatch = findLocalRestaurantByIdentifier(idf);
      const userMatch = findLocalUserByEmailOrPhone(idf);
      const localCodeOk =
        (restMatch &&
          restMatch.resetCode === code &&
          (!restMatch.resetCodeExpiresAt || Date.now() <= restMatch.resetCodeExpiresAt)) ||
        (userMatch &&
          userMatch.resetCode === code &&
          (!userMatch.resetCodeExpiresAt || Date.now() <= userMatch.resetCodeExpiresAt));

      if (backendOk || localCodeOk) {
        if (restMatch) {
          const nextRests = getLocalRestaurants().map((r) =>
            r.shopId === restMatch.shopId || r.storeSlug === restMatch.storeSlug
              ? { ...r, password: newPass, resetCode: undefined, resetCodeExpiresAt: undefined }
              : r
          );
          saveLocalRestaurants(nextRests);
        }
        if (userMatch) {
          const nextUsers = getLocalUsers().map((u) =>
            u.id === userMatch.id || u.storeSlug === userMatch.storeSlug
              ? { ...u, password: newPass, resetCode: undefined, resetCodeExpiresAt: undefined }
              : u
          );
          saveLocalUsers(nextUsers);
        }

        setLoginIdentifier(idf);
        setLoginPassword('');
        setForgotSuccess('تم تغيير كلمة السر بنجاح! يمكنك تسجيل الدخول بكلمة السر الجديدة الآن.');
        setTimeout(() => {
          setForgotModalOpen(false);
          setLoginModalOpen(true);
        }, 1200);
        return;
      }

      setForgotError(
        serverMsg || 'كود الاستعادة غير صحيح أو منتهي الصلاحية. تواصل مع الدعم للحصول على كود من 6 أرقام.'
      );
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Navbar: Buttons on Right, Nav Links Center, Logo "غزالو Ghazalo" on Left */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Right side in RTL: Action Buttons ("دخول" + "ابدأ مجاناً") */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => (isAuthenticated ? onNavigateDashboard() : openLoginModal())}
              className="px-4 sm:px-5 h-10 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#FF6A00] text-slate-800 dark:text-slate-100 font-extrabold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'لوحة التحكم' : 'دخول'}
            </button>
            <button
              type="button"
              onClick={() => openSignupModal('trial')}
              className="px-4 sm:px-6 h-10 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-xs sm:text-sm shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              ابدأ مجاناً
            </button>
            {isAuthenticated && isAdminUser && onOpenAdminPanel && (
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="hidden sm:inline-flex px-3.5 h-10 rounded-full bg-slate-900 text-white font-bold text-xs items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-4 h-4 text-[#FF6A00]" />
                <span>الإدارة</span>
              </button>
            )}
          </div>

          {/* Center nav links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-bold text-slate-600 dark:text-slate-300">
            <a href="#why-ghazalo" className="hover:text-[#FF6A00] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              ليه غزالو؟
            </a>
            <a href="#how-it-works" className="hover:text-[#FF6A00] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              كيف يعمل؟
            </a>
            <a href="#pricing" className="hover:text-[#FF6A00] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              الأسعار
            </a>
          </nav>

          {/* Left side in RTL: Logo "غزالو Ghazalo" + theme/mobile drawer controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label="تبديل المظهر"
              className="hidden sm:flex w-9 h-9 rounded-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-[#FF6A00] hover:text-[#FF6A00] items-center justify-center transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-left focus:outline-none whitespace-nowrap shrink-0"
            >
              <GhazaloLogo />
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="القائمة"
              className="lg:hidden w-9 h-9 rounded-full border border-slate-200 dark:border-slate-800 text-[#FF6A00] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="py-10 sm:py-16 lg:py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Copy Column */}
          <div className="lg:col-span-6 space-y-6 text-center lg:text-right">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white leading-[1.25] [text-wrap:balance]">
              صاحب مطعم أو كافيه؟ المنيو بتاعك لسه PDF على الواتساب؟ 😬
            </h1>
            <p className="text-base sm:text-lg font-semibold text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              زبونك بيكبّر ويصغّر ومش لاقي الأسعار.. وفي الآخر يطلب من غيرك. مع Ghazalo، منيو مطعمك يبقى موقع كامل برابط شايل اسمك
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3.5 pt-1">
              <button
                type="button"
                onClick={() => openSignupModal('trial')}
                className="px-7 py-4 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm sm:text-base shadow-[0_12px_30px_rgba(255,106,0,0.28)] transition-all whitespace-nowrap shrink-0"
              >
                اعمل منيو مطعمك مجاناً - 7 ايام
              </button>
              <button
                type="button"
                onClick={openLiveDemo}
                className="px-7 py-4 rounded-full bg-white dark:bg-slate-900 hover:bg-orange-50/60 dark:hover:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-700 font-extrabold text-sm sm:text-base transition-colors whitespace-nowrap shrink-0"
              >
                شوف نموذج حي
              </button>
            </div>

            <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
              من غير بطاقة بنكية - جرب 7 ايام مجاني
            </p>
          </div>

          {/* Interactive Phone Mockup with Demo Menu: صور اكل، اسعار، زرار اطلب على واتساب */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-[340px] rounded-[2.5rem] border-[6px] border-slate-900 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.14)] overflow-hidden">
              {/* Phone Notch & Path URL Bar */}
              <div className="bg-slate-900 px-5 pt-2.5 pb-3 text-white">
                <div className="w-16 h-1.5 rounded-full bg-slate-700 mx-auto mb-2.5" />
                <div
                  dir="ltr"
                  className="rounded-xl bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-orange-300 flex items-center justify-between"
                >
                  <span>/menu/kebda-masr</span>
                  <ExternalLink
                    onClick={openLiveDemo}
                    className="w-3.5 h-3.5 text-slate-300 hover:text-white cursor-pointer"
                  />
                </div>
              </div>

              {/* Demo Restaurant Banner */}
              <div className="px-4 py-3.5 bg-orange-50/70 dark:bg-slate-800/70 border-b border-orange-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                    كبدة مصر · منيو مباشر
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    وسط البلد · توصيل 25 دقيقة
                  </div>
                </div>
                <span className="text-[11px] font-extrabold text-[#FF6A00]">مفتوح الآن</span>
              </div>

              {/* Food Items with Real Photos & Prices */}
              <div className="p-3.5 space-y-2.5 bg-white dark:bg-slate-900">
                {MOCKUP_MENU_ITEMS.map((item) => {
                  const qty = mockupCounts[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900"
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-orange-50 dark:bg-slate-800 shrink-0">
                        <img
                          src={item.image}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                          {item.desc}
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="font-extrabold text-xs text-[#FF6A00] tabular-nums">
                            {item.price} جنيه
                          </span>
                          <div className="flex items-center gap-1.5">
                            {qty > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMockupCounts((prev) => ({
                                      ...prev,
                                      [item.id]: Math.max(0, (prev[item.id] || 0) - 1),
                                    }))
                                  }
                                  aria-label="تقليل الكمية"
                                  className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-xs font-extrabold tabular-nums w-4 text-center">
                                  {qty}
                                </span>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setMockupCounts((prev) => ({
                                  ...prev,
                                  [item.id]: (prev[item.id] || 0) + 1,
                                }))
                              }
                              aria-label="إضافة للطلب"
                              className="w-6 h-6 rounded-lg bg-[#FF6A00] text-white flex items-center justify-center"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* WhatsApp Order CTA Inside Phone */}
              <div className="p-3.5 pt-1 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleMockupWhatsapp}
                  className="w-full py-3 px-4 rounded-2xl bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-xs flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4" />
                    <span>اطلب على واتساب</span>
                  </span>
                  <span className="tabular-nums">
                    {mockupQty > 0 ? `${mockupTotal} جنيه` : 'جرب الطلب'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION: ليه غزالو؟ (5 Cards) */}
      <section id="why-ghazalo" className="py-14 sm:py-20 bg-slate-50/70 dark:bg-slate-900/40 border-y border-slate-200/70 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white [text-wrap:balance]">
              ليه غزالو؟
            </h2>
            <p className="text-sm sm:text-base font-semibold text-slate-500 dark:text-slate-400">
              كل اللي مطعمك محتاجه عشان تحوّل الزائر لطلب فعلي من غير عمولات
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
            {FEATURES_LIST.map((feat) => (
              <div
                key={feat.title}
                className={`${feat.span} bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/90 dark:border-slate-800 space-y-3 hover:border-[#FF6A00]/60 transition-colors`}
              >
                <div className="text-3xl leading-none" aria-hidden="true">
                  {feat.emoji}
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                  {feat.title}
                </h3>
                <p className="text-sm sm:text-base font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS: 3 Steps */}
      <section id="how-it-works" className="py-14 sm:py-20 bg-white dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              إزاي تبدأ في 3 خطوات؟
            </h2>
            <p className="text-sm sm:text-base font-semibold text-slate-500 dark:text-slate-400">
              جهّز منيو مطعمك في دقائق واستقبل أول طلب على واتساب اليوم
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <div
                key={step.num}
                className="rounded-3xl p-6 sm:p-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-3"
              >
                <div className="text-2xl font-extrabold text-[#FF6A00] tabular-nums">
                  {step.num}
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                  {step.title}
                </h3>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 leading-relaxed">
                  {step.desc}
                </p>
                {step.exampleSlug && (
                  <button
                    type="button"
                    onClick={openLiveDemo}
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#FF6A00] hover:underline"
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

      {/* PRICING SECTION */}
      <section id="pricing" className="py-14 sm:py-20 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-200/70 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              أسعار واضحة من غير عمولة على الطلبات
            </h2>
            <p className="text-sm sm:text-base font-semibold text-slate-500 dark:text-slate-400">
              ابدأ مجاناً 7 أيام بكل المميزات وبعدها اختار الباقة المناسبة
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Card 1: Trial */}
            <div className="rounded-3xl p-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">تجريبي</h3>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    7 ايام مجاني
                  </p>
                </div>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                  0 جنيه
                </div>
                <ul className="space-y-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>كل المميزات مفتوحة لمدة 7 أيام</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>منيو بالصور والأسعار + واتساب</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>حجز ترابيزات + تقييمات العملاء</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => openSignupModal('trial')}
                className="w-full py-3.5 px-5 rounded-full border-2 border-[#FF6A00] text-[#FF6A00] hover:bg-[#FF6A00] hover:text-white font-extrabold text-sm transition-colors"
              >
                ابدأ 7 ايام مجاني
              </button>
            </div>

            {/* Card 2: Monthly */}
            <div className="rounded-3xl p-7 bg-white dark:bg-slate-900 border-2 border-[#FF6A00] shadow-[0_14px_40px_rgba(255,106,0,0.1)] flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">شهري</h3>
                  <p className="text-xs font-bold text-[#FF6A00]">30 يوم</p>
                </div>
                <div className="flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">600</span>
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                    جنيه / شهرياً
                  </span>
                </div>
                <ul className="space-y-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>7 أيام مجاني أولاً عند التسجيل</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>طلبات غير محدودة بدون عمولة</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>لوحة تحكم كاملة + كاشير POS</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => openSignupModal('monthly')}
                className="w-full py-3.5 px-5 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm transition-colors"
              >
                ابدأ شهري
              </button>
            </div>

            {/* Card 3: Yearly */}
            <div className="rounded-3xl p-7 bg-slate-900 text-white border border-slate-800 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-extrabold">سنوي</h3>
                    <p className="text-xs font-bold text-slate-300">365 يوم</p>
                  </div>
                  <span className="text-xs font-extrabold text-[#FF6A00]">الاوفر</span>
                </div>
                <div className="flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-3xl font-extrabold text-white">3,000</span>
                  <span className="text-sm font-bold text-slate-300">جنيه / سنوياً</span>
                </div>
                <ul className="space-y-2.5 text-sm font-semibold text-slate-200">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>وفّر 4,200 جنيه مقارنة بالشهري</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>كل المميزات + رموز طاولات QR</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                    <span>دعم فني مباشر على مدار السنة</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => openSignupModal('yearly')}
                className="w-full py-3.5 px-5 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm transition-colors"
              >
                ابدأ سنوي
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* PWA Install Strip */}
      <section className="py-6 px-4 sm:px-6 bg-white dark:bg-slate-950">
        <div className="max-w-5xl mx-auto">
          <PWAInstallButton variant="card" />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white dark:bg-slate-950 border-t border-slate-200/80 dark:border-slate-800 py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-right">
            <GhazaloLogo />
            <span className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
              غزالو - منيو مطعمك في رابط واحد
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm inline-flex items-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>كلمنا واتساب</span>
            </a>
            <button
              type="button"
              onClick={() => openLoginModal()}
              className="px-5 py-3 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-[#FF6A00]"
            >
              دخول المطاعم
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <GhazaloLogo />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-2 text-sm font-bold">
                <a
                  href="#why-ghazalo"
                  onClick={() => setDrawerOpen(false)}
                  className="block px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800"
                >
                  ليه غزالو؟
                </a>
                <a
                  href="#how-it-works"
                  onClick={() => setDrawerOpen(false)}
                  className="block px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800"
                >
                  كيف يعمل؟
                </a>
                <a
                  href="#pricing"
                  onClick={() => setDrawerOpen(false)}
                  className="block px-4 py-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800"
                >
                  الأسعار
                </a>
              </div>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  openSignupModal('trial');
                }}
                className="w-full py-3 rounded-full bg-[#FF6A00] text-white font-extrabold text-sm"
              >
                ابدأ مجاناً
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  openLoginModal();
                }}
                className="w-full py-3 rounded-full border border-slate-200 dark:border-slate-700 font-extrabold text-sm"
              >
                دخول
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIGNUP MODAL (Email + Phone ONLY, NO store-name slug input) */}
      {signupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <GhazaloLogo />
              <button
                type="button"
                onClick={() => setSignupModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {signupSuccessData ? (
              <div className="space-y-5 text-center py-2">
                <div className="w-16 h-16 rounded-3xl bg-orange-50 dark:bg-orange-950/50 text-[#FF6A00] mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9" />
                </div>

                <div className="space-y-3">
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    مبروك! لينك المنيو بتاعك:
                  </h3>
                  {(() => {
                    const url = getAbsoluteMenuUrl(signupSuccessData.storeSlug);
                    return (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyMenuLink(url);
                              if (ok) {
                                setCopiedNewLink(true);
                                setTimeout(() => setCopiedNewLink(false), 2600);
                              }
                            }}
                            className="px-4 py-2 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white text-xs font-extrabold inline-flex items-center gap-1.5"
                          >
                            {copiedNewLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            <span>{copiedNewLink ? 'تم نسخ اللينك ✅' : 'نسخ لينك المنيو'}</span>
                          </button>
                          <a
                            href={getWhatsAppShareUrl(url)}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>مشاركة واتساب</span>
                          </a>
                        </div>
                        <div
                          dir="ltr"
                          className="px-3.5 py-2 rounded-2xl bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 text-xs font-bold text-[#FF6A00] break-all"
                        >
                          {url}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={handleEnterDashboardAfterSignup}
                    className="w-full py-4 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)] transition-colors"
                  >
                    ادخل لوحة التحكم
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignupModalOpen(false);
                      onOpenStoreMenu?.(signupSuccessData.storeSlug);
                    }}
                    className="w-full py-3 rounded-full border border-slate-200 dark:border-slate-700 font-bold text-xs text-slate-700 dark:text-slate-200 hover:border-[#FF6A00]"
                  >
                    افتح المنيو الآن
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    أنشئ منيو مطعمك مجاناً
                  </h2>
                  <p className="text-xs font-bold text-[#FF6A00]">هتاخد 7 ايام مجاني</p>
                </div>

                {signupError && (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                    {signupError}
                  </div>
                )}

                <form onSubmit={(e) => void handleSignupSubmit(e)} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      اسم المطعم
                    </label>
                    <input
                      type="text"
                      required
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="مثال: كبدة مصر"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      البريد الالكتروني
                    </label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-left focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      رقم الموبايل
                    </label>
                    <div
                      dir="ltr"
                      className="flex items-stretch rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-[#FF6A00]"
                    >
                      <span className="px-3.5 flex items-center bg-orange-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 text-xs font-extrabold text-[#FF6A00] select-none tabular-nums">
                        +20
                      </span>
                      <input
                        type="tel"
                        required
                        value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                        placeholder="1012345678"
                        className="flex-1 px-3.5 py-3 bg-transparent text-sm font-semibold tabular-nums text-left focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      كلمة السر
                    </label>
                    <div className="relative">
                      <input
                        type={showSignupPass ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPass((v) => !v)}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                      >
                        {showSignupPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      تأكيد كلمة السر
                    </label>
                    <input
                      type={showSignupPass ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={signupLoading}
                    className="w-full py-3.5 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm shadow-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {signupLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>انشئ متجري مجاناً</span>
                  </button>
                </form>

                <div className="text-center text-xs font-bold text-slate-500 pt-1">
                  لديك حساب بالفعل؟{' '}
                  <button
                    type="button"
                    onClick={openLoginModal}
                    className="text-[#FF6A00] font-extrabold hover:underline"
                  >
                    دخول
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* LOGIN MODAL (Email OR Phone ONLY, NO store-name input) */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <GhazaloLogo />
              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                تسجيل الدخول
              </h2>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                ادخل بالبريد الالكتروني او رقم الموبايل للمتابعة
              </p>
            </div>

            {loginError && (
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-xs font-extrabold text-amber-900 dark:text-amber-200 leading-relaxed">
                {loginError}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={loginLoading}
                onClick={() => void handleModalGoogleLogin()}
                className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-orange-50/70 border-2 border-slate-200 dark:border-slate-700 hover:border-[#FF6A00] font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <span>دخول بجوجل - Gmail</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginModalOpen(false);
                  onNavigateAuth('login');
                }}
                className="w-full py-3.5 px-4 rounded-2xl bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span>دخول برقم الموبايل (OTP)</span>
              </button>
              <button
                type="button"
                onClick={handleModalGuestLogin}
                className="w-full py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <UserCheck className="w-4 h-4 text-[#FF6A00]" />
                <span>دخول كضيف - جرب من غير تسجيل</span>
              </button>
            </div>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              <span className="shrink mx-3 text-[11px] font-bold text-slate-400">أو بكلمة السر</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            </div>

            <form onSubmit={(e) => void handleLoginSubmit(e)} className="space-y-3.5">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                  البريد الالكتروني او رقم الموبايل
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="01015861991 or name@example.com"
                  className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-left focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                  كلمة السر
                </label>
                <div className="relative">
                  <input
                    type={showLoginPass ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPass((v) => !v)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                    aria-label={showLoginPass ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                  >
                    {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="pt-1.5">
                  <button
                    type="button"
                    onClick={openForgotModal}
                    className="text-xs font-extrabold text-[#FF6A00] hover:underline"
                  >
                    نسيت كلمة السر؟
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-4 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm shadow-xs flex items-center justify-center gap-2 transition-colors"
              >
                {loginLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>دخول</span>
              </button>
            </form>

            <div className="text-center text-xs font-bold text-slate-500 pt-1">
              ليس لديك حساب؟{' '}
              <button
                type="button"
                onClick={() => openSignupModal('trial')}
                className="text-[#FF6A00] font-extrabold hover:underline"
              >
                ابدأ مجاناً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORGOT PASSWORD POPUP */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-950/50 text-[#FF6A00] flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    نسيت كلمة السر؟
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500">
                    الخطوة {forgotStep} من 2
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotError && (
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div className="rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 p-3 text-xs font-extrabold text-orange-900 dark:text-orange-200">
                {forgotSuccess}
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={(e) => void handleForgotStep1(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    البريد الالكتروني او رقم الموبايل
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="01015861991 or name@example.com"
                    className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-left focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotBusy}
                  className="w-full py-3.5 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm flex items-center justify-center gap-2"
                >
                  {forgotBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>ارسال كود الاستعادة</span>
                </button>
              </form>
            ) : (
              <form onSubmit={(e) => void handleForgotStep2(e)} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    كود الاستعادة 6 ارقام
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    inputMode="numeric"
                    dir="ltr"
                    value={forgotCode}
                    onChange={(e) =>
                      setForgotCode(toAsciiDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="123456"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-lg font-extrabold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    كلمة سر جديدة
                  </label>
                  <div className="relative">
                    <input
                      type={showForgotPass ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={forgotNewPass}
                      onChange={(e) => setForgotNewPass(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotPass((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showForgotPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    تأكيد كلمة السر
                  </label>
                  <input
                    type={showForgotPass ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={forgotConfirmPass}
                    onChange={(e) => setForgotConfirmPass(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="px-4 py-3 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                  >
                    رجوع
                  </button>
                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="flex-1 py-3.5 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm flex items-center justify-center gap-2"
                  >
                    {forgotBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>تغيير كلمة السر</span>
                  </button>
                </div>
              </form>
            )}

            <div className="rounded-2xl bg-orange-50/70 dark:bg-slate-800 border border-orange-100 dark:border-slate-700 p-3 text-center space-y-2">
              <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                تواصل مع الدعم لاستعادة الحساب
              </div>
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  `مرحباً دعم غزالو، أحتاج كود استعادة لحسابي: ${forgotIdentifier || loginIdentifier || ''}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-4 h-4" />
                <span>تواصل واتساب ({SUPPORT_CONTACT.PHONE_DISPLAY})</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
