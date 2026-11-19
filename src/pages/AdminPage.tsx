import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, type User } from 'firebase/auth';
import {
  ArrowRight,
  Ban,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  Unlock,
} from 'lucide-react';
import { GhazaloLogo } from '../components/BrandLogo';
import { auth, googleProvider } from '../firebase';
import {
  approveAndActivateShop,
  backfillAllShopsMissingPhotos,
  extendTrialShop,
  getAdminCustomPin,
  saveAdminCustomPin,
  subscribeToAllShops,
  suspendShop,
} from '../services/firestoreService';
import { getShopAccessState } from '../utils/calculations';
import { ADMIN_EMAIL, type Shop } from '../types';

interface AdminPageProps {
  onBack: () => void;
  onPreviewShop?: (shop: Shop) => void;
}

const PIN_SESSION_KEY = 'ghazalo_admin_unlocked_v1';

export const AdminPage: React.FC<AdminPageProps> = ({ onBack, onPreviewShop }) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authLoading, setAuthLoading] = useState(true);

  const [pinUnlocked, setPinUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(PIN_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  const [shops, setShops] = useState<Shop[]>([]);
  const [loadingShops, setLoadingShops] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'payment_requests' | 'needs_approval' | 'trial' | 'active' | 'suspended'
  >('all');
  const [linkCopied, setLinkCopied] = useState(false);

  // Change PIN modal state
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinSavedMsg, setPinSavedMsg] = useState('');

  // Batch dish photo backfill across all shops
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const isAdminEmail =
    Boolean(user?.emailVerified) &&
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    if (!pinUnlocked || !isAdminEmail) return;
    setLoadingShops(true);
    const unsub = subscribeToAllShops((list) => {
      const sorted = [...list].sort((a, b) => {
        const aAccess = getShopAccessState(a);
        const bAccess = getShopAccessState(b);
        if (aAccess.isActive !== bAccess.isActive) return aAccess.isActive ? 1 : -1;
        return (b.trialEndsAt || 0) - (a.trialEndsAt || 0);
      });
      setShops(sorted);
      setLoadingShops(false);
    });
    return () => unsub();
  }, [pinUnlocked, isAdminEmail]);

  const handleGoogleAdminLogin = async () => {
    setPinError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب الإدارة');
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    const candidate = pinInput.trim();
    if (!candidate) {
      setPinError('يرجى إدخال الرقم السري.');
      return;
    }

    setVerifyingPin(true);
    try {
      // Check custom Firestore PIN first if signed in as admin
      if (isAdminEmail) {
        const customPin = await getAdminCustomPin();
        if (customPin && candidate === customPin) {
          sessionStorage.setItem(PIN_SESSION_KEY, '1');
          setPinUnlocked(true);
          setPinInput('');
          return;
        }
        if (customPin && candidate !== customPin) {
          setPinError('الرقم السري غير صحيح.');
          return;
        }
      }

      // Otherwise verify against server ADMIN_PIN
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidate }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setPinError(data.error || 'الرقم السري غير صحيح.');
        return;
      }

      sessionStorage.setItem(PIN_SESSION_KEY, '1');
      setPinUnlocked(true);
      setPinInput('');
    } catch {
      setPinError('تعذر التحقق من الرقم السري.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleLock = () => {
    try {
      sessionStorage.removeItem(PIN_SESSION_KEY);
    } catch {
      // ignore
    }
    setPinUnlocked(false);
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput.trim().length < 4) return;
    setSavingPin(true);
    try {
      await saveAdminCustomPin(newPinInput.trim());
      setPinSavedMsg('تم تحديث الرقم السري بنجاح');
      setNewPinInput('');
      setTimeout(() => {
        setPinSavedMsg('');
        setChangePinOpen(false);
      }, 1500);
    } finally {
      setSavingPin(false);
    }
  };

  const handleApproveAndActivate = async (shopId: string, days: number) => {
    setBusyId(shopId);
    try {
      await approveAndActivateShop(shopId, days);
    } finally {
      setBusyId(null);
    }
  };

  const handleExtendTrial = async (shopId: string) => {
    setBusyId(shopId);
    try {
      await extendTrialShop(shopId, 7);
    } finally {
      setBusyId(null);
    }
  };

  const handleSuspend = async (shopId: string) => {
    setBusyId(shopId);
    try {
      await suspendShop(shopId);
    } finally {
      setBusyId(null);
    }
  };

  const handleBackfillAllPhotos = async () => {
    if (shops.length === 0) return;
    setBackfillBusy(true);
    setBackfillMsg('');
    try {
      const updated = await backfillAllShopsMissingPhotos(shops.map((s) => s.id));
      setBackfillMsg(
        updated > 0
          ? `تم إضافة الصور الحقيقية لعدد ${updated} صنف عبر جميع المتاجر بنجاح.`
          : 'جميع الأصناف عبر كل المطاعم تمتلك صوراً بالفعل.'
      );
    } catch {
      setBackfillMsg('تعذر تحديث صور بعض الأصناف، يرجى المحاولة مرة أخرى.');
    } finally {
      setBackfillBusy(false);
    }
  };

  const privateAdminUrl = `${window.location.origin}/?admin=ghazalo-owner`;

  const handleCopyAdminLink = async () => {
    try {
      await navigator.clipboard.writeText(privateAdminUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      // ignore clipboard restriction
    }
  };

  const stats = useMemo(() => {
    let active = 0;
    let trial = 0;
    let needsApproval = 0;
    let paymentRequests = 0;
    for (const s of shops) {
      const access = getShopAccessState(s);
      if (s.requestedPlan) paymentRequests += 1;
      if (!access.isActive) needsApproval += 1;
      else if (access.reason === 'active') active += 1;
      else trial += 1;
    }
    return { total: shops.length, active, trial, needsApproval, paymentRequests };
  }, [shops]);

  const filteredShops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shops.filter((s) => {
      const access = getShopAccessState(s);
      const matchFilter =
        statusFilter === 'all' ||
        (statusFilter === 'payment_requests' && Boolean(s.requestedPlan)) ||
        (statusFilter === 'needs_approval' && !access.isActive) ||
        (statusFilter === 'trial' && access.isActive && access.reason === 'trial') ||
        (statusFilter === 'active' && access.isActive && access.reason === 'active') ||
        (statusFilter === 'suspended' && access.reason === 'suspended');

      const matchQuery =
        !q ||
        s.nameAr.toLowerCase().includes(q) ||
        (s.nameEn || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q) ||
        (s.country || '').toLowerCase().includes(q) ||
        (s.whatsapp || '').toLowerCase().includes(q) ||
        (s.paymentNote || '').toLowerCase().includes(q);

      return matchFilter && matchQuery;
    });
  }, [shops, searchQuery, statusFilter]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50/30 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Secret PIN & Admin Identity Gate
  if (!pinUnlocked || !isAdminEmail) {
    return (
      <div dir="rtl" className="min-h-screen bg-emerald-50/40 dark:bg-slate-950 flex flex-col">
        <header className="bg-white dark:bg-slate-900 border-b border-emerald-100 dark:border-slate-800 px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400"
          >
            <ArrowRight className="w-4 h-4" />
            العودة
          </button>
          <span className="font-extrabold text-sm text-slate-700 dark:text-slate-200">
            بوابة الإدارة الخاصة
          </span>
          <div className="w-14" />
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-1">
                <GhazaloLogo compact />
              </div>
              <div className="w-14 h-14 rounded-3xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 mx-auto flex items-center justify-center">
                <Lock className="w-7 h-7" />
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                لوحة تحكم إدارة Ghazalo
              </h1>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                مخصصة لمالك المنصة للموافقة على المطاعم وتفعيل الاشتراكات بعد الـ 7 أيام التجريبية
              </p>
            </div>

            {pinError && (
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                {pinError}
              </div>
            )}

            {!isAdminEmail && (
              <div className="rounded-2xl bg-emerald-50/70 dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 p-4 space-y-3 text-center">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {user
                    ? `أنت مسجل حالياً بحساب (${user.email}). يرجى تسجيل الدخول بحساب Gmail الخاص بالإدارة.`
                    : 'الخطوة 1: سجّل الدخول بحساب Gmail المعتمد للإدارة للوصول لقاعدة البيانات.'}
                </div>
                <button
                  type="button"
                  onClick={() => void handleGoogleAdminLogin()}
                  className="w-full py-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-600 font-extrabold text-sm text-slate-800 dark:text-white hover:bg-emerald-50 transition-colors"
                >
                  تسجيل الدخول بحساب Gmail للإدارة
                </button>
              </div>
            )}

            {!pinUnlocked ? (
              <form onSubmit={handleVerifyPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1.5">
                    الرقم السري للإدارة
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      dir="ltr"
                      required
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-4 py-3.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-lg font-extrabold tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((v) => !v)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={verifyingPin}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {verifyingPin ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                  <span>فتح لوحة الإدارة</span>
                </button>
              </form>
            ) : (
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 p-3 text-center text-xs font-extrabold text-emerald-800 dark:text-emerald-200 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                تم التحقق من الرقم السري — أكمل تسجيل الدخول بحساب الإدارة بالأعلى
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-emerald-50/30 dark:bg-slate-950 pb-14">
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-emerald-100 dark:border-slate-800 px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400"
          >
            <ArrowRight className="w-4 h-4" />
            العودة
          </button>
          <div className="flex items-center gap-2 font-extrabold text-base sm:text-lg">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>إدارة المطاعم والاشتراكات</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopyAdminLink()}
            className="px-3 py-2 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 font-bold text-xs inline-flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {linkCopied ? 'تم نسخ رابطك الخاص' : 'نسخ رابط الإدارة السري'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setChangePinOpen(true)}
            className="px-3 py-2 rounded-full glass-btn text-emerald-800 dark:text-emerald-300 font-bold text-xs inline-flex items-center gap-1.5"
          >
            <KeyRound className="w-4 h-4" />
            <span className="hidden sm:inline">تغيير الرقم السري</span>
          </button>
          <button
            type="button"
            onClick={handleLock}
            className="px-3 py-2 rounded-full glass-btn-amber font-bold text-xs inline-flex items-center gap-1.5"
          >
            <Lock className="w-4 h-4" />
            <span>قفل</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Private Admin URL + Bulk Photo Sync */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-emerald-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                رابط الإدارة السري الخاص بك (غير ظاهر لأي زائر أو مطعم في الموقع)
              </div>
              <div className="text-xs font-mono text-slate-500 truncate" dir="ltr">
                {privateAdminUrl}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={backfillBusy || shops.length === 0}
                onClick={() => void handleBackfillAllPhotos()}
                className="px-4 py-2 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {backfillBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="w-3.5 h-3.5" />
                )}
                <span>تعبئة صور حقيقية للأصناف الناقصة</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyAdminLink()}
                className="px-4 py-2 rounded-full glass-btn-primary text-xs font-extrabold"
              >
                {linkCopied ? 'تم النسخ!' : 'نسخ الرابط الخاص'}
              </button>
            </div>
          </div>
          {backfillMsg && (
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {backfillMsg}
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-emerald-100 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-500">إجمالي المطاعم</div>
            <div className="text-2xl font-extrabold mt-1 tabular-nums">{stats.total}</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-3xl p-4 border border-amber-200 dark:border-amber-800">
            <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
              متوقف / بانتظار الموافقة
            </div>
            <div className="text-2xl font-extrabold text-amber-900 dark:text-amber-200 mt-1 tabular-nums">
              {stats.needsApproval}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-emerald-100 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-500">فترة تجريبية (7 أيام)</div>
            <div className="text-2xl font-extrabold text-sky-700 dark:text-sky-400 mt-1 tabular-nums">
              {stats.trial}
            </div>
          </div>
          <div className="bg-emerald-50/70 dark:bg-emerald-950/30 rounded-3xl p-4 border border-emerald-200 dark:border-emerald-800">
            <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
              مفعل (600ج شهري / 6000ج سنوي)
            </div>
            <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
              {stats.active}
            </div>
          </div>
        </div>

        {/* Search + Filter Tabs */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-emerald-100 dark:border-slate-800 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المطعم، المدينة، الدولة، الواتساب، أو مرجع التحويل"
              className="w-full pr-10 pl-4 py-3 rounded-2xl border border-emerald-100 dark:border-slate-700 bg-emerald-50/20 dark:bg-slate-800 text-sm font-semibold"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: `الكل (${shops.length})` },
              { id: 'payment_requests', label: `طلبات دفع (${stats.paymentRequests})` },
              { id: 'needs_approval', label: `يحتاج موافقة / متوقف (${stats.needsApproval})` },
              { id: 'trial', label: `تجريبي نشط (${stats.trial})` },
              { id: 'active', label: `مفعل (${stats.active})` },
              { id: 'suspended', label: 'موقوف يدوياً' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap border transition-colors ${
                  statusFilter === tab.id
                    ? 'glass-btn-primary'
                    : 'glass-btn text-slate-700 dark:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Shops List */}
        {loadingShops ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center space-y-2 border border-emerald-100 dark:border-slate-800">
            <Store className="w-10 h-10 text-emerald-300 mx-auto" />
            <div className="font-bold text-slate-500">لا توجد مطاعم مطابقة لهذا التصنيف.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredShops.map((s) => {
              const access = getShopAccessState(s);
              const isBusy = busyId === s.id;

              return (
                <div
                  key={s.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl p-5 border space-y-4 ${
                    !access.isActive
                      ? 'border-amber-300 dark:border-amber-800'
                      : 'border-emerald-100 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-extrabold text-lg truncate">{s.nameAr}</h3>
                        {s.nameEn && (
                          <span className="text-xs font-bold text-slate-400" dir="ltr">
                            ({s.nameEn})
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {[s.country, s.city, s.plan ? `باقة: ${s.plan}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {s.whatsapp && (
                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400" dir="ltr">
                          {s.whatsapp}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 text-left">
                      {access.reason === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-extrabold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          مفعل ({access.daysLeft} يوم)
                        </span>
                      ) : access.reason === 'trial' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-xs font-extrabold">
                          <Clock className="w-3.5 h-3.5" />
                          تجريبي ({access.daysLeft} يوم)
                        </span>
                      ) : access.reason === 'suspended' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-xs font-extrabold">
                          <Ban className="w-3.5 h-3.5" />
                          موقوف من الإدارة
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-xs font-extrabold">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          انتهت التجربة - متوقف
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Payment Confirmation Request Box */}
                  {(s.requestedPlan || s.paymentNote) && (
                    <div className="rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900 dark:text-emerald-200">
                        <CreditCard className="w-4 h-4" />
                        <span>
                          {s.requestedPlan === 'yearly_6000'
                            ? 'طلب تفعيل الباقة السنوية (6,000 ج)'
                            : 'طلب تفعيل الباقة الشهرية (600 ج)'}
                        </span>
                      </div>
                      {s.paymentNote && (
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          بيان التحويل: {s.paymentNote}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Admin Controls */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-emerald-50 dark:border-slate-800">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleApproveAndActivate(s.id, 30)}
                      className="px-3.5 py-2 rounded-full glass-btn-primary font-extrabold text-xs inline-flex items-center gap-1.5"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      موافقة وتفعيل شهر (600 ج)
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleApproveAndActivate(s.id, 365)}
                      className="px-3.5 py-2 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 font-bold text-xs inline-flex items-center gap-1.5"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      تفعيل سنة (6,000 ج)
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleExtendTrial(s.id)}
                      className="px-3 py-2 rounded-full glass-btn font-bold text-xs inline-flex items-center gap-1"
                    >
                      <Clock className="w-3.5 h-3.5 text-sky-600" />
                      تجربة 7 أيام
                    </button>

                    {access.isActive && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSuspend(s.id)}
                        className="px-3 py-2 rounded-2xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold text-xs inline-flex items-center gap-1"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        إيقاف الحساب
                      </button>
                    )}

                    {onPreviewShop && (
                      <button
                        type="button"
                        onClick={() => onPreviewShop(s)}
                        className="px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs inline-flex items-center gap-1 mr-auto"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        المنيو
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Change Admin PIN Modal */}
      {changePinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <form
            onSubmit={handleSaveNewPin}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 space-y-4 border border-emerald-100 dark:border-slate-800 shadow-xl"
          >
            <h3 className="text-lg font-extrabold">تغيير الرقم السري للإدارة</h3>
            <p className="text-xs font-semibold text-slate-500">
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
              className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-base font-extrabold"
            />
            {pinSavedMsg && (
              <div className="text-xs font-extrabold text-emerald-700 text-center">
                {pinSavedMsg}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingPin}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-extrabold text-sm"
              >
                {savingPin ? 'جاري الحفظ...' : 'حفظ الرقم الجديد'}
              </button>
              <button
                type="button"
                onClick={() => setChangePinOpen(false)}
                className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold text-sm"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
