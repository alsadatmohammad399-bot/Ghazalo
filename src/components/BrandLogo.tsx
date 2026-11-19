import React from 'react';

export const GhazaloLogo: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  return (
    <div className="inline-flex items-center gap-2.5 shrink-0 select-none">
      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 flex items-center justify-center shadow-sm border border-emerald-400/30 shrink-0">
        <svg
          width="24"
          height="24"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Golden cloche crown spark */}
          <path
            d="M16 4.5C17.2 6.8 18.8 8.2 21 9.2C18.8 10.2 17.2 11.6 16 13.9C14.8 11.6 13.2 10.2 11 9.2C13.2 8.2 14.8 6.8 16 4.5Z"
            fill="#FBBF24"
          />
          {/* Sleek G culinary arch & serving tray */}
          <path
            d="M23.5 14.5C21.8 12.6 19.1 11.5 16 11.5C10.5 11.5 6.5 15.1 6.5 19.5C6.5 23.9 10.5 27.2 16.2 27.2C20.9 27.2 24.7 24.7 25.3 20.6H16.5"
            stroke="#FFFFFF"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Base plate underline */}
          <path
            d="M9 29.5H23"
            stroke="#FBBF24"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {!compact && (
        <span
          dir="ltr"
          style={{ fontFamily: "'Outfit', 'Cairo', sans-serif" }}
          className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap inline-flex items-baseline"
        >
          Ghazalo
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5 inline-block" aria-hidden="true" />
        </span>
      )}
    </div>
  );
};

export const SofrtekLogo = GhazaloLogo;

export const ShopInitialAvatar: React.FC<{
  name: string;
  themeHex?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ name, themeHex = '#16A34A', size = 'md' }) => {
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
