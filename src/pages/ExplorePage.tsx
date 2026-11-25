import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { Search, Store, UtensilsCrossed } from 'lucide-react';
import { auth } from '../firebase';
import { getStoredAuthSession } from '../utils/storeRegistry';
import { getShopThemeHex } from '../utils/calculations';
import { tx, useUiLang } from '../utils/uiLang';

interface ExploreRestaurant {
  storeSlug: string;
  nameAr: string;
  nameEn: string;
  logoUrl: string;
  coverImage: string;
  menuTemplate: string;
  themeColor: string;
  productCount: number;
  photos: string[];
}

export const ExplorePage: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
  const { isEn } = useUiLang();
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState<boolean>(() => Boolean(getStoredAuthSession().token));
  const [authChecked, setAuthChecked] = useState(false);
  const [list, setList] = useState<ExploreRestaurant[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setLoggedIn(true);
      setAuthChecked(true);
    });
    const t = setTimeout(() => setAuthChecked(true), 2500);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    fetch('/api/explore')
      .then((r) => r.json())
      .then((j: { restaurants?: ExploreRestaurant[] }) => setList(j.restaurants || []))
      .catch(() => setList([]));
  }, [loggedIn]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!list) return [];
    if (!t) return list;
    return list.filter((r) => `${r.nameAr} ${r.nameEn} ${r.storeSlug}`.toLowerCase().includes(t));
  }, [list, q]);

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      className={`${darkMode ? 'dark ' : ''}min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] text-[#14201A] dark:text-[#E8F2EB]`}
    >
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-[#18231C]/90 backdrop-blur border-b border-[#CFE3D5] dark:border-[#2C3D32]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm font-bold text-[#15803D] dark:text-[#BBF7D0]"
          >
            {tx(isEn, 'رجوع', 'Back')}
          </button>
          <h1 className="text-base sm:text-lg font-black">{tx(isEn, 'استكشاف المطاعم', 'Explore restaurants')}</h1>
          <span className="w-10" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {!loggedIn && authChecked ? (
          <div className="mx-auto max-w-sm text-center rounded-[24px] bg-white dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] p-8 space-y-4">
            <Store className="w-10 h-10 mx-auto text-[#15803D]" />
            <p className="font-extrabold">
              {tx(isEn, 'سجّل دخولك علشان تشوف المطاعم والمنيوهات', 'Sign in to browse restaurants and menus')}
            </p>
            <p className="text-sm text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'التصفح مجاني ومفتوح لكل المسجلين، بدون تفعيل.', 'Browsing is free for every registered user, no activation needed.')}
            </p>
            <div className="flex gap-2 justify-center">
              <button type="button" onClick={() => navigate('/login')} className="px-5 py-2.5 rounded-full bg-[#15803D] text-white font-extrabold text-sm">
                {tx(isEn, 'دخول', 'Sign in')}
              </button>
              <button type="button" onClick={() => navigate('/signup')} className="px-5 py-2.5 rounded-full border border-[#15803D] text-[#15803D] dark:text-[#BBF7D0] font-extrabold text-sm">
                {tx(isEn, 'حساب جديد', 'Sign up')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative mb-5">
              <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[#4B5B52] dark:text-[#A3B5AA]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tx(isEn, 'ابحث باسم المطعم', 'Search by restaurant name')}
                className="w-full ps-10 pe-4 py-3 rounded-2xl bg-white dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] text-sm font-semibold outline-none focus:border-[#15803D]"
              />
            </div>

            {list === null ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-56 rounded-[24px] bg-white dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 space-y-3 text-[#4B5B52] dark:text-[#A3B5AA]">
                <UtensilsCrossed className="w-10 h-10 mx-auto opacity-60" />
                <p className="font-bold">
                  {q ? tx(isEn, 'مفيش نتيجة بالاسم ده', 'No restaurants match that name') : tx(isEn, 'لسه مفيش مطاعم عليها منيو، ارجع بعد شوية', 'No restaurant menus yet, check back soon')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((r) => {
                  const hex = getShopThemeHex(r.themeColor);
                  const name = isEn ? r.nameEn || r.nameAr : r.nameAr || r.nameEn;
                  const hero = r.coverImage || r.photos[0] || '';
                  return (
                    <button
                      key={r.storeSlug}
                      type="button"
                      onClick={() => navigate(`/menu/${r.storeSlug}?explore=1`)}
                      className="group text-start rounded-[24px] overflow-hidden bg-white dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >
                      <div className="relative h-36" style={{ background: `linear-gradient(135deg, ${hex}, ${hex}99)` }}>
                        {hero && <img src={hero} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        {r.logoUrl && (
                          <img src={r.logoUrl} alt="" loading="lazy" className="absolute bottom-3 start-3 w-12 h-12 rounded-2xl object-cover bg-white border-2 border-white shadow" />
                        )}
                      </div>
                      <div className="p-4 space-y-1">
                        <div className="font-black text-base leading-snug break-words">{name}</div>
                        <div className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
                          {tx(isEn, `${r.productCount} صنف في المنيو`, `${r.productCount} items on the menu`)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
