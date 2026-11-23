import React from 'react';

interface PlatformLoaderProps {
  subtitle?: string;
}

export function PlatformLoader({
  subtitle = 'جاري تحميل المنصة...',
}: PlatformLoaderProps) {
  return (
    <div
      dir="rtl"
      className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F6FBF7] dark:bg-[#0F1712] px-6 py-10 relative overflow-hidden"
    >
      {/* Subtle ambient green glow behind the Ghazalo logo card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#15803D]/15 dark:bg-[#15803D]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-[#DCFCE7] dark:bg-[#173323]/50 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-7">
        {/* User's Official Ghazalo Gazelle Logo Frame */}
        <div className="w-full rounded-3xl bg-[#f5f6f6] border border-[#CFE3D5] dark:border-[#2C3D32] shadow-[0_22px_60px_rgba(21,128,61,0.16)] dark:shadow-[0_22px_60px_rgba(0,0,0,0.45)] p-5 sm:p-7 flex items-center justify-center animate-ghazalo-float">
          <img
            src="/assets/aistudio/IMG-20261120-WA6738_8ef9b827.jpg"
            alt="غزالو - Ghazalo منصة منيو مطاعم إلكترونية"
            referrerPolicy="no-referrer"
            className="w-full max-w-[290px] h-auto object-contain select-none rounded-xl"
          />
        </div>

        {/* Green Loading Progress Bar & Arabic Status */}
        <div className="w-full max-w-[230px] flex flex-col items-center gap-3">
          <div className="w-full h-2 rounded-full bg-[#DCFCE7] dark:bg-[#173323] overflow-hidden">
            <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#15803D] via-emerald-500 to-emerald-400 animate-ghazalo-bar" />
          </div>
          <p className="text-sm font-bold text-[#14532D] dark:text-[#BBF7D0] tracking-wide">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
