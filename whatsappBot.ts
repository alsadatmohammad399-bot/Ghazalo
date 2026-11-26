import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

// Ghazalo WhatsApp assistant (Meta WhatsApp Cloud API webhook).
// Env: WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_NUMBER_ID, GEMINI_API_KEY
// Optional: WHATSAPP_BOT_ENABLED=0 to pause, UPSTASH_REDIS_REST_URL/TOKEN (or KV_*) for chat memory.

const SITE = 'https://ghazalo.vercel.app/';
const GRAPH = 'https://graph.facebook.com/v23.0';

const SYSTEM_PROMPT = `انت مساعد "غزالو" على واتساب. بتتكلم بالعامية المصرية، بأسلوب ودود ومحترم ومختصر (رسايل قصيرة، مش محاضرات). ممكن تستخدم إيموجي بسيط.

غزالو (Ghazalo) منصة مصرية للمطاعم والكافيهات: منيو إلكتروني بلينك وQR، سلة وطلب عن طريق واتساب، كاشير ونظام طلبات بيوصل للكاشير في ثواني بصوت تنبيه، فواتير/إيصالات جاهزة للطباعة (توصيل واستلام) ورقم طلب يومي، عروض، وقوالب تصميم متعددة. بدون عمولة على الطلبات.
الأسعار: 7 أيام تجربة مجانية، وبعدها 600 جنيه شهريًا أو 5000 جنيه سنويًا (بدل 7200).
الموقع: ${SITE}

دورك: تعرّف بالمنصة وتجاوب على الأسئلة وتمشّي العميل خطوة خطوة للتسجيل:
1) يفتح ${SITE} ويدوس إنشاء حساب / تسجيل مطعم.
2) يكتب بيانات المطعم (الاسم، النوع، رقم التواصل) ويسجل.
3) يضيف المنيو (أصناف وأسعار وصور) أو يرفع ملف/صورة المنيو وهو بيستخرجه.
4) ياخد لينك المنيو وQR ويحطه في الصفحة والمحل، ويفتح صفحة الكاشير عشان يستلم الطلبات.
ابعت خطوة واحدة في المرة واسأل لو محتاج مساعدة قبل ما تكمل.

قواعد:
- متخترعش مميزات أو أسعار مش مذكورة هنا. لو مش متأكد قول "هسأل صاحب المنصة وهيرد عليك".
- الدفع والاشتراك بعد التجربة: بيتم بالتواصل مع محمد، متطلبش فلوس ولا بيانات دفع في الشات.
- لو العميل طلب يكلم شخص، أو عنده مشكلة تقنية معقدة، أو زعلان: قوله إن محمد من غزالو هيرد عليه بنفسه قريب.
- متطلبش باسوردات ولا أرقام كروت. متتكلمش في مواضيع بعيدة عن غزالو، ارجع بلطف للموضوع.
- جاوب بنفس لغة العميل (لو كتب إنجليزي رد إنجليزي).
- أول رسالة للعميل: رحب وقدّم غزالو في سطرين وقوله إن التجربة 7 أيام مجانية واسأله عن نوع نشاطه.`;

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

async function redis(args: string[]): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const j = (await r.json()) as { result?: unknown };
    return j.result ?? null;
  } catch {
    return null;
  }
}

type Turn = { role: 'user' | 'model'; text: string };

async function loadHistory(wa: string): Promise<Turn[]> {
  const raw = await redis(['GET', `ghazalo:wa:hist:${wa}`]);
  if (typeof raw !== 'string') return [];
  try {
    return JSON.parse(raw) as Turn[];
  } catch {
    return [];
  }
}

async function saveHistory(wa: string, h: Turn[]) {
  await redis(['SET', `ghazalo:wa:hist:${wa}`, JSON.stringify(h.slice(-16)), 'EX', '604800']);
}

async function seen(id: string): Promise<boolean> {
  const r = await redis(['SET', `ghazalo:wa:msg:${id}`, '1', 'NX', 'EX', '86400']);
  return REDIS_URL ? r !== 'OK' : false;
}

function verifySignature(req: Request): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;
  const sig = String(req.headers['x-hub-signature-256'] || '');
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!sig.startsWith('sha256=') || !raw) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = sig.slice(7);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function wa(path: string, body: unknown) {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const r = await fetch(`${GRAPH}/${id}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...(body as object) }),
  });
  if (!r.ok) console.error('whatsapp send failed', r.status, await r.text().catch(() => ''));
}

const sendText = (to: string, text: string) =>
  wa('messages', { to, type: 'text', text: { body: text.slice(0, 3500), preview_url: true } });

async function aiReply(history: Turn[], userText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = [...history, { role: 'user' as const, text: userText }].map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));
  const res = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents,
    config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.5, maxOutputTokens: 500 },
  });
  return (res.text || '').trim();
}

const FALLBACK = `أهلاً بيك 👋 معاك مساعد غزالو.
غزالو منصة منيو إلكتروني وكاشير وفواتير للمطاعم والكافيهات، وعندك 7 أيام تجربة مجانية.
ابدأ من هنا: ${SITE}
ومحمد هيرد عليك قريب لو محتاج مساعدة.`;

async function handleMessage(msg: { id: string; from: string; type: string; text?: { body: string } }) {
  if (await seen(msg.id)) return;
  wa('messages', { status: 'read', message_id: msg.id }).catch(() => {});
  if (msg.type !== 'text' || !msg.text?.body) {
    await sendText(msg.from, 'أهلاً بيك 👋 ابعتلي سؤالك مكتوب وأنا أساعدك. وتقدر تبدأ تجربتك المجانية 7 أيام من هنا: ' + SITE);
    return;
  }
  const history = await loadHistory(msg.from);
  let reply = '';
  try {
    reply = await aiReply(history, msg.text.body.slice(0, 1500));
  } catch (e) {
    console.error('ai failed', e);
  }
  if (!reply) reply = FALLBACK;
  await sendText(msg.from, reply);
  await saveHistory(msg.from, [...history, { role: 'user', text: msg.text.body.slice(0, 1500) }, { role: 'model', text: reply }]);
}

export function registerWhatsAppBot(app: Express) {
  app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token) {
      res.status(200).send(String(req.query['hub.challenge'] || ''));
      return;
    }
    res.sendStatus(403);
  });

  app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
    if (!verifySignature(req)) {
      res.sendStatus(401);
      return;
    }
    if (process.env.WHATSAPP_BOT_ENABLED === '0' || !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
      res.sendStatus(200);
      return;
    }
    // Serverless freezes after the response, so finish the work first (Meta allows several seconds).
    try {
      const entries = (req.body?.entry || []) as Array<{ changes?: Array<{ value?: { messages?: any[] } }> }>;
      for (const e of entries)
        for (const c of e.changes || [])
          for (const m of c.value?.messages || []) await handleMessage(m);
    } catch (err) {
      console.error('webhook error', err);
    }
    res.sendStatus(200);
  });
}
