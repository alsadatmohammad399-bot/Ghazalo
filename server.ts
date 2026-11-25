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
// No default PIN: ADMIN_PIN must be set in the environment (Vercel > Settings > Environment Variables).
const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || '';
// Stable secret so login tokens survive restarts and work across serverless instances.
if (process.env.VERCEL && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is not set. Tokens will not survive restarts.');
}
// Without SESSION_SECRET a random secret per serverless instance made admin/merchant logins bounce
// back to the login screen (another instance could not verify the token). Derive a stable one from
// other server-only secrets instead. Setting SESSION_SECRET explicitly is still the best option.
const DERIVED_SECRET_SOURCE = [process.env.ADMIN_PIN, process.env.GEMINI_API_KEY]
  .filter(Boolean)
  .join('|');
const HAS_STABLE_SECRET = Boolean(process.env.SESSION_SECRET || DERIVED_SECRET_SOURCE);
let TOKEN_SIGNING_SECRET =
  process.env.SESSION_SECRET ||
  (DERIVED_SECRET_SOURCE
    ? crypto.createHash('sha256').update(`ghazalo-session:${DERIVED_SECRET_SOURCE}`).digest('hex')
    : crypto.randomBytes(32).toString('hex'));

// Simple in-memory limiter for admin PIN attempts (per IP, 5 tries / 15 minutes).
const pinAttempts = new Map<string, { count: number; resetAt: number }>();
function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : String(fwd || '').split(',')[0];
  return String(first || req.ip || 'unknown').trim() || 'unknown';
}
function pinRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = pinAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    pinAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 5;
}
function safeEqualString(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

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
  createdAt?: number;
  updatedAt: number;
}

interface PublicMenuSnapshot {
  shopId: string;
  storeSlug: string;
  shop: Record<string, unknown>;
  products: Record<string, unknown>[];
  createdAt?: number;
  updatedAt: number;
}

interface ServerRegistryState {
  adminPin?: string;
  adminPinSalt?: string;
  adminPinHash?: string;
  forceZeroFeesGlobally: boolean;
  stores: Record<string, ServerStoreCredential>;
  publicMenus: Record<string, PublicMenuSnapshot>;
}

// Optional durable storage (Upstash Redis via Vercel Marketplace, or Vercel KV). Without it the
// registry only lives in /tmp, which Vercel wipes on cold starts.
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const REMOTE_STORE = Boolean(REDIS_URL && REDIS_TOKEN);
const REGISTRY_KEY = 'ghazalo:registry:v1';
const SECRET_KEY = 'ghazalo:session-secret:v1';

async function redisCmd(args: string[]): Promise<unknown> {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = (await r.json()) as { result?: unknown; error?: string };
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}

function normalizeRegistry(parsed: Partial<ServerRegistryState>): ServerRegistryState {
  return {
    adminPin: parsed.adminPin,
    adminPinSalt: parsed.adminPinSalt,
    adminPinHash: parsed.adminPinHash,
    forceZeroFeesGlobally: Boolean(parsed.forceZeroFeesGlobally),
    stores: parsed.stores || {},
    publicMenus: parsed.publicMenus || {},
  };
}

function loadRegistryState(): ServerRegistryState {
  try {
    if (fs.existsSync(STORE_REGISTRY_PATH)) {
      const raw = fs.readFileSync(STORE_REGISTRY_PATH, 'utf8');
      return normalizeRegistry(JSON.parse(raw) as Partial<ServerRegistryState>);
    }
  } catch {
    // ignore read error on cold start
  }
  return { forceZeroFeesGlobally: false, stores: {}, publicMenus: {} };
}

let pendingWrites: Promise<void> = Promise.resolve();

function persistRegistryState(state: ServerRegistryState): void {
  try {
    fs.writeFileSync(STORE_REGISTRY_PATH, JSON.stringify(state), 'utf8');
  } catch {
    // non-blocking in read-only runtimes
  }
  if (REMOTE_STORE) {
    const snapshot = JSON.stringify(state);
    pendingWrites = pendingWrites
      .then(() => redisCmd(['SET', REGISTRY_KEY, snapshot]).then(() => undefined))
      .catch((err) => {
        console.error('Registry save to remote store failed:', err instanceof Error ? err.message : err);
      });
  }
}

let lastRemoteLoad = 0;
let secretReady = false;
async function refreshRegistryFromRemote(): Promise<void> {
  if (!REMOTE_STORE) return;
  try {
    if (!secretReady && !HAS_STABLE_SECRET) {
      // No SESSION_SECRET set: keep one stable secret in the shared store so logins work on every instance.
      let secret = (await redisCmd(['GET', SECRET_KEY])) as string | null;
      if (!secret) {
        const fresh = crypto.randomBytes(32).toString('hex');
        await redisCmd(['SET', SECRET_KEY, fresh, 'NX']);
        secret = (await redisCmd(['GET', SECRET_KEY])) as string | null;
      }
      if (secret) TOKEN_SIGNING_SECRET = secret;
    }
    secretReady = true;
    if (Date.now() - lastRemoteLoad < 1500) return;
    await pendingWrites;
    const raw = (await redisCmd(['GET', REGISTRY_KEY])) as string | null;
    lastRemoteLoad = Date.now();
    if (raw) {
      serverRegistry = normalizeRegistry(JSON.parse(raw) as Partial<ServerRegistryState>);
    }
  } catch (err) {
    console.error('Registry load from remote store failed:', err instanceof Error ? err.message : err);
  }
}

// Rate limit shared across instances when the remote store exists, per-instance otherwise.
const localHits = new Map<string, { count: number; resetAt: number }>();
async function overLimit(name: string, ip: string, max: number, windowSec: number): Promise<boolean> {
  const key = `rl:${name}:${ip}`;
  if (REMOTE_STORE) {
    try {
      const n = Number(await redisCmd(['INCR', key]));
      if (n === 1) await redisCmd(['EXPIRE', key, String(windowSec)]);
      return n > max;
    } catch {
      // fall through to local counter
    }
  }
  const now = Date.now();
  const rec = localHits.get(key);
  if (!rec || now > rec.resetAt) {
    localHits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > max;
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
  grill: '/src/assets/images/dish_lamb_chops_1795092514353.jpg',
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
  juice: '/src/assets/images/dish_iced_latte_1795092514007.jpg',
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

  // Load shared state first and hold each response until pending saves are done (serverless can freeze after reply).
  app.use('/api', async (req: Request, res: Response, next) => {
    await refreshRegistryFromRemote();
    const origJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      pendingWrites.then(() => origJson(body));
      return res;
    }) as typeof res.json;

    const limits: Array<[string, string, number, number]> = [
      ['/ai/extract-menu', 'extract', 8, 3600],
      ['/ai/menu-chat', 'chat', 40, 600],
      ['/store-auth/login', 'login', 15, 900],
      ['/store-auth/register', 'register', 6, 3600],
      ['/store-auth/forgot-request', 'forgot', 6, 3600],
      ['/store-auth/reset-password', 'reset', 10, 900],
    ];
    const hit = req.method === 'POST' ? limits.find(([p]) => req.path === p) : undefined;
    if (hit && (await overLimit(hit[1], getClientIp(req), hit[2], hit[3]))) {
      res.status(429).json({ ok: false, error: 'محاولات كثيرة. حاول لاحقاً.' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'ghazalo-api' });
  });

  app.get('/api/platform-config', (_req: Request, res: Response) => {
    res.json({ forceZeroFeesGlobally: Boolean(serverRegistry.forceZeroFeesGlobally) });
  });

  function isAdminPinConfigured(): boolean {
    return Boolean(
      (serverRegistry.adminPinHash && serverRegistry.adminPinSalt) ||
        serverRegistry.adminPin ||
        DEFAULT_ADMIN_PIN
    );
  }

  function verifyAdminPinMatch(submitted: string): boolean {
    if (!submitted) return false;
    if (serverRegistry.adminPinHash && serverRegistry.adminPinSalt) {
      return verifyPasswordScrypt(submitted, serverRegistry.adminPinSalt, serverRegistry.adminPinHash);
    }
    if (serverRegistry.adminPin) {
      return safeEqualString(submitted, serverRegistry.adminPin);
    }
    if (DEFAULT_ADMIN_PIN) {
      return safeEqualString(submitted, DEFAULT_ADMIN_PIN);
    }
    return false;
  }

  app.get('/api/admin/pin-status', (_req: Request, res: Response) => {
    res.json({ ok: true, configured: isAdminPinConfigured() });
  });

  app.post('/api/admin/claim-pin', (req: Request, res: Response) => {
    if (pinRateLimited(getClientIp(req))) {
      res.status(429).json({ ok: false, error: 'محاولات كثيرة. حاول بعد 15 دقيقة.' });
      return;
    }
    if (isAdminPinConfigured()) {
      res.status(403).json({ ok: false, error: 'تم تعيين الرقم السري للإدارة مسبقاً.' });
      return;
    }
    const body = req.body as { pin?: string };
    const clean = String(body.pin || '').trim().slice(0, 32);
    if (clean.length < 4) {
      res.status(400).json({ ok: false, error: 'الرقم السري يجب ألا يقل عن 4 أحرف.' });
      return;
    }
    const { salt, hash } = hashPasswordScrypt(clean);
    serverRegistry.adminPin = undefined;
    serverRegistry.adminPinSalt = salt;
    serverRegistry.adminPinHash = hash;
    persistRegistryState(serverRegistry);
    const adminToken = signToken({ role: 'admin' }, 24 * 60 * 60 * 1000);
    res.json({ ok: true, adminToken });
  });

  app.post('/api/admin/verify-pin', (req: Request, res: Response) => {
    const body = req.body as { pin?: string };
    const submitted = String(body.pin || '').trim();
    if (pinRateLimited(getClientIp(req))) {
      res.status(429).json({ ok: false, error: 'محاولات كثيرة. حاول بعد 15 دقيقة.' });
      return;
    }
    if (!isAdminPinConfigured() || !submitted || !verifyAdminPinMatch(submitted)) {
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
    const { salt, hash } = hashPasswordScrypt(clean);
    serverRegistry.adminPin = undefined;
    serverRegistry.adminPinSalt = salt;
    serverRegistry.adminPinHash = hash;
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
      createdAt: s.createdAt || s.updatedAt,
      updatedAt: s.updatedAt,
    }));
    res.json({ ok: true, stores: items });
  });

  app.get('/api/admin/stores', (req: Request, res: Response) => {
    if (!requireAdminAuth(req, res)) return;
    const merged = new Map<string, Record<string, unknown>>();
    const credsBySlug = serverRegistry.stores || {};
    const menusBySlug = serverRegistry.publicMenus || {};

    for (const cred of Object.values(credsBySlug)) {
      const key = cred.storeSlug || cred.shopId;
      const snap = menusBySlug[key] || Object.values(menusBySlug).find((m) => m.shopId === cred.shopId);
      const shopObj = snap?.shop && typeof snap.shop === 'object' ? snap.shop : {};
      merged.set(key, {
        shopId: cred.shopId,
        storeSlug: cred.storeSlug,
        nameAr: String(shopObj.nameAr || cred.nameAr || cred.storeSlug),
        email: cred.email || '',
        phone: String(shopObj.whatsapp || cred.phone || ''),
        resetCode:
          cred.resetCode && (!cred.resetCodeExpiresAt || Date.now() < cred.resetCodeExpiresAt)
            ? cred.resetCode
            : undefined,
        resetCodeExpiresAt: cred.resetCodeExpiresAt,
        createdAt: Number(cred.createdAt || snap?.createdAt || shopObj.createdAt || cred.updatedAt || Date.now()),
        updatedAt: Number(snap?.updatedAt || cred.updatedAt || Date.now()),
        shop: {
          ...shopObj,
          id: cred.shopId,
          storeSlug: cred.storeSlug,
          nameAr: String(shopObj.nameAr || cred.nameAr || cred.storeSlug),
          whatsapp: String(shopObj.whatsapp || cred.phone || ''),
          country: String(shopObj.country || 'مصر'),
          subscriptionStatus: String(shopObj.subscriptionStatus || 'trial'),
        },
        productsCount: Array.isArray(snap?.products) ? snap.products.length : 0,
      });
    }

    for (const snap of Object.values(menusBySlug)) {
      const key = snap.storeSlug || snap.shopId;
      if (merged.has(key)) continue;
      const shopObj = snap.shop && typeof snap.shop === 'object' ? snap.shop : {};
      const byShopId = Array.from(merged.values()).find((item) => item.shopId === snap.shopId);
      if (byShopId) continue;
      merged.set(key, {
        shopId: snap.shopId,
        storeSlug: snap.storeSlug,
        nameAr: String(shopObj.nameAr || snap.storeSlug),
        email: '',
        phone: String(shopObj.whatsapp || ''),
        createdAt: Number(snap.createdAt || shopObj.createdAt || snap.updatedAt || Date.now()),
        updatedAt: Number(snap.updatedAt || Date.now()),
        shop: {
          ...shopObj,
          id: snap.shopId,
          storeSlug: snap.storeSlug,
          country: String(shopObj.country || 'مصر'),
          subscriptionStatus: String(shopObj.subscriptionStatus || 'trial'),
        },
        productsCount: Array.isArray(snap.products) ? snap.products.length : 0,
      });
    }

    const stores = Array.from(merged.values()).sort(
      (a, b) => Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0)
    );
    res.json({ ok: true, stores });
  });

  app.post('/api/admin/update-store', (req: Request, res: Response) => {
    if (!requireAdminAuth(req, res)) return;
    const body = req.body as {
      shopId?: string;
      storeSlug?: string;
      updates?: Record<string, unknown>;
    };
    const slug = normalizeSlugServer(body.storeSlug || body.shopId || '');
    const shopId = String(body.shopId || slug || '').trim();
    if (!slug && !shopId) {
      res.status(400).json({ ok: false, error: 'معرف المتجر مطلوب.' });
      return;
    }
    const updates = body.updates && typeof body.updates === 'object' ? body.updates : {};
    const menus = serverRegistry.publicMenus || {};
    const existingSnap =
      menus[slug] ||
      Object.values(menus).find((m) => m.shopId === shopId || m.storeSlug === slug);
    const cred =
      serverRegistry.stores[slug] ||
      Object.values(serverRegistry.stores).find((s) => s.shopId === shopId || s.storeSlug === slug);

    const targetSlug = existingSnap?.storeSlug || cred?.storeSlug || slug || shopId;
    const targetShopId = existingSnap?.shopId || cred?.shopId || shopId || targetSlug;
    const prevShop = existingSnap?.shop || {
      id: targetShopId,
      storeSlug: targetSlug,
      nameAr: cred?.nameAr || targetSlug,
      country: 'مصر',
      acceptOrders: true,
      isOpen: true,
      subscriptionStatus: 'trial',
    };
    const nextShop = {
      ...prevShop,
      ...updates,
      id: targetShopId,
      storeSlug: targetSlug,
      updatedAt: Date.now(),
    };
    serverRegistry.publicMenus = {
      ...menus,
      [targetSlug]: {
        shopId: targetShopId,
        storeSlug: targetSlug,
        shop: nextShop,
        products: existingSnap?.products || [],
        createdAt: existingSnap?.createdAt || cred?.createdAt || Date.now(),
        updatedAt: Date.now(),
      },
    };
    if (cred) {
      cred.updatedAt = Date.now();
      if (typeof updates.whatsapp === 'string') cred.phone = updates.whatsapp.slice(0, 40);
      if (typeof updates.nameAr === 'string') cred.nameAr = updates.nameAr.slice(0, 120);
      serverRegistry.stores[cred.storeSlug] = cred;
    }
    persistRegistryState(serverRegistry);
    res.json({ ok: true, shop: nextShop });
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
    const slug = normalizeSlugServer(body.storeSlug || body.shopId || body.nameAr || '');
    const pass = String(body.password || '');
    if (!slug) {
      res.status(400).json({ ok: false, error: 'يرجى إدخال عنوان المتجر.' });
      return;
    }
    if (serverRegistry.stores[slug]) {
      res.status(409).json({ ok: false, error: 'اسم المتجر مستخدم بالفعل. اختر اسماً آخر أو تواصل مع الدعم.' });
      return;
    }
    const hasNewPass = pass.trim().length >= 4;
    const { salt, hash } = hasNewPass
      ? hashPasswordScrypt(pass)
      : { salt: '', hash: '' };
    const now = Date.now();
    const cred: ServerStoreCredential = {
      shopId: body.shopId || slug,
      storeSlug: slug,
      nameAr: String(body.nameAr || slug).slice(0, 120),
      email: String(body.email || '').slice(0, 200),
      phone: String(body.phone || '').slice(0, 40),
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: now,
      updatedAt: now,
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
    const now = Date.now();
    const snapshot: PublicMenuSnapshot = {
      shopId,
      storeSlug,
      shop: {
        ...shopObj,
        id: shopId,
        storeSlug,
      },
      products: incomingProducts,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    serverRegistry.publicMenus = {
      ...menus,
      [storeSlug]: snapshot,
    };
    if (serverRegistry.stores[storeSlug] && typeof shopObj.nameAr === 'string' && shopObj.nameAr.trim()) {
      serverRegistry.stores[storeSlug] = {
        ...serverRegistry.stores[storeSlug],
        nameAr: shopObj.nameAr.trim().slice(0, 120),
        updatedAt: now,
      };
    }
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
      const promptText = `اقرأ واستخرج كل الأقسام والأصناف والأسعار من المنيو (${fileNamesList}) لنشاط "${businessName || 'متجر'}" (${language || 'العربية'}).
أرجع sections مرتبة (العروض ثم الرئيسية والمشويات ثم الساندوتشات ثم الإضافات والحلويات والمشروبات).
كل سطر في rows بالصيغة:
"الاسم || السعر || الخيارات مفصولة بـ / (إن وجدت) || الوصف (فقط لو مكتوب)"
أمثلة: "كفتة مشوية || 220" أو "لحم بلدي || 110 || ربع - 110 / نص - 215 / كيلو - 420".
لا تكتب وصفاً من عندك ولا تخترع أسعاراً (لو بدون سعر اكتب 0).`;

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
            text: `جدول المنيو (${f.fileName || 'Excel'}):\n${f.textContent.slice(0, 50000)}`,
          });
        }
      }
      parts.push({ text: promptText });

      const extractResponseSchema = {
        type: Type.OBJECT,
        properties: {
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                cat: { type: Type.STRING },
                isOffer: { type: Type.BOOLEAN },
                rows: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['cat', 'rows'],
            },
          },
        },
        required: ['sections'],
      };

      const withModelTimeout = <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`MODEL_TIMEOUT_${label}`)), timeoutMs);
          promise.then(
            (val) => {
              clearTimeout(timer);
              resolve(val);
            },
            (err) => {
              clearTimeout(timer);
              reject(err);
            }
          );
        });

      const callExtractModel = async (
        modelName: string,
        timeoutMs: number,
        thinkingLevel?: ThinkingLevel
      ): Promise<string> => {
        const response = await withModelTimeout(
          ai.models.generateContent({
            model: modelName,
            contents: { parts },
            config: {
              systemInstruction:
                'Fast accurate Arabic & English restaurant menu extractor. Output compact valid JSON matching schema immediately.',
              temperature: 0.1,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
              responseSchema: extractResponseSchema,
              ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
            },
          }),
          timeoutMs,
          modelName
        );
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
          msg.includes('502') ||
          msg.includes('504') ||
          msg.includes('unavailable') ||
          msg.includes('high demand') ||
          msg.includes('overloaded') ||
          msg.includes('429') ||
          msg.includes('resource_exhausted') ||
          msg.includes('not_found') ||
          msg.includes('404') ||
          msg.includes('timeout') ||
          msg.includes('timed out') ||
          msg.includes('aborted') ||
          msg.includes('fetch failed') ||
          msg.includes('econnreset') ||
          msg.includes('empty_model_response')
        );
      };

      const attemptChain: Array<{
        model: string;
        timeoutMs: number;
        thinkingLevel?: ThinkingLevel;
        delayBeforeMs?: number;
      }> = [
        { model: 'gemini-3.1-flash-lite', timeoutMs: 14000, thinkingLevel: ThinkingLevel.MINIMAL },
        { model: 'gemini-4-hydrogen', timeoutMs: 22000, thinkingLevel: ThinkingLevel.MINIMAL, delayBeforeMs: 150 },
        { model: 'gemini-3.1-flash-lite', timeoutMs: 16000, thinkingLevel: ThinkingLevel.MINIMAL, delayBeforeMs: 300 },
      ];

      let responseRawText = '';
      let lastAiError: unknown = null;
      const attemptTrace: string[] = [];

      for (const step of attemptChain) {
        try {
          if (step.delayBeforeMs) {
            await new Promise((r) => setTimeout(r, step.delayBeforeMs));
          }
          responseRawText = await callExtractModel(step.model, step.timeoutMs, step.thinkingLevel);
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

      interface RawMenuSection {
        cat?: string;
        isOffer?: boolean;
        rows?: string[];
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
        sections?: RawMenuSection[];
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
          // Salvage balanced section objects from truncated responses
          const secIdx = cleaned.indexOf('"sections"');
          const arrStart = secIdx >= 0 ? cleaned.indexOf('[', secIdx) : -1;
          const salvagedSections: RawMenuSection[] = [];

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
                    const parsedObj = JSON.parse(candidateSlice) as RawMenuSection;
                    if (parsedObj && typeof parsedObj.cat === 'string' && Array.isArray(parsedObj.rows)) {
                      salvagedSections.push(parsedObj);
                    }
                  } catch {
                    // skip malformed object
                  }
                  objStart = -1;
                }
              }
            }
          }

          if (salvagedSections.length > 0) {
            return { sections: salvagedSections };
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

      const parseCompactPrice = (rawPrice: string): number => {
        const norm = toAsciiDigits(rawPrice || '').replace(/,/g, '.');
        const m = norm.match(/([0-9]+(?:\.[0-9]+)?)/);
        if (!m) return 0;
        const n = Number(m[1]);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      };

      const expandedItems: RawMenuItem[] = [];
      const sectionCategories: string[] = [];

      if (Array.isArray(parsed.sections)) {
        for (const sec of parsed.sections) {
          const catName = String(sec?.cat || 'أصناف متنوعة').trim().slice(0, 80);
          if (catName) sectionCategories.push(catName);
          const secIsOffer =
            Boolean(sec?.isOffer) ||
            /عروض|عرض|توفير|باقات|باقة|بوكسات|offers|deals/i.test(catName);
          const rows = Array.isArray(sec?.rows) ? sec.rows : [];
          for (const row of rows) {
            if (typeof row !== 'string' || !row.trim()) continue;
            const cols = row.split('||').map((c) => c.trim());
            const itemName = (cols[0] || '').trim();
            if (!itemName) continue;
            const parsedPrice = parseCompactPrice(cols[1] || '0');
            const variantsRaw = (cols[2] || '').trim();
            const variantsList = variantsRaw
              ? variantsRaw
                  .split(/\s*\/\s*/)
                  .map((v) => v.trim())
                  .filter(Boolean)
              : [];
            const descText = (cols[3] || '').trim();
            const itemIsOffer =
              secIsOffer || /عرض|توفير|باقة|بوكس|offer|combo|bundle/i.test(itemName);
            expandedItems.push({
              name: itemName,
              category: catName || 'أصناف متنوعة',
              price: parsedPrice,
              variants: variantsList,
              description: descText,
              isOffer: itemIsOffer,
              offerLabel: itemIsOffer ? 'عرض خاص' : undefined,
            });
          }
        }
      }

      const rawItemsList = expandedItems.length > 0 ? expandedItems : parsed.items || [];

      const cleanedRaw = rawItemsList
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

      const resolvedItems = cleanedRaw.map((item, idx) => ({
        name: item.name,
        category: item.category,
        price: item.price,
        description: item.description,
        variants: item.variants,
        ...(item.isOffer ? { isOffer: true, offerLabel: item.offerLabel } : {}),
        imageUrl:
          VERIFIED_DISH_FALLBACKS[inferDishFamily(item.name, item.category, item.photoQuery)] ||
          VERIFIED_DISH_FALLBACKS.grill,
        sortOrder: idx,
      }));

      const categorySet = new Set<string>();
      for (const item of resolvedItems) {
        categorySet.add(item.category);
      }
      for (const cat of [...sectionCategories, ...(parsed.categories || [])]) {
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