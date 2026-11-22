import React, { useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircle,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import { SUPPORT_CONTACT, type DemoRestaurantRecord } from '../types';
import { phoneToAuthEmail, toAsciiDigits } from '../utils/authHelpers';
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
} from '../utils/storeRegistry';
import { GhazaloLogo } from '../components/BrandLogo';

interface AuthPageProps {
  initialMode: 'signup' | 'login';
  onBack: () => void;
  onAuthComplete: (draftMeta: {
    fullName: string;
    businessName: string;
    storeSlug?: string;
    password?: string;
    country: string;
    contact: string;
  }) => void;
  onStoreLoginSuccess?: (payload: {
    storeSlug: string;
    shopId: string;
    token: string;
    record?: DemoRestaurantRecord | null;
  }) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode,
  onBack,
  onStoreLoginSuccess,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);

  // Login State: Email OR Phone ONLY (no store-name input)
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Signup State
  const [restaurantName, setRestaurantName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState<{
    storeSlug: string;
    shopId: string;
    token: string;
    record?: DemoRestaurantRecord | null;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Forgot Password Popup (Email/Phone + 6-digit code from Admin)
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [resetCodeInput, setResetCodeInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg('');
    setSignupSuccess(null);
  }, [initialMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const idf = identifier.trim();
    const cleanPass = password;
    if (!idf || !cleanPass) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني أو رقم الموبايل وكلمة السر.');
      return;
    }

    setLoading(true);
    try {
      const userMatch = findLocalUserByEmailOrPhone(idf);
      const restMatch = findLocalRestaurantByIdentifier(idf);

      if (userMatch && userMatch.password === cleanPass) {
        const token = `ghz-token-${userMatch.storeSlug}-${Date.now()}`;
        setAuthSessionStorage(userMatch.storeSlug, token);
        onStoreLoginSuccess?.({
          storeSlug: userMatch.storeSlug,
          shopId: userMatch.shopId,
          token,
          record: restMatch,
        });
        return;
      }

      if (restMatch && restMatch.password === cleanPass) {
        const token = `ghz-token-${restMatch.storeSlug}-${Date.now()}`;
        setAuthSessionStorage(restMatch.storeSlug, token);
        onStoreLoginSuccess?.({
          storeSlug: restMatch.storeSlug,
          shopId: restMatch.shopId,
          token,
          record: restMatch,
        });
        return;
      }

      const slugToCheck = userMatch?.storeSlug || restMatch?.storeSlug || '';
      if (slugToCheck) {
        try {
          const srvRes = await fetch('/api/store-auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeSlug: slugToCheck, password: cleanPass }),
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
            onStoreLoginSuccess?.({
              storeSlug: finalSlug,
              shopId: srvData.shopId || finalSlug,
              token: srvData.token,
              record: restMatch,
            });
            return;
          }
        } catch {
          // continue fallback
        }
      }

      try {
        const cleanEmail = idf.includes('@')
          ? idf
          : phoneToAuthEmail(toAsciiDigits(normalizeEgyptianPhone(idf)));
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
        const token = `fb-${cred.user.uid}-${Date.now()}`;
        const slug = restMatch?.storeSlug || userMatch?.storeSlug || 'kebda-masr';
        setAuthSessionStorage(slug, token);
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

      setErrorMsg(
        'البريد الإلكتروني / رقم الموبايل أو كلمة السر غير صحيحة. (للتجربة: kebda@menu.eg أو 01015861991 وكلمة السر 123456)'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < 6) {
      setErrorMsg('كلمة السر يجب أن تكون 6 أحرف أو أرقام على الأقل.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('كلمة السر وتأكيد كلمة السر غير متطابقتين.');
      return;
    }

    setLoading(true);
    try {
      const normalizedPhone = normalizeEgyptianPhone(phone);
      const res = registerDemoAccount({
        restaurantName,
        email,
        phone: normalizedPhone,
        password,
        plan: 'trial',
      });

      if (!res.ok || !res.user || !res.token) {
        setErrorMsg(res.error || 'يرجى مراجعة البيانات المدخلة.');
        return;
      }

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
            password,
          }),
        });
      } catch {
        // offline demo works smoothly
      }

      setSignupSuccess({
        storeSlug: res.user.storeSlug,
        shopId: res.user.shopId,
        token: res.token,
        record: res.record,
      });
    } finally {
      setLoading(false);
    }
  };

  const openForgotPopup = () => {
    setForgotError('');
    setForgotSuccess('');
    setForgotStep(1);
    setForgotIdentifier(identifier || '');
    setResetCodeInput('');
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    setForgotModalOpen(true);
  };

  const handleForgotStep1Request = async (e: React.FormEvent) => {
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
        'تم تسجيل طلب الاستعادة. أدخل كود الاستعادة المكون من 6 أرقام الصادر من الأدمن، أو تواصل عبر واتساب.'
      );
    } finally {
      setForgotBusy(false);
    }
  };

  const handleForgotStep2Reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    const idf = forgotIdentifier.trim();
    const code = toAsciiDigits(resetCodeInput.trim());
    const newPass = newPasswordInput.trim();
    const confirmPass = confirmNewPasswordInput.trim();

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
      let serverError = '';
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
          serverError = data.error || '';
        }
      } catch {
        // check localStorage below
      }

      const localRest = findLocalRestaurantByIdentifier(idf);
      const localUser = findLocalUserByEmailOrPhone(idf);
      const localCodeOk =
        (localRest &&
          localRest.resetCode === code &&
          (!localRest.resetCodeExpiresAt || Date.now() <= localRest.resetCodeExpiresAt)) ||
        (localUser &&
          localUser.resetCode === code &&
          (!localUser.resetCodeExpiresAt || Date.now() <= localUser.resetCodeExpiresAt));

      if (backendOk || localCodeOk) {
        if (localRest) {
          saveLocalRestaurants(
            getLocalRestaurants().map((r) =>
              r.shopId === localRest.shopId || r.storeSlug === localRest.storeSlug
                ? { ...r, password: newPass, resetCode: undefined, resetCodeExpiresAt: undefined }
                : r
            )
          );
        }
        if (localUser) {
          saveLocalUsers(
            getLocalUsers().map((u) =>
              u.id === localUser.id || u.storeSlug === localUser.storeSlug
                ? { ...u, password: newPass, resetCode: undefined, resetCodeExpiresAt: undefined }
                : u
            )
          );
        }

        setIdentifier(idf);
        setPassword('');
        setForgotSuccess('تم تغيير كلمة السر بنجاح! يمكنك الدخول بكلمة السر الجديدة الآن.');
        setTimeout(() => {
          setForgotModalOpen(false);
          setMode('login');
        }, 1200);
        return;
      }

      setForgotError(
        serverError || 'كود الاستعادة غير صحيح أو منتهي الصلاحية. تواصل مع الدعم لإصدار كود من 6 أرقام.'
      );
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex justify-center">
            <GhazaloLogo stacked />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/90 dark:border-slate-800 shadow-[0_14px_45px_rgba(255,106,0,0.08)] space-y-5">
            {signupSuccess ? (
              <div className="space-y-5 text-center py-2">
                <div className="w-16 h-16 rounded-3xl bg-orange-50 dark:bg-orange-950/50 text-[#FF6A00] mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    مبروك! لينك المنيو بتاعك:
                  </h1>
                  <div
                    dir="ltr"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 text-sm font-extrabold text-[#FF6A00]"
                  >
                    <span>/menu/{signupSuccess.storeSlug}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/menu/${signupSuccess.storeSlug}`;
                        void navigator.clipboard.writeText(url);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="text-slate-600 dark:text-slate-300 hover:text-[#FF6A00]"
                    >
                      {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onStoreLoginSuccess?.({
                      storeSlug: signupSuccess.storeSlug,
                      shopId: signupSuccess.shopId,
                      token: signupSuccess.token,
                      record: signupSuccess.record,
                    })
                  }
                  className="w-full py-4 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)]"
                >
                  ادخل لوحة التحكم
                </button>
              </div>
            ) : mode === 'login' ? (
              <>
                <div className="text-center space-y-1.5">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                    تسجيل الدخول
                  </h1>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    ادخل بالبريد الالكتروني او رقم الموبايل للمتابعة إلى لوحة التحكم
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-extrabold text-amber-800 dark:text-amber-200 leading-relaxed">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1.5">
                      البريد الالكتروني او رقم الموبايل
                    </label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="01015861991 or name@example.com"
                      className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-left focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1.5">
                      كلمة السر
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="pt-1.5">
                      <button
                        type="button"
                        onClick={openForgotPopup}
                        className="text-xs font-extrabold text-[#FF6A00] hover:underline"
                      >
                        نسيت كلمة السر؟
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)] transition-all flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    <span>دخول</span>
                  </button>
                </form>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-center">
                  <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    ليس لديك متجر؟{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setMode('signup');
                      }}
                      className="font-extrabold text-[#FF6A00] hover:underline"
                    >
                      ابدأ مجاناً
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#FF6A00]"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    العودة إلى الموقع الرئيسي
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center space-y-1.5">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                    أنشئ متجرك مجاناً
                  </h1>
                  <p className="text-xs font-bold text-[#FF6A00]">هتاخد 7 ايام مجاني</p>
                </div>

                {errorMsg && (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-extrabold text-amber-800 dark:text-amber-200 leading-relaxed">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={(e) => void handleSignup(e)} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      اسم المطعم
                    </label>
                    <input
                      type="text"
                      required
                      value={restaurantName}
                      onChange={(e) => setRestaurantName(e.target.value)}
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
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
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
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      تأكيد كلمة السر
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)] flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    <span>انشئ متجري مجاناً</span>
                  </button>
                </form>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-center">
                  <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    لديك حساب بالفعل؟{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setMode('login');
                      }}
                      className="font-extrabold text-[#FF6A00] hover:underline"
                    >
                      دخول
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#FF6A00]"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    العودة إلى الموقع الرئيسي
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 border border-orange-100 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-950/50 text-[#FF6A00] flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    نسيت كلمة السر؟
                  </h2>
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
              <form onSubmit={(e) => void handleForgotStep1Request(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1.5">
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
              <form onSubmit={(e) => void handleForgotStep2Reset(e)} className="space-y-3.5">
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
                    value={resetCodeInput}
                    onChange={(e) =>
                      setResetCodeInput(toAsciiDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
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
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    تأكيد كلمة السر
                  </label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={confirmNewPasswordInput}
                    onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
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

            <div className="rounded-2xl bg-orange-50/70 dark:bg-slate-800/80 border border-orange-100 dark:border-slate-700 p-3.5 space-y-2 text-center">
              <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                تواصل مع الدعم لاستعادة الحساب
              </div>
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  `مرحباً دعم غزالة، أحتاج كود استعادة لحسابي: ${forgotIdentifier || identifier || ''}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>تواصل واتساب الدعم ({SUPPORT_CONTACT.PHONE_DISPLAY})</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
