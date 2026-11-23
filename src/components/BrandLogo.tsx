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
      <div className="w-10 h-10 rounded-2xl bg-[#f5f6f6] flex items-center justify-center shadow-[0_6px_16px_rgba(21,128,61,0.18)] border border-[#CFE3D5] dark:border-[#2C3D32] overflow-hidden shrink-0">
        <img
          src="/assets/aistudio/IMG-20261120-WA6738_8ef9b827.jpg"
          alt="Ghazalo"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
      {!compact && (
        <div className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[19px] sm:text-[21px] font-extrabold tracking-tight text-[#14201A] dark:text-[#E8F2EB]">
            غزالو
          </span>
          <span
            dir="ltr"
            className="text-base sm:text-lg font-extrabold tracking-tight text-[#15803D] dark:text-[#4ADE80]"
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
}> = ({ name, themeHex = '#15803D', size = 'md' }) => {
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
      className={`${sizeClass} text-white font-extrabold flex items-center justify-center shrink-0 shadow-sm border-2 border-white dark:border-[#18231C]`}
      aria-label={cleanName}
    >
      {initial}
    </div>
  );
};
