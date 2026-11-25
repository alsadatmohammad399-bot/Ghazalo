import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { toWhatsAppNumber } from '../utils/phone';
import {
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Unlock,
  X,
} from 'lucide-react';
import { GhazaloLogo } from '../components/BrandLogo';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { PlatformLoader } from '../components/PlatformLoader';
import { QrCodeImage, downloadQrPng } from '../components/QrToolkit';
import { auth, googleProvider } from '../firebase';
import {
  approveAndActivateShop,
  backfillAllShopsMissingPhotos,
  extendTrialShop,
  getAllStoreCredentials,
  saveAdminCustomPin,
  savePlatformConfig,
  subscribeToAllShops,
  suspendShop,
  updateShop,
} from '../services/firestoreService';
import { formatArabicDate, getShopAccessState } from '../utils/calculations';
import { copyMenuLink, getAbsoluteMenuUrl, syncPublicStoreSnapshot } from '../utils/menuLink';
import {
  LS_KEYS,
  getLocalRestaurants,
  getLocalUsers,
  getPlatformSettingsLocal,
  saveLocalRestaurants,
  saveLocalUsers,
  savePlatformSettingsLocal,
  shopToDemoRecord,
  upsertLocalRestaurant,
} from '../utils/storeRegistry';
import {
  ADMIN_EMAIL,
  ADMIN_PORTAL_KEY,
  SUBSCRIPTION_PRICING,
  normalizeStoreSlug,
  type DemoRestaurantRecord,
  type PlatformSettings,
  type Shop,
  type StoreCredentialRecord,
  type SubscriptionStatus,
} from '../types';

interface AdminPageProps {
  onBack: () => void;
  onPreviewShop?: (shop: Shop) => void;
  onPlatformConfigChange?: (settings: PlatformSettings) => void;
}

type AdminFilterId = 'all' | 'trial' | 'monthly' | 'yearly' | 'expired' | 'suspended';

interface ServerAdminStoreEntry {
  shopId: string;
  storeSlug: string;
  ownerId?: string;
  nameAr: string;
  email?: string;
  phone?: string;
  resetCode?: string;
  resetCodeExpiresAt?: number;
  createdAt?: number;
  updatedAt?: number;
  shop?: Partial<Shop>;
  productsCount?: number;
}

interface UnifiedRestaurantRow {
  shopId: string;
  storeSlug: string;
  nameAr: string;
  email: string;
  phone: string;
  password: string;
  resetCode?: string;
  resetCodeExpiresAt?: number;
  createdAt: number;
  productsCount?: number;
  subscriptionDateFormatted: string;
  daysLeft: number;
  statusCategory: Exclude<AdminFilterId, 'all'>;
  statusLabel: string;
  deliveryFee: number;
  shop: Shop;
  fromFirestore: boolean;
  localRecord?: DemoRestaurantRecord;
}

export const AdminPage: React.FC<AdminPageProps> = ({
  onBack,
  onPreviewShop,
  onPlatformConfigChange,
}) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authLoading, setAuthLoading] = useState(true);

  const [adminToken, setAdminToken] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEYS.ADMIN_TOKEN) || '';
    } catch {
      return '';
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  const [firestoreShops, setFirestoreShops] = useState<Shop[]>([]);
  const [firestoreCreds, setFirestoreCreds] = useState<StoreCredentialRecord[]>([]);
  const [serverStores, setServerStores] = useState<ServerAdminStoreEntry[]>([]);
  const [serverCodes, setServerCodes] = useState<
    Record<string, { resetCode?: string; resetCodeExpiresAt?: number; email?: string; phone?: string }>
  >({});
  const [localRestaurants, setLocalRestaurants] = useState<DemoRestaurantRecord[]>(() =>
    getLocalRestaurants()
  );
  const [loadingShops, setLoadingShops] = useState(false);
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminFilterId>('all');

  // Global Zero-Fees Toggle
  const [forceZeroFeesGlobally, setForceZeroFeesGlobally] = useState<boolean>(
    () => getPlatformSettingsLocal().forceZeroFeesGlobally
  );
  const [savingGlobalFeeToggle, setSavingGlobalFeeToggle] = useState(false);

  // Per-row interactive states
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [deliveryEdits, setDeliveryEdits] = useState<Record<string, string>>({});
  const [copiedSlugId, setCopiedSlugId] = useState<string | null>(null);
  const [expandedPlanRowId, setExpandedPlanRowId] = useState<string | null>(null);
  const [qrPreviewRow, setQrPreviewRow] = useState<UnifiedRestaurantRow | null>(null);

  // Change Restaurant Password Modal
  const [passwordModalRow, setPasswordModalRow] = useState<UnifiedRestaurantRow | null>(null);
  const [newStorePassInput, setNewStorePassInput] = useState('');
  const [savingStorePass, setSavingStorePass] = useState(false);

  // Change Admin PIN modal state
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinSavedMsg, setPinSavedMsg] = useState('');

  // Private link copy & photo backfill
  const [linkCopied, setLinkCopied] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (adminToken) return;
    let active = true;
    fetch('/api/admin/pin-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { configured?: boolean } | null) => {
        if (active && data && typeof data.configured === 'boolean') {
          setPinConfigured(data.configured);
        }
      })
      .catch(() => {
        if (active) setPinConfigured(true);
      });
    return () => {
      active = false;
    };
  }, [adminToken]);

  const isAdminEmail =
    Boolean(user?.emailVerified) &&
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const refreshServerAdminData = useCallback(async (tokenToUse: string, manual = false) => {
    if (!tokenToUse) return;
    if (manual) setRefreshingLive(true);
    try {
      const [cfgRes, codesRes, storesRes] = await Promise.all([
        fetch('/api/platform-config'),
        fetch('/api/admin/store-codes', {
          headers: { Authorization: `Bearer ${tokenToUse}` },
        }),
        fetch('/api/admin/stores', {
          headers: { Authorization: `Bearer ${tokenToUse}` },
        }),
      ]);
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as { forceZeroFeesGlobally?: boolean };
        const val = Boolean(cfg.forceZeroFeesGlobally);
        setForceZeroFeesGlobally(val);
        savePlatformSettingsLocal({ forceZeroFeesGlobally: val });
      }
      if (codesRes.status === 401 || storesRes.status === 401) {
        localStorage.removeItem(LS_KEYS.ADMIN_TOKEN);
        setAdminToken('');
        return;
      }
      if (codesRes.ok) {
        const data = (await codesRes.json()) as {
          stores?: Array<{
            shopId: string;
            storeSlug: string;
            email?: string;
            phone?: string;
            resetCode?: string;
            resetCodeExpiresAt?: number;
          }>;
        };
        const map: Record<
          string,
          { resetCode?: string; resetCodeExpiresAt?: number; email?: string; phone?: string }
        > = {};
        for (const s of data.stores || []) {
          const entry = {
            resetCode: s.resetCode,
            resetCodeExpiresAt: s.resetCodeExpiresAt,
            email: s.email,
            phone: s.phone,
          };
          if (s.shopId) map[s.shopId] = entry;
          if (s.storeSlug) map[s.storeSlug] = entry;
        }
        setServerCodes(map);
      }
      if (storesRes.ok) {
        const storesData = (await storesRes.json()) as { stores?: ServerAdminStoreEntry[] };
        setServerStores(Array.isArray(storesData.stores) ? storesData.stores : []);
      }
      setLocalRestaurants(getLocalRestaurants());
      setLastSyncedAt(Date.now());
    } catch {
      // keep local state seamlessly
    } finally {
      if (manual) setRefreshingLive(false);
    }
  }, []);

  useEffect(() => {
    if (!adminToken) return;
    setLocalRestaurants(getLocalRestaurants());
    void refreshServerAdminData(adminToken);

    const pollId = window.setInterval(() => {
      void refreshServerAdminData(adminToken);
    }, 4000);

    const handleStorage = () => {
      setLocalRestaurants(getLocalRestaurants());
      void refreshServerAdminData(adminToken);
    };
    window.addEventListener('storage', handleStorage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('ghazalo_admin_sync');
      channel.onmessage = () => {
        setLocalRestaurants(getLocalRestaurants());
        void refreshServerAdminData(adminToken);
      };
    }

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
    };
  }, [adminToken, refreshServerAdminData]);

  useEffect(() => {
    if (!adminToken || !isAdminEmail) return;
    setLoadingShops(true);
    const unsub = subscribeToAllShops((list) => {
      setFirestoreShops(list);
      setLoadingShops(false);
    });
    void getAllStoreCredentials().then(setFirestoreCreds);
    return () => unsub();
  }, [adminToken, isAdminEmail]);

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    const candidate = pinInput.trim();
    if (!candidate) {
      setPinError('يرجى إدخال الرقم السري للإدارة.');
      return;
    }

    if (pinConfigured === false) {
      if (candidate.length < 4) {
        setPinError('الرقم السري يجب ألا يقل عن 4 أحرف.');
        return;
      }
      if (confirmPinInput.trim() !== candidate) {
        setPinError('تأكيد الرقم السري غير متطابق.');
        return;
      }
    }

    setVerifyingPin(true);
    try {
      const endpoint = pinConfigured === false ? '/api/admin/claim-pin' : '/api/admin/verify-pin';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidate }),
      });
      const data = (await res.json()) as { ok?: boolean; adminToken?: string; error?: string };
      if (!res.ok || !data.ok || !data.adminToken) {
        setPinError(data.error || 'الرقم السري غير صحيح.');
        if (res.status === 403) {
          setPinConfigured(true);
        }
        return;
      }

      try {
        localStorage.setItem(LS_KEYS.ADMIN_TOKEN, data.adminToken);
      } catch {
        // ignore storage quota
      }
      setPinConfigured(true);
      setAdminToken(data.adminToken);
      setPinInput('');
      setConfirmPinInput('');
    } catch {
      setPinError('تعذر الاتصال بخادم الإدارة.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleLock = () => {
    try {
      localStorage.removeItem(LS_KEYS.ADMIN_TOKEN);
    } catch {
      // ignore
    }
    setAdminToken('');
  };

  const handleGoogleAdminLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      showToast('تعذر ربط حساب Google');
    }
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPinInput.trim();
    if (clean.length < 4) return;
    setSavingPin(true);
    try {
      const res = await fetch('/api/admin/update-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ newPin: clean }),
      });
      if (!res.ok) {
        showToast('تعذر تحديث الرقم السري على الخادم');
        return;
      }
      if (isAdminEmail) {
        try {
          await saveAdminCustomPin(clean);
        } catch {
          // non-blocking
        }
      }
      setPinSavedMsg('تم تحديث الرقم السري بنجاح');
      setNewPinInput('');
      setTimeout(() => {
        setPinSavedMsg('');
        setChangePinOpen(false);
      }, 1400);
    } finally {
      setSavingPin(false);
    }
  };

  const handleToggleGlobalZeroFees = async () => {
    const nextVal = !forceZeroFeesGlobally;
    setSavingGlobalFeeToggle(true);
    setForceZeroFeesGlobally(nextVal);
    savePlatformSettingsLocal({ forceZeroFeesGlobally: nextVal });
    onPlatformConfigChange?.({ forceZeroFeesGlobally: nextVal });

    try {
      await fetch('/api/admin/global-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ forceZeroFeesGlobally: nextVal }),
      });
      if (isAdminEmail) {
        await savePlatformConfig(nextVal);
      }
      showToast(
        nextVal
          ? 'تم تفعيل الإلغاء الشامل لكل الرسوم والضرايب لجميع المطاعم'
          : 'تم إعادة السماح بإعدادات الرسوم الاختيارية للمطاعم'
      );
    } catch {
      showToast('تم حفظ الإعداد محلياً بنجاح');
    } finally {
      setSavingGlobalFeeToggle(false);
    }
  };

  // Merge Firestore + Server Stores + Store Credentials + Server Codes + LocalStorage "restaurants"
  const rows = useMemo<UnifiedRestaurantRow[]>(() => {
    const credByShop: Record<string, StoreCredentialRecord> = {};
    for (const c of firestoreCreds) {
      if (c.shopId) credByShop[c.shopId] = c;
      if (c.storeSlug) credByShop[normalizeStoreSlug(c.storeSlug)] = c;
    }

    const localByKey: Record<string, DemoRestaurantRecord> = {};
    for (const r of localRestaurants) {
      if (r.shopId) localByKey[r.shopId] = r;
      if (r.storeSlug) localByKey[normalizeStoreSlug(r.storeSlug)] = r;
    }

    const serverByKey: Record<string, ServerAdminStoreEntry> = {};
    for (const srv of serverStores) {
      if (srv.shopId) serverByKey[srv.shopId] = srv;
      if (srv.storeSlug) serverByKey[normalizeStoreSlug(srv.storeSlug)] = srv;
    }

    const mergedMap = new Map<string, UnifiedRestaurantRow>();

    const buildRow = (
      shop: Shop,
      fromFirestore: boolean,
      localMatch?: DemoRestaurantRecord,
      serverMatch?: ServerAdminStoreEntry
    ): UnifiedRestaurantRow => {
      const slug =
        normalizeStoreSlug(shop.storeSlug || '') ||
        normalizeStoreSlug(serverMatch?.storeSlug || '') ||
        normalizeStoreSlug(localMatch?.storeSlug || '') ||
        normalizeStoreSlug(shop.nameEn || '') ||
        normalizeStoreSlug(shop.id) ||
        shop.id;
      const cred = credByShop[shop.id] || credByShop[slug];
      const srv = serverCodes[shop.id] || serverCodes[slug] || serverMatch;

      const effectiveShop: Shop = serverMatch?.shop
        ? { ...shop, ...serverMatch.shop, id: shop.id, storeSlug: slug }
        : { ...shop, storeSlug: slug };

      const access = getShopAccessState(effectiveShop);
      let statusCategory: UnifiedRestaurantRow['statusCategory'] = 'trial';
      let statusLabel = 'تجريبي';

      if (access.reason === 'suspended') {
        statusCategory = 'suspended';
        statusLabel = 'متوقف';
      } else if (!access.isActive) {
        statusCategory = 'expired';
        statusLabel = 'منتهي';
      } else if (access.reason === 'yearly') {
        statusCategory = 'yearly';
        statusLabel = 'مفعل سنوي';
      } else if (access.reason === 'monthly' || access.reason === 'active') {
        statusCategory = 'monthly';
        statusLabel = 'مفعل شهري';
      } else {
        statusCategory = 'trial';
        statusLabel = 'تجريبي';
      }

      const expDate =
        statusCategory === 'monthly' || statusCategory === 'yearly'
          ? effectiveShop.subscriptionExpiresAt || localMatch?.subscriptionEndDate
          : effectiveShop.trialEndsAt || localMatch?.trialEndDate;

      const resolvedCreatedAt = Number(
        effectiveShop.createdAt || serverMatch?.createdAt || serverMatch?.updatedAt || Date.now()
      );

      return {
        shopId: effectiveShop.id,
        storeSlug: slug,
        nameAr: effectiveShop.nameAr || serverMatch?.nameAr || localMatch?.nameAr || slug,
        email: cred?.email || srv?.email || localMatch?.email || '',
        phone: effectiveShop.whatsapp || cred?.phone || srv?.phone || localMatch?.phone || '',
        password: localMatch?.password || '',
        resetCode: srv?.resetCode || localMatch?.resetCode,
        resetCodeExpiresAt: srv?.resetCodeExpiresAt || localMatch?.resetCodeExpiresAt,
        createdAt: resolvedCreatedAt,
        productsCount: serverMatch?.productsCount ?? localMatch?.products?.length,
        subscriptionDateFormatted: expDate ? formatArabicDate(expDate) : '-',
        daysLeft: access.daysLeft,
        statusCategory,
        statusLabel,
        deliveryFee: Number(effectiveShop.deliveryFee ?? localMatch?.deliveryFee ?? 0),
        shop: effectiveShop,
        fromFirestore,
        localRecord: localMatch,
      };
    };

    for (const s of firestoreShops) {
      const slug = normalizeStoreSlug(s.storeSlug || s.id);
      const lm = localByKey[s.id] || (slug ? localByKey[slug] : undefined);
      const sm = serverByKey[s.id] || (slug ? serverByKey[slug] : undefined);
      const row = buildRow(s, true, lm, sm);
      mergedMap.set(row.storeSlug || row.shopId, row);
    }

    for (const srv of serverStores) {
      const slug = normalizeStoreSlug(srv.storeSlug || srv.shopId);
      const key = slug || srv.shopId;
      if (!mergedMap.has(key) && !mergedMap.has(srv.shopId)) {
        const lm = localByKey[srv.shopId] || (slug ? localByKey[slug] : undefined);
        const now = Date.now();
        const fallbackTrialEnd = Number(srv.createdAt || now) + 7 * 24 * 60 * 60 * 1000;
        const baseDefaults: Shop = {
          id: srv.shopId,
          ownerId: srv.ownerId || '',
          storeSlug: key,
          nameAr: srv.nameAr || lm?.nameAr || key,
          nameEn: '',
          country: 'مصر',
          menuLanguage: 'العربية',
          themeColor: 'أخضر',
          themeMode: 'light',
          menuTemplate: 'classic',
          deliveryFee: Number(lm?.deliveryFee ?? 0),
          isOpen: true,
          acceptOrders: true,
          subscriptionStatus: 'trial',
          trialEndsAt: fallbackTrialEnd,
          createdAt: Number(srv.createdAt || now),
          updatedAt: Number(srv.updatedAt || now),
          whatsapp: srv.phone || lm?.phone || '',
        };
        const synthShop: Shop = {
          ...baseDefaults,
          ...(lm?.shop || {}),
          ...(srv.shop || {}),
        };
        mergedMap.set(key, buildRow(synthShop, false, lm, srv));
      }
    }

    for (const lr of localRestaurants) {
      const slug = normalizeStoreSlug(lr.storeSlug || lr.shopId);
      const key = slug || lr.shopId;
      if (!mergedMap.has(key) && !mergedMap.has(lr.shopId)) {
        const mergedShop: Shop = {
          ...lr.shop,
          id: lr.shopId,
          storeSlug: lr.storeSlug,
          nameAr: lr.nameAr || lr.shop?.nameAr || lr.storeSlug,
          subscriptionStatus: lr.status || lr.shop?.subscriptionStatus || 'trial',
          trialEndsAt: lr.trialEndDate || lr.shop?.trialEndsAt,
          subscriptionExpiresAt: lr.subscriptionEndDate || lr.shop?.subscriptionExpiresAt,
          deliveryFee: lr.deliveryFee ?? lr.shop?.deliveryFee ?? 0,
        };
        mergedMap.set(key, buildRow(mergedShop, false, lr));
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) => {
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      if (a.statusCategory === 'expired' && b.statusCategory !== 'expired') return -1;
      if (b.statusCategory === 'expired' && a.statusCategory !== 'expired') return 1;
      return a.nameAr.localeCompare(b.nameAr, 'ar');
    });
  }, [firestoreShops, firestoreCreds, serverStores, serverCodes, localRestaurants]);

  const stats = useMemo(() => {
    const counts = {
      all: rows.length,
      trial: 0,
      monthly: 0,
      yearly: 0,
      expired: 0,
      suspended: 0,
    };
    for (const r of rows) {
      counts[r.statusCategory] += 1;
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesTab = statusFilter === 'all' || r.statusCategory === statusFilter;
      const matchesSearch =
        !q ||
        r.nameAr.toLowerCase().includes(q) ||
        r.storeSlug.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [rows, searchQuery, statusFilter]);

  // Registration order (#1 = first ever registered) and day groups for the list.
  const regNumbers = useMemo(() => {
    const asc = [...rows].sort((a, b) => a.createdAt - b.createdAt || a.shopId.localeCompare(b.shopId));
    const m: Record<string, number> = {};
    asc.forEach((r, i) => {
      m[r.shopId] = i + 1;
    });
    return m;
  }, [rows]);

  const dayGroups = useMemo(() => {
    const dayKey = (t: number) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
    const map = new Map<string, { key: string; ts: number; items: UnifiedRestaurantRow[] }>();
    for (const r of filteredRows) {
      const k = dayKey(r.createdAt);
      const g = map.get(k) || { key: k, ts: r.createdAt, items: [] };
      g.items.push(r);
      map.set(k, g);
    }
    const todayK = dayKey(Date.now());
    const yestK = dayKey(Date.now() - 24 * 60 * 60 * 1000);
    return Array.from(map.values())
      .sort((a, b) => (a.key < b.key ? 1 : -1))
      .map((g) => {
        g.items.sort((a, b) => (regNumbers[a.shopId] || 0) - (regNumbers[b.shopId] || 0));
        const dateText = new Intl.DateTimeFormat('ar-EG', {
          timeZone: 'Africa/Cairo',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date(g.ts));
        const label = g.key === todayK ? 'اليوم' : g.key === yestK ? 'أمس' : dateText;
        return { ...g, label, dateText };
      });
  }, [filteredRows, regNumbers]);

  const syncAdminUpdateToServer = (
    row: UnifiedRestaurantRow,
    shopUpdates: Partial<Shop>
  ) => {
    if (!adminToken) return;
    void fetch('/api/admin/update-store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        shopId: row.shopId,
        storeSlug: row.storeSlug,
        shopUpdates,
      }),
    })
      .then((r) => {
        if (r.ok) void refreshServerAdminData(adminToken);
      })
      .catch(() => undefined);
  };

  const updateLocalRowShop = (
    row: UnifiedRestaurantRow,
    shopUpdates: Partial<Shop>,
    extraDemo?: Partial<DemoRestaurantRecord>
  ) => {
    const mergedShop: Shop = { ...row.shop, ...shopUpdates };
    const nextList = upsertLocalRestaurant(
      shopToDemoRecord(
        mergedShop,
        {
          email: row.email,
          phone: row.phone,
          password: row.password || undefined,
          resetCode: row.resetCode,
          resetCodeExpiresAt: row.resetCodeExpiresAt,
          status: mergedShop.subscriptionStatus as SubscriptionStatus,
          trialEndDate: mergedShop.trialEndsAt,
          subscriptionEndDate: mergedShop.subscriptionExpiresAt,
          ...extraDemo,
        },
        row.localRecord?.products
      )
    );
    setLocalRestaurants([...nextList]);
    void syncPublicStoreSnapshot(mergedShop, row.localRecord?.products);
    syncAdminUpdateToServer(row, shopUpdates);
  };

  const handleSubscriptionAction = async (
    row: UnifiedRestaurantRow,
    action: 'trial' | 'monthly' | 'yearly' | 'suspend'
  ) => {
    setBusyId(row.shopId);
    const now = Date.now();
    try {
      if (action === 'trial') {
        const trialEndsAt = now + 7 * 24 * 60 * 60 * 1000;
        if (row.fromFirestore && isAdminEmail) {
          await extendTrialShop(row.shopId, 7);
        }
        updateLocalRowShop(
          row,
          {
            subscriptionStatus: 'trial',
            approvedByAdmin: true,
            trialEndsAt,
            plan: 'تجريبي مجاني - 7 أيام',
          },
          { status: 'trial', trialEndDate: trialEndsAt }
        );
        showToast(`تم تفعيل التجربة المجانية (7 أيام) لـ ${row.nameAr}`);
      } else if (action === 'monthly') {
        const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
        if (row.fromFirestore && isAdminEmail) {
          await approveAndActivateShop(row.shopId, 30);
        }
        updateLocalRowShop(
          row,
          {
            subscriptionStatus: 'monthly',
            approvedByAdmin: true,
            approvedAt: now,
            subscriptionExpiresAt: expiresAt,
            plan: 'التفعيل الشهري - 30 يوم',
          },
          { status: 'monthly', subscriptionEndDate: expiresAt }
        );
        showToast(`تم التفعيل الشهري (30 يوم) لـ ${row.nameAr}`);
      } else if (action === 'yearly') {
        const expiresAt = now + 365 * 24 * 60 * 60 * 1000;
        if (row.fromFirestore && isAdminEmail) {
          await approveAndActivateShop(row.shopId, 365);
        }
        updateLocalRowShop(
          row,
          {
            subscriptionStatus: 'yearly',
            approvedByAdmin: true,
            approvedAt: now,
            subscriptionExpiresAt: expiresAt,
            plan: 'التفعيل السنوي - 365 يوم',
          },
          { status: 'yearly', subscriptionEndDate: expiresAt }
        );
        showToast(`تم التفعيل السنوي (365 يوم) لـ ${row.nameAr}`);
      } else {
        if (row.fromFirestore && isAdminEmail) {
          await suspendShop(row.shopId);
        }
        updateLocalRowShop(
          row,
          {
            subscriptionStatus: 'suspended',
            approvedByAdmin: false,
          },
          { status: 'suspended' }
        );
        showToast(`تم إيقاف متجر ${row.nameAr}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveDeliveryPrice = async (row: UnifiedRestaurantRow) => {
    const raw = deliveryEdits[row.shopId];
    const nextFee = Math.max(0, Number(raw !== undefined ? raw : row.deliveryFee) || 0);
    setBusyId(row.shopId);
    try {
      if (row.fromFirestore && isAdminEmail) {
        await updateShop(row.shopId, {
          deliveryFee: nextFee,
          freeDelivery: nextFee === 0,
        });
      }
      updateLocalRowShop(row, {
        deliveryFee: nextFee,
        freeDelivery: nextFee === 0,
      });
      showToast(`تم حفظ سعر التوصيل (${nextFee} جنيه) لـ ${row.nameAr}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleGenerateResetCode = async (row: UnifiedRestaurantRow) => {
    setBusyId(row.shopId);
    try {
      let generatedCode = String(Math.floor(100000 + Math.random() * 900000));
      let expiresAt = Date.now() + 30 * 60 * 1000;

      try {
        const res = await fetch('/api/admin/generate-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            shopId: row.shopId,
            storeSlug: row.storeSlug,
            nameAr: row.nameAr,
            email: row.email,
            phone: row.phone,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; code?: string; expiresAt?: number };
        if (res.ok && data.ok && data.code) {
          generatedCode = data.code;
          if (data.expiresAt) expiresAt = data.expiresAt;
        }
      } catch {
        // fallback to client generated code saved to localStorage
      }

      setServerCodes((prev) => ({
        ...prev,
        [row.shopId]: { ...prev[row.shopId], resetCode: generatedCode, resetCodeExpiresAt: expiresAt },
        [row.storeSlug]: { ...prev[row.storeSlug], resetCode: generatedCode, resetCodeExpiresAt: expiresAt },
      }));

      updateLocalRowShop(row, {}, {
        resetCode: generatedCode,
        resetCodeExpiresAt: expiresAt,
      });
      const updatedUsers = getLocalUsers().map((u) =>
        u.storeSlug === row.storeSlug ||
        u.shopId === row.shopId ||
        (row.email && u.email.toLowerCase() === row.email.toLowerCase())
          ? { ...u, resetCode: generatedCode, resetCodeExpiresAt: expiresAt }
          : u
      );
      saveLocalUsers(updatedUsers);

      try {
        await navigator.clipboard.writeText(generatedCode);
      } catch {
        // ignore clipboard restriction
      }
      showToast(`كود الاستعادة لـ ${row.nameAr}: ${generatedCode} (تم النسخ)`);
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveStorePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalRow) return;
    const cleanPass = newStorePassInput.trim();
    if (cleanPass.length < 4) {
      showToast('كلمة السر الجديدة يجب أن تكون 4 أحرف على الأقل');
      return;
    }

    setSavingStorePass(true);
    try {
      try {
        await fetch('/api/admin/store-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            shopId: passwordModalRow.shopId,
            storeSlug: passwordModalRow.storeSlug,
            nameAr: passwordModalRow.nameAr,
            email: passwordModalRow.email,
            phone: passwordModalRow.phone,
            newPassword: cleanPass,
          }),
        });
      } catch {
        // non-blocking
      }

      updateLocalRowShop(passwordModalRow, {}, { password: cleanPass, resetCode: undefined });
      // Also force save in localRestaurants array cleanly
      const updated = getLocalRestaurants().map((r) =>
        r.shopId === passwordModalRow.shopId ||
        normalizeStoreSlug(r.storeSlug) === passwordModalRow.storeSlug
          ? { ...r, password: cleanPass, resetCode: undefined }
          : r
      );
      saveLocalRestaurants(updated);
      setLocalRestaurants(updated);
      const updatedUsers = getLocalUsers().map((u) =>
        u.storeSlug === passwordModalRow.storeSlug ||
        u.shopId === passwordModalRow.shopId ||
        (passwordModalRow.email &&
          u.email.toLowerCase() === passwordModalRow.email.toLowerCase())
          ? { ...u, password: cleanPass, resetCode: undefined, resetCodeExpiresAt: undefined }
          : u
      );
      saveLocalUsers(updatedUsers);

      showToast(`تم تغيير كلمة السر لمتجر ${passwordModalRow.nameAr} بنجاح — يمكنه الدخول فوراً!`);
      setPasswordModalRow(null);
      setNewStorePassInput('');
    } finally {
      setSavingStorePass(false);
    }
  };

  const handleCopyMenuLink = async (row: UnifiedRestaurantRow) => {
    const fullLink = getAbsoluteMenuUrl(row.storeSlug);
    const ok = await copyMenuLink(fullLink);
    if (ok) {
      setCopiedSlugId(row.shopId);
      setTimeout(() => setCopiedSlugId(null), 2200);
      showToast(`تم نسخ اللينك ✅ (${fullLink})`);
    } else {
      showToast(fullLink);
    }
  };

  const privateAdminUrl = `${window.location.origin}/?portal=${ADMIN_PORTAL_KEY}`;

  const handleCopyAdminLink = async () => {
    const ok = await copyMenuLink(privateAdminUrl);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }
  };

  const handleBackfillAllPhotos = async () => {
    if (firestoreShops.length === 0) return;
    setBackfillBusy(true);
    try {
      const updated = await backfillAllShopsMissingPhotos(firestoreShops.map((s) => s.id));
      showToast(
        updated > 0
          ? `تم إضافة الصور الحقيقية لـ ${updated} صنف بنجاح.`
          : 'كل الأصناف تمتلك صوراً بالفعل.'
      );
    } catch {
      showToast('تعذر تعبئة الصور حالياً.');
    } finally {
      setBackfillBusy(false);
    }
  };

  if (authLoading) {
    return <PlatformLoader subtitle="جاري تحميل بوابة الأدمن..." />;
  }

  // Admin-Only Login Gate
  if (!adminToken) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB] flex flex-col">
        <header className="bg-[#FFFFFF] dark:bg-[#18231C] border-b border-[#CFE3D5] dark:border-[#2C3D32] px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#15803D] dark:text-[#BBF7D0]"
          >
            <ArrowRight className="w-4 h-4" />
            العودة للموقع
          </button>
          <span className="font-extrabold text-sm text-[#4B5B52] dark:text-[#A3B5AA]">
            بوابة خاصة
          </span>
          <div className="w-16" />
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md sf-card p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2.5">
              <div className="flex justify-center">
                <GhazaloLogo stacked />
              </div>
              <div className="w-14 h-14 rounded-[18px] bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] border border-[#86EFAC] dark:border-[#2C3D32] mx-auto flex items-center justify-center">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black">
                {pinConfigured === false ? 'إعداد الرقم السري للإدارة' : 'دخول لوحة تحكم الأدمن'}
              </h1>
              <p className="text-xs sm:text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                {pinConfigured === false
                  ? 'لم يتم تعيين الرقم السري للإدارة بعد — أنشئ رقماً سرياً قوياً (4 أحرف على الأقل) لحماية لوحة الإدارة'
                  : 'مخصصة لإدارة Ghazalo فقط — إدارة المطاعم والاشتراكات وكلمات السر والرسوم'}
              </p>
            </div>

            {pinError && (
              <div className="rounded-[16px] bg-[#FEF9C3] dark:bg-amber-950/40 border border-[#FACC15] dark:border-amber-800 p-3.5 text-xs font-extrabold text-[#14201A] dark:text-amber-200">
                {pinError}
              </div>
            )}

            <form onSubmit={(e) => void handleVerifyPin(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-[#14201A] dark:text-[#E8F2EB] mb-1.5">
                  {pinConfigured === false ? 'الرقم السري الجديد للإدارة (PIN)' : 'الرقم السري للأدمن (PIN)'}
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    dir="ltr"
                    required
                    minLength={pinConfigured === false ? 4 : undefined}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="••••••"
                    className="sf-inp text-center text-lg font-extrabold tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4B5B52] hover:text-[#15803D]"
                    aria-label="إظهار أو إخفاء الرقم"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {pinConfigured === false && (
                <div>
                  <label className="block text-xs font-extrabold text-[#14201A] dark:text-[#E8F2EB] mb-1.5">
                    تأكيد الرقم السري
                  </label>
                  <input
                    type={showPin ? 'text' : 'password'}
                    dir="ltr"
                    required
                    minLength={4}
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(e.target.value)}
                    placeholder="••••••"
                    className="sf-inp text-center text-lg font-extrabold tracking-widest"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={verifyingPin}
                className="sf-btn-primary w-full text-sm"
              >
                {verifyingPin ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                <span>{pinConfigured === false ? 'حفظ الرقم السري وفتح اللوحة' : 'فتح لوحة الأدمن'}</span>
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB] pb-16">
      {/* Admin Top Header */}
      <header className="sticky top-0 z-30 bg-[#FFFFFF]/95 dark:bg-[#18231C]/95 backdrop-blur-md border-b border-[#CFE3D5] dark:border-[#2C3D32] px-4 sm:px-6 h-16 flex items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#15803D] dark:text-[#BBF7D0]"
          >
            <ArrowRight className="w-4 h-4" />
            العودة
          </button>
          <div className="hidden sm:flex items-center gap-1.5 font-black text-sm sm:text-lg">
            <ShieldCheck className="hidden sm:block w-5 h-5 text-[#15803D] dark:text-[#BBF7D0] shrink-0" />
            <span className="whitespace-nowrap"><span className="hidden sm:inline">لوحة تحكم الأدمن · Ghazalo</span></span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isAdminEmail && (
            <button
              type="button"
              onClick={() => void handleGoogleAdminLogin()}
              className="hidden md:inline-flex px-3 py-2 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] border border-[#86EFAC] dark:border-[#2C3D32] font-bold text-xs items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              مزامنة Firebase السحابية
            </button>
          )}
          {user && isAdminEmail && (
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="hidden sm:inline-flex px-3 py-2 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14201A] dark:text-[#E8F2EB] font-bold text-xs items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              فصل Google
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshServerAdminData(adminToken, true)}
            className="px-3 py-2 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] font-bold text-xs inline-flex items-center gap-1.5"
            title="تحديث فوري لقائمة المطاعم"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingLive ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">تحديث فوري</span>
          </button>
          <PWAInstallButton variant="compact" label="التطبيق" />
          <button
            type="button"
            onClick={() => setChangePinOpen(true)}
            className="px-3 py-2 rounded-full bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-[#15803D] dark:text-[#BBF7D0] font-bold text-xs inline-flex items-center gap-1.5"
          >
            <KeyRound className="w-4 h-4" />
            <span className="hidden sm:inline">تغيير PIN</span>
          </button>
          <button
            type="button"
            onClick={handleLock}
            className="px-3 py-2 rounded-full bg-[#14201A] dark:bg-[#173323] text-white font-bold text-xs inline-flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#14201A] text-white px-5 py-3 rounded-[16px] text-xs sm:text-sm font-extrabold shadow-xl border border-[#15803D]">
          {toastMsg}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6 no-print">
        {/* Global Control Toggle: الغاء كل الرسوم والضرايب لكل المطاعم */}
        <div className="sf-card p-5 border-2 border-[#15803D]/40 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 text-base font-black">
              <span className="w-3 h-3 rounded-full bg-[#15803D]" />
              <span>الغاء كل الرسوم والضرايب لكل المطاعم</span>
            </div>
            <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              عند تفعيل هذا الخيار يتم إجبار رسوم الخدمة والضريبة (VAT) ورسوم التغليف على 0 في جميع المطاعم تلقائياً، ليصبح الحساب (سعر الأكل + التوصيل فقط).
            </p>
          </div>
          <button
            type="button"
            disabled={savingGlobalFeeToggle}
            onClick={() => void handleToggleGlobalZeroFees()}
            className={`px-6 py-3 rounded-[16px] font-extrabold text-sm transition-all inline-flex items-center gap-2 shadow-xs ${
              forceZeroFeesGlobally
                ? 'bg-[#15803D] text-white'
                : 'bg-[#F6FBF7] dark:bg-[#173323] text-[#14201A] dark:text-[#E8F2EB] border border-[#CFE3D5] dark:border-[#2C3D32]'
            }`}
          >
            {savingGlobalFeeToggle && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{forceZeroFeesGlobally ? 'مفعل — كل الرسوم 0 لكل المطاعم' : 'اضغط للتفعيل (إلغاء كل الرسوم)'}</span>
          </button>
        </div>

        {/* Private Link + Live Sync Status + Quick Tools */}
        <div className="sf-card p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-[#15803D] dark:text-[#BBF7D0]">
                رابط لوحة الأدمن الخاص بك وحدك (محمي برقم PIN)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-[10px] font-extrabold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] animate-pulse" />
                مزامنة فورية · {new Date(lastSyncedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="text-xs font-mono text-[#4B5B52] dark:text-[#A3B5AA] truncate" dir="ltr">
              {privateAdminUrl}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdminEmail && firestoreShops.length > 0 && (
              <button
                type="button"
                disabled={backfillBusy}
                onClick={() => void handleBackfillAllPhotos()}
                className="px-4 py-2 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] border border-[#86EFAC] dark:border-[#2C3D32] text-xs font-extrabold inline-flex items-center gap-1.5"
              >
                {backfillBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="w-3.5 h-3.5" />
                )}
                <span>تعبئة صور الأصناف الناقصة</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCopyAdminLink()}
              className="px-4 py-2 rounded-full bg-[#15803D] hover:bg-[#166534] text-white text-xs font-extrabold inline-flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{linkCopied ? 'تم النسخ!' : 'نسخ رابط الإدارة'}</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'إجمالي المطاعم', count: stats.all, tone: 'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5]' },
            { label: 'تجريبي', count: stats.trial, tone: 'bg-[#FEF9C3] dark:bg-amber-950/30 border-[#FACC15]' },
            { label: 'مفعل شهري', count: stats.monthly, tone: 'bg-[#DCFCE7] dark:bg-[#173323] border-[#86EFAC]' },
            { label: 'مفعل سنوي', count: stats.yearly, tone: 'bg-[#DCFCE7] dark:bg-[#173323] border-[#15803D]' },
            { label: 'منتهي', count: stats.expired, tone: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200' },
            { label: 'متوقف', count: stats.suspended, tone: 'bg-[#F6FBF7] dark:bg-[#173323] border-[#CFE3D5]' },
          ].map((k) => (
            <div key={k.label} className={`rounded-[20px] p-4 border dark:border-[#2C3D32] ${k.tone}`}>
              <div className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA]">{k.label}</div>
              <div className="text-2xl font-black text-[#14201A] dark:text-[#E8F2EB] mt-1 tabular-nums">
                {k.count}
              </div>
            </div>
          ))}
        </div>

        {/* Search + Status Filters */}
        <div className="sf-card p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#4B5B52] absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المطعم، رابط المتجر، الإيميل، أو رقم الموبايل..."
              className="sf-inp pr-10 pl-4"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: `الكل (${stats.all})` },
                { id: 'trial', label: `تجريبي (${stats.trial})` },
                { id: 'monthly', label: `مفعل شهري (${stats.monthly})` },
                { id: 'yearly', label: `مفعل سنوي (${stats.yearly})` },
                { id: 'expired', label: `منتهي (${stats.expired})` },
                { id: 'suspended', label: `متوقف (${stats.suspended})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={statusFilter === tab.id ? 'sf-chip-on text-xs' : 'sf-chip text-xs'}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Smooth Responsive Restaurant Cards Grid */}
        {loadingShops && rows.length === 0 ? (
          <div className="sf-card p-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#15803D] mx-auto" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="sf-card p-10 text-center space-y-2">
            <Store className="w-10 h-10 text-[#15803D] mx-auto opacity-60" />
            <div className="font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
              لا توجد مطاعم مطابقة للبحث أو التصنيف.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {dayGroups.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-[#F6FBF7]/95 dark:bg-[#0F1712]/95 backdrop-blur flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full bg-[#15803D] text-white text-xs font-black">{group.label}</span>
                  {group.label !== group.dateText && (
                    <span className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA]">{group.dateText}</span>
                  )}
                  <span className="text-xs font-extrabold text-[#4B5B52] dark:text-[#A3B5AA] ms-auto tabular-nums">
                    {group.items.length} مطعم
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {group.items.map((row) => {
              const isBusy = busyId === row.shopId;
              const showPass = Boolean(revealedPasswords[row.shopId]);
              const deliveryVal =
                deliveryEdits[row.shopId] !== undefined
                  ? deliveryEdits[row.shopId]
                  : String(row.deliveryFee);
              const isPlansExpanded = expandedPlanRowId === row.shopId;
              const isNewStore = Date.now() - row.createdAt < 24 * 60 * 60 * 1000;

              return (
                <div
                  key={row.shopId}
                  className="sf-card p-4 sm:p-5 space-y-4 transition-all hover:border-[#15803D]/60 flex flex-col justify-between"
                >
                  {/* Card Header: Logo + Name + Slug + Status Badges */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {row.shop.logoUrl ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={row.shop.logoUrl}
                          alt={row.nameAr}
                          className="w-12 h-12 rounded-2xl object-cover border border-[#CFE3D5] dark:border-[#2C3D32] bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-[#15803D] text-white font-black text-lg flex items-center justify-center shrink-0">
                          {row.nameAr.trim().slice(0, 1) || 'م'}
                        </div>
                      )}
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-lg bg-[#14201A] dark:bg-[#E8F2EB] text-white dark:text-[#14201A] text-[11px] font-black tabular-nums" dir="ltr">
                            #{regNumbers[row.shopId]}
                          </span>
                          <h3 className="font-black text-[15px] text-[#14201A] dark:text-[#E8F2EB] break-words leading-snug">
                            {row.nameAr}
                          </h3>
                          {isNewStore && (
                            <span className="px-2 py-0.5 rounded-full bg-[#15803D] text-white text-[10px] font-black">
                              جديد
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-[11px]" dir="ltr">
                          <span className="font-mono font-bold text-[#15803D] dark:text-[#BBF7D0] truncate">
                            /menu/{row.storeSlug}
                          </span>
                          {typeof row.productsCount === 'number' && (
                            <span className="text-[#4B5B52] dark:text-[#A3B5AA] font-bold" dir="rtl">
                              · {row.productsCount} صنف
                            </span>
                          )}
                          <span className="text-[#4B5B52] dark:text-[#A3B5AA] font-bold" dir="rtl">
                            · سجّل {new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }).format(new Date(row.createdAt))}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-extrabold whitespace-nowrap ${
                          row.statusCategory === 'monthly' || row.statusCategory === 'yearly'
                            ? 'bg-[#DCFCE7] text-[#14532D] dark:bg-[#173323] dark:text-[#BBF7D0]'
                            : row.statusCategory === 'trial'
                              ? 'bg-[#FEF9C3] text-[#14201A] dark:bg-amber-950 dark:text-amber-300'
                              : row.statusCategory === 'expired'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-[#F6FBF7] text-[#4B5B52] dark:bg-[#173323] dark:text-[#A3B5AA]'
                        }`}
                      >
                        {row.statusCategory === 'expired' && <ShieldAlert className="w-3 h-3" />}
                        {row.statusCategory === 'trial' && <Clock className="w-3 h-3" />}
                        {(row.statusCategory === 'monthly' || row.statusCategory === 'yearly') && (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {row.statusCategory === 'suspended' && <Ban className="w-3 h-3" />}
                        {row.statusLabel}
                      </span>
                      <span
                        className={`text-[11px] font-extrabold tabular-nums ${
                          row.daysLeft <= 1
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-[#4B5B52] dark:text-[#A3B5AA]'
                        }`}
                      >
                        متبقي {row.daysLeft} يوم · {row.subscriptionDateFormatted}
                      </span>
                    </div>
                  </div>

                  {/* Merchant Contact + Password + Delivery Fee */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-2xl bg-[#F6FBF7] dark:bg-[#0F1712] p-3 border border-[#CFE3D5]/70 dark:border-[#2C3D32] text-xs">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#4B5B52] dark:text-[#A3B5AA] shrink-0">الإيميل:</span>
                        <span dir="ltr" className="font-bold truncate text-[#14201A] dark:text-[#E8F2EB]">
                          {row.email || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#4B5B52] dark:text-[#A3B5AA] shrink-0">الموبايل:</span>
                        <span dir="ltr" className="font-extrabold tabular-nums text-[#14201A] dark:text-[#E8F2EB]">
                          {row.phone || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#4B5B52] dark:text-[#A3B5AA] shrink-0">كلمة السر:</span>
                        <div className="inline-flex items-center gap-1.5">
                          <span dir="ltr" className="font-mono font-bold text-[#14201A] dark:text-[#E8F2EB]">
                            {showPass ? row.password || 'مشفرة بالخادم' : '••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedPasswords((prev) => ({
                                ...prev,
                                [row.shopId]: !prev[row.shopId],
                              }))
                            }
                            aria-label="إظهار كلمة السر"
                            className="p-1 rounded-lg bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0]"
                          >
                            {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:border-s sm:border-[#CFE3D5]/70 dark:sm:border-[#2C3D32] sm:ps-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#4B5B52] dark:text-[#A3B5AA]">التوصيل (ج):</span>
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={deliveryVal}
                            onChange={(e) =>
                              setDeliveryEdits((prev) => ({
                                ...prev,
                                [row.shopId]: e.target.value,
                              }))
                            }
                            className="w-16 px-2 py-1 rounded-xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C] text-center font-extrabold tabular-nums"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSaveDeliveryPrice(row)}
                            className="p-1.5 rounded-xl bg-[#15803D] text-white hover:bg-[#166534]"
                            title="حفظ سعر التوصيل"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {row.resetCode ? (
                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <span className="px-2 py-0.5 rounded-lg bg-[#FEF9C3] text-[#14201A] text-[11px] font-extrabold tabular-nums">
                            كود الاستعادة: {row.resetCode}
                          </span>
                          {row.phone && (
                            <a
                              href={`https://wa.me/${toWhatsAppNumber(row.phone)}?text=${encodeURIComponent(
                                `مرحباً ${row.nameAr}، كود استعادة كلمة سر متجرك على Ghazalo هو: ${row.resetCode}`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-0.5 rounded-lg bg-[#15803D] text-white text-[11px] font-extrabold inline-flex items-center gap-1"
                            >
                              <MessageCircle className="w-3 h-3" />
                              واتساب
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA] pt-0.5">
                          القالب: {row.shop.menuTemplate || 'classic'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions Toolbar */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {onPreviewShop && (
                      <button
                        type="button"
                        onClick={() => onPreviewShop(row.shop)}
                        className="px-3 py-1.5 rounded-xl bg-[#14201A] dark:bg-[#173323] text-white font-extrabold inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        فتح المنيو
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCopyMenuLink(row)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#F6FBF7] dark:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32] font-bold inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedSlugId === row.shopId ? 'تم النسخ!' : 'نسخ اللينك'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrPreviewRow(row)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] font-bold inline-flex items-center gap-1"
                    >
                      <QrCode className="w-3 h-3" />
                      QR
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordModalRow(row);
                        setNewStorePassInput('');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-[#FFFFFF] dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] font-bold inline-flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3 text-[#15803D]" />
                      تغيير الباسورد
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleGenerateResetCode(row)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#FEF9C3] text-[#14201A] font-bold inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      كود استعادة
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPlanRowId((prev) => (prev === row.shopId ? null : row.shopId))
                      }
                      className="px-3 py-1.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold inline-flex items-center gap-1 ms-auto"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isPlansExpanded ? 'إخفاء الباقات' : 'إدارة الاشتراك'}
                    </button>
                  </div>

                  {/* Subscription Controls Strip (Always visible 4 crisp controls + expanded details) */}
                  <div
                    className={`grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#CFE3D5]/70 dark:border-[#2C3D32] ${
                      isPlansExpanded ? '' : ''
                    }`}
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSubscriptionAction(row, 'trial')}
                      className="py-2 px-2.5 rounded-xl bg-[#FEF9C3] hover:bg-[#FACC15] text-[#14201A] font-extrabold text-[11px] text-center transition-colors"
                    >
                      تجربة 7 أيام (0 ج)
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSubscriptionAction(row, 'monthly')}
                      className="py-2 px-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-[11px] text-center transition-colors"
                    >
                      شهري ({SUBSCRIPTION_PRICING.MONTHLY_EGP} ج)
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSubscriptionAction(row, 'yearly')}
                      className="py-2 px-2.5 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] border border-[#15803D] text-[#14532D] dark:text-[#BBF7D0] hover:bg-[#15803D] hover:text-white font-extrabold text-[11px] text-center transition-colors"
                    >
                      سنوي ({SUBSCRIPTION_PRICING.YEARLY_EGP} ج)
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSubscriptionAction(row, 'suspend')}
                      className="py-2 px-2.5 rounded-xl bg-[#FFFFFF] dark:bg-[#18231C] border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 font-extrabold text-[11px] inline-flex items-center justify-center gap-1 transition-colors"
                    >
                      <Ban className="w-3 h-3" />
                      إيقاف
                    </button>
                  </div>
                </div>
              );
            })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Admin QR Quick Preview & Print Modal */}
      {qrPreviewRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs no-print"
          onClick={() => setQrPreviewRow(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sf-card max-w-sm w-full p-6 space-y-4 text-center shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black break-words leading-snug">{qrPreviewRow.nameAr}</h3>
              <button
                type="button"
                onClick={() => setQrPreviewRow(null)}
                className="w-8 h-8 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-center">
              <QrCodeImage value={getAbsoluteMenuUrl(qrPreviewRow.storeSlug)} size={190} />
            </div>
            <div dir="ltr" className="text-xs font-mono text-[#15803D] dark:text-[#BBF7D0] break-all">
              {getAbsoluteMenuUrl(qrPreviewRow.storeSlug)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  void downloadQrPng(
                    getAbsoluteMenuUrl(qrPreviewRow.storeSlug),
                    `${qrPreviewRow.storeSlug}-qr.png`
                  )
                }
                className="sf-btn-primary text-xs min-h-[42px]"
              >
                <Download className="w-4 h-4" />
                تحميل PNG
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="sf-btn text-xs min-h-[42px]"
              >
                <Printer className="w-4 h-4" />
                طباعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Restaurant Password Modal */}
      {passwordModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <form
            onSubmit={(e) => void handleSaveStorePassword(e)}
            className="sf-card max-w-sm w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">
                تغيير كلمة سر {passwordModalRow.nameAr}
              </h3>
              <button
                type="button"
                onClick={() => setPasswordModalRow(null)}
                className="w-8 h-8 rounded-xl bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              أدخل كلمة السر الجديدة — سيتمكن المطعم من تسجيل الدخول بها فوراً على لوحة{' '}
              <span dir="ltr" className="font-bold text-[#15803D] dark:text-[#BBF7D0]">
                {passwordModalRow.storeSlug}
              </span>
            </p>
            <input
              type="text"
              required
              minLength={4}
              value={newStorePassInput}
              onChange={(e) => setNewStorePassInput(e.target.value)}
              placeholder="كلمة السر الجديدة"
              className="sf-inp"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingStorePass}
                className="sf-btn-primary flex-1 text-sm"
              >
                {savingStorePass ? 'جاري الحفظ...' : 'حفظ كلمة السر'}
              </button>
              <button
                type="button"
                onClick={() => setPasswordModalRow(null)}
                className="sf-btn text-sm"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change Admin PIN Modal */}
      {changePinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <form
            onSubmit={(e) => void handleSaveNewPin(e)}
            className="sf-card max-w-sm w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-black">تغيير الرقم السري للأدمن</h3>
            <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              أدخل الرقم السري الجديد (4 أرقام أو أحرف على الأقل).
            </p>
            <input
              type="text"
              dir="ltr"
              required
              minLength={4}
              maxLength={32}
              value={newPinInput}
              onChange={(e) => setNewPinInput(e.target.value)}
              placeholder="الرقم السري الجديد"
              className="sf-inp text-center text-base font-extrabold"
            />
            {pinSavedMsg && (
              <div className="text-xs font-extrabold text-[#15803D] text-center">
                {pinSavedMsg}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingPin}
                className="sf-btn-primary flex-1 text-sm"
              >
                {savingPin ? 'جاري الحفظ...' : 'حفظ الرقم الجديد'}
              </button>
              <button
                type="button"
                onClick={() => setChangePinOpen(false)}
                className="sf-btn text-sm"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Printable QR Poster for Admin QR Preview */}
      {qrPreviewRow && (
        <div className="hidden print-only p-8 text-center max-w-md mx-auto">
          <div className="border-2 border-emerald-700 rounded-3xl p-6 space-y-4">
            <h2 className="text-2xl font-black text-slate-900">{qrPreviewRow.nameAr}</h2>
            <p className="text-sm font-bold text-slate-600">امسح الرمز لتصفح المنيو والطلب أونلاين</p>
            <div className="flex justify-center">
              <QrCodeImage value={getAbsoluteMenuUrl(qrPreviewRow.storeSlug)} size={240} />
            </div>
            <div dir="ltr" className="text-xs font-mono text-emerald-800">
              {getAbsoluteMenuUrl(qrPreviewRow.storeSlug)}
            </div>
            <div className="text-xs font-extrabold text-slate-500">Ghazalo Digital Menu</div>
          </div>
        </div>
      )}
    </div>
  );
};
