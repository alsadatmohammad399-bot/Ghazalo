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
      className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f6f8f7] dark:bg-slate-950 px-6 py-10 relative overflow-hidden"
    >
      {/* Subtle ambient teal/emerald glow behind the logo card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-teal-400/15 dark:bg-teal-500/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-amber-300/15 dark:bg-amber-400/10 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-7">
        {/* Uploaded Ghazalo Brand Logo Frame */}
        <div className="w-full rounded-3xl bg-[#f5f6f6] border border-teal-900/10 dark:border-white/15 shadow-[0_22px_60px_rgba(13,92,99,0.12)] dark:shadow-[0_22px_60px_rgba(0,0,0,0.45)] p-5 sm:p-7 flex items-center justify-center animate-ghazalo-float">
          <img
            src="/assets/aistudio/IMG-20261120-WA6738_8ef9b827.jpg"
            alt="غزالو - Ghazalo منصة منيو مطاعم إلكترونية"
            className="w-full max-w-[290px] h-auto object-contain select-none"
          />
        </div>

        {/* Sleek Loading Progress Bar & Arabic Status */}
        <div className="w-full max-w-[230px] flex flex-col items-center gap-3">
          <div className="w-full h-1.5 rounded-full bg-teal-950/10 dark:bg-slate-800 overflow-hidden">
            <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#0d5c63] via-emerald-600 to-amber-500 animate-ghazalo-bar" />
          </div>
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300 tracking-wide">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
