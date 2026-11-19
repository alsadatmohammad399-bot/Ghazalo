import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || '202600';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface ExtractMenuFileInput {
  fileName?: string;
  mimeType?: string;
  base64Data?: string;
  textContent?: string;
}

interface ExtractMenuRequestBody {
  fileName?: string;
  mimeType?: string;
  base64Data?: string;
  textContent?: string;
  files?: ExtractMenuFileInput[];
  businessName?: string;
  language?: string;
}

const CATEGORY_RANK_RULES: Array<{ rank: number; keywords: string[] }> = [
  {
    rank: 10,
    keywords: [
      'مشويات', 'مشاوي', 'المشويات', 'كباب', 'كفتة', 'كفته', 'ريش', 'طرب',
      'نيفا', 'شيش', 'تكا', 'فحم', 'جريل', 'ستيك', 'استيك', 'grill', 'bbq', 'kebab', 'steak',
    ],
  },
  {
    rank: 20,
    keywords: [
      'أطباق رئيسية', 'اطباق رئيسية', 'رئيسية', 'رئيسي', 'وجبات', 'ولائم', 'فتة', 'فته',
      'موزة', 'لحوم', 'لحم', 'فراخ', 'دجاج', 'بط', 'حمام', 'كوارع', 'ممبار',
      'مأكولات بحرية', 'بحرية', 'أسماك', 'اسماك', 'سمك', 'جمبري', 'main', 'platter', 'chicken', 'meat', 'seafood', 'fish',
    ],
  },
  {
    rank: 30,
    keywords: [
      'طواجن', 'طاجن', 'محاشي', 'محشي', 'أرز', 'ارز', 'رز', 'مكرونة', 'مكرونه',
      'باستا', 'كشري', 'برام', 'فرن', 'casserole', 'tagine', 'pasta', 'rice',
    ],
  },
  {
    rank: 40,
    keywords: [
      'بيتزا', 'فطائر', 'فطير', 'كريب', 'برجر', 'شاورما', 'ساندوتش', 'ساندويتش',
      'سندوتش', 'حواوشي', 'رول', 'توست', 'فطار', 'إفطار', 'افطار', 'pizza', 'burger', 'sandwich', 'crepe', 'shawarma', 'breakfast',
    ],
  },
  {
    rank: 50,
    keywords: [
      'شوربة', 'شوربه', 'حساء', 'سلطة', 'سلطات', 'مقبلات', 'مزة', 'مزه', 'فواتح',
      'طحينة', 'طحينه', 'بابا غنوج', 'حمص', 'متبل', 'سمبوسك', 'كبيبة', 'كبيبه',
      'ورق عنب', 'soup', 'salad', 'appetizer', 'starter', 'mezze',
    ],
  },
  {
    rank: 60,
    keywords: [
      'إضافات', 'اضافات', 'جانبية', 'اطباق جانبية', 'أطباق جانبية', 'بطاطس', 'فرايز',
      'خبز', 'عيش', 'صوص', 'صوصات', 'مخلل', 'extras', 'sides', 'side dish', 'fries', 'sauce', 'bread',
    ],
  },
  {
    rank: 70,
    keywords: [
      'حلويات', 'حلو', 'تحلية', 'كنافة', 'كنافه', 'بسبوسة', 'بسبوسه', 'أم علي', 'ام علي',
      'رز بلبن', 'تورتة', 'كيك', 'آيس كريم', 'ايس كريم', 'وافل', 'بان كيك', 'dessert', 'sweet', 'cake', 'pastry', 'ice cream',
    ],
  },
  {
    rank: 80,
    keywords: [
      'مشروبات ساخنة', 'ساخنة', 'عصائر', 'عصير', 'قهوة', 'قهوه', 'شاي', 'نسكافيه',
      'كابتشينو', 'لاتيه', 'اسبريسو', 'سحلب', 'سموزي', 'ميلك شيك', 'كوكتيل', 'موهيتو',
      'فرابتشينو', 'coffee', 'hot drink', 'tea', 'juice', 'smoothie', 'shake',
    ],
  },
  {
    rank: 90,
    keywords: [
      'مياه', 'مايه', 'ميه', 'ماء', 'مشروبات غازية', 'غازية', 'غازيه', 'ساقع',
      'مشروبات باردة', 'مشروبات بارده', 'مشروبات', 'كولا', 'بيبسي', 'سفن', 'ميرندا',
      'كانز', 'صودا', 'ريد بول', 'فيروز', 'water', 'mineral water', 'soft drink', 'soda', 'cold drink', 'beverage',
    ],
  },
];

function getCategoryCulinaryRank(category: string): number {
  const norm = (category || '').trim().toLowerCase();
  if (!norm) return 55;
  for (const rule of CATEGORY_RANK_RULES) {
    if (rule.keywords.some((kw) => norm.includes(kw))) {
      return rule.rank;
    }
  }
  return 55;
}

type DishFamily =
  | 'grill'
  | 'kofta'
  | 'chicken'
  | 'fish'
  | 'tagine'
  | 'rice'
  | 'pasta'
  | 'pizza'
  | 'burger'
  | 'shawarma'
  | 'crepe'
  | 'soup'
  | 'salad'
  | 'tahini'
  | 'fries'
  | 'dessert'
  | 'coffee'
  | 'tea'
  | 'juice'
  | 'soda'
  | 'water';

const VERIFIED_DISH_FALLBACKS: Record<DishFamily, string> = {
  grill: '/src/assets/images/dish_kebab_kofta_1795092513923.jpg',
  kofta: '/src/assets/images/dish_kebab_kofta_1795092513923.jpg',
  chicken: '/src/assets/images/dish_roasted_chicken_1795092513804.jpg',
  fish: '/src/assets/images/dish_roasted_chicken_1795092513804.jpg',
  tagine: '/src/assets/images/dish_okra_molokhia_1795092514978.jpg',
  rice: '/src/assets/images/dish_vine_leaves_1795092514241.jpg',
  pasta: '/src/assets/images/dish_bechamel_pasta_1795092515180.jpg',
  pizza: '/src/assets/images/dish_cheese_burger_1795092514624.jpg',
  burger: '/src/assets/images/dish_cheese_burger_1795092514624.jpg',
  shawarma: '/src/assets/images/dish_liver_sausage_1795092514076.jpg',
  crepe: '/src/assets/images/dish_croissant_cake_1795092514036.jpg',
  soup: '/src/assets/images/dish_okra_molokhia_1795092514978.jpg',
  salad: '/src/assets/images/dish_caesar_salad_1795092514020.jpg',
  tahini: '/src/assets/images/dish_caesar_salad_1795092514020.jpg',
  fries: '/src/assets/images/dish_cheese_burger_1795092514624.jpg',
  dessert: '/src/assets/images/dish_croissant_cake_1795092514036.jpg',
  coffee: '/src/assets/images/dish_turkish_coffee_1795092513637.jpg',
  tea: '/src/assets/images/dish_turkish_coffee_1795092513637.jpg',
  juice: '/src/assets/images/dish_mint_mojito_1795092514106.jpg',
  soda: '/src/assets/images/dish_mint_mojito_1795092514106.jpg',
  water: '/src/assets/images/dish_mint_mojito_1795092514106.jpg',
};

function inferDishFamily(name: string, category: string, photoQuery?: string): DishFamily {
  const txt = `${name} ${category} ${photoQuery || ''}`.toLowerCase();
  if (/مياه|مايه|ميه|ماء|water|mineral/.test(txt)) return 'water';
  if (/بيبسي|كولا|سفن|ميرندا|كانز|ساقع|غازية|غازيه|صودا|فيروز|pepsi|cola|soda|sprite|fanta/.test(txt)) return 'soda';
  if (/قهوة|قهوه|اسبريسو|لاتيه|كابتشينو|نسكافيه|موكا|coffee|espresso|latte|cappuccino/.test(txt)) return 'coffee';
  if (/شاي|ينسون|نعناع|كركديه|حلبة|tea|mint/.test(txt)) return 'tea';
  if (/عصير|مانجو|فراولة|برتقال|ليمون|جوافة|رمان|كوكتيل|سموزي|شيك|juice|smoothie|shake|mango|orange/.test(txt)) return 'juice';
  if (/كنافة|كنافه|بسبوسة|بسبوسه|أم علي|ام علي|حلو|حلويات|كيك|تورتة|وافل|آيس|dessert|cake|kunafa|sweet/.test(txt)) return 'dessert';
  if (/بطاطس|فرايز|شيبسي|fries|potato/.test(txt)) return 'fries';
  if (/طحينة|طحينه|بابا غنوج|حمص|متبل|صوص|تومية|ثومية|tahini|hummus|dip|sauce/.test(txt)) return 'tahini';
  if (/سلطة|سلطه|خضار|تبولة|فتوش|salad/.test(txt)) return 'salad';
  if (/شوربة|شوربه|لسان عصفور|عدس|حساء|soup/.test(txt)) return 'soup';
  if (/كريب|بان كيك|وافل مالح|crepe/.test(txt)) return 'crepe';
  if (/شاورما|فاهيتا|تورتيلا|ساندوتش|حواوشي|shawarma|sandwich|wrap/.test(txt)) return 'shawarma';
  if (/برجر|تشيز برجر|burger/.test(txt)) return 'burger';
  if (/بيتزا|فطير|فطيرة|مناقيش|pizza/.test(txt)) return 'pizza';
  if (/مكرونة|مكرونه|باستا|بشاميل|اسباجتي|لازانيا|pasta|spaghetti|macaroni/.test(txt)) return 'pasta';
  if (/رز|أرز|ارز|كبسة|مندي|برياني|محشي|كشري|فتة|فته|rice|mandi|biryani|fattah/.test(txt)) return 'rice';
  if (/طاجن|طواجن|برام|بامية|ملوخية|مسقعة|tagine|casserole/.test(txt)) return 'tagine';
  if (/سمك|جمبري|سبيط|كاليماري|سي فود|فيليه|بلطي|بوري|fish|shrimp|seafood/.test(txt)) return 'fish';
  if (/فراخ|دجاج|شيش|بانيه|بروست|مسحب|حمام|بط|chicken|duck|pigeon|wings/.test(txt)) return 'chicken';
  if (/كفتة|كفته|طرب|برجر لحم|kofta/.test(txt)) return 'kofta';
  return 'grill';
}

const mealPhotoCache = new Map<string, string[]>();
const drinkPhotoCache = new Map<string, string[]>();

async function fetchJsonWithTimeout(url: string, timeoutMs = 2500): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GhazaloMenuApp/1.0 (https://ghazalo.app; support@ghazalo.app)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchMealDbImages(queryTerm: string): Promise<string[]> {
  const key = queryTerm.trim().toLowerCase();
  if (!key) return [];
  const cached = mealPhotoCache.get(key);
  if (cached) return cached;

  const data = (await fetchJsonWithTimeout(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(key)}`
  )) as { meals?: Array<{ strMealThumb?: string }> } | null;

  const urls = (data?.meals || [])
    .map((m) => m.strMealThumb || '')
    .filter((u) => u.startsWith('https://') && u.length <= 490);
  mealPhotoCache.set(key, urls);
  return urls;
}

async function searchCocktailDbImages(queryTerm: string): Promise<string[]> {
  const key = queryTerm.trim().toLowerCase();
  if (!key) return [];
  const cached = drinkPhotoCache.get(key);
  if (cached) return cached;

  const data = (await fetchJsonWithTimeout(
    `https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(key)}`
  )) as { drinks?: Array<{ strDrinkThumb?: string }> } | null;

  const urls = (data?.drinks || [])
    .map((d) => d.strDrinkThumb || '')
    .filter((u) => u.startsWith('https://') && u.length <= 490);
  drinkPhotoCache.set(key, urls);
  return urls;
}

async function resolveDishPhotoUrl(
  photoQuery: string,
  name: string,
  category: string,
  itemIndex: number
): Promise<string> {
  const family = inferDishFamily(name, category, photoQuery);
  const tokens = (photoQuery || '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const isDrinkFamily = family === 'coffee' || family === 'tea' || family === 'juice';
  if (family === 'water' || family === 'soda') {
    return VERIFIED_DISH_FALLBACKS[family];
  }

  try {
    if (isDrinkFamily) {
      for (const candidate of [photoQuery, tokens[0], family]) {
        if (!candidate) continue;
        const urls = await searchCocktailDbImages(candidate);
        if (urls.length > 0) {
          return urls[itemIndex % urls.length];
        }
      }
    } else {
      for (const candidate of [photoQuery, tokens[0], family === 'grill' ? 'kebab' : family]) {
        if (!candidate) continue;
        const urls = await searchMealDbImages(candidate);
        if (urls.length > 0) {
          return urls[itemIndex % urls.length];
        }
      }
    }
  } catch {
    // Fallback cleanly below
  }

  return VERIFIED_DISH_FALLBACKS[family] || VERIFIED_DISH_FALLBACKS.grill;
}

const app = express();

async function startServer() {
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'ghazalo-api' });
  });

  app.post('/api/admin/verify-pin', (req: Request, res: Response) => {
    const body = req.body as { pin?: string };
    const submitted = String(body.pin || '').trim();
    if (!submitted || submitted !== DEFAULT_ADMIN_PIN) {
      res.status(401).json({ ok: false, error: 'الرقم السري غير صحيح.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/ai/extract-menu', async (req: Request, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error: 'مفتاح Gemini API غير متوفر في إعدادات الخادم (Secrets). يرجى إضافته للمتابعة.',
        });
        return;
      }

      const body = req.body as ExtractMenuRequestBody;
      const { fileName, mimeType, base64Data, textContent, files, businessName, language } = body;

      const inputFiles: ExtractMenuFileInput[] =
        Array.isArray(files) && files.length > 0
          ? files
          : base64Data || textContent
            ? [{ fileName, mimeType, base64Data, textContent }]
            : [];

      const validFiles = inputFiles.filter((f) => Boolean(f.base64Data || f.textContent));

      if (validFiles.length === 0) {
        res.status(400).json({ error: 'يرجى رفع صورة أو أكثر للمنيو أو ملف PDF أو Excel أولاً.' });
        return;
      }

      const fileNamesList = validFiles.map((f, i) => f.fileName || `صفحة ${i + 1}`).join('، ');

      const promptText = `أنت خبير رقمنة وتنظيم قوائم الطعام والمتاجر لمنصة Ghazalo.
مهمتك استخراج جميع الأقسام والأصناف والأسعار والأوصاف والمتغيرات بدقة عالية من جميع صفحات وصور المنيو المرفقة (${validFiles.length} ملفات) للنشاط "${businessName || 'متجر'}".
لغة المنيو المفضلة: ${language || 'العربية'}.
الملفات المرفقة: ${fileNamesList}.

القواعد الصارمة:
1. افحص كل الصور والملفات المرفقة دون استثناء واجمع كل الأصناف منها في قائمة واحدة موحدة.
2. **ترتيب الأقسام والأصناف (مهم جداً)**: رتب الأقسام والأصناف ترتيباً منطقياً احترافياً للمطاعم يبدأ بالأطباق الرئيسية الثقيلة وينتهي بالمياه والمشروبات الغازية بالترتيب التالي:
   أولاً: المشويات ومشويات الفحم والكباب والكفتة والستيك
   ثانياً: الأطباق الرئيسية والوجبات والفراخ واللحوم والأسماك
   ثالثاً: الطواجن والمحاشي والأرز والمكرونات
   رابعاً: البيتزا والفطائر والكريب والشاورما والساندوتشات والبرجر
   خامساً: الشوربة والسلطات والمقبلات
   سادساً: الإضافات والبطاطس والصوصات
   سابعاً: الحلويات
   ثامناً: المشروبات الساخنة والعصائر الطازجة
   تاسعاً (في آخر القائمة): المشروبات الغازية (الساقع) والمياه المعدنية (المايه)
3. استخرج كل صنف مع اسمه الواضح، القسم التابع له، سعره كرقم (إذا وُجد أكثر من حجم، ضع السعر الأساسي واذكر الأحجام في variants مثل "وسط - 120" أو "كبير - 180"). إذا لم يوجد سعر ضع 0.
4. لكل صنف اكتب في حقل photoQuery اسم الطبق أو المشروب بالإنجليزية بكلمة أو كلمتين واضحتين للبحث عن صورته الحقيقية (مثال: "Kofta kebab", "Grilled chicken", "Shawarma", "Lentil soup", "Tahini", "French fries", "Kunafa", "Mango juice", "Cola", "Bottled water").
5. لا تبتكر أصنافاً غير موجودة في الملفات المرفقة، ولا تكرر نفس الصنف إذا ظهر في أكثر من صورة.`;

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      for (const f of validFiles) {
        if (f.base64Data && f.mimeType) {
          parts.push({
            inlineData: {
              mimeType: f.mimeType,
              data: f.base64Data,
            },
          });
        }
        if (f.textContent) {
          parts.push({
            text: `محتوى جدول المنيو (${f.fileName || 'Excel'}):\n${f.textContent.slice(0, 50000)}`,
          });
        }
      }

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              categories: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'أسماء الأقسام مرتبة من المشويات والأطباق الرئيسية أولاً إلى الحلويات والمشروبات والمياه أخيراً.',
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'اسم الصنف' },
                    category: { type: Type.STRING, description: 'اسم القسم' },
                    price: { type: Type.NUMBER, description: 'السعر كرقم' },
                    description: { type: Type.STRING, description: 'وصف مختصر للصنف إن وجد' },
                    photoQuery: {
                      type: Type.STRING,
                      description: 'اسم الطبق أو المشروب بالإنجليزية للبحث عن صورة حقيقية له (كلمة أو كلمتان)',
                    },
                    variants: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'المتغيرات أو الأحجام مثل كبير، وسط، إضافات',
                    },
                  },
                  required: ['name', 'category', 'price', 'photoQuery'],
                },
              },
            },
            required: ['categories', 'items'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        categories?: string[];
        items?: Array<{
          name: string;
          category: string;
          price: number;
          description?: string;
          photoQuery?: string;
          variants?: string[];
        }>;
      };

      const cleanedRaw = (parsed.items || [])
        .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 0)
        .map((item, idx) => ({
          name: item.name.trim().slice(0, 160),
          category: (item.category || 'أصناف متنوعة').trim().slice(0, 80),
          price: Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? Number(item.price) : 0,
          description: (item.description || '').trim().slice(0, 400),
          photoQuery: (item.photoQuery || '').trim().slice(0, 80),
          variants: Array.isArray(item.variants)
            ? item.variants.filter((v) => typeof v === 'string' && v.trim()).slice(0, 20)
            : [],
          rawIdx: idx,
        }));

      // Enforce strict culinary sort: Grills -> Mains -> Casseroles/Rice -> Sandwiches/Pizza -> Soups/Salads -> Extras -> Desserts -> Hot/Juices -> Water/Soda
      cleanedRaw.sort((a, b) => {
        const rankDiff = getCategoryCulinaryRank(a.category) - getCategoryCulinaryRank(b.category);
        if (rankDiff !== 0) return rankDiff;
        const catCompare = a.category.localeCompare(b.category, 'ar');
        if (catCompare !== 0) return catCompare;
        return a.rawIdx - b.rawIdx;
      });

      // Resolve real dish photos concurrently in controlled batches
      const resolvedItems: Array<{
        name: string;
        category: string;
        price: number;
        description: string;
        variants: string[];
        imageUrl: string;
        sortOrder: number;
      }> = [];

      const batchSize = 8;
      for (let start = 0; start < cleanedRaw.length; start += batchSize) {
        const chunk = cleanedRaw.slice(start, start + batchSize);
        const photos = await Promise.all(
          chunk.map((item, offset) =>
            resolveDishPhotoUrl(item.photoQuery, item.name, item.category, start + offset)
          )
        );
        chunk.forEach((item, offset) => {
          resolvedItems.push({
            name: item.name,
            category: item.category,
            price: item.price,
            description: item.description,
            variants: item.variants,
            imageUrl: photos[offset] || VERIFIED_DISH_FALLBACKS.grill,
            sortOrder: start + offset,
          });
        });
      }

      const categorySet = new Set<string>();
      for (const item of resolvedItems) {
        categorySet.add(item.category);
      }
      for (const cat of parsed.categories || []) {
        if (typeof cat === 'string' && cat.trim()) {
          categorySet.add(cat.trim().slice(0, 80));
        }
      }

      const sortedCategories = Array.from(categorySet).sort((a, b) => {
        const rankDiff = getCategoryCulinaryRank(a) - getCategoryCulinaryRank(b);
        if (rankDiff !== 0) return rankDiff;
        return a.localeCompare(b, 'ar');
      });

      res.json({
        categories: sortedCategories,
        items: resolvedItems,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'حدث خطأ أثناء تحليل المنيو بالذكاء الاصطناعي.';
      console.error('Gemini extract-menu error:', error);
      res.status(500).json({ error: message });
    }
  });

  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(__dirname, 'dist');
      app.use(express.static(distDir));
      app.get('/{*splat}', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Ghazalo server listening on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
