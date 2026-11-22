import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Globe, Lock, LogOut, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import { auth } from './firebase';
import {
  findShopBySlugOrId,
  getOwnerShops,
  getPlatformConfig,
  subscribeToOrders,
  subscribeToProducts,
  subscribeToShop,
  subscribeToTables,
} from './services/firestoreService';
import { getShopAccessState } from './utils/calculations';
import { getShopDisplayName, tx, useUiLang } from './utils/uiLang';
import {
  formatAuthContactLabel,
  isPhoneAuthEmail,
  isUserActivated,
} from './utils/authHelpers';
import {
  clearAuthTokenKeepLastStore,
  findLocalRestaurantBySlugOrShopId,
  getPlatformSettingsLocal,
  getStoredAuthSession,
  safeJsonParse,
  savePlatformSettingsLocal,
  setAuthSessionStorage,
  shopToDemoRecord,
  upsertLocalRestaurant,
} from './utils/storeRegistry';
import { DEMO_PROJECTS } from './data/demoProjects';
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
  type DemoRestaurantRecord,
  type Order,
  type Product,
  type Shop,
  type ShopTable,
} from './types';

function loadLocalOrders(shopId: string): Order[] {
  try {
    return safeJsonParse<Order[]>(localStorage.getItem(`ghazalo_orders_${shopId}`), []);
  } catch {
    return [];
  }
}

function saveLocalOrders(shopId: string, orders: Order[]): void {
  try {
    localStorage.setItem(`ghazalo_orders_${shopId}`, JSON.stringify(orders));
  } catch {
    // ignore storage quota
  }
}

function loadLocalTables(shopId: string): ShopTable[] {
  try {
    return safeJsonParse<ShopTable[]>(localStorage.getItem(`ghazalo_tables_${shopId}`), []);
  } catch {
    return [];
  }
}

function saveLocalTables(shopId: string, tables: ShopTable[]): void {
  try {
    localStorage.setItem(`ghazalo_tables_${shopId}`, JSON.stringify(tables));
  } catch {
    // ignore storage quota
  }
}

function parseRouteTarget(): {
  isAdminRoute: boolean;
  shopTarget: string | null;
  dashboardTarget: string | null;
  authRoute: 'login' | 'signup' | null;
  tableLabel: string;
  shortcutMode: 'cashier' | 'dashboard' | null;
} {
  const pathname = window.location.pathname || '/';
  const params = new URLSearchParams(window.location.search);
  const portalParam = params.get('portal');
  const shopParam = params.get('shop');
  const tableLabel = params.get('table') || '';
  const modeParam = params.get('mode');

  const isAdminRoute =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    Boolean(portalParam && portalParam === ADMIN_PORTAL_KEY);

  const menuPathMatch = pathname.match(/^\/menu\/([a-z0-9-]+)\/?$/i);
  const legacyMenuMatch = pathname.match(/^\/([a-z0-9-]+)\/menu\/?$/i);
  const shopTarget = menuPathMatch
    ? menuPathMatch[1]
    : legacyMenuMatch
      ? legacyMenuMatch[1]
      : shopParam;

  const dashboardMatch = pathname.match(/^\/dashboard\/([a-z0-9-]+)\/?$/i);
  const dashboardTarget = dashboardMatch ? dashboardMatch[1] : null;

  const authRoute =
    pathname === '/login' || pathname === '/login/'
      ? 'login'
      : pathname === '/signup' || pathname === '/signup/'
        ? 'signup'
        : null;

  const shortcutMode =
    modeParam === 'cashier' || modeParam === 'dashboard' ? modeParam : null;

  return { isAdminRoute, shopTarget, dashboardTarget, authRoute, tableLabel, shortcutMode };
}

function replacePathSafely(nextPath: string): void {
  try {
    if (window.location.pathname + window.location.search !== nextPath) {
      window.history.replaceState({}, '', nextPath);
    }
  } catch {
    // ignore history restriction
  }
}

function pushPathSafely(nextPath: string): void {
  try {
    if (window.location.pathname + window.location.search !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  } catch {
    // ignore history restriction
  }
}

function AppShell() {
  const { isEn, toggleLang } = useUiLang();
  const [darkMode, setDarkMode] = useState(false);
  const [view, setView] = useState<AppView>('landing');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authSyncTick, setAuthSyncTick] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [bootSplash, setBootSplash] = useState(true);

  const [forceZeroFeesGlobally, setForceZeroFeesGlobally] = useState<boolean>(
    () => getPlatformSettingsLocal().forceZeroFeesGlobally
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBootSplash(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const [signupMeta, setSignupMeta] = useState<{
    fullName: string;
    businessName: string;
    storeSlug?: string;
    password?: string;
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
  const [publicNotFound, setPublicNotFound] = useState(false);

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

  // Fetch global platform configuration (Global "الغاء كل الرسوم والضرايب لكل المطاعم" toggle)
  useEffect(() => {
    const syncPlatformConfig = async () => {
      try {
        const res = await fetch('/api/platform-config');
        if (res.ok) {
          const cfg = (await res.json()) as { forceZeroFeesGlobally?: boolean };
          const val = Boolean(cfg.forceZeroFeesGlobally);
          setForceZeroFeesGlobally(val);
          savePlatformSettingsLocal({ forceZeroFeesGlobally: val });
          return;
        }
      } catch {
        // fallback below
      }
      try {
        const fsCfg = await getPlatformConfig();
        setForceZeroFeesGlobally(Boolean(fsCfg.forceZeroFeesGlobally));
        savePlatformSettingsLocal({ forceZeroFeesGlobally: Boolean(fsCfg.forceZeroFeesGlobally) });
      } catch {
        // ignore offline error
      }
    };
    void syncPlatformConfig();
  }, []);

  const hydrateStoreSession = useCallback(
    async (
      slugOrId: string,
      recordOverride?: DemoRestaurantRecord | null,
      targetView?: AppView
    ): Promise<boolean> => {
      const localRec = recordOverride || findLocalRestaurantBySlugOrShopId(slugOrId);
      if (localRec) {
        setActiveShopId(localRec.shopId);
        setActiveShop(localRec.shop);
        setShopProducts(
          localRec.products && localRec.products.length > 0
            ? localRec.products
            : DEMO_PROJECTS[0]?.products || []
        );
        setShopOrders(loadLocalOrders(localRec.shopId));
        setShopTables(loadLocalTables(localRec.shopId));
        if (targetView) setView(targetView);
        return true;
      }

      const remoteShop = await findShopBySlugOrId(slugOrId);
      if (remoteShop) {
        setActiveShopId(remoteShop.id);
        setActiveShop(remoteShop);
        setShopOrders(loadLocalOrders(remoteShop.id));
        setShopTables(loadLocalTables(remoteShop.id));
        if (targetView) setView(targetView);
        return true;
      }

      return false;
    },
    []
  );

  // Detect URL /admin, /login, /signup, /menu/{slug}, /dashboard/{slug}, ?portal=..., ?shop=..., or ?mode=...
  useEffect(() => {
    const applyRouteFromLocation = () => {
      const { isAdminRoute, shopTarget, dashboardTarget, authRoute, tableLabel, shortcutMode } =
        parseRouteTarget();
      if (isAdminRoute) {
        setQrTargetShopId(null);
        setView('admin');
        return;
      }
      if (shopTarget) {
        setDemoPreview(null);
        setQrTargetShopId(shopTarget);
        setQrTableLabel(tableLabel);
        setView('storefront');
        return;
      }
      if (authRoute) {
        setQrTargetShopId(null);
        setAuthMode(authRoute);
        setView(authRoute);
        return;
      }
      if (dashboardTarget) {
        setQrTargetShopId(null);
        const storedSession = getStoredAuthSession();
        if (storedSession.token) {
          void hydrateStoreSession(dashboardTarget, null, 'dashboard');
        } else {
          try {
            localStorage.setItem('lastStore', dashboardTarget);
          } catch {
            // ignore
          }
          setAuthMode('login');
          setView('login');
        }
        return;
      }
      if (shortcutMode) {
        setPendingShortcutMode(shortcutMode);
      }
    };

    applyRouteFromLocation();
    window.addEventListener('popstate', applyRouteFromLocation);
    return () => window.removeEventListener('popstate', applyRouteFromLocation);
  }, [hydrateStoreSession]);

  // Subscribe / Resolve Public Customer Menu when viewing via ?shop= or /{slug}/menu
  useEffect(() => {
    if (!qrTargetShopId || demoPreview) return;
    let active = true;
    let unsubShop: (() => void) | null = null;
    let unsubProds: (() => void) | null = null;
    setPublicNotFound(false);

    const localRec = findLocalRestaurantBySlugOrShopId(qrTargetShopId);
    if (localRec) {
      setPublicShop(localRec.shop);
      setPublicProducts(
        localRec.products && localRec.products.length > 0
          ? localRec.products
          : DEMO_PROJECTS[0]?.products || []
      );
    }

    const resolveAndSubscribe = async () => {
      try {
        const fsShop = await findShopBySlugOrId(qrTargetShopId);
        if (!active) return;
        if (fsShop) {
          setPublicShop(fsShop);
          unsubShop = subscribeToShop(fsShop.id, (s) => {
            if (s && active) setPublicShop(s);
          });
          unsubProds = subscribeToProducts(fsShop.id, (p) => {
            if (active) setPublicProducts(p);
          });
        } else if (!localRec) {
          setPublicNotFound(true);
        }
      } catch {
        if (!localRec && active) setPublicNotFound(true);
      }
    };

    void resolveAndSubscribe();

    return () => {
      active = false;
      unsubShop?.();
      unsubProds?.();
    };
  }, [qrTargetShopId, demoPreview]);

  // Listen to Firebase Auth state AND honor persisted localStorage ("token" + "lastStore") auto-redirect
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

      const { isAdminRoute, shopTarget, dashboardTarget, authRoute, shortcutMode } =
        parseRouteTarget();
      const isSpecialRoute = Boolean(isAdminRoute || shopTarget);

      if (user && isUserActivated(user)) {
        try {
          const shops = await getOwnerShops(user.uid);
          if (shops.length > 0) {
            const firstShop = shops[0];
            const firstSlug = firstShop.storeSlug || firstShop.id;
            setActiveShopId(firstShop.id);
            setActiveShop(firstShop);
            upsertLocalRestaurant(
              shopToDemoRecord(firstShop, { email: user.email || '' })
            );
            setAuthSessionStorage(firstSlug, `fb-${user.uid}`);
            if (!isSpecialRoute && !authRoute) {
              const modeTarget = shortcutMode || pendingShortcutMode;
              setView(modeTarget === 'cashier' ? 'cashier' : 'dashboard');
              if (modeTarget !== 'cashier') {
                replacePathSafely(`/dashboard/${firstSlug}`);
              }
              if (pendingShortcutMode) setPendingShortcutMode(null);
            }
          }
        } catch {
          // handled gracefully
        }
      } else {
        const storedSession = getStoredAuthSession();
        const targetSlug = dashboardTarget || storedSession.lastStore;
        if (storedSession.token && targetSlug) {
          const modeTarget = shortcutMode || pendingShortcutMode;
          const nextView =
            !isSpecialRoute && !authRoute
              ? modeTarget === 'cashier'
                ? 'cashier'
                : 'dashboard'
              : undefined;
          const hydrated = await hydrateStoreSession(targetSlug, null, nextView);
          if (hydrated && nextView === 'dashboard') {
            const rec = findLocalRestaurantBySlugOrShopId(targetSlug);
            replacePathSafely(`/dashboard/${rec?.storeSlug || targetSlug}`);
          } else if (!hydrated) {
            setActiveShopId(null);
            setActiveShop(null);
          }
        } else {
          setActiveShopId(null);
          setActiveShop(null);
          setShopProducts([]);
          setShopOrders([]);
          setShopTables([]);
        }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [hydrateStoreSession, pendingShortcutMode]);

  // Real-time Firestore subscriptions for Merchant's Active Shop (when authenticated with Firebase)
  useEffect(() => {
    if (!activeShopId || !currentUser || !isUserActivated(currentUser)) return;
    if (!activeShopId.startsWith('shop-')) return;

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
    storeSlug?: string;
    password?: string;
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
      replacePathSafely('/admin');
      setView('admin');
    } else if (shops.length > 0) {
      const firstShop = shops[0];
      const firstSlug = firstShop.storeSlug || firstShop.id;
      setActiveShopId(firstShop.id);
      setActiveShop(firstShop);
      setAuthSessionStorage(firstSlug, `fb-${user.uid}`);
      replacePathSafely(`/dashboard/${firstSlug}`);
      setView('dashboard');
    } else {
      setView('onboarding');
    }
  };

  // On logout: remove ONLY "token", keep "lastStore" so login input stays pre-filled
  const handleLogout = async () => {
    clearAuthTokenKeepLastStore();
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // ignore offline signOut error
      }
    }
    setActiveShopId(null);
    setActiveShop(null);
    setShopProducts([]);
    setShopOrders([]);
    setShopTables([]);
    setAuthMode('login');
    replacePathSafely('/login');
    setView('login');
  };

  const isAdminUser = Boolean(
    currentUser?.emailVerified &&
      currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  const hasMerchantSession = Boolean(
    (currentUser && isUserActivated(currentUser)) ||
      (getStoredAuthSession().token && activeShop)
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
        isAuthenticated={hasMerchantSession}
        isAdminUser={isAdminUser}
        onNavigateAuth={(mode) => {
          setAuthMode(mode);
          pushPathSafely(`/${mode}`);
          setView(mode);
        }}
        onNavigateDashboard={async () => {
          if (currentUser && !activeShop) {
            const shops = await getOwnerShops(currentUser.uid);
            if (shops.length > 0) {
              const slug = shops[0].storeSlug || shops[0].id;
              setActiveShopId(shops[0].id);
              setActiveShop(shops[0]);
              replacePathSafely(`/dashboard/${slug}`);
              setView('dashboard');
            } else if (isAdminUser) {
              replacePathSafely('/admin');
              setView('admin');
            } else {
              setView('onboarding');
            }
          } else if (activeShop) {
            replacePathSafely(`/dashboard/${activeShop.storeSlug || activeShop.id}`);
            setView('dashboard');
          } else if (isAdminUser) {
            replacePathSafely('/admin');
            setView('admin');
          } else {
            setView('onboarding');
          }
        }}
        onOpenAdminPanel={() => {
          pushPathSafely('/admin');
          setView('admin');
        }}
        onOpenDemoMenu={(demo) => {
          setDemoPreview(demo);
          setQrTargetShopId(null);
          setQrTableLabel('');
          setView('storefront');
        }}
        onOpenStoreMenu={(storeSlug) => {
          setDemoPreview(null);
          setQrTargetShopId(storeSlug);
          setQrTableLabel('');
          pushPathSafely(`/menu/${storeSlug}`);
          setView('storefront');
        }}
        onStoreLoginSuccess={({ storeSlug, shopId, record }) => {
          const finalSlug = record?.storeSlug || storeSlug || shopId;
          replacePathSafely(`/dashboard/${finalSlug}`);
          void hydrateStoreSession(finalSlug, record, 'dashboard');
        }}
      />
    );
  }

  if (view === 'signup' || view === 'login') {
    return (
      <AuthPage
        initialMode={authMode}
        onBack={() => {
          replacePathSafely('/');
          setView('landing');
        }}
        onAuthComplete={(meta) => void handleAuthComplete(meta)}
        onStoreLoginSuccess={({ storeSlug, shopId, record }) => {
          const finalSlug = record?.storeSlug || storeSlug || shopId;
          replacePathSafely(`/dashboard/${finalSlug}`);
          void hydrateStoreSession(finalSlug, record, 'dashboard');
        }}
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
        initialStoreSlug={signupMeta.storeSlug}
        initialContact={signupMeta.contact}
        initialPassword={signupMeta.password}
        initialCountry={signupMeta.country}
        onCancel={() => {
          replacePathSafely('/');
          setView('landing');
        }}
        onCompleted={(newShop) => {
          const slug = newShop.storeSlug || newShop.id;
          setActiveShopId(newShop.id);
          setActiveShop(newShop);
          replacePathSafely(`/dashboard/${slug}`);
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
          forceZeroFeesGlobally={forceZeroFeesGlobally}
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
      if (publicNotFound) {
        return (
          <div dir="rtl" className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-orange-100 dark:border-slate-800 text-center space-y-4 shadow-sm">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                لم يتم العثور على هذا المنيو
              </h2>
              <p className="text-sm font-medium text-slate-500">
                تأكد من رابط المتجر أو عد إلى الصفحة الرئيسية.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState({}, '', '/');
                  setQrTargetShopId(null);
                  setPublicNotFound(false);
                  setView('landing');
                }}
                className="px-6 py-3 rounded-2xl bg-[#FF6A00] text-white font-extrabold text-sm"
              >
                العودة إلى الرئيسية
              </button>
            </div>
          </div>
        );
      }
      if (!publicShop) {
        return <PlatformLoader subtitle="جاري تحميل المنيو..." />;
      }
      return (
        <StorefrontPage
          shop={publicShop}
          products={publicProducts}
          initialTableLabel={qrTableLabel}
          forceZeroFeesGlobally={forceZeroFeesGlobally}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onOrderPlaced={(newOrder) => {
            if (!publicShop.id.startsWith('shop-')) {
              const existing = loadLocalOrders(publicShop.id);
              const next = [newOrder, ...existing.filter((o) => o.id !== newOrder.id)];
              saveLocalOrders(publicShop.id, next);
              if (activeShopId === publicShop.id) {
                setShopOrders(next);
              }
            }
          }}
          onBack={() => {
            setQrTargetShopId(null);
            if (activeShop) {
              replacePathSafely(`/dashboard/${activeShop.storeSlug || activeShop.id}`);
              setView('dashboard');
            } else {
              replacePathSafely('/');
              setView('landing');
            }
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
          forceZeroFeesGlobally={forceZeroFeesGlobally}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onOrderPlaced={(newOrder) => {
            if (!activeShop.id.startsWith('shop-')) {
              setShopOrders((prev) => {
                const next = [newOrder, ...prev.filter((o) => o.id !== newOrder.id)];
                saveLocalOrders(activeShop.id, next);
                return next;
              });
            }
          }}
          onBack={() => {
            replacePathSafely(`/dashboard/${activeShop.storeSlug || activeShop.id}`);
            setView('dashboard');
          }}
          backLabel="لوحة التحكم"
        />
      );
    }
  }

  if (view === 'admin') {
    return (
      <AdminPage
        onBack={() => {
          if (activeShop) {
            replacePathSafely(`/dashboard/${activeShop.storeSlug || activeShop.id}`);
            setView('dashboard');
          } else {
            replacePathSafely('/');
            setView('landing');
          }
        }}
        onPlatformConfigChange={(settings) => {
          setForceZeroFeesGlobally(Boolean(settings.forceZeroFeesGlobally));
        }}
        onPreviewShop={(shopItem) => {
          const targetSlug = shopItem.storeSlug || shopItem.id;
          setDemoPreview(null);
          setQrTargetShopId(targetSlug);
          setQrTableLabel('');
          pushPathSafely(`/menu/${targetSlug}`);
          setView('storefront');
        }}
      />
    );
  }

  // Enforce 7-day trial expiration & Admin-only approval on Merchant Portal views
  if (
    activeShop &&
    hasMerchantSession &&
    (view === 'dashboard' || view === 'cashier' || view === 'orders' || view === 'share')
  ) {
    const shopAccess = getShopAccessState(activeShop);
    if (!shopAccess.isActive) {
      const waText = encodeURIComponent(
        `مرحباً إدارة غزالو، أرغب في تفعيل منيو مطعم (${activeShop.nameAr})`
      );
      const mailSubject = encodeURIComponent(`تفعيل منيو ${activeShop.nameAr} - Ghazalo`);

      const expiredShopName = getShopDisplayName(activeShop, isEn);
      return (
        <div
          dir={isEn ? 'ltr' : 'rtl'}
          className="min-h-screen bg-orange-50/30 dark:bg-slate-950 flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-orange-200 dark:border-amber-800 shadow-sm space-y-5 relative">
            <button
              type="button"
              onClick={toggleLang}
              className={`absolute top-4 ${
                isEn ? 'right-4' : 'left-4'
              } px-2.5 py-1 rounded-full bg-orange-50 dark:bg-slate-800 text-[#FF6A00] dark:text-orange-300 text-xs font-extrabold inline-flex items-center gap-1`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isEn ? 'عربي' : 'EN'}</span>
            </button>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-orange-100 dark:bg-amber-950/60 text-[#FF6A00] dark:text-amber-300 mx-auto flex items-center justify-center">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug">
                  {tx(
                    isEn,
                    'المنيو متوقف مؤقتاً، انتهت الفترة المجانية، فعل اشتراكك لتشغيل المنيو',
                    'Menu temporarily paused — your free trial ended. Activate a plan to resume.'
                  )}
                </h1>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                  {tx(isEn, 'تم إيقاف متجر ', 'Store ')}
                  <span className="text-[#FF6A00] dark:text-orange-400">"{expiredShopName}"</span>{' '}
                  {tx(
                    isEn,
                    'لحين التفعيل من الإدارة. جميع أصنافك وبياناتك محفوظة بأمان.',
                    'is paused pending activation. All your menu items and data are safely preserved.'
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl border border-orange-200 dark:border-slate-700 bg-orange-50/40 dark:bg-slate-800/70 space-y-1">
                <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {tx(isEn, 'الباقة الشهرية (30 يوم)', 'Monthly Plan (30 days)')}
                </div>
                <div className="text-xl font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
                  {SUBSCRIPTION_PRICING.MONTHLY_EGP} {tx(isEn, 'جنيه / شهري', 'EGP / month')}
                </div>
              </div>

              <div className="p-4 rounded-2xl border-2 border-[#FF6A00] bg-orange-50 dark:bg-orange-950/40 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {tx(isEn, 'الباقة السنوية (365 يوم)', 'Yearly Plan (365 days)')}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-300 text-slate-900 text-[11px] font-extrabold">
                    {tx(
                      isEn,
                      `وفّر ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه`,
                      `Save ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} EGP`
                    )}
                  </span>
                </div>
                <div className="text-xl font-extrabold text-[#FF6A00] dark:text-orange-400 tabular-nums">
                  {SUBSCRIPTION_PRICING.YEARLY_EGP} {tx(isEn, 'جنيه / سنوي', 'EGP / year')}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-1 border-t border-orange-100 dark:border-slate-800">
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 px-4 rounded-full bg-[#FF6A00] hover:bg-[#E55E00] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {tx(isEn, 'تواصل للتفعيل واتساب:', 'Activate via WhatsApp:')} {SUPPORT_CONTACT.PHONE_DISPLAY}
                </span>
              </a>

              <a
                href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${mailSubject}`}
                className="w-full py-3.5 px-4 rounded-full bg-orange-50 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-slate-700 text-[#FF6A00] dark:text-orange-200 border border-orange-200 dark:border-slate-700 font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span dir="ltr">{SUPPORT_CONTACT.EMAIL}</span>
              </a>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    const localRec = findLocalRestaurantBySlugOrShopId(
                      activeShop.storeSlug || activeShop.id
                    );
                    if (localRec) {
                      setActiveShop(localRec.shop);
                    }
                    if (currentUser && activeShop.id.startsWith('shop-')) {
                      try {
                        const shops = await getOwnerShops(currentUser.uid);
                        if (shops.length > 0) setActiveShop(shops[0]);
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  className="py-3 rounded-full glass-btn text-[#FF6A00] dark:text-orange-200 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  {tx(isEn, 'تحديث الحالة', 'Refresh Status')}
                </button>

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="py-3 rounded-full glass-btn text-slate-600 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  {tx(isEn, 'تسجيل الخروج', 'Log Out')}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  if (view === 'cashier' && activeShop && hasMerchantSession) {
    return (
      <CashierPage
        shop={activeShop}
        products={shopProducts}
        tables={shopTables}
        orders={shopOrders}
        forceZeroFeesGlobally={forceZeroFeesGlobally}
        onBackDashboard={() => setView('dashboard')}
        onOrderCreated={(newOrder) => {
          if (!activeShop.id.startsWith('shop-')) {
            setShopOrders((prev) => {
              const next = [newOrder, ...prev.filter((o) => o.id !== newOrder.id)];
              saveLocalOrders(activeShop.id, next);
              return next;
            });
          }
        }}
        onOrderStatusChange={(orderId, nextStatus) => {
          if (!activeShop.id.startsWith('shop-')) {
            setShopOrders((prev) => {
              const next = prev.map((o) =>
                o.id === orderId ? { ...o, status: nextStatus } : o
              );
              saveLocalOrders(activeShop.id, next);
              return next;
            });
          }
        }}
      />
    );
  }

  if (view === 'orders' && activeShop && hasMerchantSession) {
    return (
      <OrdersPage
        shop={activeShop}
        orders={shopOrders}
        onBackDashboard={() => setView('dashboard')}
        onOpenCashier={() => setView('cashier')}
        onOrderStatusUpdated={(orderId, nextStatus) => {
          if (!activeShop.id.startsWith('shop-')) {
            setShopOrders((prev) => {
              const next = prev.map((o) =>
                o.id === orderId ? { ...o, status: nextStatus } : o
              );
              saveLocalOrders(activeShop.id, next);
              return next;
            });
          }
        }}
      />
    );
  }

  if (view === 'share' && activeShop && hasMerchantSession) {
    return (
      <ShareQrPage
        shop={activeShop}
        tables={shopTables}
        onBackDashboard={() => setView('dashboard')}
        onLocalTableAdd={(label) => {
          const newTbl: ShopTable = {
            id: `tbl-${Date.now()}`,
            shopId: activeShop.id,
            shopOwnerId: activeShop.ownerId,
            label,
          };
          setShopTables((prev) => {
            const next = [...prev, newTbl];
            saveLocalTables(activeShop.id, next);
            return next;
          });
        }}
        onLocalTableDelete={(tableId) => {
          setShopTables((prev) => {
            const next = prev.filter((t) => t.id !== tableId);
            saveLocalTables(activeShop.id, next);
            return next;
          });
        }}
        onOpenStorefront={(tbl) => {
          const slug = activeShop.storeSlug || activeShop.id;
          setDemoPreview(null);
          setQrTargetShopId(null);
          setQrTableLabel(tbl || '');
          pushPathSafely(`/menu/${slug}${tbl ? `?table=${encodeURIComponent(tbl)}` : ''}`);
          setView('storefront');
        }}
      />
    );
  }

  if (activeShop && hasMerchantSession) {
    return (
      <DashboardPage
        shop={activeShop}
        products={shopProducts}
        orders={shopOrders}
        userName={
          currentUser?.displayName || signupMeta.fullName || activeShop.nameAr || 'تاجر Ghazalo'
        }
        userEmail={
          formatAuthContactLabel(currentUser?.email) ||
          signupMeta.contact ||
          activeShop.whatsapp ||
          ''
        }
        isAdminUser={isAdminUser}
        forceZeroFeesGlobally={forceZeroFeesGlobally}
        darkMode={darkMode}
        onSetThemeMode={handleSetThemeMode}
        onShopUpdated={(updated) => setActiveShop(updated)}
        onProductsUpdated={(updatedProducts) => setShopProducts(updatedProducts)}
        onOpenStorefront={() => {
          const slug = activeShop.storeSlug || activeShop.id;
          setDemoPreview(null);
          setQrTargetShopId(null);
          setQrTableLabel('');
          pushPathSafely(`/menu/${slug}`);
          setView('storefront');
        }}
        onOpenCashier={() => setView('cashier')}
        onOpenOrders={() => setView('orders')}
        onOpenShareQr={() => setView('share')}
        onOpenAdmin={() => {
          pushPathSafely('/admin');
          setView('admin');
        }}
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
        pushPathSafely(`/${mode}`);
        setView(mode);
      }}
      onNavigateDashboard={() => setView('onboarding')}
      onOpenDemoMenu={(demo) => {
        setDemoPreview(demo);
        setQrTargetShopId(null);
        setQrTableLabel('');
        setView('storefront');
      }}
      onOpenStoreMenu={(storeSlug) => {
        setDemoPreview(null);
        setQrTargetShopId(storeSlug);
        setQrTableLabel('');
        pushPathSafely(`/menu/${storeSlug}`);
        setView('storefront');
      }}
      onStoreLoginSuccess={({ storeSlug, shopId, record }) => {
        const finalSlug = record?.storeSlug || storeSlug || shopId;
        replacePathSafely(`/dashboard/${finalSlug}`);
        void hydrateStoreSession(finalSlug, record, 'dashboard');
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
