import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MailCheck,
  MessageCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { SUPPORT_CONTACT, type DemoRestaurantRecord } from '../types';
import { isUserActivated, isValidPhoneDigits, toAsciiDigits } from '../utils/authHelpers';
import {
  findLocalRestaurantByIdentifier,
  findLocalUserByEmailOrPhone,
  lookupEmailByPhone,
  normalizeEgyptianPhone,
  savePhoneEmailMapping,
  setAuthSessionStorage,
} from '../utils/storeRegistry';

const PENDING_SIGNUP_META_KEY = 'ghazalo_pending_signup_meta';

export interface AuthSuccessMeta {
  fullName: string;
  businessName: string;
  storeSlug?: string;
  password?: string;
  country: string;
  contact: string;
}

export function loadPendingSignupMeta(): AuthSuccessMeta | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGNUP_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSuccessMeta;
  } catch {
    return null;
  }
}

export function clearPendingSignupMeta(): void {
  try {
    sessionStorage.removeItem(PENDING_SIGNUP_META_KEY);
  } catch {
    // ignore
  }
}

function savePendingSignupMeta(meta: AuthSuccessMeta): void {
  try {
    sessionStorage.setItem(PENDING_SIGNUP_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

interface AuthFormPanelProps {
  mode: 'signup' | 'login';
  onModeChange: (nextMode: 'signup' | 'login') => void;
  onAuthComplete: (meta: AuthSuccessMeta) => void;
  onStoreLoginSuccess?: (payload: {
    storeSlug: string;
    shopId: string;
    token: string;
    record?: DemoRestaurantRecord | null;
  }) => void;
  compact?: boolean;
}

function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'هذا الجيميل مسجل بالفعل. يمكنك تسجيل الدخول مباشرة.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني (الجيميل) غير صحيحة.';
    case 'auth/weak-password':
      return 'كلمة السر ضعيفة، يجب أن تكون 6 أحرف أو أرقام على الأقل.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'الجيميل / رقم الموبايل أو كلمة السر غير صحيحة.';
    case 'auth/popup-closed-by-user':
      return 'تم إغلاق نافذة تسجيل الدخول بحساب جوجل.';
    case 'auth/too-many-requests':
      return 'تم إرسال عدة محاولات متتالية. يرجى الانتظار دقيقة ثم المحاولة مجدداً.';
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بالشبكة. تحقق من الإنترنت وحاول مرة أخرى.';
    default:
      return err instanceof Error && err.message
        ? err.message
        : 'حدث خطأ غير متوقع أثناء المصادقة. حاول مرة أخرى.';
  }
}

function GoogleGIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.92h5.45c-.24 1.26-.96 2.33-2.04 3.04l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.48 0-.72-.06-1.41-.19-2.04H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.74 0 5.04-.91 6.72-2.46l-3.3-2.56c-.91.61-2.08.97-3.42.97-2.63 0-4.86-1.78-5.65-4.17l-3.41 2.63C4.61 19.72 8.03 22 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.35 13.78A5.99 5.99 0 0 1 6.03 12c0-.62.11-1.22.32-1.78L2.94 7.59A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.41l3.27-2.63z"
      />
      <path
        fill="#4285F4"
        d="M12 6.05c1.49 0 2.83.51 3.88 1.52l2.91-2.91C17.03 3.04 14.74 2 12 2 8.03 2 4.61 4.28 2.94 7.59l3.41 2.63C7.14 7.83 9.37 6.05 12 6.05z"
      />
    </svg>
  );
}

export const AuthFormPanel: React.FC<AuthFormPanelProps> = ({
  mode,
  onModeChange,
  onAuthComplete,
  onStoreLoginSuccess,
  compact = false,
}) => {
  // Signup / Login form fields (NO SMS / NO Recaptcha)
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Loading & feedback
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Gmail verification waiting screen state
  const [awaitingVerification, setAwaitingVerification] = useState<boolean>(() => {
    const u = auth.currentUser;
    return Boolean(u && !isUserActivated(u) && u.email);
  });
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string>(
    () => auth.currentUser?.email || ''
  );
  const [pendingVerifyMeta, setPendingVerifyMeta] = useState<AuthSuccessMeta | null>(() =>
    loadPendingSignupMeta()
  );
  const [checkingVerify, setCheckingVerify] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Forgot Password modal
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmailOrPhone, setForgotEmailOrPhone] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    setErrorMsg('');
    setInfoMsg('');
  }, [mode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  // Poll Firebase Auth every 4s while user is on the Gmail activation screen
  useEffect(() => {
    if (!awaitingVerification) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      const user = auth.currentUser;
      if (!user || cancelled) return;
      try {
        await user.reload();
        if (!cancelled && isUserActivated(auth.currentUser)) {
          const verifiedUser = auth.currentUser!;
          const meta = pendingVerifyMeta || loadPendingSignupMeta() || {
            fullName: verifiedUser.displayName || fullName.trim() || 'تاجر',
            businessName: businessName.trim(),
            country: 'مصر',
            contact: normalizeEgyptianPhone(phoneInput) || verifiedUser.email || pendingVerifyEmail,
          };
          clearPendingSignupMeta();
          setAwaitingVerification(false);
          onAuthComplete(meta);
        }
      } catch {
        // ignore transient network check
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    awaitingVerification,
    businessName,
    fullName,
    onAuthComplete,
    pendingVerifyEmail,
    pendingVerifyMeta,
    phoneInput,
  ]);

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      if (!isUserActivated(user)) {
        try {
          await sendEmailVerification(user);
        } catch {
          // ignore rate limit
        }
        const meta: AuthSuccessMeta = {
          fullName: user.displayName || 'تاجر',
          businessName: '',
          country: 'مصر',
          contact: user.email || '',
        };
        setPendingVerifyEmail(user.email || '');
        setPendingVerifyMeta(meta);
        setResendCooldown(30);
        setAwaitingVerification(true);
        return;
      }

      clearPendingSignupMeta();
      onAuthComplete({
        fullName: user.displayName || 'تاجر',
        businessName: '',
        country: 'مصر',
        contact: user.email || '',
      });
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanName = fullName.trim();
    const cleanBusinessName = businessName.trim();
    const rawPhone = toAsciiDigits(phoneInput.trim());
    const cleanEmail = emailInput.trim().toLowerCase();

    if (!cleanName) {
      setErrorMsg('يرجى إدخال اسمك الشخصي.');
      return;
    }
    if (!cleanBusinessName) {
      setErrorMsg('يرجى إدخال اسم المطعم أو النشاط.');
      return;
    }
    if (!rawPhone || !isValidPhoneDigits(rawPhone)) {
      setErrorMsg('يرجى إدخال رقم موبايل صحيح.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('يرجى إدخال الجيميل بشكل صحيح.');
      return;
    }
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
      const normalizedPhone = normalizeEgyptianPhone(rawPhone);
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      savePhoneEmailMapping(normalizedPhone, cleanEmail);
      try {
        await updateProfile(cred.user, { displayName: cleanName });
      } catch {
        // non-blocking
      }
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // user can resend on verification screen
      }

      const meta: AuthSuccessMeta = {
        fullName: cleanName,
        businessName: cleanBusinessName,
        password,
        country: 'مصر',
        contact: normalizedPhone,
      };
      savePendingSignupMeta(meta);
      setPendingVerifyEmail(cleanEmail);
      setPendingVerifyMeta(meta);
      setResendCooldown(30);
      setAwaitingVerification(true);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const rawId = toAsciiDigits(loginIdentifier.trim());
    if (!rawId) {
      setErrorMsg('يرجى إدخال الجيميل أو رقم الموبايل.');
      return;
    }
    if (!password) {
      setErrorMsg('يرجى إدخال كلمة السر.');
      return;
    }

    const isEmail = rawId.includes('@');
    const cleanEmail = isEmail ? rawId.toLowerCase() : lookupEmailByPhone(rawId);

    setLoading(true);
    try {
      // 1) Try Firebase Auth when we have a Gmail/email (either entered directly or mapped from phone)
      if (cleanEmail && cleanEmail.includes('@')) {
        try {
          const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
          if (!isUserActivated(cred.user)) {
            try {
              await sendEmailVerification(cred.user);
            } catch {
              // ignore rate limit if already sent recently
            }
            const savedMeta = loadPendingSignupMeta();
            const meta: AuthSuccessMeta = savedMeta || {
              fullName: cred.user.displayName || 'تاجر',
              businessName: '',
              password,
              country: 'مصر',
              contact: isEmail ? cred.user.email || cleanEmail : normalizeEgyptianPhone(rawId) || cleanEmail,
            };
            setPendingVerifyEmail(cred.user.email || cleanEmail);
            setPendingVerifyMeta(meta);
            setResendCooldown(30);
            setErrorMsg('روح أكد جيميلك الأول — أرسلنا لك لينك التأكيد على الجيميل.');
            setAwaitingVerification(true);
            return;
          }

          const savedMeta = loadPendingSignupMeta();
          clearPendingSignupMeta();
          onAuthComplete({
            fullName: savedMeta?.fullName || cred.user.displayName || 'تاجر',
            businessName: savedMeta?.businessName || '',
            password,
            country: 'مصر',
            contact:
              savedMeta?.contact ||
              (isEmail ? cred.user.email || cleanEmail : normalizeEgyptianPhone(rawId)) ||
              cleanEmail,
          });
          return;
        } catch (fbErr) {
          // Check local/server fallback below before failing
          const userMatch = findLocalUserByEmailOrPhone(rawId);
          const restMatch = findLocalRestaurantByIdentifier(rawId);

          if (userMatch && userMatch.password === password) {
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

          if (restMatch && restMatch.password === password) {
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

          try {
            const srvRes = await fetch('/api/store-auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier: rawId, password }),
            });
            const srvData = (await srvRes.json()) as {
              ok?: boolean;
              token?: string;
              storeSlug?: string;
              shopId?: string;
            };
            if (srvRes.ok && srvData.ok && srvData.token && srvData.storeSlug) {
              setAuthSessionStorage(srvData.storeSlug, srvData.token);
              onStoreLoginSuccess?.({
                storeSlug: srvData.storeSlug,
                shopId: srvData.shopId || srvData.storeSlug,
                token: srvData.token,
                record: restMatch,
              });
              return;
            }
          } catch {
            // ignore offline
          }

          setErrorMsg(mapFirebaseAuthError(fbErr));
          return;
        }
      }

      // 2) Phone / store identifier login (local + backend store auth)
      const userMatch = findLocalUserByEmailOrPhone(rawId);
      const restMatch = findLocalRestaurantByIdentifier(rawId);

      if (userMatch && userMatch.password === password) {
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

      if (restMatch && restMatch.password === password) {
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

      try {
        const srvRes = await fetch('/api/store-auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: rawId, password }),
        });
        const srvData = (await srvRes.json()) as {
          ok?: boolean;
          token?: string;
          storeSlug?: string;
          shopId?: string;
        };
        if (srvRes.ok && srvData.ok && srvData.token && srvData.storeSlug) {
          setAuthSessionStorage(srvData.storeSlug, srvData.token);
          onStoreLoginSuccess?.({
            storeSlug: srvData.storeSlug,
            shopId: srvData.shopId || srvData.storeSlug,
            token: srvData.token,
            record: restMatch,
          });
          return;
        }
      } catch {
        // ignore offline
      }

      setErrorMsg(
        'بيانات الدخول غير صحيحة. أدخل الجيميل أو رقم الموبايل المسجل وكلمة السر، أو أنشئ حساباً جديداً.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerifiedNow = async () => {
    setErrorMsg('');
    setInfoMsg('');
    const user = auth.currentUser;
    if (!user) {
      setAwaitingVerification(false);
      return;
    }

    setCheckingVerify(true);
    try {
      await user.reload();
      const refreshed = auth.currentUser;
      if (refreshed && isUserActivated(refreshed)) {
        const meta = pendingVerifyMeta || loadPendingSignupMeta() || {
          fullName: refreshed.displayName || fullName.trim() || 'تاجر',
          businessName: businessName.trim(),
          country: 'مصر',
          contact: normalizeEgyptianPhone(phoneInput) || refreshed.email || pendingVerifyEmail,
        };
        clearPendingSignupMeta();
        setAwaitingVerification(false);
        onAuthComplete(meta);
      } else {
        setErrorMsg('روح أكد جيميلك الأول! افتح الجيميل واضغط على لينك التأكيد وبعدين جرب تاني.');
      }
    } catch {
      setErrorMsg('تعذر التحقق الآن. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.');
    } finally {
      setCheckingVerify(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    if (resendCooldown > 0 || !auth.currentUser) return;
    setErrorMsg('');
    setInfoMsg('');
    setResendingEmail(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setResendCooldown(45);
      setInfoMsg('تم إعادة إرسال رسالة التأكيد إلى جيميلك بنجاح.');
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setResendingEmail(false);
    }
  };

  const handleCancelVerification = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    clearPendingSignupMeta();
    setAwaitingVerification(false);
    setErrorMsg('');
    setInfoMsg('');
  };

  const openForgotPopup = () => {
    setForgotError('');
    setForgotSuccess('');
    setForgotEmailOrPhone(loginIdentifier || emailInput || '');
    setForgotModalOpen(true);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    const raw = toAsciiDigits(forgotEmailOrPhone.trim());
    const cleanEmail = raw.includes('@') ? raw.toLowerCase() : lookupEmailByPhone(raw);
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setForgotError('يرجى إدخال الجيميل المسجل بشكل صحيح لاستلام رابط الاستعادة.');
      return;
    }

    setForgotBusy(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setForgotSuccess(
        'تم إرسال رسالة تغيير كلمة السر على جيميلك بنجاح. افتح جيميلك واضغط على الرابط.'
      );
    } catch (err) {
      setForgotError(mapFirebaseAuthError(err));
    } finally {
      setForgotBusy(false);
    }
  };

  if (awaitingVerification) {
    return (
      <div className="space-y-4 text-center py-2">
        <div className="w-16 h-16 rounded-[20px] bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] mx-auto flex items-center justify-center">
          <MailCheck className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF9C3] text-[#14201A] text-xs font-extrabold">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>روح أكد جيميلك الأول</span>
          </div>
          <h2 className="text-xl font-extrabold">أرسلنا رسالة تأكيد على جيميلك</h2>
          <p className="text-xs sm:text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA] leading-relaxed">
            افتح بريدك{' '}
            <span dir="ltr" className="font-extrabold text-[#15803D] dark:text-[#BBF7D0]">
              {pendingVerifyEmail}
            </span>{' '}
            ودوس على لينك التأكيد، وبعدين اضغط على الزر بالأسفل للدخول (تحقق من Spam لو موصلتش).
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-[16px] bg-[#FEF9C3] border border-[#FACC15] p-3 text-xs font-extrabold text-[#14201A] leading-relaxed">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="rounded-[16px] bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] p-3 text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] leading-relaxed">
            {infoMsg}
          </div>
        )}

        <div className="space-y-2.5">
          <button
            type="button"
            disabled={checkingVerify}
            onClick={() => void handleCheckVerifiedNow()}
            className="sf-btn-primary w-full min-h-[52px] text-sm"
          >
            {checkingVerify ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>أكدت الجيميل — ادخل الآن</span>
          </button>

          <button
            type="button"
            disabled={resendingEmail || resendCooldown > 0}
            onClick={() => void handleResendVerificationEmail()}
            className="sf-btn w-full text-xs disabled:opacity-60"
          >
            {resendingEmail ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>
              {resendCooldown > 0
                ? `إعادة الإرسال بعد ${resendCooldown} ثانية`
                : 'إعادة إرسال رسالة التأكيد'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleCancelVerification()}
            className="text-xs font-extrabold text-[#15803D] dark:text-[#BBF7D0] underline pt-1"
          >
            تغيير الجيميل أو العودة
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3.5">
        <div className={compact ? 'space-y-1' : 'space-y-1'}>
          <h1 className="text-[26px] font-extrabold leading-tight">
            {mode === 'login' ? 'تسجيل الدخول' : 'أنشئ حسابك'}
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
            {mode === 'login'
              ? 'ادخل بالجيميل أو رقم الموبايل وكلمة السر، أو بحساب جوجل'
              : 'سجّل اسمك واسم المطعم ورقم الموبايل والجيميل — ستصلك رسالة تأكيد على الجيميل'}
          </p>
        </div>

        <div className="rounded-[18px] p-3 bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-xs font-extrabold">
          7 أيام مجاناً تفتح كل المزايا بدون رسوم وبدون بطاقة بنكية
        </div>

        {errorMsg && (
          <div className="rounded-[16px] bg-[#FEF9C3] border border-[#FACC15] p-3 text-xs font-extrabold text-[#14201A] leading-relaxed">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="rounded-[16px] bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] p-3 text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] leading-relaxed">
            {infoMsg}
          </div>
        )}

        {/* Quick Google Sign-in Option */}
        <button
          type="button"
          disabled={googleLoading || loading}
          onClick={() => void handleGoogleLogin()}
          className="sf-btn w-full min-h-[48px] text-xs sm:text-sm"
        >
          {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleGIcon />}
          <span>الدخول السريع بحساب جوجل (Gmail)</span>
        </button>

        <div className="flex items-center gap-3 text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
          <div className="flex-1 h-px bg-[#CFE3D5] dark:bg-[#2C3D32]" />
          <span>أو</span>
          <div className="flex-1 h-px bg-[#CFE3D5] dark:bg-[#2C3D32]" />
        </div>

        {mode === 'login' ? (
          <form onSubmit={(e) => void handleLoginSubmit(e)} className="space-y-3">
            <div>
              <label className="block text-xs font-extrabold mb-1">
                الجيميل أو رقم الموبايل
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="name@gmail.com أو 01012345678"
                className="sf-inp text-left"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold mb-1">كلمة السر</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="sf-inp pl-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4B5B52] hover:text-[#15803D]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={openForgotPopup}
                  className="text-xs font-extrabold text-[#15803D] dark:text-[#BBF7D0] underline"
                >
                  نسيت كلمة السر؟
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="sf-btn-primary w-full min-h-[54px] text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>دخول</span>
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleSignupSubmit(e)} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold mb-1">الاسم</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: محمد غزال"
                  className="sf-inp"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold mb-1">اسم المطعم</label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="مثال: مشويات غزالو"
                  className="sf-inp"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold mb-1">رقم الموبايل</label>
              <div
                dir="ltr"
                className="flex items-stretch rounded-[16px] border-[1.5px] border-[#CFE3D5] dark:border-[#2C3D32] bg-[#FFFFFF] dark:bg-[#18231C] overflow-hidden focus-within:border-[#15803D]"
              >
                <span className="px-3.5 flex items-center bg-[#DCFCE7] dark:bg-[#173323] border-r border-[#CFE3D5] dark:border-[#2C3D32] text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] select-none tabular-nums">
                  +20
                </span>
                <input
                  type="tel"
                  required
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="01012345678"
                  className="flex-1 min-h-[48px] px-3.5 bg-transparent text-[15px] font-bold tabular-nums text-left focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold mb-1">الجيميل</label>
              <input
                type="email"
                required
                dir="ltr"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="name@gmail.com"
                className="sf-inp text-left"
              />
              <p className="text-[11px] font-bold text-[#15803D] dark:text-[#BBF7D0] mt-1">
                ستصلك رسالة تأكيد على الجيميل لتفعيل حسابك فوراً
              </p>
            </div>

            <div>
              <label className="block text-xs font-extrabold mb-1">كلمة السر</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="sf-inp pl-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4B5B52] hover:text-[#15803D]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold mb-1">تأكيد كلمة السر</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  className="sf-inp pl-11"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4B5B52] hover:text-[#15803D]"
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
              disabled={loading || googleLoading}
              className="sf-btn-primary w-full min-h-[54px] text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>إنشاء الحساب — 7 أيام مجاني</span>
            </button>
          </form>
        )}

        <div className="text-center text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA] pt-1">
          {mode === 'login' ? (
            <>
              ليس لديك حساب؟{' '}
              <button
                type="button"
                onClick={() => onModeChange('signup')}
                className="text-[#15803D] dark:text-[#BBF7D0] font-extrabold underline"
              >
                ابدأ مجاناً
              </button>
            </>
          ) : (
            <>
              لديك حساب بالفعل؟{' '}
              <button
                type="button"
                onClick={() => onModeChange('login')}
                className="text-[#15803D] dark:text-[#BBF7D0] font-extrabold underline"
              >
                تسجيل الدخول
              </button>
            </>
          )}
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {forgotModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#14201A]/60 backdrop-blur-xs"
          onClick={() => setForgotModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sf-card max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-[14px] bg-[#DCFCE7] dark:bg-[#173323] text-[#15803D] dark:text-[#BBF7D0] flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold">نسيت كلمة السر؟</h3>
                  <p className="text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
                    استعادة كلمة السر عبر الجيميل
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                className="w-9 h-9 rounded-[12px] bg-[#F6FBF7] dark:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotError && (
              <div className="rounded-[14px] bg-[#FEF9C3] border border-[#FACC15] p-3 text-xs font-extrabold text-[#14201A]">
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div className="rounded-[14px] bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] p-3 text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] leading-relaxed">
                {forgotSuccess}
              </div>
            )}

            <form onSubmit={(e) => void handleForgotPasswordSubmit(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-extrabold mb-1">
                  الجيميل أو رقم الموبايل المسجل
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={forgotEmailOrPhone}
                  onChange={(e) => setForgotEmailOrPhone(e.target.value)}
                  placeholder="name@gmail.com أو 01012345678"
                  className="sf-inp text-left"
                />
              </div>
              <button
                type="submit"
                disabled={forgotBusy}
                className="sf-btn-primary w-full text-sm"
              >
                {forgotBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>إرسال رابط استعادة كلمة السر</span>
              </button>
            </form>

            <div className="rounded-[16px] bg-[#DCFCE7]/50 dark:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32] p-3 text-center space-y-2">
              <div className="text-xs font-extrabold">أو تواصل مباشرة مع الإدارة</div>
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  `مرحباً، أحتاج مساعدة في حسابي: ${forgotEmailOrPhone || loginIdentifier || ''}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="sf-btn-primary !min-h-[42px] w-full text-xs"
              >
                <MessageCircle className="w-4 h-4" />
                <span>تواصل واتساب ({SUPPORT_CONTACT.PHONE_DISPLAY})</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
