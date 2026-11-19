import type { MenuTemplateId } from '../types';

export interface MenuTemplateMeta {
  id: MenuTemplateId;
  name: string;
  tagline: string;
  badge: string;
  cardPreviewClass: string;
}

export const MENU_TEMPLATES: MenuTemplateMeta[] = [
  {
    id: 'classic',
    name: 'الكلاسيكي العصري',
    tagline: 'بطاقات بيضاء وزجاجية متوازنة تناسب كل المطاعم',
    badge: 'الافتراضي',
    cardPreviewClass: 'bg-white border-emerald-200 text-slate-900',
  },
  {
    id: 'luxury',
    name: 'الفاخر الهادئ',
    tagline: 'تصميم راقٍ بحواف أنيقة وإطارات ذهبية للأطباق المميزة',
    badge: 'مطاعم راقية',
    cardPreviewClass: 'bg-[#18221D] border-amber-400/50 text-amber-50',
  },
  {
    id: 'magazine',
    name: 'المجلاتي المصور',
    tagline: 'صور عريضة كبيرة تُبرز تفاصيل المشويات والأطباق',
    badge: 'للصور',
    cardPreviewClass: 'bg-emerald-50/70 border-emerald-300 text-slate-900',
  },
  {
    id: 'compact',
    name: 'السريع المدمج',
    tagline: 'صفوف سريعة واضحة مع أزرار طلب فورية بضغطة واحدة',
    badge: 'سريع',
    cardPreviewClass: 'bg-slate-50 border-slate-300 text-slate-900',
  },
];

export function getMenuTemplateMeta(id?: MenuTemplateId): MenuTemplateMeta {
  return MENU_TEMPLATES.find((t) => t.id === id) || MENU_TEMPLATES[0];
}
