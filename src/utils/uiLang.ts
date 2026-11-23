import { useEffect, useState } from 'react';
import type { MenuTemplateId, Shop } from '../types';

export type UiLang = 'ar' | 'en';

export const UI_LANG_STORAGE_KEY = 'ghazalo_ui_lang';
const UI_LANG_EVENT = 'ghazalo-lang-change';

export function getStoredUiLang(): UiLang {
  try {
    const raw = localStorage.getItem(UI_LANG_STORAGE_KEY);
    return raw === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

export function applyDocumentLang(lang: UiLang): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
}

export function setStoredUiLang(lang: UiLang): void {
  try {
    localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
  } catch {
    // ignore storage errors
  }
  applyDocumentLang(lang);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<UiLang>(UI_LANG_EVENT, { detail: lang }));
  }
}

export function useUiLang() {
  const [lang, setLangState] = useState<UiLang>(() => getStoredUiLang());

  useEffect(() => {
    applyDocumentLang(lang);
  }, [lang]);

  useEffect(() => {
    const onCustom = (evt: Event) => {
      const next = (evt as CustomEvent<UiLang>).detail;
      if (next === 'ar' || next === 'en') {
        setLangState(next);
      }
    };
    const onStorage = (evt: StorageEvent) => {
      if (evt.key === UI_LANG_STORAGE_KEY) {
        setLangState(evt.newValue === 'en' ? 'en' : 'ar');
      }
    };
    window.addEventListener(UI_LANG_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(UI_LANG_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setLang = (next: UiLang) => {
    setLangState(next);
    setStoredUiLang(next);
  };

  const toggleLang = () => {
    setLang(lang === 'en' ? 'ar' : 'en');
  };

  return {
    lang,
    isEn: lang === 'en',
    setLang,
    toggleLang,
  };
}

export function tx<T>(isEn: boolean, ar: T, en: T): T {
  return isEn ? en : ar;
}

export function getShopDisplayName(shop: Pick<Shop, 'nameAr' | 'nameEn'>, isEn: boolean): string {
  if (isEn && shop.nameEn && shop.nameEn.trim()) {
    return shop.nameEn;
  }
  return shop.nameAr;
}

export function translateThemeColor(colorAr: string, isEn: boolean): string {
  if (!isEn) return colorAr;
  const map: Record<string, string> = {
    برتقالي: 'Orange',
    أخضر: 'Green',
    أحمر: 'Red',
    'أزرق مخضر': 'Teal',
    أسود: 'Black',
    'لون آخر': 'Custom',
  };
  return map[colorAr] || colorAr;
}

export function translateTemplateMeta(
  id: MenuTemplateId,
  fallbackName: string,
  fallbackTagline: string,
  isEn: boolean
): { name: string; tagline: string } {
  if (!isEn) {
    return { name: fallbackName, tagline: fallbackTagline };
  }
  const map: Record<MenuTemplateId, { name: string; tagline: string }> = {
    classic: { name: 'Classic', tagline: 'Traditional warm menu with bordered cards' },
    modern: { name: 'Modern', tagline: 'Bold full-width photo cards & sleek look' },
    minimal: { name: 'Minimal', tagline: 'Clean spacious layout focusing on items' },
    compact: { name: 'Compact', tagline: 'Dense grid showing more dishes per screen' },
    royal: {
      name: 'Royal Bistro + AI Chef',
      tagline: 'Signature Navy/Ivory & Gold storefront with interactive AI Chef Assistant',
    },
  };
  return map[id] || { name: fallbackName, tagline: fallbackTagline };
}
