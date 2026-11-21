import React from 'react';

export const GhazaloLogo: React.FC<{
  compact?: boolean;
  stacked?: boolean;
}> = ({ compact = false, stacked = false }) => {
  return (
    <div
      className={`inline-flex items-center shrink-0 select-none ${
        stacked ? 'flex-col gap-2 text-center' : 'gap-2.5'
      }`}
    >
      <div className="w-11 h-11 rounded-2xl bg-[#FF6A00] flex items-center justify-center shadow-[0_10px_24px_rgba(255,106,0,0.28)] border border-orange-300/40 shrink-0">
        <svg
          width="26"
          height="26"
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Sleek modern orange/white Gazelle antlers & head mark */}
          <path
            d="M12.5 5.5C11.2 8.4 11.4 11.4 13.4 14.2M23.5 5.5C24.8 8.4 24.6 11.4 22.6 14.2"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11.6 8.8H14M22 8.8H24.4"
            stroke="#FFE3CC"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M18 12.2C14.8 12.2 12.4 14.6 12.4 17.7C12.4 21.8 15.6 26.8 18 29.8C20.4 26.8 23.6 21.8 23.6 17.7C23.6 14.6 21.2 12.2 18 12.2Z"
            fill="#FFFFFF"
          />
          {/* Ears */}
          <path
            d="M12.3 15.2L8.8 13.8C9.2 16 10.6 17.2 12.4 17.5M23.7 15.2L27.2 13.8C26.8 16 25.4 17.2 23.6 17.5"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Geometric nose accent */}
          <circle cx="18" cy="24.2" r="1.4" fill="#FF6A00" />
        </svg>
      </div>
      {!compact && (
        <div className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            غزالة
          </span>
          <span
            dir="ltr"
            style={{ fontFamily: "'Cairo', sans-serif" }}
            className="text-lg sm:text-xl font-extrabold tracking-tight text-[#FF6A00]"
          >
            Ghazalo
          </span>
        </div>
      )}
    </div>
  );
};

export const SofrtekLogo = GhazaloLogo;

export const ShopInitialAvatar: React.FC<{
  name: string;
  themeHex?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ name, themeHex = '#FF6A00', size = 'md' }) => {
  const cleanName = (name || 'G').trim();
  const initial = cleanName.charAt(0).toUpperCase();
  const sizeClass =
    size === 'sm'
      ? 'w-10 h-10 text-base rounded-2xl'
      : size === 'lg'
        ? 'w-16 h-16 text-2xl rounded-3xl'
        : 'w-14 h-14 text-xl rounded-2xl';

  return (
    <div
      style={{ backgroundColor: themeHex }}
      className={`${sizeClass} text-white font-extrabold flex items-center justify-center shrink-0 shadow-sm border-2 border-white dark:border-slate-900`}
      aria-label={cleanName}
    >
      {initial}
    </div>
  );
};
