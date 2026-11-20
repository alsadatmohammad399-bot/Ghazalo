import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { saveUserProfile } from '../services/firestoreService';
import {
  isPhoneAuthEmail,
  isUserActivated,
  isValidPhoneDigits,
  phoneToAuthEmail,
  toAsciiDigits,
} from '../utils/authHelpers';
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

interface PendingVerificationMeta {
  uid: string;
  fullName: string;
  businessName: string;
  country: string;
  email: string;
  phone: string;
}

const COUNTRIES = ['مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'دولة أخرى'];
const PENDING_META_PREFIX = 'ghazalo_pending_profile_';

function savePendingMeta(meta: PendingVerificationMeta): void {
  try {
    localStorage.setItem(`${PENDING_META_PREFIX}${meta.uid}`, JSON.stringify(meta));
  } catch {
    // ignore storage restriction
  }
}

function loadPendingMeta(uid: string): PendingVerificationMeta | null {
  try {
    const raw = localStorage.getItem(`${PENDING_META_PREFIX}${uid}`);
    return raw ? (JSON.parse(raw) as PendingVerificationMeta) : null;
  } catch {
    return null;
  }
}

function clearPendingMeta(uid: string): void {
  try {
    localStorage.removeItem(`${PENDING_META_PREFIX}${uid}`);
  } catch {
    // ignore storage restriction
  }
}

function formatAuthError(err: unknown, method: 'phone' | 'gmail' = 'gmail'): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return method === 'phone'
        ? 'رقم الموبايل ده مسجل بالفعل، جرّب تسجيل الدخول.'
        : 'الجيميل ده مسجل بالفعل، جرّب تسجيل الدخول.';
    case 'auth/invalid-email':
      return method === 'phone'
        ? 'رقم الموبايل غير صحيح، تأكد من كتابة الرقم بشكل سليم.'
        : 'صيغة الجيميل غير صحيحة.';
    case 'auth/weak-password':
      return 'كلمة السر ضعيفة، يجب أن تكون 6 حروف أو أرقام على الأقل.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return method === 'phone'
        ? 'رقم الموبايل أو كلمة السر غير صحيحة.'
        : 'الجيميل أو كلمة السر غير صحيحة.';
    case 'auth/too-many-requests':
      return 'تم إرسال طلبات كثيرة، انتظر دقيقة وجرّب تاني.';
    case 'auth/popup-blocked':
      return 'المتصفح منع نافذة تسجيل الدخول بـ Google، فعّل النوافذ المنبثقة أو استخدم التسجيل برقم الموبايل أو الجيميل.';
    case 'auth/popup-closed-by-user':
      return 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
    case 'auth/unauthorized-domain':
      return 'الدومين غير مضاف في Authorized domains داخل Firebase Auth.';
    case 'auth/operation-not-allowed':
      return 'طريقة الدخول دي غير مفعّلة في إعدادات Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'مشكلة في الاتصال بالإنترنت، تأكد من الشبكة وحاول تاني.';
    default:
      return err instanceof Error ? err.message : String(err);
  }
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode,
  onBack,
  onAuthComplete,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [authMethod, setAuthMethod] = useState<'phone' | 'gmail'>('phone');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [country, setCountry] = useState('مصر');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // If user arrives already signed in with an unverified Gmail, reload first in case they just verified it
  useEffect(() => {
    let active = true;
    const checkCurrent = async () => {
      const u = auth.currentUser;
      if (!u || isUserActivated(u)) return;
      try {
        await u.reload();
        if (isUserActivated(auth.currentUser)) {
          await auth.currentUser?.getIdToken(true);
          return;
        }
      } catch {
        // ignore reload failure
      }
      if (active && auth.currentUser && !isUserActivated(auth.currentUser)) {
        setAuthMethod('gmail');
        setAwaitingVerification(true);
        setPendingEmail(auth.currentUser.email || '');
        setErrorMsg('روح أكد جيميلك الأول');
      }
    };
    void checkCurrent();
    return () => {
      active = false;
    };
  }, []);

  const finalizeVerifiedSession = async (metaOverride?: Partial<PendingVerificationMeta>) => {
    const user = auth.currentUser;
    if (!user) return;

    await user.getIdToken(true);

    const stored = loadPendingMeta(user.uid);
    const resolvedFullName =
      metaOverride?.fullName?.trim() ||
      fullName.trim() ||
      stored?.fullName ||
      user.displayName ||
      'تاجر Ghazalo';
    const resolvedBusinessName =
      metaOverride?.businessName?.trim() ||
      businessName.trim() ||
      stored?.businessName ||
      '';
    const resolvedCountry = metaOverride?.country || country || stored?.country || 'مصر';
    const resolvedPhone =
      metaOverride?.phone?.trim() || toAsciiDigits(phone.trim()) || stored?.phone || '';
    const rawUserEmail = isPhoneAuthEmail(user.email) ? '' : user.email || '';
    const resolvedEmail =
      metaOverride?.email !== undefined
        ? metaOverride.email
        : rawUserEmail || email.trim() || stored?.email || '';

    await saveUserProfile({
      uid: user.uid,
      fullName: resolvedFullName,
      email: resolvedEmail,
      phone: resolvedPhone,
      country: resolvedCountry,
    });
    clearPendingMeta(user.uid);

    onAuthComplete({
      fullName: resolvedFullName,
      businessName: resolvedBusinessName,
      country: resolvedCountry,
      contact: resolvedEmail || resolvedPhone,
    });
  };

  const handleGoogleAuth = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        setAwaitingVerification(true);
        setPendingEmail(cred.user.email || '');
        setErrorMsg('روح أكد جيميلك الأول');
        return;
      }
      await finalizeVerifiedSession({
        fullName: fullName.trim() || cred.user.displayName || 'تاجر Ghazalo',
        phone: toAsciiDigits(phone.trim()),
      });
    } catch (err: unknown) {
      setErrorMsg(formatAuthError(err, 'gmail'));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanName = fullName.trim();
    const cleanPhone = toAsciiDigits(phone.trim());

    if (!cleanName) {
      setErrorMsg('يرجى إدخال الاسم.');
      return;
    }
    if (!isValidPhoneDigits(cleanPhone)) {
      setErrorMsg('يرجى إدخال رقم موبايل صحيح.');
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

    setLoading(true);
    try {
      const syntheticEmail = phoneToAuthEmail(cleanPhone);
      const cred = await createUserWithEmailAndPassword(auth, syntheticEmail, password);
      try {
        await updateProfile(cred.user, { displayName: cleanName });
      } catch {
        // non-blocking
      }

      // Phone accounts enter directly without email or SMS verification
      await finalizeVerifiedSession({
        fullName: cleanName,
        businessName: businessName.trim(),
        country,
        email: '',
        phone: cleanPhone,
      });
    } catch (err: unknown) {
      setErrorMsg(formatAuthError(err, 'phone'));
    } finally {
      setLoading(false);
    }
  };

  const handleGmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanName = fullName.trim();
    const cleanPhone = toAsciiDigits(phone.trim());
    const cleanEmail = email.trim();

    if (!cleanName) {
      setErrorMsg('يرجى إدخال الاسم.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('يرجى إدخال عنوان جيميل صحيح.');
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

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      try {
        await updateProfile(cred.user, { displayName: cleanName });
      } catch {
        // non-blocking
      }

      savePendingMeta({
        uid: cred.user.uid,
        fullName: cleanName,
        businessName: businessName.trim(),
        country,
        email: cleanEmail,
        phone: cleanPhone,
      });

      setAwaitingVerification(true);
      setPendingEmail(cleanEmail);

      try {
        await sendEmailVerification(cred.user);
        setErrorMsg('روح أكد جيميلك الأول');
        setInfoMsg(
          'تم إرسال رسالة التفعيل على الجيميل بتاعك (راجع البريد الوارد أو Spam). بعد الضغط على الرابط اضغط زر التأكيد بالأسفل.'
        );
      } catch (mailErr: unknown) {
        setErrorMsg('روح أكد جيميلك الأول');
        setInfoMsg(formatAuthError(mailErr, 'gmail'));
      }
    } catch (err: unknown) {
      setErrorMsg(formatAuthError(err, 'gmail'));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanPhone = toAsciiDigits(phone.trim());
    if (!isValidPhoneDigits(cleanPhone) || !password) {
      setErrorMsg('يرجى إدخال رقم الموبايل وكلمة السر.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, phoneToAuthEmail(cleanPhone), password);
      await finalizeVerifiedSession({ email: '', phone: cleanPhone });
    } catch (err: unknown) {
      setErrorMsg(formatAuthError(err, 'phone'));
    } finally {
      setLoading(false);
    }
  };

  const handleGmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg('يرجى إدخال الجيميل وكلمة السر.');
      return;
    }

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      await cred.user.reload();

      if (!cred.user.emailVerified) {
        setAwaitingVerification(true);
        setPendingEmail(cred.user.email || cleanEmail);
        setErrorMsg('روح أكد جيميلك الأول');
        setInfoMsg('حسابك لسه متأكدش. افتح الجيميل واضغط على رابط التفعيل الأول، أو اطلب إرسال الرابط تاني.');
        return;
      }

      await finalizeVerifiedSession();
    } catch (err: unknown) {
      setErrorMsg(formatAuthError(err, 'gmail'));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckEmailVerified = async () => {
    setErrorMsg('');
    setInfoMsg('');
    const user = auth.currentUser;
    if (!user) {
      setAwaitingVerification(false);
      return;
    }
    setLoading(true);
    try {
      await user.reload();
      await user.getIdToken(true);
      if (!auth.currentUser?.emailVerified) {
        setErrorMsg('روح أكد جيميلك الأول');
        return;
      }
      await finalizeVerifiedSession();
    } catch (err: unknown) {
      setErrorMsg(formatAuthError(err, 'gmail'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setErrorMsg('');
    setInfoMsg('');
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      await sendEmailVerification(user);
      setInfoMsg('تم إعادة إرسال رسالة التفعيل إلى الجيميل بنجاح. راجع البريد الوارد أو الرسائل غير المرغوب فيها (Spam).');
    } catch (err: unknown) {
      setErrorMsg(formatAuthError(err, 'gmail'));
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    await signOut(auth);
    setAwaitingVerification(false);
    setPendingEmail('');
    setErrorMsg('');
    setInfoMsg('');
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
          {awaitingVerification ? (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 mx-auto flex items-center justify-center">
                <Mail className="w-8 h-8" />
              </div>

              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                روح أكد جيميلك الأول
              </h1>

              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                بعتنالك رسالة تفعيل على الجيميل:
                <br />
                <span className="text-emerald-700 dark:text-emerald-400 font-extrabold" dir="ltr">
                  {pendingEmail}
                </span>
              </p>

              {errorMsg && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                  {errorMsg}
                </div>
              )}

              {infoMsg && (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3.5 text-xs font-bold text-emerald-800 dark:text-emerald-200 leading-relaxed">
                  {infoMsg}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleCheckEmailVerified()}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                <span>أكدت الجيميل، ادخل الآن</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleResendVerification()}
                className="w-full py-3 rounded-2xl bg-emerald-50 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-slate-700 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-slate-700 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة إرسال رسالة التفعيل</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSwitchAccount()}
                className="text-xs font-bold text-slate-500 hover:underline pt-1"
              >
                تغيير الحساب أو التسجيل بطريقة أخرى
              </button>
            </div>
          ) : (
            <>
              <div className="text-center space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {mode === 'signup' ? 'أنشئ حسابك' : 'تسجيل الدخول'}
                </h1>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  اختر طريقة التسجيل المناسبة لك لتجهيز منيوك في دقائق
                </p>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 rounded-2xl p-3.5 text-center">
                <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
                  7 أيام مجاناً تفتح كل المزايا، بدون رسوم وبدون بطاقة
                </p>
              </div>

              {/* Method Switcher: Phone (Direct Entry) vs Gmail (Email Verification) */}
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-emerald-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setInfoMsg('');
                    setAuthMethod('phone');
                  }}
                  className={`py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-0.5 transition-all ${
                    authMethod === 'phone'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-4 h-4" />
                    <span>برقم الموبايل</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      authMethod === 'phone' ? 'text-emerald-100' : 'text-slate-400'
                    }`}
                  >
                    {mode === 'signup' ? 'يخش على طول' : 'رقم + كلمة سر'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setInfoMsg('');
                    setAuthMethod('gmail');
                  }}
                  className={`py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-0.5 transition-all ${
                    authMethod === 'gmail'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="w-4 h-4" />
                    <span>بالجيميل</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      authMethod === 'gmail' ? 'text-emerald-100' : 'text-slate-400'
                    }`}
                  >
                    {mode === 'signup' ? 'برسالة تفعيل' : 'جيميل + كلمة سر'}
                  </span>
                </button>
              </div>

              {authMethod === 'gmail' && (
                <>
                  {/* Google One-Click Sign-in */}
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
                          ? 'التسجيل السريع بحساب Google'
                          : 'دخول سريع بحساب Google'}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                    <span>أو بالجيميل وكلمة السر</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  </div>
                </>
              )}

              {errorMsg && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-extrabold text-amber-800 dark:text-amber-200 leading-relaxed">
                  {errorMsg}
                </div>
              )}

              {authMethod === 'phone' ? (
                mode === 'signup' ? (
                  <form onSubmit={(e) => void handlePhoneSignup(e)} className="space-y-3.5">
                    <div className="rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3.5 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      التسجيل برقم الموبايل يفتح حسابك على طول بدون رسالة تفعيل.
                    </div>

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
                        رقم الموبايل
                      </label>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01012345678"
                        className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums text-left"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          اسم المطعم (اختياري)
                        </label>
                        <input
                          type="text"
                          value={businessName}
                          onChange={(e) => setBusinessName(e.target.value)}
                          placeholder="مطعم البرنس"
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
                          aria-label={
                            showConfirmPassword ? 'إخفاء تأكيد كلمة السر' : 'إظهار تأكيد كلمة السر'
                          }
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
                        <UserPlus className="w-5 h-5" />
                      )}
                      <span>إنشاء الحساب والدخول فوراً</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={(e) => void handlePhoneLogin(e)} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        رقم الموبايل
                      </label>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01012345678"
                        className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums text-left"
                      />
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
                      <span>تسجيل الدخول برقم الموبايل</span>
                    </button>
                  </form>
                )
              ) : mode === 'signup' ? (
                <form onSubmit={(e) => void handleGmailSignup(e)} className="space-y-3.5">
                  <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3.5 py-2.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                    التسجيل بالجيميل يرسل رسالة تفعيل على بريدك الإلكتروني لتأكيد الحساب قبل الدخول.
                  </div>

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
                      الجيميل
                    </label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="example@gmail.com"
                      className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-left"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      رقم الموبايل (اختياري)
                    </label>
                    <input
                      type="tel"
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01012345678"
                      className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums text-left"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        اسم المطعم (اختياري)
                      </label>
                      <input
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="مطعم البرنس"
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
                        aria-label={
                          showConfirmPassword ? 'إخفاء تأكيد كلمة السر' : 'إظهار تأكيد كلمة السر'
                        }
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
                      <UserPlus className="w-5 h-5" />
                    )}
                    <span>إنشاء الحساب وإرسال رسالة التفعيل</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={(e) => void handleGmailLogin(e)} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      الجيميل
                    </label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="example@gmail.com"
                      className="w-full px-4 py-3 rounded-2xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-left"
                    />
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
                    <span>تسجيل الدخول بالجيميل</span>
                  </button>
                </form>
              )}

              <div className="text-center text-sm font-bold text-slate-600 dark:text-slate-300 pt-1">
                {mode === 'signup' ? (
                  <>
                    لديك حساب بالفعل؟{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setInfoMsg('');
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
                        setInfoMsg('');
                        setMode('signup');
                      }}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      أنشئ حسابك مجاناً
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
