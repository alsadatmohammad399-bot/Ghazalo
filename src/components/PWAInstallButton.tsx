import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Monitor,
  Share,
  ShieldCheck,
  Smartphone,
  Star,
  Tablet,
  X,
} from 'lucide-react';
import { usePWAInstall, type DevicePlatform } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'default' | 'compact' | 'card' | 'drawer';
  label?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'default',
  label = 'تثبيت التطبيق',
}) => {
  const { isInstallable, isInstalled, platform, install } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DevicePlatform>(platform);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);

  if (isInstalled) {
    return null;
  }

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const triggerPlayStoreInstall = async () => {
    if (!isInstallable) {
      setActiveTab(platform);
      setModalOpen(true);
      return;
    }
    setInstalling(true);
    setInstallProgress(35);
    const timer = window.setInterval(() => {
      setInstallProgress((p) => (p < 85 ? p + 15 : p));
    }, 120);
    try {
      const accepted = await install();
      window.clearInterval(timer);
      if (accepted) {
        setInstallProgress(100);
        setTimeout(() => {
          setModalOpen(false);
          setInstalling(false);
          setInstallProgress(0);
        }, 400);
      } else {
        setInstalling(false);
        setInstallProgress(0);
      }
    } catch {
      window.clearInterval(timer);
      setInstalling(false);
      setInstallProgress(0);
    }
  };

  const openStoreModal = () => {
    setActiveTab(platform);
    setModalOpen(true);
  };

  return (
    <>
      {variant === 'card' ? (
        <div className="bg-gradient-to-l from-emerald-600 to-teal-700 rounded-3xl p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <img
              src="/pwa-192x192.png"
              alt="غزالو POS"
              className="w-14 h-14 rounded-2xl border-2 border-white/40 bg-white object-cover shrink-0 shadow-xs"
            />
            <div className="space-y-0.5">
              <div className="font-extrabold text-base flex items-center gap-1.5">
                <span>تطبيق غزالو POS الرسمي</span>
                <ShieldCheck className="w-4 h-4 text-emerald-200" />
              </div>
              <div className="text-xs font-semibold text-emerald-100">
                ثبّته مباشرة على أندرويد، آيفون iOS، والكمبيوتر مثل تطبيقات المتجر
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={installing}
            onClick={() => (isInstallable ? void triggerPlayStoreInstall() : openStoreModal())}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold text-xs inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{isInstallable ? 'تثبيت الآن (ضغطة واحدة)' : 'تحميل التطبيق للأندرويد وiOS والكمبيوتر'}</span>
          </button>
        </div>
      ) : variant === 'drawer' ? (
        <button
          type="button"
          onClick={() => (isInstallable ? void triggerPlayStoreInstall() : openStoreModal())}
          className="w-full text-right px-4 py-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 flex items-center justify-between gap-2 font-extrabold text-sm"
        >
          <span className="inline-flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>{label}</span>
          </span>
          <span className="text-[11px] font-bold opacity-80">Android · iOS · PC</span>
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          disabled={installing}
          onClick={() => (isInstallable ? void triggerPlayStoreInstall() : openStoreModal())}
          className="px-3 h-9 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 font-extrabold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          title="تثبيت التطبيق على أندرويد وآيفون والكمبيوتر"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={installing}
          onClick={() => (isInstallable ? void triggerPlayStoreInstall() : openStoreModal())}
          className="px-5 py-3 rounded-full glass-btn text-emerald-800 dark:text-emerald-200 font-extrabold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>{label}</span>
        </button>
      )}

      {/* Play Store Style App Listing Sheet */}
      {modalOpen && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs no-print"
          onClick={() => setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto space-y-4 border border-emerald-100 dark:border-slate-800 shadow-2xl"
          >
            {/* Store Listing Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <img
                  src="/pwa-192x192.png"
                  alt="غزالو POS"
                  className="w-16 h-16 rounded-2xl border border-emerald-100 dark:border-slate-700 object-cover shadow-xs shrink-0"
                />
                <div className="space-y-0.5">
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">
                    غزالو POS · منيو وكاشير
                  </h3>
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    Ghazalo Platform
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-extrabold">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      4.9
                    </span>
                    <span>·</span>
                    <span>بدون إعلانات</span>
                    <span>·</span>
                    <span>حجم خفيف</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Store Stats Row */}
            <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-emerald-100 dark:border-slate-800 text-center">
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">Android</div>
                <div className="text-[10px] font-semibold text-slate-500">موبايل وتابلت</div>
              </div>
              <div className="border-x border-emerald-100 dark:border-slate-800">
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">iPhone / iPad</div>
                <div className="text-[10px] font-semibold text-slate-500">نظام iOS</div>
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">Windows / Mac</div>
                <div className="text-[10px] font-semibold text-slate-500">برنامج كاشير PC</div>
              </div>
            </div>

            {/* Primary Play Store-style Green Action Button */}
            {isInstallable ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={installing}
                  onClick={() => void triggerPlayStoreInstall()}
                  className="w-full py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>{installing ? `جاري التثبيت (${installProgress}%)...` : 'تثبيت التطبيق الآن'}</span>
                </button>
                {installing && (
                  <div className="w-full h-1.5 rounded-full bg-emerald-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${installProgress}%` }}
                      className="h-full bg-emerald-600 transition-all duration-150"
                    />
                  </div>
                )}
              </div>
            ) : isInIframe ? (
              <div className="space-y-2">
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>فتح رابط التثبيت المباشر (تثبيت مثل المتجر)</span>
                </a>
                <p className="text-[11px] font-semibold text-center text-slate-500">
                  عند فتح الرابط في نافذة المتصفح الرئيسية سيظهر لك زر «تثبيت التطبيق» مباشرة مثل متجر Google Play.
                </p>
              </div>
            ) : null}

            {/* Store Screenshots Preview */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 rounded-2xl overflow-hidden border border-emerald-100 dark:border-slate-700 h-28 bg-emerald-900">
                <img
                  src="/screenshot-mobile.png"
                  alt="معاينة التطبيق للموبايل"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="col-span-2 rounded-2xl overflow-hidden border border-emerald-100 dark:border-slate-700 h-28 bg-emerald-900">
                <img
                  src="/screenshot-desktop.png"
                  alt="معاينة نظام الكاشير POS"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Platform Tabs for Safari / Desktop Fallback */}
            <div className="grid grid-cols-3 gap-1.5 bg-emerald-50/70 dark:bg-slate-800 p-1 rounded-2xl">
              {[
                { id: 'android' as const, label: 'أندرويد', icon: Smartphone },
                { id: 'ios' as const, label: 'آيفون iOS', icon: Tablet },
                { id: 'desktop' as const, label: 'كمبيوتر PC', icon: Monitor },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 transition-colors ${
                      activeTab === t.id
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'android' && (
              <div className="rounded-2xl bg-emerald-50/50 dark:bg-slate-800/80 p-3.5 space-y-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <div>1. افتح الموقع في متصفح <strong>Chrome</strong> على أندرويد.</div>
                <div>2. سيظهر لك شريط <strong>تثبيت التطبيق (مثل متجر Play)</strong> أو من قائمة <strong>(⋮)</strong> اختر <strong>تثبيت التطبيق</strong>.</div>
                <div>3. يظهر التطبيق بأيقونة <strong>غزالو</strong> وسط تطبيقات هاتفك بدون الحاجة لملفات خارجية.</div>
              </div>
            )}

            {activeTab === 'ios' && (
              <div className="rounded-2xl bg-emerald-50/50 dark:bg-slate-800/80 p-3.5 space-y-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <div>1. افتح الرابط في متصفح <strong>Safari</strong> على الآيفون أو الآيباد.</div>
                <div className="inline-flex items-center gap-1 flex-wrap">
                  2. اضغط على أيقونة المشاركة <Share className="w-3.5 h-3.5 text-emerald-600 inline" /> بالأسفل.
                </div>
                <div>3. اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</div>
              </div>
            )}

            {activeTab === 'desktop' && (
              <div className="rounded-2xl bg-emerald-50/50 dark:bg-slate-800/80 p-3.5 space-y-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <div>1. افتح الرابط في <strong>Chrome</strong> أو <strong>Edge</strong> على الكمبيوتر.</div>
                <div>2. اضغط أيقونة التثبيت في شريط العنوان أو اختر <strong>تثبيت غزالو POS</strong>.</div>
                <div>3. يعمل كبرنامج كاشير مستقل على سطح المكتب مع اختصار مباشر للكاشير.</div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>جاهز أيضاً للتصدير بصيغة APK / AAB لمتجر Google Play عبر PWABuilder.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
