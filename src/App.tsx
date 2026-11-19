import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { CheckCircle2, Loader2, Lock, LogOut, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { auth } from './firebase';
import {
  getOwnerShops,
  subscribeToOrders,
  subscribeToProducts,
  subscribeToShop,
  subscribeToTables,
  updateShop,
} from './services/firestoreService';
import { getShopAccessState } from './utils/calculations';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { StorefrontPage } from './pages/StorefrontPage';
import { CashierPage } from './pages/CashierPage';
import { OrdersPage } from './pages/OrdersPage';
import { ShareQrPage } from './pages/ShareQrPage';
import { AdminPage } from './pages/AdminPage';
import {
  ADMIN_EMAIL,
  SUBSCRIPTION_PRICING,
  type AppView,
  type DemoProject,
  type Order,
  type Product,
  type Shop,
  type ShopTable,
} from './types';

function AppShell() {
  const [darkMode, setDarkMode] = useState(false);
  const [view, setView] = useState<AppView>('landing');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [signupMeta, setSignupMeta] = useState<{
    fullName: string;
    businessName: string;
    country: string;
    contact: string;
  }>({ fullName: '', businessName: '', country: 'مصر', contact: '' });

  // Active Merchant Shop State
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [shopProducts, setShopProducts] = useState<Product[]>([]);
  const [shopOrders, setShopOrders] = useState<Order[]>([]);
  const [shopTables, setShopTables] = useState<ShopTable[]>([]);

  // Public Storefront / Demo State
  const [demoPreview, setDemoPreview] = useState<DemoProject | null>(null);
  const [qrTargetShopId, setQrTargetShopId] = useState<string | null>(null);
  const [qrTableLabel, setQrTableLabel] = useState<string>('');
  const [publicShop, setPublicShop] = useState<Shop | null>(null);
  const [publicProducts, setPublicProducts] = useState<Product[]>([]);

  // Lock Screen Subscription Payment Request State
  const [requestedPlanChoice, setRequestedPlanChoice] = useState<'monthly_600' | 'yearly_6000'>('monthly_600');
  const [paymentNoteInput, setPaymentNoteInput] = useState('');
  const [submittingPaymentReq, setSubmittingPaymentReq] = useState(false);
  const [paymentReqSaved, setPaymentReqSaved] = useState(false);
  const [paymentReqError, setPaymentReqError] = useState('');

  // Apply Dark Mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  const handleSetThemeMode = (mode: 'light' | 'dark' | 'system') => {
    if (mode === 'system') {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    } else {
      setDarkMode(mode === 'dark');
    }
  };

  // Detect URL ?shop=...&table=... or private ?admin=ghazalo-owner on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adminParam = params.get('admin');
    const shopParam = params.get('shop');
    const tableParam = params.get('table') || '';
    if (
      adminParam === '1' ||
      adminParam === 'ghazalo-owner' ||
      adminParam === 'sofrtek-owner' ||
      window.location.hash === '#admin'
    ) {
      setView('admin');
      return;
    }
    if (shopParam) {
      setQrTargetShopId(shopParam);
      setQrTableLabel(tableParam);
      setView('storefront');
    }
  }, []);

  // Subscribe to Public QR Shop when viewing public storefront via ?shop=
  useEffect(() => {
    if (!qrTargetShopId || demoPreview) return;
    const unsubShop = subscribeToShop(qrTargetShopId, (s) => setPublicShop(s));
    const unsubProds = subscribeToProducts(qrTargetShopId, (p) => setPublicProducts(p));
    return () => {
      unsubShop();
      unsubProds();
    };
  }, [qrTargetShopId, demoPreview]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user && user.emailVerified) {
        try {
          const shops = await getOwnerShops(user.uid);
          if (shops.length > 0) {
            setActiveShopId(shops[0].id);
            setActiveShop(shops[0]);
          }
        } catch {
          // handled gracefully
        }
      } else {
        setActiveShopId(null);
        setActiveShop(null);
        setShopProducts([]);
        setShopOrders([]);
        setShopTables([]);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Real-time Firestore subscriptions for Merchant's Active Shop
  useEffect(() => {
    if (!activeShopId || !currentUser || !currentUser.emailVerified) return;
    const unsubShop = subscribeToShop(activeShopId, (s) => {
      if (s) setActiveShop(s);
    });
    const unsubProducts = subscribeToProducts(activeShopId, (prods) => {
      setShopProducts(prods);
    });
    const unsubOrders = subscribeToOrders(activeShopId, currentUser.uid, (ords) => {
      setShopOrders(ords);
    });
    const unsubTables = subscribeToTables(activeShopId, (tbls) => {
      setShopTables(tbls);
    });
    return () => {
      unsubShop();
      unsubProducts();
      unsubOrders();
      unsubTables();
    };
  }, [activeShopId, currentUser]);

  const handleAuthComplete = async (meta: {
    fullName: string;
    businessName: string;
    country: string;
    contact: string;
  }) => {
    setSignupMeta(meta);
    const user = auth.currentUser;
    if (!user) return;
    const isAdmin = Boolean(
      user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );
    const shops = await getOwnerShops(user.uid);
    if (isAdmin && shops.length === 0) {
      setView('admin');
    } else if (shops.length > 0) {
      setActiveShopId(shops[0].id);
      setActiveShop(shops[0]);
      setView('dashboard');
    } else {
      setView('onboarding');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('landing');
  };

  const isAdminUser = Boolean(
    currentUser?.emailVerified &&
      currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  if (!authReady && view !== 'landing' && view !== 'storefront') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (view === 'landing') {
    return (
      <LandingPage
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        isAuthenticated={Boolean(currentUser && currentUser.emailVerified)}
        isAdminUser={isAdminUser}
        onNavigateAuth={(mode) => {
          setAuthMode(mode);
          setView(mode);
        }}
        onNavigateDashboard={async () => {
          if (currentUser && !activeShop) {
            const shops = await getOwnerShops(currentUser.uid);
            if (shops.length > 0) {
              setActiveShopId(shops[0].id);
              setActiveShop(shops[0]);
              setView('dashboard');
            } else if (isAdminUser) {
              setView('admin');
            } else {
              setView('onboarding');
            }
          } else if (activeShop) {
            setView('dashboard');
          } else if (isAdminUser) {
            setView('admin');
          } else {
            setView('onboarding');
          }
        }}
        onOpenAdminPanel={() => setView('admin')}
        onOpenDemoMenu={(demo) => {
          setDemoPreview(demo);
          setQrTargetShopId(null);
          setQrTableLabel('');
          setView('storefront');
        }}
      />
    );
  }

  if (view === 'signup' || view === 'login') {
    return (
      <AuthPage
        initialMode={authMode}
        onBack={() => setView('landing')}
        onAuthComplete={(meta) => void handleAuthComplete(meta)}
      />
    );
  }

  if (view === 'onboarding' && currentUser) {
    return (
      <OnboardingPage
        ownerId={currentUser.uid}
        ownerName={signupMeta.fullName || currentUser.displayName || 'تاجر'}
        ownerEmail={currentUser.email || signupMeta.contact}
        initialBusinessName={signupMeta.businessName}
        initialCountry={signupMeta.country}
        onCancel={() => setView('landing')}
        onCompleted={(newShop) => {
          setActiveShopId(newShop.id);
          setActiveShop(newShop);
          setView('dashboard');
        }}
      />
    );
  }

  if (view === 'storefront') {
    if (demoPreview) {
      return (
        <StorefrontPage
          shop={demoPreview.shop}
          products={demoPreview.products}
          isDemo
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onBack={() => {
            setDemoPreview(null);
            setView('landing');
          }}
          backLabel="الرئيسية"
        />
      );
    }

    if (qrTargetShopId) {
      if (!publicShop) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        );
      }
      return (
        <StorefrontPage
          shop={publicShop}
          products={publicProducts}
          initialTableLabel={qrTableLabel}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onBack={() => {
            window.history.replaceState({}, '', '/');
            setQrTargetShopId(null);
            setView(activeShop ? 'dashboard' : 'landing');
          }}
          backLabel={activeShop ? 'لوحة التحكم' : 'الرئيسية'}
        />
      );
    }

    if (activeShop) {
      return (
        <StorefrontPage
          shop={activeShop}
          products={shopProducts}
          initialTableLabel={qrTableLabel}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onBack={() => setView('dashboard')}
          backLabel="لوحة التحكم"
        />
      );
    }
  }

  if (view === 'admin') {
    return (
      <AdminPage
        onBack={() => {
          window.history.replaceState({}, '', '/');
          setView(activeShop ? 'dashboard' : 'landing');
        }}
        onPreviewShop={(shopItem) => {
          setDemoPreview(null);
          setQrTargetShopId(shopItem.id);
          setQrTableLabel('');
          setView('storefront');
        }}
      />
    );
  }

  // Enforce 7-day trial expiration & Admin approval on Merchant Portal views
  if (
    activeShop &&
    currentUser &&
    (view === 'dashboard' || view === 'cashier' || view === 'orders' || view === 'share')
  ) {
    const shopAccess = getShopAccessState(activeShop);
    if (!shopAccess.isActive) {
      const handleSubmitPaymentRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setPaymentReqError('');
        setSubmittingPaymentReq(true);
        try {
          await updateShop(activeShop.id, {
            requestedPlan: requestedPlanChoice,
            paymentNote: paymentNoteInput.trim() || 'تم التحويل وفي انتظار المراجعة',
          });
          setPaymentReqSaved(true);
        } catch (err: unknown) {
          setPaymentReqError(err instanceof Error ? err.message : 'تعذر إرسال طلب التفعيل.');
        } finally {
          setSubmittingPaymentReq(false);
        }
      };

      return (
        <div dir="rtl" className="min-h-screen bg-emerald-50/40 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-amber-300 dark:border-amber-800 shadow-sm space-y-5">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 mx-auto flex items-center justify-center">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                  {shopAccess.reason === 'trial_expired'
                    ? 'انتهت الفترة التجريبية (7 أيام)'
                    : shopAccess.reason === 'subscription_expired'
                      ? 'انتهى اشتراك الباقة'
                      : 'الحساب موقوف مؤقتاً'}
                </h1>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                  تم إيقاف حساب متجر{' '}
                  <span className="text-emerald-700 dark:text-emerald-400">"{activeShop.nameAr}"</span>{' '}
                  لحين دفع الاشتراك وموافقة الإدارة. جميع أصنافك وبياناتك محفوظة بأمان.
                </p>
              </div>
            </div>

            {/* Subscription Plans & Payment Confirmation Request */}
            <form onSubmit={(e) => void handleSubmitPaymentRequest(e)} className="space-y-3.5">
              <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                اختر باقة الاشتراك لتجديد الحساب:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRequestedPlanChoice('monthly_600');
                    setPaymentReqSaved(false);
                  }}
                  className={`p-3.5 rounded-2xl border text-right transition-all space-y-1 ${
                    requestedPlanChoice === 'monthly_600'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-600 ring-2 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                    الباقة الشهرية
                  </div>
                  <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {SUBSCRIPTION_PRICING.MONTHLY_EGP} ج
                    <span className="text-xs font-bold text-slate-500"> / شهر (30 يوم)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRequestedPlanChoice('yearly_6000');
                    setPaymentReqSaved(false);
                  }}
                  className={`p-3.5 rounded-2xl border text-right transition-all space-y-1 ${
                    requestedPlanChoice === 'yearly_6000'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-600 ring-2 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      الباقة السنوية
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-300 text-slate-900 text-[10px] font-extrabold">
                      وفّر 1,200 ج
                    </span>
                  </div>
                  <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {SUBSCRIPTION_PRICING.YEARLY_EGP.toLocaleString('en-US')} ج
                    <span className="text-xs font-bold text-slate-500"> / سنة (365 يوم)</span>
                  </div>
                </button>
              </div>

              <input
                type="text"
                maxLength={180}
                value={paymentNoteInput}
                onChange={(e) => {
                  setPaymentNoteInput(e.target.value);
                  setPaymentReqSaved(false);
                }}
                placeholder="رقم المحول منه / مرجع إنستاباي أو فودافون كاش (اختياري)"
                className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-emerald-50/30 dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {paymentReqError && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs font-bold text-amber-800">
                  {paymentReqError}
                </div>
              )}

              {(paymentReqSaved || activeShop.requestedPlan) && (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    تم إرسال طلب تفعيل{' '}
                    {(activeShop.requestedPlan || requestedPlanChoice) === 'yearly_6000'
                      ? 'الباقة السنوية (6,000 ج)'
                      : 'الباقة الشهرية (600 ج)'}{' '}
                    بنجاح، وبانتظار موافقة الإدارة.
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={submittingPaymentReq}
                className="w-full py-3.5 rounded-full glass-btn-primary font-extrabold text-sm flex items-center justify-center gap-2"
              >
                {submittingPaymentReq ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                إرسال تأكيد الدفع وطلب التفعيل
              </button>
            </form>

            <div className="space-y-2.5 pt-1 border-t border-emerald-100 dark:border-slate-800">
              <a
                href={`https://wa.me/201000000000?text=${encodeURIComponent(
                  `مرحباً إدارة Ghazalo، أرغب في تفعيل اشتراك متجري (${activeShop.nameAr}) على باقة ${
                    requestedPlanChoice === 'yearly_6000' ? 'السنة (6,000 ج)' : 'الشهر (600 ج)'
                  }${paymentNoteInput ? ` - مرجع الدفع: ${paymentNoteInput}` : ''}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 rounded-full glass-btn-amber font-extrabold text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                تواصل واتساب لتأكيد الدفع فوراً
              </a>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    const shops = await getOwnerShops(currentUser.uid);
                    if (shops.length > 0) setActiveShop(shops[0]);
                  }}
                  className="py-3 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  تحديث الحالة
                </button>

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="py-3 rounded-full glass-btn text-slate-600 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  تسجيل الخروج
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  if (view === 'cashier' && activeShop) {
    return (
      <CashierPage
        shop={activeShop}
        products={shopProducts}
        tables={shopTables}
        onBackDashboard={() => setView('dashboard')}
        onOrderCreated={() => {
          // Firestore onSnapshot automatically refreshes shopOrders
        }}
      />
    );
  }

  if (view === 'orders' && activeShop) {
    return (
      <OrdersPage
        shop={activeShop}
        orders={shopOrders}
        onBackDashboard={() => setView('dashboard')}
        onOpenCashier={() => setView('cashier')}
      />
    );
  }

  if (view === 'share' && activeShop) {
    return (
      <ShareQrPage
        shop={activeShop}
        tables={shopTables}
        onBackDashboard={() => setView('dashboard')}
        onOpenStorefront={(tbl) => {
          setDemoPreview(null);
          setQrTargetShopId(null);
          setQrTableLabel(tbl || '');
          setView('storefront');
        }}
      />
    );
  }

  if (activeShop && currentUser) {
    return (
      <DashboardPage
        shop={activeShop}
        products={shopProducts}
        orders={shopOrders}
        userName={currentUser.displayName || signupMeta.fullName || 'تاجر Ghazalo'}
        userEmail={currentUser.email || ''}
        darkMode={darkMode}
        onSetThemeMode={handleSetThemeMode}
        onOpenStorefront={() => {
          setDemoPreview(null);
          setQrTargetShopId(null);
          setQrTableLabel('');
          setView('storefront');
        }}
        onOpenCashier={() => setView('cashier')}
        onOpenOrders={() => setView('orders')}
        onOpenShareQr={() => setView('share')}
        onOpenAdmin={() => setView('admin')}
        onLogout={() => void handleLogout()}
      />
    );
  }

  return (
    <LandingPage
      darkMode={darkMode}
      onToggleDarkMode={() => setDarkMode((d) => !d)}
      isAuthenticated={false}
      onNavigateAuth={(mode) => {
        setAuthMode(mode);
        setView(mode);
      }}
      onNavigateDashboard={() => setView('onboarding')}
      onOpenDemoMenu={(demo) => {
        setDemoPreview(demo);
        setView('storefront');
      }}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
