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
import { tx, useUiLang } from '../utils/uiLang';

interface PWAInstallButtonProps {
  variant?: 'default' | 'compact' | 'card' | 'drawer';
  label?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'default',
  label,
}) => {
  const { isEn } = useUiLang();
  const resolvedLabel = label || tx(isEn, 'تثبيت التطبيق', 'Install App');
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
        <div className="bg-[#15803D] rounded-[24px] p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <img
              src="/pwa-192x192.png"
              alt="Ghazalo POS"
              className="w-14 h-14 rounded-2xl border-2 border-white/40 bg-white object-cover shrink-0 shadow-xs"
            />
            <div className="space-y-0.5">
              <div className="font-extrabold text-base flex items-center gap-1.5">
                <span>{tx(isEn, 'تطبيق Ghazalo POS الرسمي', 'Official Ghazalo POS App')}</span>
                <ShieldCheck className="w-4 h-4 text-[#DCFCE7]" />
              </div>
              <div className="text-xs font-semibold text-[#DCFCE7]">
                {tx(
                  isEn,
                  'ثبّته مباشرة على أندرويد، آيفون iOS، والكمبيوتر مثل تطبيقات المتجر',
                  'Install directly on Android, iOS & Desktop just like an app store app'
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={installing}
            onClick={() => (isInstallable ? void triggerPlayStoreInstall() : openStoreModal())}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-white text-[#15803D] hover:bg-[#DCFCE7] font-extrabold text-xs inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>
              {isInstallable
                ? tx(isEn, 'تثبيت الآن (ضغطة واحدة)', 'Install Now (1-Tap)')
                : tx(
                    isEn,
                    'تحميل التطبيق للأندرويد وiOS والكمبيوتر',
                    'Get App for Android, iOS & PC'
                  )}
            </span>
          </button>
        </div>
      ) : variant === 'drawer' ? (
        <button
          type="button"
          onClick={() => (isInstallable ? void triggerPlayStoreInstall() : openStoreModal())}
          className="w-full text-start px-4 py-3 rounded-2xl bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] hover:opacity-90 flex items-center justify-between gap-2 font-extrabold text-sm"
        >
          <span className="inline-flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>{resolvedLabel}</span>
          </span>
          <span className="text-[11px] font-bold opacity-80">Android · iOS · PC</span>
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          disabled={installing}
          onClick={() => (isInstallable ? void triggerPlayStoreInstall() : openStoreModal())}
          className="px-3 h-9 rounded-full glass-btn text-[#15803D] dark:text-[#BBF7D0] font-extrabold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          title={tx(
            isEn,
            'تثبيت التطبيق على أندرويد وآيفون والكمبيوتر',
            'Install App on Android, iOS & Desktop'
          )}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{resolvedLabel}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={installing}
          onClick={() => (isInstallable ? void triggerPlayStoreInstall() : openStoreModal())}
          className="px-5 py-3 rounded-full glass-btn text-[#15803D] dark:text-[#BBF7D0] font-extrabold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>{resolvedLabel}</span>
        </button>
      )}

      {/* Play Store Style App Listing Sheet */}
      {modalOpen && (
        <div
          dir={isEn ? 'ltr' : 'rtl'}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#14201A]/60 backdrop-blur-xs no-print"
          onClick={() => setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#FFFFFF] dark:bg-[#18231C] rounded-t-[24px] sm:rounded-[24px] max-w-md w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto space-y-4 border border-[#CFE3D5] dark:border-[#2C3D32] shadow-2xl"
          >
            {/* Store Listing Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <img
                  src="/pwa-192x192.png"
                  alt="Ghazalo POS"
                  className="w-16 h-16 rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] object-cover shadow-xs shrink-0"
                />
                <div className="space-y-0.5">
                  <h3 className="text-lg font-extrabold text-[#14201A] dark:text-[#E8F2EB] leading-tight">
                    {tx(isEn, 'Ghazalo POS · منيو وكاشير', 'Ghazalo POS · Menu & Cashier')}
                  </h3>
                  <div className="text-xs font-bold text-[#15803D] dark:text-[#BBF7D0]">
                    Ghazalo Platform
                  </div>
                  <div className="text-[11px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA] flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-extrabold">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      4.9
                    </span>
                    <span>·</span>
                    <span>{tx(isEn, 'بدون إعلانات', 'Ad-free')}</span>
                    <span>·</span>
                    <span>{tx(isEn, 'حجم خفيف', 'Lightweight')}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-[#F6FBF7] dark:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Store Stats Row */}
            <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-[#CFE3D5] dark:border-[#2C3D32] text-center">
              <div>
                <div className="text-xs font-extrabold text-[#14201A] dark:text-[#E8F2EB]">Android</div>
                <div className="text-[10px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                  {tx(isEn, 'موبايل وتابلت', 'Phone & Tablet')}
                </div>
              </div>
              <div className="border-x border-[#CFE3D5] dark:border-[#2C3D32]">
                <div className="text-xs font-extrabold text-[#14201A] dark:text-[#E8F2EB]">iPhone / iPad</div>
                <div className="text-[10px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                  {tx(isEn, 'نظام iOS', 'iOS App')}
                </div>
              </div>
              <div>
                <div className="text-xs font-extrabold text-[#14201A] dark:text-[#E8F2EB]">Windows / Mac</div>
                <div className="text-[10px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                  {tx(isEn, 'برنامج كاشير PC', 'Desktop POS')}
                </div>
              </div>
            </div>

            {isInstallable ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={installing}
                  onClick={() => void triggerPlayStoreInstall()}
                  className="w-full py-3.5 rounded-2xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {installing
                      ? tx(isEn, `جاري التثبيت (${installProgress}%)...`, `Installing (${installProgress}%)...`)
                      : tx(isEn, 'تثبيت التطبيق الآن', 'Install App Now')}
                  </span>
                </button>
                {installing && (
                  <div className="w-full h-1.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] overflow-hidden">
                    <div
                      style={{ width: `${installProgress}%` }}
                      className="h-full bg-[#15803D] transition-all duration-150"
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
                  className="w-full py-3.5 rounded-2xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>
                    {tx(
                      isEn,
                      'فتح رابط التثبيت المباشر (تثبيت مثل المتجر)',
                      'Open Direct Install Link'
                    )}
                  </span>
                </a>
                <p className="text-[11px] font-semibold text-center text-[#4B5B52] dark:text-[#A3B5AA]">
                  {tx(
                    isEn,
                    'عند فتح الرابط في نافذة المتصفح الرئيسية سيظهر لك زر «تثبيت التطبيق» مباشرة مثل متجر Google Play.',
                    'Open in your main browser tab to trigger direct one-tap app installation.'
                  )}
                </p>
              </div>
            ) : null}

            {/* Store Screenshots Preview */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 rounded-2xl overflow-hidden border border-[#CFE3D5] dark:border-[#2C3D32] h-28 bg-[#14201A]">
                <img
                  src="/screenshot-mobile.png"
                  alt={tx(isEn, 'معاينة التطبيق للموبايل', 'Mobile App Preview')}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="col-span-2 rounded-2xl overflow-hidden border border-[#CFE3D5] dark:border-[#2C3D32] h-28 bg-[#14201A]">
                <img
                  src="/screenshot-desktop.png"
                  alt={tx(isEn, 'معاينة نظام الكاشير POS', 'Desktop POS Preview')}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Platform Tabs for Safari / Desktop Fallback */}
            <div className="grid grid-cols-3 gap-1.5 bg-[#DCFCE7]/70 dark:bg-[#173323] p-1 rounded-2xl">
              {[
                { id: 'android' as const, label: tx(isEn, 'أندرويد', 'Android'), icon: Smartphone },
                { id: 'ios' as const, label: tx(isEn, 'آيفون iOS', 'iPhone iOS'), icon: Tablet },
                { id: 'desktop' as const, label: tx(isEn, 'كمبيوتر PC', 'Desktop PC'), icon: Monitor },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 transition-colors ${
                      activeTab === t.id
                        ? 'bg-[#FFFFFF] dark:bg-[#18231C] text-[#15803D] dark:text-[#BBF7D0] shadow-xs'
                        : 'text-[#4B5B52] dark:text-[#A3B5AA]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'android' && (
              <div className="rounded-2xl bg-[#F6FBF7] dark:bg-[#173323]/70 p-3.5 space-y-2 text-xs font-bold text-[#14201A] dark:text-[#E8F2EB]">
                {isEn ? (
                  <>
                    <div>1. Open the app in <strong>Chrome</strong> on Android.</div>
                    <div>2. Tap <strong>Install App</strong> banner or open <strong>(⋮)</strong> menu and select <strong>Install App</strong>.</div>
                    <div>3. The <strong>Ghazalo</strong> icon is added straight to your home screen.</div>
                  </>
                ) : (
                  <>
                    <div>1. افتح الموقع في متصفح <strong>Chrome</strong> على أندرويد.</div>
                    <div>2. سيظهر لك شريط <strong>تثبيت التطبيق (مثل متجر Play)</strong> أو من قائمة <strong>(⋮)</strong> اختر <strong>تثبيت التطبيق</strong>.</div>
                    <div>3. يظهر التطبيق بأيقونة <strong>Ghazalo</strong> وسط تطبيقات هاتفك بدون الحاجة لملفات خارجية.</div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'ios' && (
              <div className="rounded-2xl bg-[#F6FBF7] dark:bg-[#173323]/70 p-3.5 space-y-2 text-xs font-bold text-[#14201A] dark:text-[#E8F2EB]">
                {isEn ? (
                  <>
                    <div>1. Open the link in <strong>Safari</strong> on your iPhone or iPad.</div>
                    <div className="inline-flex items-center gap-1 flex-wrap">
                      2. Tap the Share button <Share className="w-3.5 h-3.5 text-[#15803D] inline" /> at the bottom.
                    </div>
                    <div>3. Select <strong>Add to Home Screen</strong>.</div>
                  </>
                ) : (
                  <>
                    <div>1. افتح الرابط في متصفح <strong>Safari</strong> على الآيفون أو الآيباد.</div>
                    <div className="inline-flex items-center gap-1 flex-wrap">
                      2. اضغط على أيقونة المشاركة <Share className="w-3.5 h-3.5 text-[#15803D] inline" /> بالأسفل.
                    </div>
                    <div>3. اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'desktop' && (
              <div className="rounded-2xl bg-[#F6FBF7] dark:bg-[#173323]/70 p-3.5 space-y-2 text-xs font-bold text-[#14201A] dark:text-[#E8F2EB]">
                {isEn ? (
                  <>
                    <div>1. Open in <strong>Chrome</strong> or <strong>Edge</strong> on Windows/Mac.</div>
                    <div>2. Click the install icon in the address bar and choose <strong>Install Ghazalo POS</strong>.</div>
                    <div>3. Runs as a standalone desktop POS application.</div>
                  </>
                ) : (
                  <>
                    <div>1. افتح الرابط في <strong>Chrome</strong> أو <strong>Edge</strong> على الكمبيوتر.</div>
                    <div>2. اضغط أيقونة التثبيت في شريط العنوان أو اختر <strong>تثبيت Ghazalo POS</strong>.</div>
                    <div>3. يعمل كبرنامج كاشير مستقل على سطح المكتب مع اختصار مباشر للكاشير.</div>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] font-bold text-[#14532D] dark:text-[#BBF7D0] bg-[#DCFCE7] dark:bg-[#173323] rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#15803D]" />
              <span>
                {tx(
                  isEn,
                  'جاهز أيضاً للتصدير بصيغة APK / AAB لمتجر Google Play عبر PWABuilder.',
                  'Ready for Google Play APK / AAB packaging via PWABuilder.'
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
