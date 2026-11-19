import React, { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Phone, ShieldCheck } from 'lucide-react';
import { auth, firebase, googleProvider } from '../firebase';
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

function normalizeEgyptianPhone(raw: string): string {
  const digits = raw.replace(/[^0-9+]/g, '').trim();
  if (!digits) return '';
  if (digits.startsWith('+20')) {
    const rest = digits.slice(3).replace(/^0+/, '');
    return `+20${rest}`;
  }
  if (digits.startsWith('20') && digits.length >= 12) {
    const rest = digits.slice(2).replace(/^0+/, '');
    return `+20${rest}`;
  }
  if (digits.startsWith('0')) {
    return `+20${digits.slice(1)}`;
  }
  return `+20${digits}`;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode,
  onBack,
  onAuthComplete,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [country, setCountry] = useState('مصر');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Firebase Phone Auth (OTP) state
  const [phoneInput, setPhoneInput] = useState('+20');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<firebase.auth.RecaptchaVerifier | null>(null);
  const confirmationResultRef = useRef<firebase.auth.ConfirmationResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    return () => {
      try {
        recaptchaVerifierRef.current?.clear();
      } catch {
        // ignore cleanup error
      }
      recaptchaVerifierRef.current = null;
    };
  }, []);

  const resetRecaptcha = () => {
    try {
      recaptchaVerifierRef.current?.clear();
    } catch {
      // ignore cleanup error
    }
    recaptchaVerifierRef.current = null;
    if (recaptchaContainerRef.current) {
      recaptchaContainerRef.current.innerHTML = '';
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (mode === 'signup' && (!fullName.trim() || !businessName.trim())) {
      setErrorMsg('يرجى إدخال الاسم الكامل واسم النشاط أولاً.');
      return;
    }

    const formattedPhone = normalizeEgyptianPhone(phoneInput);
    if (!/^\+201[0125][0-9]{8}$/.test(formattedPhone)) {
      setErrorMsg('يرجى إدخال رقم موبايل مصري صحيح بصيغة +20 (مثال: +201012345678).');
      return;
    }

    setLoading(true);
    try {
      resetRecaptcha();
      const container = recaptchaContainerRef.current;
      if (!container) {
        throw new Error('تعذر تهيئة reCAPTCHA. أعد المحاولة.');
      }

      const appVerifier = new firebase.auth.RecaptchaVerifier(container, {
        size: 'invisible',
      });
      recaptchaVerifierRef.current = appVerifier;

      const confirmationResult = await firebase
        .auth()
        .signInWithPhoneNumber(formattedPhone, appVerifier);

      confirmationResultRef.current = confirmationResult;
      setPhoneInput(formattedPhone);
      setOtpCode('');
      setOtpSent(true);
    } catch (err: unknown) {
      resetRecaptcha();
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/invalid-phone-number') {
        setErrorMsg('رقم الموبايل غير صحيح، تأكد من إدخاله بصيغة +20.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('تم إرسال محاولات كثيرة، يرجى الانتظار قليلاً والمحاولة مرة أخرى.');
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg('تفعيل رقم الهاتف غير مفعّل في Firebase Authentication Console بعد.');
      } else if (code === 'auth/captcha-check-failed') {
        setErrorMsg('تعذر التحقق من reCAPTCHA. تأكد من إضافة النطاق في Authorized domains.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'تعذر إرسال كود التفعيل، حاول مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const codeClean = otpCode.trim();
    if (!confirmationResultRef.current || !/^[0-9]{6}$/.test(codeClean)) {
      setErrorMsg('الكود غلط، حاول تاني');
      return;
    }

    setLoading(true);
    try {
      const cred = await confirmationResultRef.current.confirm(codeClean);
      const user = cred.user;
      if (!user) {
        setErrorMsg('الكود غلط، حاول تاني');
        return;
      }

      const derivedName = fullName.trim() || user.displayName || 'تاجر Ghazalo';
      if (fullName.trim() && user.displayName !== fullName.trim()) {
        try {
          await user.updateProfile({ displayName: fullName.trim() });
        } catch {
          // non-fatal
        }
      }

      const verifiedPhone = user.phoneNumber || normalizeEgyptianPhone(phoneInput);
      await saveUserProfile({
        uid: user.uid,
        fullName: derivedName,
        email: user.email || '',
        phone: verifiedPhone,
        country,
      });

      onAuthComplete({
        fullName: derivedName,
        businessName: businessName.trim(),
        country,
        contact: verifiedPhone,
      });
    } catch {
      setErrorMsg('الكود غلط، حاول تاني');
    } finally {
      setLoading(false);
    }
  };

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
        phone: contact.trim() || normalizeEgyptianPhone(phoneInput),
        country,
      });
      onAuthComplete({
        fullName: derivedName,
        businessName: businessName.trim(),
        country,
        contact: user.email || contact.trim(),
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Gmail / Google';
      if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
        setErrorMsg('تم إغلاق نافذة تسجيل الدخول عبر Gmail. يرجى المحاولة مرة أخرى.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('المتصفح منع فتح نافذة Gmail المنبثقة. يرجى السماح بالنوافذ المنبثقة والمحاولة مجدداً.');
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg('هذا النطاق غير مضاف في Authorized domains داخل إعدادات Firebase Authentication.');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const rawContact = contact.trim();
    if (!rawContact || !password) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }

    const emailValue = rawContact.includes('@')
      ? rawContact
      : `${rawContact.replace(/[^0-9a-zA-Z]/g, '')}@ghazalo.app`;

    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!fullName.trim() || !businessName.trim()) {
          setErrorMsg('يرجى إدخال الاسم الكامل واسم النشاط.');
          setLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, emailValue, password);
        await updateProfile(cred.user, { displayName: fullName.trim() });
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user);
          setVerificationSent(true);
          setLoading(false);
          return;
        }
        await saveUserProfile({
          uid: cred.user.uid,
          fullName: fullName.trim(),
          email: emailValue,
          phone: rawContact,
          country,
        });
        onAuthComplete({
          fullName: fullName.trim(),
          businessName: businessName.trim(),
          country,
          contact: rawContact,
        });
      } else {
        const cred = await signInWithEmailAndPassword(auth, emailValue, password);
        if (!cred.user.emailVerified) {
          setVerificationSent(true);
          setLoading(false);
          return;
        }
        onAuthComplete({
          fullName: cred.user.displayName || 'تاجر',
          businessName: businessName.trim(),
          country,
          contact: emailValue,
        });
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في إعدادات Firebase Console بعد. يمكنك المتابعة فوراً برقم الموبايل OTP أو عبر زر "Google" بالأعلى.'
        );
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg('هذا البريد مسجل بالفعل. قم بتسجيل الدخول.');
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErrorMsg('بيانات الدخول غير صحيحة.');
      } else if (code === 'auth/weak-password') {
        setErrorMsg('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ أثناء العملية');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecheckVerification = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await saveUserProfile({
          uid: auth.currentUser.uid,
          fullName: fullName.trim() || auth.currentUser.displayName || 'تاجر',
          email: auth.currentUser.email || '',
          phone: contact.trim(),
          country,
        });
        onAuthComplete({
          fullName: fullName.trim() || auth.currentUser.displayName || 'تاجر',
          businessName: businessName.trim(),
          country,
          contact: auth.currentUser.email || contact.trim(),
        });
      } else {
        setErrorMsg('لم يتم تأكيد البريد الإلكتروني بعد. يرجى الضغط على الرابط المرسل لبريدك.');
      }
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

          {/* Light green trial card */}
          <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 rounded-2xl p-3.5 text-center">
            <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
              7 أيام تفتح كل المزايا، بدون رسوم وبدون بطاقة
            </p>
          </div>

          {verificationSent ? (
            <div className="bg-emerald-50/70 dark:bg-slate-800 rounded-2xl p-5 text-center space-y-3 border border-emerald-200 dark:border-slate-700">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h3 className="font-extrabold text-base">تم إرسال رابط التفعيل لبريدك الإلكتروني</h3>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                افتح بريدك واضغط على رابط التفعيل ثم اضغط الزر بالأسفل للمتابعة.
              </p>
              <button
                type="button"
                onClick={handleRecheckVerification}
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm"
              >
                {loading ? 'جاري التحقق...' : 'تم التفعيل، متابعة'}
              </button>
            </div>
          ) : (
            <>
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
                <p className="text-[11px] font-bold text-center text-emerald-700 dark:text-emerald-400">
                  التسجيل والدخول مفعّل بضغطة واحدة عبر حسابك في Gmail
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span>أو</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>

              {/* Method Switcher: Egyptian Mobile OTP vs Email */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-emerald-50/80 dark:bg-slate-800 border border-emerald-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('phone');
                    setErrorMsg('');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5 ${
                    authMethod === 'phone'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>برقم الموبايل (OTP)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('email');
                    setErrorMsg('');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-colors ${
                    authMethod === 'email'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700'
                  }`}
                >
                  بالبريد وكلمة المرور
                </button>
              </div>

              {errorMsg && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-bold text-amber-800 dark:text-amber-200 leading-relaxed">
                  {errorMsg}
                </div>
              )}

              {authMethod === 'phone' ? (
                <div className="space-y-3.5">
                  {mode === 'signup' && !otpSent && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          الاسم الكامل
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
                          اسم النشاط
                        </label>
                        <input
                          type="text"
                          required
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
                    </>
                  )}

                  {!otpSent ? (
                    <form onSubmit={handleSendOtp} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          رقم الموبايل المصري (+20)
                        </label>
                        <input
                          type="tel"
                          required
                          dir="ltr"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="+201012345678"
                          className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-extrabold tracking-wide text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                        />
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
                          أدخل رقمك بصيغة +20 مثل: +201012345678
                        </p>
                      </div>

                      <div ref={recaptchaContainerRef} id="recaptcha-container" />

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-xs transition-colors flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Phone className="w-4 h-4" />
                        )}
                        <span>ابعتلي كود التفعيل</span>
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleConfirmOtp} className="space-y-3.5">
                      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>
                          تم إرسال رسالة SMS تحتوي على كود التفعيل إلى{' '}
                          <span dir="ltr" className="font-extrabold">
                            {phoneInput}
                          </span>
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          اكتب الكود
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          required
                          maxLength={6}
                          dir="ltr"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="••••••"
                          className="w-full px-4 py-3.5 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-xl font-extrabold tracking-[0.4em] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setOtpSent(false);
                          setOtpCode('');
                          setErrorMsg('');
                          resetRecaptcha();
                        }}
                        className="w-full py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        تغيير الرقم أو إعادة إرسال الكود
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  {mode === 'signup' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          الاسم الكامل
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
                          اسم النشاط
                        </label>
                        <input
                          type="text"
                          required
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
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      البريد الإلكتروني
                    </label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="name@restaurant.com"
                      className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      كلمة المرور
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
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
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    <span>{mode === 'signup' ? 'إنشاء الحساب' : 'تسجيل الدخول'}</span>
                  </button>
                </form>
              )}
            </>
          )}

          <div className="text-center text-sm font-bold text-slate-600 dark:text-slate-300 pt-1">
            {mode === 'signup' ? (
              <>
                لديك حساب بالفعل؟{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setOtpSent(false);
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
                    setOtpSent(false);
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
