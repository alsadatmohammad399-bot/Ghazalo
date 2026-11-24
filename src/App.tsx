import React, { useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Globe, Lock, LogOut, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import { auth } from './firebase';
import {
  fetchProductsOnce,
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
import { isUserActivated } from './utils/authHelpers';
import {
  clearPendingSignupMeta,
  loadPendingSignupMeta,
} from './components/AuthFormPanel';
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
import { buildFallbackStoreForSlug, findDemoStoreBySlug } from './data/stores';
import { fetchPublicStoreSnapshot, syncPublicStoreSnapshot } from './utils/menuLink';
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
import { MenuPage } from './pages/MenuPage';
import {
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

  const menuPathMatch = pathname.match(/^\/menu\/([^/?#]+)\/?$/i);
  const legacyMenuMatch = pathname.match(/^\/([^/?#]+)\/menu\/?$/i);
  const rawMenuSegment = menuPathMatch
    ? menuPathMatch[1]
    : legacyMenuMatch
      ? legacyMenuMatch[1]
      : shopParam;
  let shopTarget: string | null = rawMenuSegment;
  if (shopTarget) {
    try {
      shopTarget = decodeURIComponent(shopTarget);
    } catch {
      // keep raw segment
    }
  }

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

interface AppShellProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  forceZeroFeesGlobally: boolean;
  setForceZeroFeesGlobally: React.Dispatch<React.SetStateAction<boolean>>;
}

function AppShell({
  darkMode,
  setDarkMode,
  forceZeroFeesGlobally,
  setForceZeroFeesGlobally,
}: AppShellProps) {
  const { isEn, toggleLang } = useUiLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<AppView>('landing');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authSyncTick, setAuthSyncTick] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [bootSplash, setBootSplash] = useState(() => !parseRouteTarget().shopTarget);

  const replacePathSafely = useCallback(
    (nextPath: string) => {
      try {
        if (location.pathname + location.search !== nextPath) {
          navigate(nextPath, { replace: true });
        }
      } catch {
        // ignore router restriction
      }
    },
    [location.pathname, location.search, navigate]
  );

  const pushPathSafely = useCallback(
    (nextPath: string) => {
      try {
        if (location.pathname + location.search !== nextPath) {
          navigate(nextPath);
        }
      } catch {
        // ignore router restriction
      }
    },
    [location.pathname, location.search, navigate]
  );

  useEffect(() => {
    if (!bootSplash) return;
    const timer = window.setTimeout(() => {
      setBootSplash(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [bootSplash]);

  const [signupMeta, setSignupMeta] = useState<{
    fullName: string;
    businessName: string;
    storeSlug?: string;
    password?: string;
    country: string;
    contact: string;
  }>(
    () =>
      loadPendingSignupMeta() || {
        fullName: '',
        businessName: '',
        country: 'مصر',
        contact: '',
      }
  );

  // Active Merchant Shop State
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [shopProducts, setShopProducts] = useState<Product[]>([]);
  const [shopOrders, setShopOrders] = useState<Order[]>([]);
  const [shopTables, setShopTables] = useState<ShopTable[]>([]);

  // Public Storefront / Demo State
  const [demoPreview, setDemoPreview] = useState<DemoProject | null>(null);
  const [demoReturnView, setDemoReturnView] = useState<'landing' | 'dashboard'>('landing');
  const [qrTargetShopId, setQrTargetShopId] = useState<string | null>(null);
  const [qrTableLabel, setQrTableLabel] = useState<string>('');
  const [publicShop, setPublicShop] = useState<Shop | null>(null);
  const [publicProducts, setPublicProducts] = useState<Product[]>([]);
  const [isFallbackMenu, setIsFallbackMenu] = useState(false);
  const [isPublicMenuLoading, setIsPublicMenuLoading] = useState(false);

  const handleSetThemeMode = (mode: 'light' | 'dark' | 'system') => {
    if (mode === 'system') {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    } else {
      setDarkMode(mode === 'dark');
    }
  };

  const [pendingShortcutMode, setPendingShortcutMode] = useState<'cashier' | 'dashboard' | null>(null);

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
        const initialProducts = localRec.products || [];
        setShopProducts(initialProducts);
        setShopOrders(loadLocalOrders(localRec.shopId));
        setShopTables(loadLocalTables(localRec.shopId));
        if (targetView) setView(targetView);

        if (initialProducts.length === 0 && localRec.shopId.startsWith('shop-')) {
          void (async () => {
            try {
              const [fsProds, snap] = await Promise.all([
                fetchProductsOnce(localRec.shopId).catch(() => []),
                fetchPublicStoreSnapshot(localRec.storeSlug || slugOrId).catch(() => null),
              ]);
              const resolved = fsProds.length > 0 ? fsProds : snap?.products || [];
              if (resolved.length > 0) {
                setShopProducts(resolved);
                upsertLocalRestaurant(
                  shopToDemoRecord(localRec.shop, {
                    ...localRec,
                    products: resolved,
                  })
                );
              }
            } catch {
              // keep existing empty array
            }
          })();
        }
        return true;
      }

      const remoteShop = await findShopBySlugOrId(slugOrId);
      if (remoteShop) {
        setActiveShopId(remoteShop.id);
        setActiveShop(remoteShop);
        const [fsProds, snap] = await Promise.all([
          fetchProductsOnce(remoteShop.id).catch(() => []),
          fetchPublicStoreSnapshot(remoteShop.storeSlug || slugOrId).catch(() => null),
        ]);
        const resolvedProds = fsProds.length > 0 ? fsProds : snap?.products || [];
        setShopProducts(resolvedProds);
        setShopOrders(loadLocalOrders(remoteShop.id));
        setShopTables(loadLocalTables(remoteShop.id));
        upsertLocalRestaurant(shopToDemoRecord(remoteShop, { products: resolvedProds }));
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
      if (location.pathname === '/onboarding') {
        setQrTargetShopId(null);
        setView('onboarding');
        return;
      }
      if (shortcutMode) {
        setPendingShortcutMode(shortcutMode);
      }
    };

    applyRouteFromLocation();
  }, [hydrateStoreSession, location.pathname, location.search]);

  // Subscribe / Resolve Public Customer Menu when viewing via ?shop=:slug (no login or localStorage required)
  useEffect(() => {
    if (!qrTargetShopId || demoPreview) return;
    let active = true;
    let unsubShop: (() => void) | null = null;
    let unsubProds: (() => void) | null = null;

    const demoStoreMatch = findDemoStoreBySlug(qrTargetShopId);
    const localRec = findLocalRestaurantBySlugOrShopId(qrTargetShopId);
    const demoProjectMatch = DEMO_PROJECTS.find(
      (p) =>
        p.id.toLowerCase() === qrTargetShopId.toLowerCase() ||
        p.shop.storeSlug?.toLowerCase() === qrTargetShopId.toLowerCase()
    );

    if (localRec) {
      setPublicShop(localRec.shop);
      setPublicProducts(localRec.products || []);
      setIsFallbackMenu(false);
      setIsPublicMenuLoading(false);
    } else if (demoStoreMatch) {
      setPublicShop(demoStoreMatch.shop);
      setPublicProducts(demoStoreMatch.products);
      setIsFallbackMenu(false);
      setIsPublicMenuLoading(false);
    } else if (demoProjectMatch) {
      setPublicShop(demoProjectMatch.shop);
      setPublicProducts(demoProjectMatch.products);
      setIsFallbackMenu(false);
      setIsPublicMenuLoading(false);
    } else {
      setIsFallbackMenu(false);
      setIsPublicMenuLoading(true);
    }

    const resolveAndSubscribe = async () => {
      const [fsShop, remoteSnapshot] = await Promise.all([
        findShopBySlugOrId(qrTargetShopId).catch(() => null),
        fetchPublicStoreSnapshot(qrTargetShopId).catch(() => null),
      ]);
      if (!active) return;

      const localUpdated = localRec?.updatedAt || 0;
      const snapUpdated = remoteSnapshot?.updatedAt || 0;

      if (fsShop) {
        const fsProds = await fetchProductsOnce(fsShop.id).catch(() => []);
        if (!active) return;

        const chosenProducts =
          fsProds.length > 0
            ? fsProds
            : localRec?.products && localRec.products.length > 0
              ? localRec.products
              : remoteSnapshot?.products || [];

        const preferRemoteSnap = Boolean(remoteSnapshot && snapUpdated > localUpdated);
        const mergedShop: Shop = preferRemoteSnap && remoteSnapshot
          ? {
              ...remoteSnapshot.shop,
              subscriptionStatus: fsShop.subscriptionStatus,
              plan: fsShop.plan,
              subscriptionExpiresAt: fsShop.subscriptionExpiresAt,
              trialEndsAt: fsShop.trialEndsAt,
              approvedByAdmin: fsShop.approvedByAdmin,
              approvedAt: fsShop.approvedAt,
            }
          : localRec && localUpdated > snapUpdated
            ? {
                ...localRec.shop,
                subscriptionStatus: fsShop.subscriptionStatus,
                plan: fsShop.plan,
                subscriptionExpiresAt: fsShop.subscriptionExpiresAt,
                trialEndsAt: fsShop.trialEndsAt,
                approvedByAdmin: fsShop.approvedByAdmin,
                approvedAt: fsShop.approvedAt,
              }
            : fsShop;

        setPublicShop(mergedShop);
        setPublicProducts(chosenProducts);
        setIsFallbackMenu(false);
        setIsPublicMenuLoading(false);

        unsubShop = subscribeToShop(
          fsShop.id,
          (s) => {
            if (s && active) setPublicShop(s);
          },
          () => {
            // non-fatal listener error
          }
        );
        unsubProds = subscribeToProducts(
          fsShop.id,
          (p) => {
            if (active && p.length > 0) setPublicProducts(p);
          },
          () => {
            // non-fatal listener error
          }
        );
        return;
      }

      if (remoteSnapshot && (!localRec || snapUpdated >= localUpdated)) {
        setPublicShop(remoteSnapshot.shop);
        setPublicProducts(remoteSnapshot.products || []);
        setIsFallbackMenu(false);
        setIsPublicMenuLoading(false);
        return;
      }

      if (!localRec && !demoStoreMatch && !demoProjectMatch) {
        const generic = buildFallbackStoreForSlug(qrTargetShopId);
        setPublicShop(generic.shop);
        setPublicProducts(generic.products);
        setIsFallbackMenu(true);
        setIsPublicMenuLoading(false);
      } else {
        setIsPublicMenuLoading(false);
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
      const isRootHome =
        !isSpecialRoute &&
        !authRoute &&
        !dashboardTarget &&
        !shortcutMode &&
        window.location.pathname !== '/onboarding';

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
            if (!isSpecialRoute && !authRoute && !isRootHome) {
              const modeTarget = shortcutMode || pendingShortcutMode;
              setView(modeTarget === 'cashier' ? 'cashier' : 'dashboard');
              if (modeTarget !== 'cashier') {
                replacePathSafely(`/dashboard/${firstSlug}`);
              }
              if (pendingShortcutMode) setPendingShortcutMode(null);
            }
          } else if (!isSpecialRoute && !isRootHome) {
            if (authRoute || window.location.pathname === '/onboarding') {
              const pending = loadPendingSignupMeta();
              if (pending) {
                setSignupMeta((prev) => (prev.contact ? prev : pending));
              }
              setView('onboarding');
              replacePathSafely('/onboarding');
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
            !isSpecialRoute && !authRoute && !isRootHome
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
    const shops = await getOwnerShops(user.uid);
    if (shops.length > 0) {
      const firstShop = shops[0];
      const firstSlug = firstShop.storeSlug || firstShop.id;
      setActiveShopId(firstShop.id);
      setActiveShop(firstShop);
      setAuthSessionStorage(firstSlug, `fb-${user.uid}`);
      replacePathSafely(`/dashboard/${firstSlug}`);
      setView('dashboard');
    } else {
      replacePathSafely('/onboarding');
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

  const hasMerchantSession = Boolean(
    (currentUser && isUserActivated(currentUser)) ||
      (getStoredAuthSession().token && activeShop)
  );

  if (view !== 'storefront' && (bootSplash || !authReady)) {
    return <PlatformLoader subtitle="جاري تحميل المنصة..." />;
  }

  if (view === 'landing') {
    return (
      <LandingPage
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        isAuthenticated={hasMerchantSession}
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
            } else {
              replacePathSafely('/onboarding');
              setView('onboarding');
            }
          } else if (activeShop) {
            replacePathSafely(`/dashboard/${activeShop.storeSlug || activeShop.id}`);
            setView('dashboard');
          } else {
            replacePathSafely('/onboarding');
            setView('onboarding');
          }
        }}
        onOpenDemoMenu={(demo) => {
          setDemoReturnView('landing');
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
        onAuthComplete={(meta) => void handleAuthComplete(meta)}
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
        ownerEmail={currentUser.email || ''}
        initialBusinessName={signupMeta.businessName}
        initialStoreSlug={signupMeta.storeSlug}
        initialContact={signupMeta.contact}
        initialPassword={signupMeta.password}
        initialCountry={signupMeta.country}
        onCancel={() => {
          replacePathSafely('/');
          setView('landing');
        }}
        onCompleted={(newShop, createdProducts) => {
          clearPendingSignupMeta();
          const slug = newShop.storeSlug || newShop.id;
          const initialProducts = createdProducts || [];
          setActiveShopId(newShop.id);
          setActiveShop(newShop);
          setShopProducts(initialProducts);
          void syncPublicStoreSnapshot(newShop, initialProducts);
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
          key={`${demoPreview.shop.id}-${demoPreview.shop.menuTemplate}-${demoPreview.shop.themeColor}-${demoPreview.shop.themeMode}`}
          shop={demoPreview.shop}
          products={demoPreview.products}
          isDemo
          forceZeroFeesGlobally={forceZeroFeesGlobally}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onBack={() => {
            setDemoPreview(null);
            setView(demoReturnView);
          }}
          backLabel={demoReturnView === 'dashboard' ? 'لوحة التحكم' : 'الرئيسية'}
        />
      );
    }

    if (qrTargetShopId) {
      const resolvedPublic = publicShop
        ? { shop: publicShop, products: publicProducts }
        : buildFallbackStoreForSlug(qrTargetShopId);
      return (
        <StorefrontPage
          shop={resolvedPublic.shop}
          products={resolvedPublic.products}
          initialTableLabel={qrTableLabel}
          isFallbackMenu={isFallbackMenu}
          isLoading={isPublicMenuLoading}
          onCreateFreeStore={() => {
            setQrTargetShopId(null);
            setIsFallbackMenu(false);
            setAuthMode('signup');
            pushPathSafely('/signup');
            setView('signup');
          }}
          forceZeroFeesGlobally={forceZeroFeesGlobally}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onOrderPlaced={(newOrder) => {
            if (!resolvedPublic.shop.id.startsWith('shop-')) {
              const existing = loadLocalOrders(resolvedPublic.shop.id);
              const next = [newOrder, ...existing.filter((o) => o.id !== newOrder.id)];
              saveLocalOrders(resolvedPublic.shop.id, next);
              if (activeShopId === resolvedPublic.shop.id) {
                setShopOrders(next);
              }
            }
          }}
          onBack={() => {
            setQrTargetShopId(null);
            setIsFallbackMenu(false);
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
          setQrTargetShopId(null);
          setQrTableLabel('');
          navigate(`/menu/${targetSlug}`, {
            state: { shop: shopItem },
          });
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
          className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB] flex items-center justify-center p-4"
        >
          <div className="max-w-[520px] w-full sf-card p-6 sm:p-7 space-y-5 relative">
            <button
              type="button"
              onClick={toggleLang}
              className={`absolute top-4 ${
                isEn ? 'right-4' : 'left-4'
              } px-3 py-1.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] border border-[#86EFAC] dark:border-[#2C3D32] text-xs font-extrabold inline-flex items-center gap-1`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isEn ? 'عربي' : 'EN'}</span>
            </button>
            <div className="text-center space-y-3 pt-2">
              <div className="w-16 h-16 rounded-[20px] bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] border border-[#86EFAC] dark:border-[#2C3D32] mx-auto flex items-center justify-center">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h1 className="text-xl sm:text-2xl font-black text-[#14201A] dark:text-[#E8F2EB] leading-snug">
                  {tx(
                    isEn,
                    'انتهت الفترة المجانية، لتفعيل المنيو تواصل مع إدارة غزالو',
                    'Free trial ended — contact Ghazalo team to activate your menu'
                  )}
                </h1>
                <p className="text-sm font-bold text-[#4B5B52] dark:text-[#A3B5AA] leading-relaxed">
                  {tx(isEn, 'تم إيقاف متجر ', 'Store ')}
                  <span className="text-[#15803D] dark:text-[#BBF7D0] font-black">"{expiredShopName}"</span>{' '}
                  {tx(
                    isEn,
                    'لحين التفعيل من الإدارة. جميع أصنافك وبياناتك محفوظة بأمان.',
                    'is paused pending activation. All your menu items and data are safely preserved.'
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-[18px] border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#173323] space-y-1">
                <div className="font-extrabold text-sm text-[#14201A] dark:text-[#E8F2EB]">
                  {tx(isEn, 'الباقة الشهرية (30 يوم)', 'Monthly Plan (30 days)')}
                </div>
                <div className="text-xl font-black text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
                  {SUBSCRIPTION_PRICING.MONTHLY_EGP} {tx(isEn, 'جنيه / شهري', 'EGP / month')}
                </div>
              </div>

              <div className="p-4 rounded-[18px] border-2 border-[#15803D] bg-[#DCFCE7] dark:bg-[#173323] space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-extrabold text-sm text-[#14201A] dark:text-[#E8F2EB]">
                    {tx(isEn, 'الباقة السنوية (365 يوم)', 'Yearly Plan (365 days)')}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#FACC15] text-[#14201A] text-[11px] font-black">
                    {tx(
                      isEn,
                      `وفّر ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} جنيه`,
                      `Save ${SUBSCRIPTION_PRICING.YEARLY_SAVINGS_EGP} EGP`
                    )}
                  </span>
                </div>
                <div className="text-xl font-black text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
                  {SUBSCRIPTION_PRICING.YEARLY_EGP} {tx(isEn, 'جنيه / سنوي', 'EGP / year')}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-[#CFE3D5] dark:border-[#2C3D32]">
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="sf-btn-primary w-full text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {tx(isEn, 'تواصل للتفعيل واتساب:', 'Activate via WhatsApp:')} {SUPPORT_CONTACT.PHONE_DISPLAY}
                </span>
              </a>

              <a
                href={`mailto:${SUPPORT_CONTACT.EMAIL}?subject=${mailSubject}`}
                className="sf-btn-mint w-full text-sm"
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
                  className="sf-btn text-xs text-[#15803D] dark:text-[#BBF7D0]"
                >
                  <RefreshCw className="w-4 h-4" />
                  {tx(isEn, 'تحديث الحالة', 'Refresh Status')}
                </button>

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="sf-btn text-xs text-[#4B5B52] dark:text-[#A3B5AA]"
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
          void syncPublicStoreSnapshot(activeShop, shopProducts);
          navigate(`/menu/${slug}${tbl ? `?table=${encodeURIComponent(tbl)}` : ''}`, {
            state: { shop: activeShop, products: shopProducts },
          });
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
          currentUser?.email ||
          signupMeta.contact ||
          activeShop.whatsapp ||
          ''
        }
        isAdminUser={false}
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
          void syncPublicStoreSnapshot(activeShop, shopProducts);
          navigate(`/menu/${slug}`, {
            state: { shop: activeShop, products: shopProducts },
          });
        }}
        onTryDemoWithStyle={({ templateId, themeColor, themeMode }) => {
          const baseDemo = DEMO_PROJECTS[0];
          const styledDemo: DemoProject = {
            ...baseDemo,
            shop: {
              ...baseDemo.shop,
              menuTemplate: templateId,
              themeColor,
              themeMode,
            },
          };
          setDemoReturnView('dashboard');
          setDemoPreview(styledDemo);
          setQrTargetShopId(null);
          setQrTableLabel('');
          setView('storefront');
        }}
        onOpenCashier={() => setView('cashier')}
        onOpenOrders={() => setView('orders')}
        onOpenShareQr={() => setView('share')}
        onOpenAdmin={() => {
          // Admin portal is private URL only
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
        setDemoReturnView('landing');
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
      onAuthComplete={(meta) => void handleAuthComplete(meta)}
      onStoreLoginSuccess={({ storeSlug, shopId, record }) => {
        const finalSlug = record?.storeSlug || storeSlug || shopId;
        replacePathSafely(`/dashboard/${finalSlug}`);
        void hydrateStoreSession(finalSlug, record, 'dashboard');
      }}
    />
  );
}

function AppRouter() {
  const [darkMode, setDarkMode] = useState(false);
  const [forceZeroFeesGlobally, setForceZeroFeesGlobally] = useState<boolean>(
    () => getPlatformSettingsLocal().forceZeroFeesGlobally
  );

  // Apply Dark Mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

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

  const appShellNode = (
    <AppShell
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      forceZeroFeesGlobally={forceZeroFeesGlobally}
      setForceZeroFeesGlobally={setForceZeroFeesGlobally}
    />
  );

  const menuPageNode = (
    <MenuPage
      forceZeroFeesGlobally={forceZeroFeesGlobally}
      darkMode={darkMode}
      onToggleDarkMode={() => setDarkMode((d) => !d)}
    />
  );

  return (
    <Routes>
      <Route path="/" element={appShellNode} />
      <Route path="/login" element={appShellNode} />
      <Route path="/signup" element={appShellNode} />
      <Route path="/onboarding" element={appShellNode} />
      <Route path="/admin/*" element={appShellNode} />
      <Route path="/dashboard/*" element={appShellNode} />
      <Route path="/menu/:slug" element={menuPageNode} />
      <Route path="/:slug/menu" element={menuPageNode} />
      <Route path="*" element={menuPageNode} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
      <OfflineIndicator />
    </ErrorBoundary>
  );
}
