import React, { useEffect, useRef, useState } from 'react';
import {
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from 'firebase/auth';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircle,
  Phone,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
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
  setGhazaloUser,
  type GhazaloUserSession,
} from '../utils/storeRegistry';
import { GhazaloLogo } from '../components/BrandLogo';

interface AuthPageProps {
  initialMode: 'signup' | 'login';
  onBack: () => void;
  onAuthComplete?: (draftMeta: {
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
    userSession?: GhazaloUserSession;
  }) => void;
  onSocialLoginSuccess?: (payload: {
    userSession: GhazaloUserSession;
    token: string;
  }) => void;
}

function normalizeEgyptE164Client(raw: string): string {
  const ascii = toAsciiDigits(raw || '');
  const digits = ascii.replace(/\D/g, '');
  if (digits.startsWith('201') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('01') && digits.length === 11) return `+20${digits.slice(1)}`;
  if (digits.startsWith('1') && digits.length === 10) return `+20${digits}`;
  return '';
}

function GoogleGIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode,
  onBack,
  onStoreLoginSuccess,
  onSocialLoginSuccess,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [showEmailForm, setShowEmailForm] = useState(initialMode === 'signup');

  // Phone OTP State (+20)
  const [phoneAuthOpen, setPhoneAuthOpen] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [otpPhoneInput, setOtpPhoneInput] = useState('');
  const [otpNormalizedE164, setOtpNormalizedE164] = useState('');
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpPreviewHint, setOtpPreviewHint] = useState('');
  const [otpMode, setOtpMode] = useState<'firebase' | 'server'>('server');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // Google Auth Loading
  const [googleLoading, setGoogleLoading] = useState(false);

  // Classic Email/Password State
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
    userSession?: GhazaloUserSession;
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
    if (initialMode === 'signup') setShowEmailForm(true);
    setErrorMsg('');
    setSignupSuccess(null);
  }, [initialMode]);

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // ignore
        }
        recaptchaRef.current = null;
      }
    };
  }, []);

  const finishSocialSession = (session: GhazaloUserSession, token: string) => {
    setGhazaloUser(session);
    setAuthSessionStorage('mshwyat-al-ghazal', token);
    if (onSocialLoginSuccess) {
      onSocialLoginSuccess({ userSession: session, token });
    } else if (onStoreLoginSuccess) {
      onStoreLoginSuccess({
        storeSlug: 'mshwyat-al-ghazal',
        shopId: 'mshwyat-al-ghazal',
        token,
        userSession: session,
      });
    }
  };

  // Option A: Google Sign-In
  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      const session: GhazaloUserSession = {
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'مستخدم جوجل',
        email: user.email || '',
        phone: user.phoneNumber || '',
        photo: user.photoURL || '',
        isGuest: false,
        loginMethod: 'google',
      };
      const token = `fb-google-${user.uid}-${Date.now()}`;
      finishSocialSession(session, token);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMsg('تم إغلاق نافذة تسجيل الدخول بجوجل. اضغط مرة أخرى للمتابعة.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('المتصفح منع نافذة جوجل المنبثقة. اسمح بالنوافذ المنبثقة أو جرب رقم الموبايل أو الضيف.');
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg('هذا النطاق غير مضاف في Firebase Auth لتسجيل جوجل. يمكنك التجربة فوراً برقم الموبايل أو كضيف.');
      } else {
        setErrorMsg('تعذر تسجيل الدخول بجوجل حالياً. يمكنك الدخول برقم الموبايل أو كضيف.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Option B: Phone OTP Step 1 - Send OTP
  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setOtpPreviewHint('');
    const e164 = normalizeEgyptE164Client(otpPhoneInput);
    if (!e164) {
      setErrorMsg('يرجى إدخال رقم موبايل مصري صحيح (مثال: 01012345678).');
      return;
    }

    setPhoneLoading(true);
    try {
      // Attempt Firebase Phone Auth first
      try {
        if (!recaptchaRef.current) {
          recaptchaRef.current = new RecaptchaVerifier(auth, 'ghazalo-recaptcha-container', {
            size: 'invisible',
          });
        }
        const confirmation = await signInWithPhoneNumber(auth, e164, recaptchaRef.current);
        confirmationRef.current = confirmation;
        setOtpMode('firebase');
        setOtpNormalizedE164(e164);
        setPhoneStep('otp');
        return;
      } catch {
        if (recaptchaRef.current) {
          try {
            recaptchaRef.current.clear();
          } catch {
            // ignore
          }
          recaptchaRef.current = null;
        }
      }

      // Clean backend OTP verification fallback (for preview / non-SMS hosts)
      const res = await fetch('/api/phone-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: e164 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        phone?: string;
        previewCode?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'تعذر إرسال كود التحقق، تأكد من رقم الموبايل.');
        return;
      }
      setOtpMode('server');
      setOtpNormalizedE164(data.phone || e164);
      setOtpPreviewHint(data.previewCode || '');
      setPhoneStep('otp');
    } catch {
      setErrorMsg('حدث خطأ أثناء إرسال كود التحقق، حاول مرة أخرى.');
    } finally {
      setPhoneLoading(false);
    }
  };

  // Option B: Phone OTP Step 2 - Verify OTP
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanOtp = toAsciiDigits(otpCodeInput).replace(/\D/g, '').slice(0, 6);
    if (cleanOtp.length !== 6) {
      setErrorMsg('يرجى إدخال كود التحقق المكون من 6 أرقام.');
      return;
    }

    setPhoneLoading(true);
    try {
      if (otpMode === 'firebase' && confirmationRef.current) {
        const result = await confirmationRef.current.confirm(cleanOtp);
        const fbUser = result.user;
        const phoneDisplay = fbUser.phoneNumber || otpNormalizedE164;
        const session: GhazaloUserSession = {
          uid: fbUser.uid,
          name: fbUser.displayName || phoneDisplay.replace(/^\+20/, '0'),
          email: '',
          phone: phoneDisplay,
          photo: '',
          isGuest: false,
          loginMethod: 'phone',
        };
        finishSocialSession(session, `fb-phone-${fbUser.uid}-${Date.now()}`);
        return;
      }

      const res = await fetch('/api/phone-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: otpNormalizedE164, code: cleanOtp }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        phone?: string;
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.token) {
        setErrorMsg(data.error || 'كود التحقق غير صحيح.');
        return;
      }
      const verifiedPhone = data.phone || otpNormalizedE164;
      const localDisplay = verifiedPhone.replace(/^\+20/, '0');
      const session: GhazaloUserSession = {
        uid: `phone-${verifiedPhone.replace(/\D/g, '')}`,
        name: localDisplay,
        email: '',
        phone: verifiedPhone,
        photo: '',
        isGuest: false,
        loginMethod: 'phone',
      };
      finishSocialSession(session, data.token);
    } catch {
      setErrorMsg('كود التحقق غير صحيح أو منتهي الصلاحية.');
    } finally {
      setPhoneLoading(false);
    }
  };

  // Option C: Guest Testing Mode
  const handleGuestLogin = () => {
    const guestSession: GhazaloUserSession = {
      uid: 'guest',
      name: 'ضيف غزالو',
      email: '',
      phone: '',
      photo: '',
      isGuest: true,
      loginMethod: 'guest',
    };
    finishSocialSession(guestSession, `ghz-guest-${Date.now()}`);
  };

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
        const session: GhazaloUserSession = {
          uid: userMatch.id,
          name: userMatch.restaurantName || 'تاجر غزالو',
          email: userMatch.email || '',
          phone: userMatch.phone || '',
          photo: '',
          isGuest: false,
          loginMethod: 'email',
        };
        setGhazaloUser(session);
        setAuthSessionStorage(userMatch.storeSlug, token);
        onStoreLoginSuccess?.({
          storeSlug: userMatch.storeSlug,
          shopId: userMatch.shopId,
          token,
          record: restMatch,
          userSession: session,
        });
        return;
      }

      if (restMatch && restMatch.password === cleanPass) {
        const token = `ghz-token-${restMatch.storeSlug}-${Date.now()}`;
        const session: GhazaloUserSession = {
          uid: restMatch.shop?.ownerId || restMatch.id,
          name: restMatch.nameAr || 'تاجر غزالو',
          email: restMatch.email || '',
          phone: restMatch.phone || '',
          photo: '',
          isGuest: false,
          loginMethod: 'email',
        };
        setGhazaloUser(session);
        setAuthSessionStorage(restMatch.storeSlug, token);
        onStoreLoginSuccess?.({
          storeSlug: restMatch.storeSlug,
          shopId: restMatch.shopId,
          token,
          record: restMatch,
          userSession: session,
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
            nameAr?: string;
          };
          if (srvRes.ok && srvData.ok && srvData.token) {
            const finalSlug = srvData.storeSlug || slugToCheck;
            const session: GhazaloUserSession = {
              uid: finalSlug,
              name: srvData.nameAr || restMatch?.nameAr || 'تاجر غزالو',
              email: idf.includes('@') ? idf : '',
              phone: !idf.includes('@') ? idf : '',
              photo: '',
              isGuest: false,
              loginMethod: 'email',
            };
            setGhazaloUser(session);
            setAuthSessionStorage(finalSlug, srvData.token);
            onStoreLoginSuccess?.({
              storeSlug: finalSlug,
              shopId: srvData.shopId || finalSlug,
              token: srvData.token,
              record: restMatch,
              userSession: session,
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
        const slug = restMatch?.storeSlug || userMatch?.storeSlug || 'mshwyat-al-ghazal';
        const session: GhazaloUserSession = {
          uid: cred.user.uid,
          name: cred.user.displayName || restMatch?.nameAr || 'تاجر غزالو',
          email: cred.user.email || '',
          phone: cred.user.phoneNumber || '',
          photo: cred.user.photoURL || '',
          isGuest: false,
          loginMethod: 'email',
        };
        setGhazaloUser(session);
        setAuthSessionStorage(slug, token);
        onStoreLoginSuccess?.({
          storeSlug: slug,
          shopId: restMatch?.shopId || slug,
          token,
          record: restMatch,
          userSession: session,
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

      const session: GhazaloUserSession = {
        uid: res.user.id,
        name: res.user.restaurantName,
        email: res.user.email,
        phone: res.user.phone,
        photo: '',
        isGuest: false,
        loginMethod: 'email',
      };
      setGhazaloUser(session);

      setSignupSuccess({
        storeSlug: res.user.storeSlug,
        shopId: res.user.shopId,
        token: res.token,
        record: res.record,
        userSession: session,
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
          setShowEmailForm(true);
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
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-orange-50/40 via-white to-orange-50/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex justify-center">
            <GhazaloLogo stacked />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-orange-100/90 dark:border-slate-800 shadow-[0_18px_50px_rgba(255,106,0,0.09)] space-y-5">
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
                      userSession: signupSuccess.userSession,
                    })
                  }
                  className="w-full py-4 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)]"
                >
                  ادخل لوحة التحكم
                </button>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/50 text-[#FF6A00] text-xs font-extrabold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>منيو مطعمك الاحترافي في دقيقة</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                    تسجيل الدخول
                  </h1>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    اختر طريقة الدخول لمتابعة لوحة تحكم مطعمك
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-extrabold text-amber-800 dark:text-amber-200 leading-relaxed">
                    {errorMsg}
                  </div>
                )}

                {/* 2 Primary Options + Guest Option */}
                <div className="space-y-3">
                  {/* Option A: Google Sign In */}
                  <button
                    type="button"
                    disabled={googleLoading || phoneLoading}
                    onClick={() => void handleGoogleSignIn()}
                    className="w-full py-4 px-5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-orange-50/60 dark:hover:bg-slate-700 border-2 border-slate-200 dark:border-slate-700 hover:border-[#FF6A00] text-slate-900 dark:text-white font-extrabold text-base shadow-xs transition-all flex items-center justify-center gap-3"
                  >
                    {googleLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#FF6A00]" />
                    ) : (
                      <GoogleGIcon />
                    )}
                    <span>دخول بجوجل - Gmail</span>
                  </button>

                  {/* Option B: Phone OTP */}
                  <button
                    type="button"
                    disabled={googleLoading || phoneLoading}
                    onClick={() => {
                      setErrorMsg('');
                      setPhoneAuthOpen((prev) => !prev);
                    }}
                    className={`w-full py-4 px-5 rounded-2xl font-extrabold text-base transition-all flex items-center justify-center gap-3 ${
                      phoneAuthOpen
                        ? 'bg-orange-600 text-white shadow-[0_10px_28px_rgba(255,106,0,0.3)]'
                        : 'bg-[#FF6A00] hover:bg-[#e55f00] text-white shadow-[0_10px_28px_rgba(255,106,0,0.25)]'
                    }`}
                  >
                    <Phone className="w-5 h-5" />
                    <span>دخول برقم الموبايل</span>
                  </button>

                  {/* Phone OTP Stepper Card */}
                  {phoneAuthOpen && (
                    <div className="rounded-2xl bg-orange-50/70 dark:bg-slate-800/90 border border-orange-200 dark:border-slate-700 p-4 space-y-3">
                      {phoneStep === 'input' ? (
                        <form onSubmit={(e) => void handleSendPhoneOtp(e)} className="space-y-3">
                          <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-200">
                            أدخل رقم الموبايل المصري (+20)
                          </label>
                          <div
                            dir="ltr"
                            className="flex items-stretch rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden focus-within:ring-2 focus-within:ring-[#FF6A00]"
                          >
                            <span className="px-3.5 flex items-center bg-orange-100/80 dark:bg-slate-800 border-r border-orange-200 dark:border-slate-700 text-xs font-extrabold text-[#FF6A00] select-none tabular-nums">
                              +20
                            </span>
                            <input
                              type="tel"
                              required
                              autoFocus
                              value={otpPhoneInput}
                              onChange={(e) => setOtpPhoneInput(e.target.value)}
                              placeholder="1012345678"
                              className="flex-1 px-3.5 py-3 bg-transparent text-sm font-bold tabular-nums text-left focus:outline-none"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={phoneLoading}
                            className="w-full py-3 rounded-full bg-slate-900 dark:bg-[#FF6A00] hover:opacity-95 text-white text-sm font-extrabold flex items-center justify-center gap-2"
                          >
                            {phoneLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            <span>إرسال كود التحقق OTP</span>
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={(e) => void handleVerifyPhoneOtp(e)} className="space-y-3">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                            <span>
                              أدخل الكود المرسل إلى{' '}
                              <span dir="ltr" className="text-[#FF6A00] font-extrabold">
                                {otpNormalizedE164}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPhoneStep('input');
                                setOtpCodeInput('');
                                setOtpPreviewHint('');
                              }}
                              className="text-[#FF6A00] hover:underline font-extrabold"
                            >
                              تغيير الرقم
                            </button>
                          </div>

                          {otpPreviewHint && (
                            <div className="rounded-xl bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-700 px-3 py-2 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                              <span>كود التحقق التجريبي:</span>
                              <button
                                type="button"
                                dir="ltr"
                                onClick={() => setOtpCodeInput(otpPreviewHint)}
                                className="px-2.5 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950 text-[#FF6A00] tracking-widest tabular-nums"
                              >
                                {otpPreviewHint}
                              </button>
                            </div>
                          )}

                          <input
                            type="text"
                            required
                            autoFocus
                            maxLength={6}
                            inputMode="numeric"
                            dir="ltr"
                            value={otpCodeInput}
                            onChange={(e) =>
                              setOtpCodeInput(toAsciiDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
                            }
                            placeholder="123456"
                            className="w-full px-4 py-3 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center text-xl font-extrabold tracking-[0.35em] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                          />
                          <button
                            type="submit"
                            disabled={phoneLoading}
                            className="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold flex items-center justify-center gap-2"
                          >
                            {phoneLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            <span>تأكيد والدخول للوحة التحكم</span>
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Guest Testing Option */}
                  <button
                    type="button"
                    onClick={handleGuestLogin}
                    className="w-full py-3.5 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-extrabold text-sm transition-colors flex items-center justify-center gap-2 border border-slate-200/80 dark:border-slate-700"
                  >
                    <UserCheck className="w-4 h-4 text-[#FF6A00]" />
                    <span>دخول كضيف - جرب من غير تسجيل</span>
                  </button>
                </div>

                {/* Invisible Firebase reCAPTCHA Mount */}
                <div id="ghazalo-recaptcha-container" />

                {/* Collapsible Email/Password & Signup Legacy Section */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowEmailForm((prev) => !prev)}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-extrabold text-slate-500 hover:text-[#FF6A00] py-1"
                  >
                    <span>
                      {mode === 'signup'
                        ? 'التسجيل بالبريد الإلكتروني وكلمة السر'
                        : 'أو الدخول بالبريد الإلكتروني وكلمة السر'}
                    </span>
                    {showEmailForm ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showEmailForm && (
                    <div className="space-y-4 pt-1">
                      {mode === 'login' ? (
                        <form onSubmit={(e) => void handleLogin(e)} className="space-y-3.5">
                          <div>
                            <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                              البريد الالكتروني او رقم الموبايل
                            </label>
                            <input
                              type="text"
                              required
                              dir="ltr"
                              value={identifier}
                              onChange={(e) => setIdentifier(e.target.value)}
                              placeholder="01015861991 or name@example.com"
                              className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-left focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                              كلمة السر
                            </label>
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••"
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
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
                            <div className="pt-1.5 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={openForgotPopup}
                                className="text-xs font-extrabold text-[#FF6A00] hover:underline"
                              >
                                نسيت كلمة السر؟
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setErrorMsg('');
                                  setMode('signup');
                                }}
                                className="text-xs font-extrabold text-slate-600 dark:text-slate-300 hover:text-[#FF6A00]"
                              >
                                إنشاء متجر جديد
                              </button>
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 rounded-full bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-extrabold text-sm flex items-center justify-center gap-2"
                          >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            <span>دخول بكلمة السر</span>
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={(e) => void handleSignup(e)} className="space-y-3">
                          <div>
                            <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                              اسم المطعم
                            </label>
                            <input
                              type="text"
                              required
                              value={restaurantName}
                              onChange={(e) => setRestaurantName(e.target.value)}
                              placeholder="مثال: مشويات الغزال"
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

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="كلمة السر"
                                className="w-full px-3.5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            <div className="relative">
                              <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="تأكيد كلمة السر"
                                className="w-full px-3.5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
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
                            className="w-full py-3.5 rounded-full bg-[#FF6A00] hover:bg-[#e55f00] text-white font-extrabold text-sm flex items-center justify-center gap-2"
                          >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            <span>إنشاء متجري مجاناً</span>
                          </button>

                          <div className="text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setErrorMsg('');
                                setMode('login');
                              }}
                              className="text-xs font-extrabold text-[#FF6A00] hover:underline"
                            >
                              لديك حساب بالفعل؟ دخول
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#FF6A00]"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    استعراض الموقع الرئيسي
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
                  `مرحباً دعم غزالو، أحتاج كود استعادة لحسابي: ${forgotIdentifier || identifier || ''}`
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
