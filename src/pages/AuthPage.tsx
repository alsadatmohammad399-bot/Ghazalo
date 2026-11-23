import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { DemoRestaurantRecord } from '../types';
import { SofrtekLogo } from '../components/BrandLogo';
import { AuthFormPanel, type AuthSuccessMeta } from '../components/AuthFormPanel';

interface AuthPageProps {
  initialMode: 'signup' | 'login';
  onBack: () => void;
  onAuthComplete: (draftMeta: AuthSuccessMeta) => void;
  onStoreLoginSuccess?: (payload: {
    storeSlug: string;
    shopId: string;
    token: string;
    record?: DemoRestaurantRecord | null;
  }) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode,
  onBack,
  onAuthComplete,
  onStoreLoginSuccess,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB] flex flex-col">
      <main className="flex-1 w-full max-w-[560px] mx-auto px-4 py-7 flex flex-col gap-3.5 justify-center">
        <div className="flex items-center justify-between">
          <SofrtekLogo />
          <button
            type="button"
            onClick={onBack}
            className="sf-btn !min-h-[40px] !rounded-[14px] text-xs"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>الرئيسية</span>
          </button>
        </div>

        <div className="sf-card p-5 sm:p-6 space-y-4">
          <AuthFormPanel
            mode={mode}
            onModeChange={setMode}
            onAuthComplete={onAuthComplete}
            onStoreLoginSuccess={onStoreLoginSuccess}
          />
        </div>
      </main>
    </div>
  );
};
