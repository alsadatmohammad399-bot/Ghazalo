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
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Store,
  UserPlus,
  X,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { saveUserProfile } from '../services/firestoreService';
import { normalizeStoreSlug, SUPPORT_CONTACT, type DemoRestaurantRecord } from '../types';
import {
  isPhoneAuthEmail,
  isUserActivated,
  isValidPhoneDigits,
  phoneToAuthEmail,
  toAsciiDigits,
} from '../utils/authHelpers';
import {
  findLocalRestaurantByIdentifier,
  findLocalRestaurantBySlugOrShopId,
  getLocalRestaurants,
  getStoredAuthSession,
  saveLocalRestaurants,
  setAuthSessionStorage,
  upsertLocalRestaurant,
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

interface PendingVerificationMeta {
  uid: string;
  fullName: string;
  businessName: string;
  storeSlug?: string;
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
  onStoreLoginSuccess,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [loginMethod, setLoginMethod] = useState<'store' | 'phone' | 'gmail'>('store');
  const [authMethod, setAuthMethod] = useState<'phone' | 'gmail'>('phone');

  // Store-Slug Login state (pre-filled from localStorage "lastStore")
  const [storeSlugInput, setStoreSlugInput] = useState<string>(() => {
    return getStoredAuthSession().lastStore || '';
  });

  // Shared & Signup fields
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [signupStoreSlug, setSignupStoreSlug] = useState('');
  const [country, setCountry] = useState('مصر');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Verification gate (Gmail)
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  // Forgot Password Popup (2-Step: 6-digit Admin Recovery Code + WhatsApp Support + Gmail fallback)
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

  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg('');
    setInfoMsg('');
    const stored = getStoredAuthSession().lastStore;
    if (stored && !storeSlugInput) {
      setStoreSlugInput(stored);
    }
  }, [initialMode]);

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
    const resolvedSlug =
      normalizeStoreSlug(
        metaOverride?.storeSlug ||
          signupStoreSlug ||
          stored?.storeSlug ||
          resolvedBusinessName
      ) || `store-${user.uid.slice(0, 6).toLowerCase()}`;
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

    // Save lastStore + token in localStorage for instant re-entry rules
    setAuthSessionStorage(resolvedSlug, `fb-${user.uid}-${Date.now()}`);

    onAuthComplete({
      fullName: resolvedFullName,
      businessName: resolvedBusinessName,
      storeSlug: resolvedSlug,
      password: password || undefined,
      country: resolvedCountry,
      contact: resolvedEmail || resolvedPhone,
    });
  };

  // Primary Ghazalo Store-Slug Login
  const handleStoreSlugLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const slug = normalizeStoreSlug(storeSlugInput);
    const cleanPass = password.trim();
    if (!slug) {
      setErrorMsg('يرجى إدخال عنوان متجرك (مثال: koshary-corner).');
      return;
    }
    if (!cleanPass) {
      setErrorMsg('يرجى إدخال كلمة السر.');
      return;
    }

    setLoading(true);
    try {
      // 1) Try backend scrypt-verified store login
      let serverData: {
        ok?: boolean;
        token?: string;
        storeSlug?: string;
        shopId?: string;
        error?: string;
      } | null = null;
      try {
        const res = await fetch('/api/store-auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeSlug: slug, password: cleanPass }),
        });
        serverData = (await res.json()) as {
          ok?: boolean;
          token?: string;
          storeSlug?: string;
          shopId?: string;
          error?: string;
        };
      } catch {
        serverData = null;
      }

      const localMatch = findLocalRestaurantBySlugOrShopId(slug);
      const localMatchesPass =
        localMatch && localMatch.password !== undefined && localMatch.password === cleanPass;

      if (serverData?.ok && serverData.token) {
        const finalSlug = serverData.storeSlug || slug;
        const finalShopId = serverData.shopId || localMatch?.shopId || finalSlug;
        setAuthSessionStorage(finalSlug, serverData.token);

        if (localMatch && localMatch.email && !localMatch.email.includes('phone_')) {
          try {
            await signInWithEmailAndPassword(auth, localMatch.email, cleanPass);
          } catch {
            // store-slug session token handles access cleanly
          }
        }

        if (onStoreLoginSuccess) {
          onStoreLoginSuccess({
            storeSlug: finalSlug,
            shopId: finalShopId,
            token: serverData.token,
            record: localMatch,
          });
          return;
        }
      }

      if (localMatch && localMatchesPass) {
        const demoToken = `ghz-store-${localMatch.storeSlug}-${Date.now()}`;
        setAuthSessionStorage(localMatch.storeSlug, demoToken);
        if (onStoreLoginSuccess) {
          onStoreLoginSuccess({
            storeSlug: localMatch.storeSlug,
            shopId: localMatch.shopId,
            token: demoToken,
            record: localMatch,
          });
          return;
        }
      }

      setErrorMsg(
        serverData?.error ||
          'عنوان المتجر أو كلمة السر غير صحيحة. (للتجربة: koshary-corner وكلمة السر 123456)'
      );
    } finally {
      setLoading(false);
    }
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
    const cleanSlug =
      normalizeStoreSlug(signupStoreSlug || businessName) || `store-${cleanPhone.slice(-6)}`;

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

      // Also register store credentials on backend so store-slug login & recovery work
      try {
        await fetch('/api/store-auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: cleanSlug,
            storeSlug: cleanSlug,
            nameAr: businessName.trim() || cleanName,
            phone: cleanPhone,
            password,
          }),
        });
      } catch {
        // non-blocking
      }

      // Phone accounts enter directly without email or SMS verification
      await finalizeVerifiedSession({
        fullName: cleanName,
        businessName: businessName.trim(),
        storeSlug: cleanSlug,
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
    const cleanSlug =
      normalizeStoreSlug(signupStoreSlug || businessName || cleanEmail.split('@')[0]) ||
      `store-${Date.now().toString().slice(-6)}`;

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

      try {
        await fetch('/api/store-auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: cleanSlug,
            storeSlug: cleanSlug,
            nameAr: businessName.trim() || cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            password,
          }),
        });
      } catch {
        // non-blocking
      }

      savePendingMeta({
        uid: cred.user.uid,
        fullName: cleanName,
        businessName: businessName.trim(),
        storeSlug: cleanSlug,
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
      // Fallback: check local restaurants by phone + password
      const localMatch = findLocalRestaurantByIdentifier(cleanPhone);
      if (localMatch && localMatch.password === password && onStoreLoginSuccess) {
        const token = `ghz-store-${localMatch.storeSlug}-${Date.now()}`;
        setAuthSessionStorage(localMatch.storeSlug, token);
        onStoreLoginSuccess({
          storeSlug: localMatch.storeSlug,
          shopId: localMatch.shopId,
          token,
          record: localMatch,
        });
        return;
      }
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

  // Open 2-Step Forgot Password Popup
  const openForgotPopup = () => {
    setForgotError('');
    setForgotSuccess('');
    setForgotStep(1);
    setForgotIdentifier(storeSlugInput || email || phone || '');
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
      setForgotError('يرجى إدخال اسم المتجر أو رقم الموبايل أو الإيميل.');
      return;
    }

    setForgotBusy(true);
    try {
      // Optional: if user typed a valid gmail, also trigger Firebase email reset silently
      if (idf.includes('@') && !idf.includes('phone_')) {
        try {
          await sendPasswordResetEmail(auth, idf);
        } catch {
          // still proceed with 6-digit admin recovery step
        }
      }

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
        'تم تسجيل طلب الاستعادة. أدخل كود الاستعادة المكون من 6 أرقام الصادر من لوحة الأدمن، أو تواصل مع الدعم عبر واتساب للحصول عليه فوراً.'
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
      let resolvedSlug = normalizeStoreSlug(idf);
      let serverError = '';
      try {
        const res = await fetch('/api/store-auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: idf, code, newPassword: newPass }),
        });
        const data = (await res.json()) as { ok?: boolean; storeSlug?: string; error?: string };
        if (res.ok && data.ok) {
          backendOk = true;
          if (data.storeSlug) resolvedSlug = data.storeSlug;
        } else {
          serverError = data.error || '';
        }
      } catch {
        // try localStorage restaurants check below
      }

      const localList = getLocalRestaurants();
      const localMatch = findLocalRestaurantByIdentifier(idf);
      const localCodeOk =
        localMatch &&
        localMatch.resetCode === code &&
        (!localMatch.resetCodeExpiresAt || Date.now() <= localMatch.resetCodeExpiresAt);

      if (backendOk || localCodeOk) {
        if (localMatch) {
          const updatedList = localList.map((r) =>
            r.shopId === localMatch.shopId || r.storeSlug === localMatch.storeSlug
              ? { ...r, password: newPass, resetCode: undefined, resetCodeExpiresAt: undefined }
              : r
          );
          saveLocalRestaurants(updatedList);
          resolvedSlug = localMatch.storeSlug;
        } else if (resolvedSlug) {
          const existingSlug = findLocalRestaurantBySlugOrShopId(resolvedSlug);
          if (existingSlug) {
            upsertLocalRestaurant({
              ...existingSlug,
              password: newPass,
              resetCode: undefined,
              resetCodeExpiresAt: undefined,
            });
          }
        }

        if (resolvedSlug) setStoreSlugInput(resolvedSlug);
        setPassword('');
        setForgotSuccess('تم تغيير كلمة السر بنجاح! يمكنك تسجيل الدخول بكلمة السر الجديدة الآن.');
        setTimeout(() => {
          setForgotModalOpen(false);
          setMode('login');
          setLoginMethod('store');
        }, 1400);
        return;
      }

      setForgotError(
        serverError || 'كود الاستعادة غير صحيح أو منتهي الصلاحية. تواصل مع الأدمن لإصدار كود من 6 أرقام.'
      );
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md space-y-6">
          {/* Top Center Brand: غزالة Ghazalo with modern orange gazelle icon */}
          <div className="flex justify-center">
            <GhazaloLogo stacked />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-orange-100 dark:border-slate-800 shadow-[0_14px_45px_rgba(255,106,0,0.08)] space-y-5">
            {awaitingVerification ? (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-3xl bg-orange-50 dark:bg-orange-950/50 text-[#FF6A00] mx-auto flex items-center justify-center">
                  <Mail className="w-8 h-8" />
                </div>

                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                  روح أكد جيميلك الأول
                </h1>

                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                  بعتنالك رسالة تفعيل على الجيميل:
                  <br />
                  <span className="text-[#FF6A00] font-extrabold" dir="ltr">
                    {pendingEmail}
                  </span>
                </p>

                {errorMsg && (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                    {errorMsg}
                  </div>
                )}

                {infoMsg && (
                  <div className="rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 p-3.5 text-xs font-bold text-orange-900 dark:text-orange-200 leading-relaxed">
                    {infoMsg}
                  </div>
                )}

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleCheckEmailVerified()}
                  className="w-full py-3.5 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
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
                  className="w-full py-3 rounded-2xl bg-orange-50 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-slate-700 text-[#FF6A00] dark:text-orange-300 border border-orange-200 dark:border-slate-700 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
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
            ) : mode === 'login' ? (
              <>
                <div className="text-center space-y-1.5">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                    تسجيل الدخول
                  </h1>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    أدخل عنوان متجرك للمتابعة إلى لوحة التحكم
                  </p>
                </div>

                {/* Method tabs inside Login (Default: Store Slug .ghazalo.com) */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
                  {[
                    { id: 'store', label: 'عنوان المتجر', icon: Store },
                    { id: 'phone', label: 'الموبايل', icon: Phone },
                    { id: 'gmail', label: 'الجيميل', icon: Mail },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = loginMethod === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setErrorMsg('');
                          setInfoMsg('');
                          setLoginMethod(tab.id as typeof loginMethod);
                        }}
                        className={`py-2 px-2 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1 transition-all ${
                          active
                            ? 'bg-[#FF6A00] text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-[#FF6A00]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {errorMsg && (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs font-extrabold text-amber-800 dark:text-amber-200 leading-relaxed">
                    {errorMsg}
                  </div>
                )}

                {loginMethod === 'store' ? (
                  <form onSubmit={(e) => void handleStoreSlugLogin(e)} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                        عنوان المتجر
                      </label>
                      <div
                        dir="ltr"
                        className="flex items-stretch rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-[#FF6A00] focus-within:border-[#FF6A00]"
                      >
                        <span className="px-3.5 flex items-center bg-orange-50/80 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-extrabold text-[#FF6A00] select-none shrink-0">
                          .ghazalo.com
                        </span>
                        <input
                          type="text"
                          required
                          value={storeSlugInput}
                          onChange={(e) => setStoreSlugInput(e.target.value)}
                          placeholder="store-name"
                          className="flex-1 px-3.5 py-3.5 bg-transparent text-sm font-bold text-slate-900 dark:text-white focus:outline-none text-left"
                        />
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        مثال: إذا كان متجرك هو{' '}
                        <span dir="ltr" className="font-extrabold text-[#FF6A00]">
                          koshary-corner
                        </span>
                        ، أدخل{' '}
                        <span dir="ltr" className="font-extrabold">
                          koshary-corner
                        </span>{' '}
                        فقط
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                        كلمة السر
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••"
                          className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <div className="flex justify-start pt-0.5">
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
                      className="w-full py-4 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)] transition-all flex items-center justify-center gap-2"
                    >
                      {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                      <span>اذهب إلى لوحة التحكم</span>
                    </button>
                  </form>
                ) : loginMethod === 'phone' ? (
                  <form onSubmit={(e) => void handlePhoneLogin(e)} className="space-y-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                        رقم الموبايل
                      </label>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01012345678"
                        className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00] tabular-nums text-left"
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
                          className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <div className="pt-1">
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
                      className="w-full py-4 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)] transition-all flex items-center justify-center gap-2"
                    >
                      {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                      <span>اذهب إلى لوحة التحكم</span>
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => void handleGoogleAuth()}
                      disabled={loading}
                      className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-2 border-orange-200 dark:border-slate-700 font-extrabold text-sm flex items-center justify-center gap-3 shadow-xs transition-colors"
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
                      <span>دخول سريع بحساب Google</span>
                    </button>

                    <form onSubmit={(e) => void handleGmailLogin(e)} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                          الجيميل
                        </label>
                        <input
                          type="email"
                          required
                          dir="ltr"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="example@gmail.com"
                          className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00] text-left"
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
                            className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A00]"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <div className="pt-1">
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
                        className="w-full py-4 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)] transition-all flex items-center justify-center gap-2"
                      >
                        {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                        <span>اذهب إلى لوحة التحكم</span>
                      </button>
                    </form>
                  </div>
                )}

                {/* Below Login CTA: Signup Switch + Home Link */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-center">
                  <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    ليس لديك متجر؟ أنشئ متجرك مجاناً{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setInfoMsg('');
                        setMode('signup');
                      }}
                      className="font-extrabold text-[#FF6A00] hover:underline"
                    >
                      إنشاء متجر
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
              /* SIGNUP FLOW: Phone (Direct) or Gmail (Verification) */
              <>
                <div className="text-center space-y-1.5">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                    أنشئ متجرك مجاناً
                  </h1>
                  <p className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                    تجربة مجانية تلقائية لمدة 7 أيام بدون بطاقة وبدون رسوم خفية
                  </p>
                </div>

                {/* Method Switcher: Phone (Direct Entry) vs Gmail (Email Verification) */}
                <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-orange-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setInfoMsg('');
                      setAuthMethod('phone');
                    }}
                    className={`py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-0.5 transition-all ${
                      authMethod === 'phone'
                        ? 'bg-[#FF6A00] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-[#FF6A00]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="w-4 h-4" />
                      <span>برقم الموبايل</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        authMethod === 'phone' ? 'text-orange-100' : 'text-slate-400'
                      }`}
                    >
                      يخش على طول
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
                        ? 'bg-[#FF6A00] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-[#FF6A00]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-4 h-4" />
                      <span>بالجيميل</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        authMethod === 'gmail' ? 'text-orange-100' : 'text-slate-400'
                      }`}
                    >
                      برسالة تفعيل
                    </span>
                  </button>
                </div>

                {authMethod === 'gmail' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleGoogleAuth()}
                      disabled={loading}
                      className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-2 border-orange-200 dark:border-slate-700 font-extrabold text-sm flex items-center justify-center gap-3 shadow-xs transition-colors"
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
                      <span>التسجيل السريع بحساب Google</span>
                    </button>

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

                <form
                  onSubmit={(e) =>
                    void (authMethod === 'phone' ? handlePhoneSignup(e) : handleGmailSignup(e))
                  }
                  className="space-y-3.5"
                >
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      الاسم
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="مثال: أحمد محمد"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                    />
                  </div>

                  {authMethod === 'phone' ? (
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                        رقم الموبايل
                      </label>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01012345678"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00] tabular-nums text-left"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                          الجيميل
                        </label>
                        <input
                          type="email"
                          required
                          dir="ltr"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="example@gmail.com"
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00] text-left"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                          رقم الموبايل (اختياري)
                        </label>
                        <input
                          type="tel"
                          dir="ltr"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="01012345678"
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00] text-left"
                        />
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                        اسم المطعم
                      </label>
                      <input
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="ركن الكشري"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                        دولة المشروع
                      </label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
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
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      عنوان رابط المتجر بالإنجليزية (اختياري)
                    </label>
                    <div
                      dir="ltr"
                      className="flex items-stretch rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-[#FF6A00]"
                    >
                      <span className="px-3 flex items-center bg-orange-50/70 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 text-xs font-extrabold text-[#FF6A00]">
                        .ghazalo.com
                      </span>
                      <input
                        type="text"
                        value={signupStoreSlug}
                        onChange={(e) => setSignupStoreSlug(e.target.value)}
                        placeholder="koshary-corner"
                        className="flex-1 px-3 py-3 bg-transparent text-sm font-semibold focus:outline-none text-left"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-base shadow-[0_10px_28px_rgba(255,106,0,0.28)] transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : authMethod === 'phone' ? (
                      <UserPlus className="w-5 h-5" />
                    ) : (
                      <Mail className="w-5 h-5" />
                    )}
                    <span>
                      {authMethod === 'phone'
                        ? 'إنشاء المتجر والدخول فوراً'
                        : 'إنشاء المتجر وإرسال رسالة التفعيل'}
                    </span>
                  </button>
                </form>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-center">
                  <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    لديك متجر بالفعل؟{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setInfoMsg('');
                        setMode('login');
                      }}
                      className="font-extrabold text-[#FF6A00] hover:underline"
                    >
                      تسجيل الدخول
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

      {/* 2-Step Forgot Password Popup Modal */}
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
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotError && (
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-xs font-extrabold text-amber-900 dark:text-amber-200 leading-relaxed">
                {forgotError}
              </div>
            )}

            {forgotSuccess && (
              <div className="rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 p-3 text-xs font-extrabold text-orange-900 dark:text-orange-200 leading-relaxed">
                {forgotSuccess}
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={(e) => void handleForgotStep1Request(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1.5">
                    اسم المتجر + رقم الموبايل او الايميل
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="مثال: koshary-corner أو 01015861991 أو email@gmail.com"
                    className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotBusy}
                  className="w-full py-3.5 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-sm shadow-xs flex items-center justify-center gap-2 transition-colors"
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
                    onChange={(e) => setResetCodeInput(toAsciiDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
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
                    className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                  >
                    رجوع
                  </button>
                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="flex-1 py-3.5 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    {forgotBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>تغيير كلمة السر</span>
                  </button>
                </div>
              </form>
            )}

            {/* Support option with WhatsApp CTA */}
            <div className="rounded-2xl bg-orange-50/70 dark:bg-slate-800/80 border border-orange-100 dark:border-slate-700 p-3.5 space-y-2 text-center">
              <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                التواصل مع الدعم لاستعادة الحساب
              </div>
              <a
                href={`https://wa.me/${SUPPORT_CONTACT.WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  `مرحباً دعم غزالة، أحتاج كود استعادة لحساب متجر: ${forgotIdentifier || storeSlugInput || 'متجري'}`
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
