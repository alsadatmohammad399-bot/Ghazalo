import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || '202600';
const TOKEN_SIGNING_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const STORE_REGISTRY_PATH = '/tmp/ghazalo_store_registry.json';

interface ServerStoreCredential {
  shopId: string;
  storeSlug: string;
  nameAr: string;
  email: string;
  phone: string;
  passwordSalt: string;
  passwordHash: string;
  resetCode?: string;
  resetCodeExpiresAt?: number;
  updatedAt: number;
}

interface PublicMenuSnapshot {
  shopId: string;
  storeSlug: string;
  shop: Record<string, unknown>;
  products: Record<string, unknown>[];
  updatedAt: number;
}

interface ServerRegistryState {
  adminPin?: string;
  forceZeroFeesGlobally: boolean;
  stores: Record<string, ServerStoreCredential>;
  publicMenus: Record<string, PublicMenuSnapshot>;
}

function loadRegistryState(): ServerRegistryState {
  try {
    if (fs.existsSync(STORE_REGISTRY_PATH)) {
      const raw = fs.readFileSync(STORE_REGISTRY_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ServerRegistryState>;
      return {
        adminPin: parsed.adminPin,
        forceZeroFeesGlobally: Boolean(parsed.forceZeroFeesGlobally),
        stores: parsed.stores || {},
        publicMenus: parsed.publicMenus || {},
      };
    }
  } catch {
    // ignore read error on cold start
  }
  return { forceZeroFeesGlobally: false, stores: {}, publicMenus: {} };
}

function persistRegistryState(state: ServerRegistryState): void {
  try {
    fs.writeFileSync(STORE_REGISTRY_PATH, JSON.stringify(state), 'utf8');
  } catch {
    // non-blocking in read-only runtimes
  }
}

let serverRegistry: ServerRegistryState = loadRegistryState();

function hashPasswordScrypt(password: string, salt?: string): { salt: string; hash: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { salt: usedSalt, hash: derived };
}

function verifyPasswordScrypt(password: string, salt: string, hash: string): boolean {
  if (!salt || !hash) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

function signToken(payload: Record<string, unknown>, ttlMs = 7 * 24 * 60 * 60 * 1000): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + ttlMs }),
    'utf8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SIGNING_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedToken(token: string): Record<string, unknown> | null {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto
      .createHmac('sha256', TOKEN_SIGNING_SECRET)
      .update(body)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (typeof decoded.exp === 'number' && Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

function requireAdminAuth(req: Request, res: Response): boolean {
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = verifySignedToken(bearer);
  if (!payload || payload.role !== 'admin') {
    res.status(401).json({ ok: false, error: 'صلاحية الإدارة مطلوبة.' });
    return false;
  }
  return true;
}

function normalizeSlugServer(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?menu\//i, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

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
    rank: 5,
    keywords: [
      'عروض', 'عرض', 'عروض اليوم', 'عروض خاصة', 'عروض التوفير', 'باقات', 'باقة',
      'بوكسات', 'بوكس', 'توفير', 'خصومات', 'offers', 'offer', 'deals', 'bundles', 'combo',
    ],
  },
  {
    rank: 10,
    keywords: [
      'مشويات', 'مشاوي', 'المشويات', 'كباب', 'كفتة', 'كفته', 'ريش', 'طرب',
      'نيفا', 'شيش', 'تكا', 'فحم', 'جريل', 'ستيك', 'استيك', 'جزارة', 'لحوم طازجة',
      'لحم بلدي', 'كندوز', 'بتلو', 'ضاني', 'مفروم', 'بوفتيك', 'انتركوت', 'فلتو', 'عرق',
      'grill', 'bbq', 'kebab', 'steak', 'butcher', 'fresh meat',
    ],
  },
  {
    rank: 20,
    keywords: [
      'أطباق رئيسية', 'اطباق رئيسية', 'رئيسية', 'رئيسي', 'وجبات', 'ولائم', 'فتة', 'فته',
      'موزة', 'لحوم', 'لحم', 'لحمة', 'فراخ', 'فرخة', 'فرخه', 'دجاج', 'دواجن', 'طيور',
      'بط', 'حمام', 'كوارع', 'ممبار', 'كبدة', 'سجق',
      'مأكولات بحرية', 'بحرية', 'أسماك', 'اسماك', 'سمك', 'جمبري', 'main', 'platter', 'chicken', 'poultry', 'meat', 'seafood', 'fish',
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
  if (/فراخ|فرخة|فرخه|دواجن|طيور|دجاج|شيش|بانيه|بروست|مسحب|حمام|بط|chicken|duck|pigeon|wings|poultry/.test(txt)) return 'chicken';
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
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'ghazalo-api' });
  });

  app.get('/api/platform-config', (_req: Request, res: Response) => {
    res.json({ forceZeroFeesGlobally: Boolean(serverRegistry.forceZeroFeesGlobally) });
  });

  app.post('/api/admin/verify-pin', (req: Request, res: Response) => {
    const body = req.body as { pin?: string };
    const submitted = String(body.pin || '').trim();
    const expectedPin = serverRegistry.adminPin || DEFAULT_ADMIN_PIN;
    if (!submitted || submitted !== expectedPin) {
      res.status(401).json({ ok: false, error: 'الرقم السري غير صحيح.' });
      return;
    }
    const adminToken = signToken({ role: 'admin' }, 24 * 60 * 60 * 1000);
    res.json({ ok: true, adminToken });
  });

  app.post('/api/admin/update-pin', (req: Request, res: Response) => {
    if (!requireAdminAuth(req, res)) return;
    const body = req.body as { newPin?: string };
    const clean = String(body.newPin || '').trim().slice(0, 32);
    if (clean.length < 4) {
      res.status(400).json({ ok: false, error: 'الرقم السري يجب ألا يقل عن 4 أحرف.' });
      return;
    }
    serverRegistry.adminPin = clean;
    persistRegistryState(serverRegistry);
    res.json({ ok: true });
  });

  app.post('/api/admin/global-settings', (req: Request, res: Response) => {
    if (!requireAdminAuth(req, res)) return;
    const body = req.body as { forceZeroFeesGlobally?: boolean };
    serverRegistry.forceZeroFeesGlobally = Boolean(body.forceZeroFeesGlobally);
    persistRegistryState(serverRegistry);
    res.json({ ok: true, forceZeroFeesGlobally: serverRegistry.forceZeroFeesGlobally });
  });

  app.get('/api/admin/store-codes', (req: Request, res: Response) => {
    if (!requireAdminAuth(req, res)) return;
    const items = Object.values(serverRegistry.stores).map((s) => ({
      shopId: s.shopId,
      storeSlug: s.storeSlug,
      nameAr: s.nameAr,
      email: s.email,
      phone: s.phone,
      resetCode: s.resetCode && (!s.resetCodeExpiresAt || Date.now() < s.resetCodeExpiresAt) ? s.resetCode : undefined,
      resetCodeExpiresAt: s.resetCodeExpiresAt,
    }));
    res.json({ ok: true, stores: items });
  });

  app.post('/api/admin/generate-code', (req: Request, res: Response) => {
    if (!requireAdminAuth(req, res)) return;
    const body = req.body as {
      shopId?: string;
      storeSlug?: string;
      nameAr?: string;
      email?: string;
      phone?: string;
    };
    const slug = normalizeSlugServer(body.storeSlug || body.shopId || '');
    const key = slug || String(body.shopId || '').trim();
    if (!key) {
      res.status(400).json({ ok: false, error: 'معرف المتجر مطلوب.' });
      return;
    }
    const existing = serverRegistry.stores[key];
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = Date.now() + 30 * 60 * 1000;
    serverRegistry.stores[key] = {
      shopId: body.shopId || existing?.shopId || key,
      storeSlug: slug || existing?.storeSlug || key,
      nameAr: String(body.nameAr || existing?.nameAr || key).slice(0, 120),
      email: String(body.email || existing?.email || '').slice(0, 200),
      phone: String(body.phone || existing?.phone || '').slice(0, 40),
      passwordSalt: existing?.passwordSalt || '',
      passwordHash: existing?.passwordHash || '',
      resetCode: code,
      resetCodeExpiresAt: expiresAt,
      updatedAt: Date.now(),
    };
    persistRegistryState(serverRegistry);
    res.json({ ok: true, code, expiresAt });
  });

  app.post('/api/admin/store-password', (req: Request, res: Response) => {
    if (!requireAdminAuth(req, res)) return;
    const body = req.body as {
      shopId?: string;
      storeSlug?: string;
      nameAr?: string;
      email?: string;
      phone?: string;
      newPassword?: string;
    };
    const slug = normalizeSlugServer(body.storeSlug || body.shopId || '');
    const key = slug || String(body.shopId || '').trim();
    const cleanPass = String(body.newPassword || '').trim();
    if (!key || cleanPass.length < 4) {
      res.status(400).json({ ok: false, error: 'كلمة السر الجديدة يجب أن تكون 4 أحرف على الأقل.' });
      return;
    }
    const existing = serverRegistry.stores[key];
    const { salt, hash } = hashPasswordScrypt(cleanPass);
    serverRegistry.stores[key] = {
      shopId: body.shopId || existing?.shopId || key,
      storeSlug: slug || existing?.storeSlug || key,
      nameAr: String(body.nameAr || existing?.nameAr || key).slice(0, 120),
      email: String(body.email || existing?.email || '').slice(0, 200),
      phone: String(body.phone || existing?.phone || '').slice(0, 40),
      passwordSalt: salt,
      passwordHash: hash,
      resetCode: undefined,
      resetCodeExpiresAt: undefined,
      updatedAt: Date.now(),
    };
    persistRegistryState(serverRegistry);
    res.json({ ok: true });
  });

  app.post('/api/store-auth/register', (req: Request, res: Response) => {
    const body = req.body as {
      shopId?: string;
      storeSlug?: string;
      nameAr?: string;
      email?: string;
      phone?: string;
      password?: string;
    };
    const slug = normalizeSlugServer(body.storeSlug || body.shopId || '');
    const pass = String(body.password || '');
    if (!slug || pass.length < 4) {
      res.status(400).json({ ok: false, error: 'يرجى إدخال عنوان المتجر وكلمة السر.' });
      return;
    }
    const { salt, hash } = hashPasswordScrypt(pass);
    const cred: ServerStoreCredential = {
      shopId: body.shopId || slug,
      storeSlug: slug,
      nameAr: String(body.nameAr || slug).slice(0, 120),
      email: String(body.email || '').slice(0, 200),
      phone: String(body.phone || '').slice(0, 40),
      passwordSalt: salt,
      passwordHash: hash,
      updatedAt: Date.now(),
    };
    serverRegistry.stores[slug] = cred;
    persistRegistryState(serverRegistry);
    const token = signToken({ role: 'merchant', storeSlug: slug, shopId: cred.shopId });
    res.json({ ok: true, token, storeSlug: slug, shopId: cred.shopId });
  });

  app.post('/api/store-auth/login', (req: Request, res: Response) => {
    const body = req.body as { storeSlug?: string; identifier?: string; password?: string };
    const rawId = String(body.identifier || body.storeSlug || '').trim().toLowerCase();
    const slug = normalizeSlugServer(rawId);
    const digits = rawId.replace(/[^0-9]/g, '');
    const normDigits =
      digits.startsWith('20') && digits.length >= 12
        ? `0${digits.slice(2)}`
        : digits.startsWith('1') && digits.length === 10
          ? `0${digits}`
          : digits;
    const pass = String(body.password || '');
    const match = Object.values(serverRegistry.stores).find((s) => {
      if (slug && s.storeSlug === slug) return true;
      if (rawId && s.shopId.toLowerCase() === rawId) return true;
      if (rawId && s.email && s.email.toLowerCase() === rawId) return true;
      if (normDigits && s.phone) {
        const sDigits = s.phone.replace(/[^0-9]/g, '');
        const sNorm =
          sDigits.startsWith('20') && sDigits.length >= 12
            ? `0${sDigits.slice(2)}`
            : sDigits.startsWith('1') && sDigits.length === 10
              ? `0${sDigits}`
              : sDigits;
        if (sNorm === normDigits) return true;
      }
      return false;
    });
    if (!match || !verifyPasswordScrypt(pass, match.passwordSalt, match.passwordHash)) {
      res.status(401).json({ ok: false, error: 'بيانات الدخول أو كلمة السر غير صحيحة.' });
      return;
    }
    const token = signToken({ role: 'merchant', storeSlug: match.storeSlug, shopId: match.shopId });
    res.json({
      ok: true,
      token,
      storeSlug: match.storeSlug,
      shopId: match.shopId,
      nameAr: match.nameAr,
      email: match.email,
      phone: match.phone,
    });
  });

  app.post('/api/store-auth/forgot-request', (req: Request, res: Response) => {
    const body = req.body as { identifier?: string };
    const q = String(body.identifier || '').trim().toLowerCase();
    if (!q) {
      res.status(400).json({ ok: false, error: 'أدخل اسم المتجر أو رقم الموبايل أو الإيميل.' });
      return;
    }
    const slug = normalizeSlugServer(q);
    const digits = q.replace(/[^0-9]/g, '');
    const match = Object.values(serverRegistry.stores).find(
      (s) =>
        (slug && s.storeSlug === slug) ||
        s.nameAr.toLowerCase() === q ||
        (s.email && s.email.toLowerCase() === q) ||
        (digits && s.phone && s.phone.replace(/[^0-9]/g, '') === digits)
    );
    res.json({
      ok: true,
      found: Boolean(match),
      storeSlug: match?.storeSlug,
    });
  });

  app.post('/api/store-auth/reset-password', (req: Request, res: Response) => {
    const body = req.body as { identifier?: string; code?: string; newPassword?: string };
    const q = String(body.identifier || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const newPassword = String(body.newPassword || '').trim();
    if (!q || code.length !== 6 || newPassword.length < 4) {
      res.status(400).json({ ok: false, error: 'تأكد من إدخال كود الاستعادة المكون من 6 أرقام وكلمة السر الجديدة.' });
      return;
    }
    const slug = normalizeSlugServer(q);
    const digits = q.replace(/[^0-9]/g, '');
    const match = Object.values(serverRegistry.stores).find(
      (s) =>
        (slug && s.storeSlug === slug) ||
        s.nameAr.toLowerCase() === q ||
        (s.email && s.email.toLowerCase() === q) ||
        (digits && s.phone && s.phone.replace(/[^0-9]/g, '') === digits)
    );
    if (!match || !match.resetCode || match.resetCode !== code) {
      res.status(400).json({ ok: false, error: 'كود الاستعادة غير صحيح أو لم يتم إنشاؤه من الإدارة بعد.' });
      return;
    }
    if (match.resetCodeExpiresAt && Date.now() > match.resetCodeExpiresAt) {
      res.status(400).json({ ok: false, error: 'انتهت صلاحية كود الاستعادة، اطلب كوداً جديداً من الإدارة.' });
      return;
    }
    const { salt, hash } = hashPasswordScrypt(newPassword);
    match.passwordSalt = salt;
    match.passwordHash = hash;
    match.resetCode = undefined;
    match.resetCodeExpiresAt = undefined;
    match.updatedAt = Date.now();
    serverRegistry.stores[match.storeSlug] = match;
    persistRegistryState(serverRegistry);
    res.json({ ok: true, storeSlug: match.storeSlug });
  });

  app.get('/api/public-stores/:slug', (req: Request, res: Response) => {
    const rawSlug = decodeURIComponent(String(req.params.slug || '')).trim().toLowerCase();
    const norm = normalizeSlugServer(rawSlug);
    const menus = serverRegistry.publicMenus || {};
    const direct =
      (norm && menus[norm]) ||
      menus[rawSlug] ||
      Object.values(menus).find(
        (m) =>
          (norm && m.storeSlug.toLowerCase() === norm) ||
          m.storeSlug.toLowerCase() === rawSlug ||
          m.shopId.toLowerCase() === rawSlug
      );
    if (direct) {
      res.json({
        ok: true,
        found: true,
        shop: direct.shop,
        products: direct.products,
        updatedAt: direct.updatedAt,
      });
      return;
    }
    const cred = Object.values(serverRegistry.stores || {}).find(
      (s) =>
        (norm && s.storeSlug.toLowerCase() === norm) ||
        s.storeSlug.toLowerCase() === rawSlug ||
        s.shopId.toLowerCase() === rawSlug
    );
    if (cred) {
      res.json({
        ok: true,
        found: true,
        shop: {
          id: cred.shopId,
          ownerId: `owner-${cred.storeSlug}`,
          storeSlug: cred.storeSlug,
          nameAr: cred.nameAr,
          nameEn: cred.storeSlug,
          country: 'مصر',
          acceptOrders: true,
          isOpen: true,
          subscriptionStatus: 'trial',
          whatsapp: cred.phone || '201015861991',
        },
        products: [],
      });
      return;
    }
    res.json({ ok: true, found: false });
  });

  app.post('/api/public-stores', (req: Request, res: Response) => {
    const body = req.body as {
      shop?: Record<string, unknown>;
      products?: Record<string, unknown>[];
    };
    const shopObj = body?.shop;
    if (!shopObj || typeof shopObj !== 'object') {
      res.status(400).json({ ok: false, error: 'Missing shop payload' });
      return;
    }
    const rawSlug = String(shopObj.storeSlug || shopObj.nameEn || shopObj.nameAr || shopObj.id || '');
    const storeSlug = normalizeSlugServer(rawSlug) || String(shopObj.id || '').trim().toLowerCase();
    const shopId = String(shopObj.id || storeSlug).trim();
    if (!storeSlug || !shopId) {
      res.status(400).json({ ok: false, error: 'Missing storeSlug' });
      return;
    }
    const menus = serverRegistry.publicMenus || {};
    const existing = menus[storeSlug];
    const incomingProducts = Array.isArray(body.products) ? body.products.slice(0, 400) : existing?.products || [];
    const snapshot: PublicMenuSnapshot = {
      shopId,
      storeSlug,
      shop: {
        ...shopObj,
        id: shopId,
        storeSlug,
      },
      products: incomingProducts,
      updatedAt: Date.now(),
    };
    serverRegistry.publicMenus = {
      ...menus,
      [storeSlug]: snapshot,
    };
    persistRegistryState(serverRegistry);
    res.json({ ok: true, storeSlug });
  });

  app.post('/api/ai/extract-menu', async (req: Request, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error: 'مفتاح Gemini API غير متوفر في إعدادات الخادم (Secrets). يرجى إضافته للمتابعة.',
        });
        return;
      }

      const body = (req.body || {}) as ExtractMenuRequestBody;
      const { fileName, mimeType, base64Data, textContent, files, businessName, language } = body;
      const inputFiles: ExtractMenuFileInput[] =
        Array.isArray(files) && files.length > 0
          ? files
          : base64Data || textContent
            ? [{ fileName, mimeType, base64Data, textContent }]
            : [];

      const cleanBase64 = (raw?: string): string =>
        String(raw || '')
          .replace(/^data:[^;]+;base64,/i, '')
          .replace(/\s+/g, '')
          .trim();

      const normalizeMime = (rawMime?: string, fName?: string): string => {
        const lowerMime = String(rawMime || '').trim().toLowerCase();
        if (lowerMime === 'image/jpg') return 'image/jpeg';
        if (
          lowerMime === 'image/jpeg' ||
          lowerMime === 'image/png' ||
          lowerMime === 'image/webp' ||
          lowerMime === 'image/gif' ||
          lowerMime === 'image/heic' ||
          lowerMime === 'image/heif' ||
          lowerMime === 'application/pdf'
        ) {
          return lowerMime;
        }
        const lowerName = String(fName || '').toLowerCase();
        if (lowerName.endsWith('.pdf')) return 'application/pdf';
        if (lowerName.endsWith('.png')) return 'image/png';
        if (lowerName.endsWith('.webp')) return 'image/webp';
        if (lowerName.endsWith('.gif')) return 'image/gif';
        return 'image/jpeg';
      };

      const validFiles = inputFiles
        .map((f) => ({
          fileName: f.fileName,
          mimeType: normalizeMime(f.mimeType, f.fileName),
          base64Data: cleanBase64(f.base64Data),
          textContent: f.textContent ? String(f.textContent).trim() : '',
        }))
        .filter((f) => Boolean(f.base64Data || f.textContent));

      if (validFiles.length === 0) {
        res.status(400).json({ error: 'يرجى رفع صورة أو أكثر للمنيو أو ملف PDF أو Excel أولاً.' });
        return;
      }

      const fileNamesList = validFiles.map((f, i) => f.fileName || `صفحة ${i + 1}`).join('، ');
      const promptText = `أنت خبير رقمنة وتنظيم قوائم الطعام والمطاعم والجزارة والدواجن والمتاجر لمنصة Ghazalo.
مهمتك استخراج وتفسير جميع الأقسام والأصناف والعروض والأسعار والأوزان والأوصاف والمتغيرات بدقة عالية من جميع صفحات وصور المنيو المرفقة (${validFiles.length} ملفات) للنشاط "${businessName || 'متجر'}".
لغة المنيو المفضلة: ${language || 'العربية'}.
الملفات المرفقة: ${fileNamesList}.

القواعد الصارمة:
1. افحص كل الصور والملفات المرفقة دون استثناء واجمع كل الأصناف والعروض منها في قائمة واحدة موحدة.
2. **ترتيب الأقسام والأصناف (مهم جداً)**: رتب الأقسام والأصناف ترتيباً منطقياً احترافياً يبدأ بالعروض والباقات والأطباق/المنتجات الرئيسية الثقيلة وينتهي بالمياه والمشروبات الغازية بالترتيب التالي:
   أولاً: العروض والباقات وعروض التوفير (إن وجدت)
   ثانياً: المشويات والجزارة واللحوم الطازجة والدواجن والفراخ والأطباق الرئيسية والأسماك
   ثالثاً: الطواجن والمحاشي والأرز والمكرونات
   رابعاً: البيتزا والفطائر والكريب والشاورما والساندوتشات والبرجر
   خامساً: الشوربة والسلطات والمقبلات
   سادساً: الإضافات والبطاطس والصوصات
   سابعاً: الحلويات
   ثامناً: المشروبات الساخنة والعصائر الطازجة
   تاسعاً (في آخر القائمة): المشروبات الغازية (الساقع) والمياه المعدنية (المايه)
3. **حفظ النص والأوصاف والعروض كما هي مكتوبة**:
   - انقل أي وصف أو مكونات أو شروط عرض أو ملاحظات مكتوبة في المنيو **كما هي** في حقل description بالضبط دون حذف تفاصيل مهمة.
   - إذا كان الصنف عبارة عن عرض أو باقة (مثل "عرض التوفير" أو "4 فرخة بـ 1000 والاثنين بـ 550")، اجعل isOffer: true واكتب في offerLabel شارة قصيرة مناسبة (مثل "عرض خاص" أو "توفير").
4. **تفسير الأسعار المتعددة والأوزان والكميات والأحجام في variants (مهم جداً)**:
   - إذا ذكر المنيو لنفس الصنف أو العرض أكثر من كمية أو وزن أو حجم بأسعار مختلفة، فسرها وضع كل خيار في مصفوفة variants بالصيغة الثابتة: "اسم الخيار كما في المنيو - السعر" (مرتبة من الأقل سعراً للأعلى)، وضع في price أقل سعر متاح لهذا الصنف:
     * مثال عروض الكميات: لو مكتوب "4 فرخة بـ 1000 والاثنين بـ 550" -> اسم الصنف "فراخ (عرض التوفير)" أو حسب عنوانه في المنيو، price: 550، وvariants: ["2 فرخة - 550", "4 فرخة - 1000"]، وdescription: "الاثنين بـ 550 و4 فرخة بـ 1000".
     * مثال الجزارة واللحوم: لو مكتوب "لحم بلدي الكيلو 420 والنص 215 والربع 110" -> price: 110، وvariants: ["ربع كيلو - 110", "نص كيلو - 215", "كيلو - 420"].
     * مثال الأحجام: لو مكتوب "وسط 120 / كبير 170" -> price: 120، وvariants: ["وسط - 120", "كبير - 170"].
   - **ممنوع تماماً اختراع أي أوزان أو أحجام أو خيارات غير مكتوبة في المنيو المرفق.** إذا كان للصنف سعر واحد فقط بدون أوزان أو كميات متعددة في المنيو، اترك variants فارغة [].
   - إذا لم يوجد سعر نهائياً ضع 0.
5. لكل صنف اكتب في حقل photoQuery اسم الطبق أو المنتج بالإنجليزية بكلمة أو كلمتين واضحتين للبحث عن صورته الحقيقية (مثال: "Kofta kebab", "Grilled chicken", "Raw beef steak", "Shawarma", "Lentil soup", "Tahini", "French fries", "Kunafa", "Mango juice", "Cola", "Bottled water").
6. لا تبتكر أصنافاً غير موجودة في الملفات المرفقة، ولا تكرر نفس الصنف إذا ظهر في أكثر من صورة.`;

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

      const extractResponseSchema = {
        type: Type.OBJECT,
        properties: {
          categories: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              'أسماء الأقسام مرتبة من العروض والمشويات/اللحوم/الأطباق الرئيسية أولاً إلى الحلويات والمشروبات والمياه أخيراً.',
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'اسم الصنف أو العرض كما في المنيو' },
                category: { type: Type.STRING, description: 'اسم القسم' },
                price: {
                  type: Type.NUMBER,
                  description: 'السعر الأساسي أو أقل سعر متاح كرقم',
                },
                description: {
                  type: Type.STRING,
                  description: 'الوصف أو تفاصيل العرض أو المكونات المكتوبة كما هي في المنيو',
                },
                photoQuery: {
                  type: Type.STRING,
                  description:
                    'اسم الطبق أو المنتج بالإنجليزية للبحث عن صورة حقيقية له (كلمة أو كلمتان)',
                },
                variants: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    'قائمة الخيارات أو الأوزان أو عروض الكميات المذكورة فعلياً في المنيو بصيغة "الاسم - السعر" مثل "2 فرخة - 550" أو "نص كيلو - 215"',
                },
                isOffer: {
                  type: Type.BOOLEAN,
                  description: 'هل هذا الصنف عرض أو باقة توفير مذكورة في المنيو',
                },
                offerLabel: {
                  type: Type.STRING,
                  description: 'شارة العرض القصيرة إن كان عرضاً مثل "عرض خاص" أو "عرض التوفير"',
                },
              },
              required: ['name', 'category', 'price', 'photoQuery'],
            },
          },
        },
        required: ['categories', 'items'],
      };

      const callExtractModel = async (
        modelName: string,
        thinkingLevel?: ThinkingLevel
      ): Promise<string> => {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: extractResponseSchema,
            ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
          },
        });
        const textOut = response.text;
        if (!textOut || !textOut.trim()) {
          const finishReason = String(response.candidates?.[0]?.finishReason || '');
          if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'PROHIBITED_CONTENT') {
            throw new Error('IMAGE_BLOCKED_SAFETY');
          }
          throw new Error('EMPTY_MODEL_RESPONSE');
        }
        return textOut;
      };

      const isTransientAiError = (err: unknown): boolean => {
        const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
        return (
          msg.includes('503') ||
          msg.includes('unavailable') ||
          msg.includes('high demand') ||
          msg.includes('overloaded') ||
          msg.includes('429') ||
          msg.includes('resource_exhausted') ||
          msg.includes('not_found') ||
          msg.includes('404') ||
          msg.includes('timeout') ||
          msg.includes('econnreset') ||
          msg.includes('empty_model_response')
        );
      };

      const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const attemptChain: Array<{
        model: string;
        thinkingLevel?: ThinkingLevel;
        delayBeforeMs: number;
      }> = [
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayBeforeMs: 0 },
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayBeforeMs: 1400 },
        { model: 'gemini-3.1-flash-lite', delayBeforeMs: 600 },
        { model: 'gemini-3.1-flash-lite', delayBeforeMs: 1800 },
      ];

      let responseRawText = '';
      let lastAiError: unknown = null;
      const attemptTrace: string[] = [];

      for (const step of attemptChain) {
        if (step.delayBeforeMs > 0) {
          await sleepMs(step.delayBeforeMs);
        }
        try {
          responseRawText = await callExtractModel(step.model, step.thinkingLevel);
          attemptTrace.push(`${step.model}:ok`);
          lastAiError = null;
          break;
        } catch (err: unknown) {
          lastAiError = err;
          const shortErr = err instanceof Error ? err.message.slice(0, 180) : String(err).slice(0, 180);
          attemptTrace.push(`${step.model}:err(${shortErr.slice(0, 60)})`);
          console.warn(`[extract-menu] model=${step.model} error:`, shortErr);
          if (!isTransientAiError(err)) {
            throw err;
          }
        }
      }

      res.setHeader('X-Extract-Models', attemptTrace.join(' | ').slice(0, 500));
      if (lastAiError) {
        throw lastAiError;
      }

      interface RawMenuItem {
        name: string;
        category: string;
        price: number;
        description?: string;
        photoQuery?: string;
        variants?: string[];
        isOffer?: boolean;
        offerLabel?: string;
      }
      interface RawParsedMenu {
        categories?: string[];
        items?: RawMenuItem[];
      }

      const parseExtractedMenuJson = (rawInput: string): RawParsedMenu => {
        let cleaned = (rawInput || '{}')
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }

        try {
          return JSON.parse(cleaned || '{}') as RawParsedMenu;
        } catch {
          // Salvage balanced JSON objects from truncated responses (dense menus with many dishes)
          const salvagedCategories: string[] = [];
          const catMatch = cleaned.match(/"categories"\s*:\s*\[([^\]]*)\]/);
          if (catMatch) {
            try {
              const arr = JSON.parse(`[${catMatch[1]}]`) as unknown;
              if (Array.isArray(arr)) {
                for (const c of arr) {
                  if (typeof c === 'string' && c.trim()) salvagedCategories.push(c.trim());
                }
              }
            } catch {
              // ignore partial category array
            }
          }

          const itemsIdx = cleaned.indexOf('"items"');
          const arrStart = itemsIdx >= 0 ? cleaned.indexOf('[', itemsIdx) : -1;
          const salvagedItems: RawMenuItem[] = [];

          if (arrStart >= 0) {
            let inStr = false;
            let escaped = false;
            let objDepth = 0;
            let objStart = -1;

            for (let i = arrStart + 1; i < cleaned.length; i++) {
              const ch = cleaned[i];
              if (inStr) {
                if (escaped) {
                  escaped = false;
                } else if (ch === '\\') {
                  escaped = true;
                } else if (ch === '"') {
                  inStr = false;
                }
                continue;
              }
              if (ch === '"') {
                inStr = true;
                continue;
              }
              if (ch === '{') {
                if (objDepth === 0) objStart = i;
                objDepth++;
              } else if (ch === '}') {
                objDepth--;
                if (objDepth === 0 && objStart >= 0) {
                  const candidateSlice = cleaned.slice(objStart, i + 1);
                  try {
                    const parsedObj = JSON.parse(candidateSlice) as RawMenuItem;
                    if (parsedObj && typeof parsedObj.name === 'string' && parsedObj.name.trim()) {
                      salvagedItems.push(parsedObj);
                    }
                  } catch {
                    // skip malformed individual entry
                  }
                  objStart = -1;
                }
              }
            }
          }

          if (salvagedItems.length > 0 || salvagedCategories.length > 0) {
            return { categories: salvagedCategories, items: salvagedItems };
          }
          throw new Error('PARSE_EXTRACTED_MENU_FAILED');
        }
      };

      const parsed = parseExtractedMenuJson(responseRawText);

      const toAsciiDigits = (s: string) =>
        s.replace(/[٠-٩۰-۹]/g, (ch) => {
          const idx = '٠١٢٣٤٥٦٧٨٩'.indexOf(ch);
          if (idx >= 0) return String(idx);
          const idx2 = '۰۱۲۳۴۵۶۷۸۹'.indexOf(ch);
          return idx2 >= 0 ? String(idx2) : ch;
        });

      const extractVariantMinPrice = (variantsList: string[]): number | null => {
        const prices: number[] = [];
        for (const v of variantsList) {
          const norm = toAsciiDigits(v);
          const m = norm.match(/(?:[-:–—|=]|بـ\s*|\()\s*([0-9]+(?:\.[0-9]+)?)\s*(?:ج\.?م\.?|جنيه|ريال|درهم|egp|sar|aed)?\s*\)?$/i);
          if (m) {
            const num = Number(m[1]);
            if (Number.isFinite(num) && num > 0) prices.push(num);
          }
        }
        return prices.length > 0 ? Math.min(...prices) : null;
      };

      const cleanedRaw = (parsed.items || [])
        .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 0)
        .map((item, idx) => {
          const cleanVariants = Array.isArray(item.variants)
            ? item.variants
                .filter((v) => typeof v === 'string' && v.trim())
                .map((v) => toAsciiDigits(v).trim().slice(0, 120))
                .slice(0, 20)
            : [];
          const basePrice =
            Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? Number(item.price) : 0;
          const minVariantPrice = extractVariantMinPrice(cleanVariants);
          const resolvedPrice = basePrice > 0 ? basePrice : minVariantPrice ?? 0;
          const isOffer = Boolean(item.isOffer);
          const offerLabel = isOffer
            ? (item.offerLabel || 'عرض خاص').trim().slice(0, 60)
            : '';
          return {
            name: item.name.trim().slice(0, 160),
            category: (item.category || 'أصناف متنوعة').trim().slice(0, 80),
            price: resolvedPrice,
            description: (item.description || '').trim().slice(0, 400),
            photoQuery: (item.photoQuery || '').trim().slice(0, 80),
            variants: cleanVariants,
            isOffer,
            offerLabel,
            rawIdx: idx,
          };
        });

      cleanedRaw.sort((a, b) => {
        const rankDiff = getCategoryCulinaryRank(a.category) - getCategoryCulinaryRank(b.category);
        if (rankDiff !== 0) return rankDiff;
        const catCompare = a.category.localeCompare(b.category, 'ar');
        if (catCompare !== 0) return catCompare;
        return a.rawIdx - b.rawIdx;
      });

      const photoDeadline = Date.now() + 1400;
      const resolvedItems: Array<{
        name: string;
        category: string;
        price: number;
        description: string;
        variants: string[];
        isOffer?: boolean;
        offerLabel?: string;
        imageUrl: string;
        sortOrder: number;
      }> = [];

      const batchSize = 10;
      for (let start = 0; start < cleanedRaw.length; start += batchSize) {
        const chunk = cleanedRaw.slice(start, start + batchSize);
        const canFetchExternal = Date.now() < photoDeadline;
        const photos = canFetchExternal
          ? await Promise.race([
              Promise.all(
                chunk.map((item, offset) =>
                  resolveDishPhotoUrl(item.photoQuery, item.name, item.category, start + offset)
                )
              ),
              sleepMs(1000).then(() =>
                chunk.map(
                  (item) =>
                    VERIFIED_DISH_FALLBACKS[inferDishFamily(item.name, item.category, item.photoQuery)] ||
                    VERIFIED_DISH_FALLBACKS.grill
                )
              ),
            ])
          : chunk.map(
              (item) =>
                VERIFIED_DISH_FALLBACKS[inferDishFamily(item.name, item.category, item.photoQuery)] ||
                VERIFIED_DISH_FALLBACKS.grill
            );
        chunk.forEach((item, offset) => {
          resolvedItems.push({
            name: item.name,
            category: item.category,
            price: item.price,
            description: item.description,
            variants: item.variants,
            ...(item.isOffer ? { isOffer: true, offerLabel: item.offerLabel } : {}),
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
      const rawMessage = error instanceof Error ? error.message : String(error || '');
      const lower = rawMessage.toLowerCase();
      console.error('Gemini extract-menu error:', error);

      if (rawMessage === 'IMAGE_BLOCKED_SAFETY') {
        res.status(400).json({
          error: 'تعذر تحليل هذه الصورة تلقائياً. يرجى التأكد من وضوح صفحة المنيو فقط وإعادة المحاولة.',
        });
        return;
      }
      if (rawMessage === 'PARSE_EXTRACTED_MENU_FAILED' || rawMessage === 'EMPTY_MODEL_RESPONSE') {
        res.status(502).json({
          error: 'تعذر قراءة تفاصيل الأصناف من هذه الصورة. جرب تقريب الصورة على جزء أصغر أو التقاط صورة أوضح.',
        });
        return;
      }
      if (lower.includes('api_key') || lower.includes('permission_denied') || lower.includes('403')) {
        res.status(500).json({
          error: 'يرجى التحقق من صلاحية مفتاح Gemini API في إعدادات الخادم (Secrets).',
        });
        return;
      }
      if (lower.includes('404') || lower.includes('not_found')) {
        res.status(502).json({
          error: 'نموذج قراءة المنيو غير متاح مؤقتاً حالياً. اضغط إعادة المحاولة بعد لحظات.',
        });
        return;
      }
      if (lower.includes('413') || lower.includes('payload') || lower.includes('too large')) {
        res.status(413).json({
          error: 'حجم الصورة كبير جداً. يرجى اختيار صورة أصغر أو قصها ثم إعادة المحاولة.',
        });
        return;
      }
      if (
        lower.includes('503') ||
        lower.includes('unavailable') ||
        lower.includes('high demand') ||
        lower.includes('overloaded') ||
        lower.includes('timeout') ||
        lower.includes('econnreset')
      ) {
        res.status(503).json({
          error: 'خدمة تحليل المنيو تشهد ضغطاً مؤقتاً حالياً. اضغط "إعادة المحاولة" بعد لحظات أو ارفع صورة أوضح.',
        });
        return;
      }
      if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
        res.status(429).json({
          error: 'تم الوصول للحد الأقصى المؤقت لطلبات الذكاء الاصطناعي. يرجى الانتظار قليلاً والمحاولة مرة أخرى.',
        });
        return;
      }
      if (
        lower.includes('unsupported') ||
        lower.includes('invalid argument') ||
        lower.includes('unable to process input image') ||
        lower.includes('bad base64')
      ) {
        res.status(400).json({
          error: 'صيغة الصورة غير مدعومة أو تالفة. يرجى استخدام صورة بصيغة JPG أو PNG واضحة.',
        });
        return;
      }
      res.status(500).json({
        error: 'تعذر قراءة المنيو من هذه الصورة حالياً. جرب صورة أوضح أو أعد المحاولة.',
      });
    }
  });

  app.post('/api/ai/menu-chat', async (req: Request, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error: 'مفتاح Gemini API غير متوفر في إعدادات الخادم (Secrets).',
        });
        return;
      }
      const body = req.body as {
        shopName?: string;
        language?: 'ar' | 'en';
        country?: string;
        message?: string;
        history?: Array<{ role?: string; text?: string }>;
        deliveryInfo?: {
          deliveryFee?: number;
          freeDelivery?: boolean;
          freeDeliveryMinOrder?: number;
        };
        products?: Array<{
          id?: string;
          name?: string;
          category?: string;
          price?: number;
          originalPrice?: number;
          description?: string;
          variants?: string[];
          isOffer?: boolean;
          offerLabel?: string;
        }>;
      };
      const userMessage = String(body.message || '').trim().slice(0, 600);
      if (!userMessage) {
        res.status(400).json({ error: 'اكتب سؤالك للشيف أولاً.' });
        return;
      }
      const isEn = body.language === 'en';
      const catalog = Array.isArray(body.products)
        ? body.products
            .filter((p) => p && p.id && p.name)
            .slice(0, 120)
            .map((p) => ({
              id: String(p.id),
              name: String(p.name).slice(0, 120),
              category: String(p.category || '').slice(0, 60),
              price: Number(p.price || 0),
              originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
              description: String(p.description || '').slice(0, 220),
              isOffer: Boolean(p.isOffer),
              offerLabel: p.offerLabel ? String(p.offerLabel).slice(0, 40) : undefined,
              variants: Array.isArray(p.variants) ? p.variants.slice(0, 8) : [],
            }))
        : [];
      if (catalog.length === 0) {
        res.status(400).json({ error: 'لا توجد أصناف في المنيو للترشيح حالياً.' });
        return;
      }
      const historyText = Array.isArray(body.history)
        ? body.history
            .slice(-6)
            .map((h) => `${h.role === 'user' ? 'Customer' : 'Chef'}: ${String(h.text || '').slice(0, 200)}`)
            .join('\n')
        : '';
      const deliverySummary = body.deliveryInfo
        ? body.deliveryInfo.freeDelivery
          ? 'Free delivery available'
          : `Delivery fee: ${Number(body.deliveryInfo.deliveryFee || 0)}`
        : '';
      const systemPrompt = isEn
        ? `You are the friendly AI Chef Assistant for "${body.shopName || 'the restaurant'}".
Help customers with ingredients, allergens/components, exact prices, sizes/weights (variants), offers, and dish recommendations ONLY from the provided JSON menu catalog below.
${deliverySummary ? `Delivery info: ${deliverySummary}` : ''}
Rules:
1. Never invent dish names, ingredients, prices, or IDs that are not in the catalog.
2. If asked about ingredients/components or prices, answer accurately using the dish's description, variants, price, and originalPrice from the catalog.
3. Pick 1 to 2 matching product IDs in recommendedProductIds (use exact "id" strings from the catalog).
4. Keep your reply warm, concise (2-3 sentences max), and helpful in English.
5. Provide 2-3 short followUpChips (under 4 words each) for quick replies.

Menu Catalog:
${JSON.stringify(catalog)}`
        : `أنت "الشيف الذكي" لمطعم "${body.shopName || 'المطعم'}".
مهمتك مساعدة العميل بلهجة دافئة وودودة للإجابة عن المكونات، الأسعار، الأوزان والأحجام (variants)، العروض، وترشيح أحلى وجبة من المنيو الفعلي فقط.
${deliverySummary ? `معلومات التوصيل: ${deliverySummary}` : ''}
القواعد الصارمة:
1. ممنوع تماماً اختراع أي صنف أو مكون أو سعر أو معرّف id مش موجود في قائمة المنيو المرفقة.
2. لو العميل سأل عن مكونات صنف أو سعره أو أوزانه/أحجامه، جاوب بدقة من حقول description و price و originalPrice و variants الموجودة في الكتالوج، وإذا لم يُذكر تفصيل المكونات وضح له الوصف المتاح بصدق.
3. اختار من 1 إلى 2 من أنسب الأصناف لطلب العميل وضع الـ id الحقيقي بتاعهم في recommendedProductIds.
4. اجعل ردك قصيراً ولطيفاً ومباشراً (جملتين أو 3 جمل بالكثير).
5. أضف 2 إلى 3 أزرار متابعة قصيرة في followUpChips (مثل: "كم السعر والحجم؟"، "مكونات الطبق ده"، "عروض التوفير").

قائمة المنيو الفعلية (${body.country || 'مصر'}):
${JSON.stringify(catalog)}`;
      const promptWithHistory = historyText
        ? `${systemPrompt}\n\nPrevious chat:\n${historyText}\n\nCustomer latest question: ${userMessage}`
        : `${systemPrompt}\n\nCustomer question: ${userMessage}`;
      const invokeChatModel = async (
        modelName: string,
        thinkingLevel?: ThinkingLevel
      ): Promise<string> => {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: promptWithHistory,
          config: {
            responseMimeType: 'application/json',
            ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: { type: Type.STRING },
                recommendedProductIds: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                followUpChips: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['reply', 'recommendedProductIds'],
            },
          },
        });
        return response.text ?? '{}';
      };
      const isTransient = (err: unknown): boolean => {
        const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
        return (
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('unavailable') ||
          msg.includes('quota') ||
          msg.includes('high demand') ||
          msg.includes('overloaded') ||
          msg.includes('404')
        );
      };
      let rawJson = '{}';
      try {
        rawJson = await invokeChatModel('gemini-4-hydrogen', ThinkingLevel.LOW);
      } catch (primaryErr) {
        if (!isTransient(primaryErr)) throw primaryErr;
        await new Promise((r) => setTimeout(r, 350));
        rawJson = await invokeChatModel('gemini-3.1-flash-lite');
      }
      const validIds = new Set(catalog.map((p) => p.id));
      let parsed: {
        reply?: string;
        recommendedProductIds?: string[];
        followUpChips?: string[];
      } = {};
      try {
        parsed = JSON.parse(rawJson.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
      } catch {
        parsed = { reply: isEn ? 'Here is a great pick for you from our menu:' : 'جرب ترشيح الشيف ده من المنيو:' };
      }
      const matchedIds = Array.isArray(parsed.recommendedProductIds)
        ? parsed.recommendedProductIds.map((id) => String(id)).filter((id) => validIds.has(id)).slice(0, 2)
        : [];
      const chips = Array.isArray(parsed.followUpChips)
        ? parsed.followUpChips.map((c) => String(c).trim()).filter(Boolean).slice(0, 3)
        : [];
      res.json({
        reply: String(parsed.reply || '').trim() || (isEn ? 'Here is what I recommend:' : 'ده أنسب اختيار ليك من المنيو:'),
        recommendedProductIds: matchedIds,
        followUpChips: chips,
      });
    } catch (error: unknown) {
      const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
      console.error('Gemini menu-chat error:', error);
      if (msg.includes('503') || msg.includes('429') || msg.includes('quota') || msg.includes('unavailable')) {
        res.status(503).json({
          error: 'الشيف الذكي مشغول لحظياً بسبب ضغط الطلبات — اضغط إعادة المحاولة أو استخدم اختيارات الشيف السريعة بالأسفل.',
        });
        return;
      }
      res.status(500).json({
        error: 'تعذر التواصل مع الشيف الذكي حالياً، يمكنك المتابعة باستخدام الاختيارات السريعة.',
      });
    }
  });

  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'spa',
        plugins: [
          {
            name: 'disable-hmr-websocket-client',
            transform(code, id) {
              if (!id.includes('vite/dist/client/client.mjs')) return null;
              const startMarker = 'const transport = normalizeModuleRunnerTransport((() => {';
              const endMarker = '})());';
              const startIdx = code.indexOf(startMarker);
              const endIdx = startIdx >= 0 ? code.indexOf(endMarker, startIdx) : -1;
              if (startIdx >= 0 && endIdx > startIdx) {
                return (
                  code.slice(0, startIdx) +
                  'const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, send() {} });' +
                  code.slice(endIdx + endMarker.length)
                );
              }
              return null;
            },
          },
        ],
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