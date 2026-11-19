import type { ExtractedMenuItem, Product } from '../types';

const CATEGORY_RANK_RULES: Array<{ rank: number; keywords: string[] }> = [
  {
    rank: 10,
    keywords: [
      'مشويات',
      'مشاوي',
      'المشويات',
      'كباب',
      'كفتة',
      'كفته',
      'ريش',
      'طرب',
      'نيفا',
      'شيش',
      'تكا',
      'فحم',
      'جريل',
      'ستيك',
      'استيك',
      'grill',
      'bbq',
      'kebab',
      'steak',
    ],
  },
  {
    rank: 20,
    keywords: [
      'أطباق رئيسية',
      'اطباق رئيسية',
      'رئيسية',
      'رئيسي',
      'وجبات',
      'ولائم',
      'فتة',
      'فته',
      'موزة',
      'لحوم',
      'لحم',
      'فراخ',
      'دجاج',
      'بط',
      'حمام',
      'كوارع',
      'ممبار',
      'مأكولات بحرية',
      'بحرية',
      'أسماك',
      'اسماك',
      'سمك',
      'جمبري',
      'main',
      'platter',
      'chicken',
      'meat',
      'seafood',
      'fish',
    ],
  },
  {
    rank: 30,
    keywords: [
      'طواجن',
      'طاجن',
      'محاشي',
      'محشي',
      'أرز',
      'ارز',
      'رز',
      'مكرونة',
      'مكرونه',
      'باستا',
      'كشري',
      'برام',
      'فرن',
      'casserole',
      'tagine',
      'pasta',
      'rice',
    ],
  },
  {
    rank: 40,
    keywords: [
      'بيتزا',
      'فطائر',
      'فطير',
      'كريب',
      'برجر',
      'شاورما',
      'ساندوتش',
      'ساندويتش',
      'سندوتش',
      'حواوشي',
      'رول',
      'توست',
      'فطار',
      'إفطار',
      'افطار',
      'pizza',
      'burger',
      'sandwich',
      'crepe',
      'shawarma',
      'breakfast',
    ],
  },
  {
    rank: 50,
    keywords: [
      'شوربة',
      'شوربه',
      'حساء',
      'سلطة',
      'سلطات',
      'مقبلات',
      'مزة',
      'مزه',
      'فواتح',
      'طحينة',
      'طحينه',
      'بابا غنوج',
      'حمص',
      'متبل',
      'سمبوسك',
      'كبيبة',
      'كبيبه',
      'ورق عنب',
      'soup',
      'salad',
      'appetizer',
      'starter',
      'mezze',
    ],
  },
  {
    rank: 60,
    keywords: [
      'إضافات',
      'اضافات',
      'جانبية',
      'اطباق جانبية',
      'أطباق جانبية',
      'بطاطس',
      'فرايز',
      'خبز',
      'عيش',
      'صوص',
      'صوصات',
      'مخلل',
      'extras',
      'sides',
      'side dish',
      'fries',
      'sauce',
      'bread',
    ],
  },
  {
    rank: 70,
    keywords: [
      'حلويات',
      'حلو',
      'تحلية',
      'كنافة',
      'كنافه',
      'بسبوسة',
      'بسبوسه',
      'أم علي',
      'ام علي',
      'رز بلبن',
      'تورتة',
      'كيك',
      'آيس كريم',
      'ايس كريم',
      'وافل',
      'بان كيك',
      'dessert',
      'sweet',
      'cake',
      'pastry',
      'ice cream',
    ],
  },
  {
    rank: 80,
    keywords: [
      'مشروبات ساخنة',
      'ساخنة',
      'عصائر',
      'عصير',
      'قهوة',
      'قهوه',
      'شاي',
      'نسكافيه',
      'كابتشينو',
      'لاتيه',
      'اسبريسو',
      'سحلب',
      'سموزي',
      'ميلك شيك',
      'كوكتيل',
      'موهيتو',
      'فرابتشينو',
      'coffee',
      'hot drink',
      'tea',
      'juice',
      'smoothie',
      'shake',
    ],
  },
  {
    rank: 90,
    keywords: [
      'مياه',
      'مايه',
      'ميه',
      'ماء',
      'مشروبات غازية',
      'غازية',
      'غازيه',
      'ساقع',
      'مشروبات باردة',
      'مشروبات بارده',
      'مشروبات',
      'كولا',
      'بيبسي',
      'سفن',
      'ميرندا',
      'كانز',
      'صودا',
      'ريد بول',
      'فيروز',
      'water',
      'mineral water',
      'soft drink',
      'soda',
      'cold drink',
      'beverage',
    ],
  },
];

export function getCategoryCulinaryRank(category: string): number {
  const norm = (category || '').trim().toLowerCase();
  if (!norm) return 55;
  for (const rule of CATEGORY_RANK_RULES) {
    if (rule.keywords.some((kw) => norm.includes(kw))) {
      return rule.rank;
    }
  }
  return 55;
}

export function sortMenuCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const rankDiff = getCategoryCulinaryRank(a) - getCategoryCulinaryRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b, 'ar');
  });
}

export function sortExtractedMenuItems(items: ExtractedMenuItem[]): ExtractedMenuItem[] {
  return [...items]
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const rankDiff =
        getCategoryCulinaryRank(a.item.category) - getCategoryCulinaryRank(b.item.category);
      if (rankDiff !== 0) return rankDiff;
      const catCompare = a.item.category.localeCompare(b.item.category, 'ar');
      if (catCompare !== 0) return catCompare;
      const orderA = a.item.sortOrder ?? a.idx;
      const orderB = b.item.sortOrder ?? b.idx;
      return orderA - orderB;
    })
    .map(({ item }, idx) => ({ ...item, sortOrder: idx }));
}

export function sortProductsCulinary(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const rankDiff = getCategoryCulinaryRank(a.category) - getCategoryCulinaryRank(b.category);
    if (rankDiff !== 0) return rankDiff;
    const catCompare = (a.category || '').localeCompare(b.category || '', 'ar');
    if (catCompare !== 0) return catCompare;
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, 'ar');
  });
}
