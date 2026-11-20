import React, { useEffect, useRef, useState } from 'react';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type ConfirmationResult,
} from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, Phone, ShieldCheck } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { saveUserProfile } from '../services/firestoreService';
import { GhazaloLogo } from '../components/BrandLogo';

interface AuthPageProps {
  initialMode: 'signup' | 'login';
  onBack: () => void;
  onAuthComplete: (draftMeta: {
    fullName: string;
    businessName: string;
    country: string;
    contact: string;
  }) => void;
}

const COUNTRIES = ['مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'دولة أخرى'];

function formatEgyptianPhone(raw: string): string {
  let cleaned = raw.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+20')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('0020')) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('20') && cleaned.length >= 12) {
    cleaned = cleaned.slice(2);
  }
  cleaned = cleaned.replace(/^0+/, '');
  return `+20${cleaned}`;
}

function phoneToCredentialEmail(formattedPhone: string): string {
  return `${formattedPhone.replace(/[^0-9]/g, '')}@ghazalo.app`;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode,
  onBack,
  onAuthComplete,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [country, setCountry] = useState('مصر');
  const [phoneInput, setPhoneInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [formattedPhoneSent, setFormattedPhoneSent] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const clearRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // ignore clear error
      }
      recaptchaVerifierRef.current = null;
    }
    if (recaptchaContainerRef.current) {
      recaptchaContainerRef.current.innerHTML = '';
    }
  };

  useEffect(() => {
    return () => {
      clearRecaptcha();
    };
  }, []);

  const handleGoogleAuth = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      const derivedName = fullName.trim() || user.displayName || 'تاجر Ghazalo';
      await saveUserProfile({
        uid: user.uid,
        fullName: derivedName,
        email: user.email || '',
        phone: phoneInput.trim() ? formatEgyptianPhone(phoneInput) : '',
        country,
      });
      onAuthComplete({
        fullName: derivedName,
        businessName: businessName.trim(),
        country,
        contact: user.email || phoneInput.trim(),
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (mode === 'signup') {
      if (!fullName.trim()) {
        setErrorMsg('يرجى إدخال الاسم.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('كلمة السر يجب أن تكون 6 حروف على الأقل.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('كلمة السر مش متطابقة');
        return;
      }
    }

    const formattedPhone = formatEgyptianPhone(phoneInput);
    if (!/^\+201[0125]\d{8}$/.test(formattedPhone)) {
      setErrorMsg('يرجى إدخال رقم موبايل مصري صحيح (مثال: 1012345678 بعد +20).');
      return;
    }

    setLoading(true);
    try {
      const phoneAuth = getAuth();
      phoneAuth.languageCode = 'ar';
      clearRecaptcha();

      const containerEl = recaptchaContainerRef.current;
      if (!containerEl) {
        throw new Error('تعذر تهيئة عنصر reCAPTCHA في الصفحة.');
      }

      const verifier = new RecaptchaVerifier(phoneAuth, containerEl, {
        size: 'invisible',
      });
      recaptchaVerifierRef.current = verifier;

      const result = await signInWithPhoneNumber(phoneAuth, formattedPhone, verifier);
      setConfirmationResult(result);
      setFormattedPhoneSent(formattedPhone);
      setOtpCode('');
    } catch (err: unknown) {
      clearRecaptcha();
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setErrorMsg('');

    const code = otpCode.trim();
    if (!code) {
      setErrorMsg('يرجى كتابة كود التفعيل.');
      return;
    }

    setLoading(true);
    try {
      const cred = await confirmationResult.confirm(code);
      const user = cred.user;
      const derivedName = fullName.trim() || user.displayName || 'تاجر Ghazalo';

      if (mode === 'signup' && fullName.trim()) {
        try {
          await updateProfile(user, { displayName: derivedName });
        } catch {
          // continue even if displayName update fails
        }
      }

      if (mode === 'signup' && password.length >= 6) {
        const credEmail = phoneToCredentialEmail(formattedPhoneSent);
        try {
          const emailCred = EmailAuthProvider.credential(credEmail, password);
          await linkWithCredential(user, emailCred);
        } catch (linkErr: unknown) {
          const linkCode = (linkErr as { code?: string })?.code || '';
          if (
            linkCode === 'auth/provider-already-linked' ||
            linkCode === 'auth/credential-already-in-use'
          ) {
            try {
              await updatePassword(user, password);
            } catch {
              // phone session already authenticated
            }
          }
        }
      }

      await saveUserProfile({
        uid: user.uid,
        fullName: derivedName,
        email: user.email || '',
        phone: formattedPhoneSent,
        country,
      });

      onAuthComplete({
        fullName: derivedName,
        businessName: businessName.trim(),
        country,
        contact: formattedPhoneSent,
      });
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code || '';
      if (errCode === 'auth/invalid-verification-code' || errCode === 'auth/code-expired') {
        setErrorMsg('الكود غلط، حاول تاني');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'الكود غلط، حاول تاني');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const raw = phoneInput.trim();
    if (!raw || !password) {
      setErrorMsg('يرجى إدخال رقم الموبايل وكلمة السر.');
      return;
    }

    const formattedPhone = raw.includes('@') ? raw : formatEgyptianPhone(raw);
    const loginIdentifier = raw.includes('@') ? raw : phoneToCredentialEmail(formattedPhone);

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, loginIdentifier, password);
      onAuthComplete({
        fullName: cred.user.displayName || 'تاجر Ghazalo',
        businessName: businessName.trim(),
        country,
        contact: cred.user.phoneNumber || formattedPhone,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      <header className="px-4 sm:px-8 h-16 flex items-center justify-between border-b border-emerald-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-700"
        >
          <ArrowRight className="w-4 h-4" />
          العودة للرئيسية
        </button>
        <GhazaloLogo />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-5">
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {mode === 'signup' ? 'أنشئ حسابك' : 'تسجيل الدخول'}
            </h1>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              صفحة واحدة، تم إعدادها لجهز منيوك من صورته أو ملفه
            </p>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 rounded-2xl p-3.5 text-center">
            <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
              7 أيام تفتح كل المزايا، بدون رسوم وبدون بطاقة
            </p>
          </div>

          {/* Gmail / Google Sign-in Button */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-2 border-emerald-200 dark:border-slate-700 font-extrabold text-sm flex items-center justify-center gap-3 shadow-xs transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>
                {mode === 'signup'
                  ? 'التسجيل بحساب Gmail / Google'
                  : 'تسجيل الدخول بحساب Gmail / Google'}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
            <span>أو برقم الموبايل</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
          </div>

          {errorMsg && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-bold text-amber-800 dark:text-amber-200 leading-relaxed">
              {errorMsg}
            </div>
          )}

          {/* OTP Verification Code Input Form (Shown after SMS is sent) */}
          {confirmationResult ? (
            <form onSubmit={handleConfirmOtp} className="space-y-4">
              <div className="rounded-2xl bg-emerald-50/70 dark:bg-slate-800 p-4 text-center space-y-1 border border-emerald-100 dark:border-slate-700">
                <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  تم إرسال كود التفعيل من 6 أرقام إلى
                </p>
                <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums" dir="ltr">
                  {formattedPhoneSent}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اكتب الكود
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  dir="ltr"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-4 py-3.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-xl font-extrabold tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                <span>تأكيد</span>
              </button>

              <div className="flex items-center justify-between text-xs font-bold">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSendOtp()}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  إعادة إرسال الكود
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setConfirmationResult(null);
                    setOtpCode('');
                    setErrorMsg('');
                  }}
                  className="text-slate-500 hover:underline"
                >
                  تعديل الرقم
                </button>
              </div>
            </form>
          ) : mode === 'signup' ? (
            /* Signup Form: Name, Business Name, Country, +20 Phone, Password, Confirm Password -> Send OTP */
            <form onSubmit={handleSendOtp} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الاسم
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: أحمد محمد"
                  className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اسم النشاط (اختياري)
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="مثال: مطعم البرنس"
                  className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  دولة المشروع
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رقم الموبايل (+20)
                </label>
                <div className="flex items-center rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500" dir="ltr">
                  <span className="px-3.5 py-3 bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-200 text-sm font-extrabold border-r border-emerald-200 dark:border-slate-600 select-none">
                    +20
                  </span>
                  <input
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="1012345678"
                    className="flex-1 px-4 py-3 bg-transparent text-sm font-semibold focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  كلمة السر (6 حروف على الأقل)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'إخفاء تأكيد كلمة السر' : 'إظهار تأكيد كلمة السر'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Phone className="w-5 h-5" />
                )}
                <span>ابعتلي كود التفعيل</span>
              </button>
            </form>
          ) : (
            /* Login Form: Phone (+20) + Password, plus option to sign in via SMS OTP */
            <form onSubmit={handlePasswordLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رقم الموبايل (+20)
                </label>
                <div className="flex items-center rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500" dir="ltr">
                  <span className="px-3.5 py-3 bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-200 text-sm font-extrabold border-r border-emerald-200 dark:border-slate-600 select-none">
                    +20
                  </span>
                  <input
                    type="text"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="1012345678"
                    className="flex-1 px-4 py-3 bg-transparent text-sm font-semibold focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  كلمة السر
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <KeyRound className="w-5 h-5" />
                )}
                <span>تسجيل الدخول</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSendOtp()}
                className="w-full py-3 rounded-2xl bg-emerald-50 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-slate-700 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-slate-700 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span>ابعتلي كود التفعيل (دخول بـ SMS OTP)</span>
              </button>
            </form>
          )}

          {/* Real Firebase reCAPTCHA mount container */}
          <div id="recaptcha-container" ref={recaptchaContainerRef} className="flex justify-center" />

          <div className="text-center text-sm font-bold text-slate-600 dark:text-slate-300 pt-1">
            {mode === 'signup' ? (
              <>
                لديك حساب بالفعل؟{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setConfirmationResult(null);
                    setMode('login');
                  }}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  تسجيل الدخول
                </button>
              </>
            ) : (
              <>
                ليس لديك حساب؟{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setConfirmationResult(null);
                    setMode('signup');
                  }}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  أنشئ حسابك مجاناً
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
