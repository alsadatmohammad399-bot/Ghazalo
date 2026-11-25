import React, { useEffect, useState } from 'react';
import { Bell, Volume2 } from 'lucide-react';
import { isSoundReady, playOrderBeep, subscribeSoundState, unlockOrderSound } from '../utils/orderInbox';
import { tx, useUiLang } from '../utils/uiLang';

/** Visible sound state for the restaurant side. Tapping it unlocks audio and plays a test chime. */
export const OrderSoundBadge: React.FC = () => {
  const { isEn } = useUiLang();
  const [ready, setReady] = useState(isSoundReady());
  useEffect(() => subscribeSoundState(() => setReady(isSoundReady())), []);

  return (
    <button
      type="button"
      data-gz-sound={ready ? 'on' : 'off'}
      onClick={() => {
        unlockOrderSound();
        setTimeout(playOrderBeep, 60);
      }}
      className={`no-print fixed z-40 bottom-3 ${isEn ? 'left-3' : 'right-3'} flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold shadow-lg border ${
        ready
          ? 'bg-[#DCFCE7] text-[#14532D] border-[#86EFAC]'
          : 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D] animate-pulse'
      }`}
    >
      {ready ? <Volume2 className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      {ready
        ? tx(isEn, 'صوت الطلبات شغال (اضغط للتجربة)', 'Order sound on (tap to test)')
        : tx(isEn, 'اضغط لتفعيل صوت الطلبات', 'Tap to enable order sound')}
    </button>
  );
};
