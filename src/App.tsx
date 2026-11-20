import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Lock, LogOut, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import { auth } from './firebase';
import {
  getOwnerShops,
  subscribeToOrders,
  subscribeToProducts,
  subscribeToShop,
  subscribeToTables,
} from './services/firestoreService';
import { getShopAccessState } from './utils/calculations';
import {
  formatAuthContactLabel,
  isPhoneAuthEmail,
  isUserActivated,
} from './utils/authHelpers';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PlatformLoader } from './components/PlatformLoader';
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
  ADMIN_PORTAL_KEY,
  SUBSCRIPTION_PRICING,
  SUPPORT_CONTACT,
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
  const [authSyncTick, setAuthSyncTick] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [bootSplash, setBootSplash] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBootSplash(false);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, []);

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

  const [pendingShortcutMode, setPendingShortcutMode] = useState<'cashier' | 'dashboard' | null>(null);

  // Detect URL ?shop=...&table=..., PWA shortcut ?mode=..., or exclusive owner ?portal=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const portalParam = params.get('portal');
    const shopParam = params.get('shop');
    const tableParam = params.get('table') || '';
    const modeParam = params.get('mode');
    if (portalParam && portalParam === ADMIN_PORTAL_KEY) {
      setView('admin');
      return;
    }
    if (shopParam) {
      setQrTargetShopId(shopParam);
      setQrTableLabel(tableParam);
      setView('storefront');
      return;
    }
    if (modeParam === 'cashier' || modeParam === 'dashboard') {
      setPendingShortcutMode(modeParam);
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
      if (user && !isUserActivated(user)) {
        try {
          await user.reload();
        } catch {
          // ignore reload failure if offline
        }
      }
      setCurrentUser(user);
      setAuthSyncTick((t) => t + 1);
      if (user && isUserActivated(user)) {
        try {
          const shops = await getOwnerShops(user.uid);
          if (shops.length > 0) {
            setActiveShopId(shops[0].id);
            setActiveShop(shops[0]);
            if (pendingShortcutMode === 'cashier') {
              setView('cashier');
              setPendingShortcutMode(null);
            } else if (pendingShortcutMode === 'dashboard') {
              setView('dashboard');
              setPendingShortcutMode(null);
            }
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
    if (!activeShopId || !currentUser || !isUserActivated(currentUser)) return;
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
  }, [activeShopId, currentUser, authSyncTick]);

  const handleAuthComplete = async (meta: {
    fullName: string;
    businessName: string;
    country: string;
    contact: string;
  }) => {
    setSignupMeta(meta);
    const user = auth.currentUser;
    if (!user) return;
    setCurrentUser(user);
    setAuthSyncTick((t) => t + 1);
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

  if (bootSplash || !authReady) {
    return (
      <PlatformLoader
        subtitle={
          view === 'storefront' ? 'جاري تحميل المنيو...' : 'جاري تحميل المنصة...'
        }
      />
    );
  }

  if (view === 'landing') {
    return (
      <LandingPage
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        isAuthenticated={Boolean(currentUser && isUserActivated(currentUser))}
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

  if (view === 'onboarding' && currentUser && isUserActivated(currentUser)) {
    return (
      <OnboardingPage
        ownerId={currentUser.uid}
        ownerName={signupMeta.fullName || currentUser.displayName || 'تاجر'}
        ownerEmail={
          currentUser.email && !isPhoneAuthEmail(currentUser.email)
            ? currentUser.email
            : ''
        }
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
        return <PlatformLoader subtitle="جاري تحميل المنيو..." />;
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
    const hasValidPortalParam =
      new URLSearchParams(window.location.search).get('portal') === ADMIN_PORTAL_KEY;
    if (!hasValidPortalParam && !isAdminUser) {
      return (
        <LandingPage
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          isAuthenticated={Boolean(currentUser && isUserActivated(currentUser))}
          isAdminUser={isAdminUser}
          onNavigateAuth={(mode) => {
            setAuthMode(mode);
            setView(mode);
          }}
          onNavigateDashboard={() => setView(activeShop ? 'dashboard' : 'onboarding')}
          onOpenDemoMenu={(demo) => {
            setDemoPreview(demo);
            setQrTargetShopId(null);
            setQrTableLabel('');
            setView('storefront');
          }}
        />
      );
    }
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

  // Enforce 7-day trial expiration & Admin-only approval on Merchant Portal views
  if (
    activeShop &&
    currentUser &&
    isUserActivated(currentUser) &&
    (view === 'dashboard' || view === 'cashier' || view === 'orders' || view === 'share')
  ) {
    const shopAccess = getShopAccessState(activeShop);
    if (!shopAccess.isActive) {
      const waText = encodeURIComponent(
        `مرحباً إدارة غزالو، أرغب في تفعيل منيو مطعم (${activeShop.nameAr})`
      );
      const mailSubject = encodeURIComponent(`تفعيل منيو ${activeShop.nameAr} - Ghazalo`);

      return (
        <div dir="rtl" className="min-h-screen bg-emerald-50/40 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-amber-300 dark:border-amber-800 shadow-sm space-y-5">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 mx-auto flex items-center justify-center">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug">
                  انتهت الفترة المجانية، لتفعيل المنيو تواصل مع إدارة غزالو
                </h1>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                  تم إيقاف متجر{' '}
                  <span className="text-emerald-700 dark:text-emerald-400">"{activeShop.nameAr}"</span>{' '}
                  لحين التفعيل من الإدارة. جميع أصنافك وبياناتك محفوظة بأمان.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-emerald-50/40 dark:bg-slate-800/70 space-y-1">
                <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                  الباقة الشهرية
                </div>
                <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {SUBSCRIPTION_PRICING.MONTHLY_EGP} جنيه / شهري
                </div>
              </div>

              <div className="p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    الباقة السنوية
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-300 text-slate-900 text-[11px] font-extrabold">
                    وفّر {SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه
                  </span>
                </div>
                <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {SUBSCRIPTION_PRICING.YEARLY_EGP} جنيه / سنوي
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-1 border-t border-emerald-100 dark:border-slate-800">
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>تواصل واتساب: {SUPPORT_CONTACT.PHONE_DISPLAY}</span>
              </a>

              <a
                href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${mailSubject}`}
                className="w-full py-3.5 px-4 rounded-full bg-emerald-50 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-slate-700 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-slate-700 font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
              </a>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
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
        orders={shopOrders}
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

  if (activeShop && currentUser && isUserActivated(currentUser)) {
    return (
      <DashboardPage
        shop={activeShop}
        products={shopProducts}
        orders={shopOrders}
        userName={currentUser.displayName || signupMeta.fullName || 'تاجر Ghazalo'}
        userEmail={formatAuthContactLabel(currentUser.email) || signupMeta.contact || ''}
        isAdminUser={isAdminUser}
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
      <OfflineIndicator />
    </ErrorBoundary>
  );
}
