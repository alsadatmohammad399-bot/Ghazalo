import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChefHat,
  Eye,
  Plus,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import { formatMoney } from '../utils/calculations';
import { getProductOptions } from '../utils/productVariants';
import { getShopDisplayName, tx } from '../utils/uiLang';
import type { Product, Shop } from '../types';

interface ChefAiAssistantProps {
  shop: Shop;
  products: Product[];
  categories: string[];
  darkMode: boolean;
  isEn: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToCart: (product: Product) => void;
  onOpenProductDetail: (product: Product) => void;
  hasBottomDock?: boolean;
  pendingQuestion?: { id: string; text: string } | null;
  onPendingQuestionHandled?: () => void;
  variant?: 'royal' | 'emerald';
}

type GuidedStepKey = 'diet' | 'spicy' | 'hungry' | 'category';

interface ChefPreferences {
  isDiet?: boolean;
  isSpicy?: boolean;
  portion?: 'light' | 'medium' | 'heavy';
  category?: string;
}

interface ChatChip {
  label: string;
  solid?: boolean;
  action: () => void;
}

interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  kind: 'text' | 'product';
  text?: string;
  product?: Product;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const ChefAiAssistant: React.FC<ChefAiAssistantProps> = ({
  shop,
  products,
  categories,
  darkMode,
  isEn,
  isOpen,
  onOpenChange,
  onAddToCart,
  onOpenProductDetail,
  hasBottomDock = true,
  pendingQuestion = null,
  onPendingQuestionHandled,
  variant = 'royal',
}) => {
  const isEmerald = variant === 'emerald';
  const displayShopName = getShopDisplayName(shop, isEn);
  const cleanCategories = useMemo(
    () => categories.filter((c) => c && c !== '__all__'),
    [categories]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chips, setChips] = useState<ChatChip[]>([]);
  const [typing, setTyping] = useState(false);
  const [inviteHint, setInviteHint] = useState<string | null>(null);
  const [freeInput, setFreeInput] = useState('');
  const [lastFreePrompt, setLastFreePrompt] = useState('');
  const [initialized, setInitialized] = useState(false);

  const prefsRef = useRef<ChefPreferences>({});
  const queueRef = useRef<GuidedStepKey[]>([]);
  const shownProductIdsRef = useRef<Set<string>>(new Set());
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const lastHandledQuestionIdRef = useRef<string | null>(null);

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const clearPendingTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearPendingTimers();
  }, [clearPendingTimers]);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages, typing, chips]);

  // Rotating invite bubble when closed (matching Zain El Sham pattern)
  useEffect(() => {
    if (isOpen) {
      setInviteHint(null);
      return;
    }
    const hints = isEn
      ? [
          'Ask about ingredients or prices',
          'Not sure what to order?',
          'Let Chef AI pick for you',
        ]
      : [
          'عايز تعرف المكونات أو الأسعار؟',
          'محتار تطلب إيه؟',
          'اسأل الشيف عن أي صنف',
          'سيبها على الشيف',
        ];

    let hideTimeout: number | null = null;
    const triggerHint = () => {
      setInviteHint(pickRandom(hints));
      hideTimeout = window.setTimeout(() => setInviteHint(null), 4200);
    };

    const initialTimer = window.setTimeout(triggerHint, 2200);
    const interval = window.setInterval(triggerHint, 11000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      if (hideTimeout) window.clearTimeout(hideTimeout);
    };
  }, [isOpen, isEn]);

  const appendMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ]);
  }, []);

  const botSay = useCallback(
    (text: string, done?: () => void) => {
      setTyping(true);
      scheduleTimer(() => {
        setTyping(false);
        appendMessage({ role: 'bot', kind: 'text', text });
        done?.();
      }, 450);
    },
    [appendMessage, scheduleTimer]
  );

  // Score and select the best matching dish from the restaurant's live menu
  const findRecommendedProduct = useCallback(
    (prefs: ChefPreferences): Product | null => {
      if (products.length === 0) return null;

      const sortedPrices = [...products].map((p) => Number(p.price || 0)).sort((a, b) => a - b);
      const lowCap = sortedPrices[Math.floor(sortedPrices.length * 0.35)] || 100;
      const highFloor = sortedPrices[Math.floor(sortedPrices.length * 0.65)] || 180;

      const scored = products.map((item) => {
        let score = 0;
        const text = `${item.name} ${item.category} ${item.description || ''}`.toLowerCase();

        if (prefs.category && item.category === prefs.category) {
          score += 60;
        }
        if (prefs.isDiet === true) {
          if (/سلط|شورب|مشوي|صدور|دايت|تونة|خضار|عصير|salad|soup|grill|diet/.test(text)) {
            score += 25;
          }
          if (/مقلي|كومبو|بشاميل|تشيز|كريسبي|فرايز|crispy|fried|double/.test(text)) {
            score -= 15;
          }
        } else if (prefs.isDiet === false) {
          if (/عرض|وجبة|مشويات|شاورما|كفتة|برجر|بيتزا|طاجن|box|meal|grill/.test(text)) {
            score += 10;
          }
        }

        if (prefs.isSpicy === true) {
          if (/حار|سبايسي|شطة|فاهيتا|زنجر|تندوري|مكسيكي|spicy|hot|zinger/.test(text)) {
            score += 25;
          }
        } else if (prefs.isSpicy === false) {
          if (/حار|سبايسي|شطة|spicy|hot/.test(text)) {
            score -= 20;
          }
        }

        const price = Number(item.price || 0);
        if (prefs.portion === 'light') {
          if (price > 0 && price <= lowCap) score += 20;
        } else if (prefs.portion === 'medium') {
          if (price >= lowCap && price <= highFloor) score += 16;
        } else if (prefs.portion === 'heavy') {
          if (price >= highFloor || item.isOffer) score += 20;
        }

        if (item.isOffer) score += 6;
        if (!shownProductIdsRef.current.has(item.id)) score += 35;

        return { item, score, jitter: Math.random() * 6 };
      });

      scored.sort((a, b) => b.score + b.jitter - (a.score + a.jitter));
      const best = scored[0]?.item || null;
      if (best && shownProductIdsRef.current.size >= products.length) {
        shownProductIdsRef.current.clear();
      }
      if (best) {
        shownProductIdsRef.current.add(best.id);
      }
      return best;
    },
    [products]
  );

  const showResultActions = useCallback(
    (product: Product, onRestart: () => void, onRetryAnother: () => void) => {
      const options = getProductOptions(product);
      setChips([
        {
          label:
            options.length > 0
              ? tx(isEn, 'اختر الحجم / أضف للسلة', 'Choose & Add to Cart')
              : tx(isEn, 'أضف للسلة', 'Add to Cart'),
          solid: true,
          action: () => {
            if (options.length > 0 || Number(product.price || 0) === 0) {
              onOpenProductDetail(product);
              return;
            }
            onAddToCart(product);
            appendMessage({
              role: 'bot',
              kind: 'text',
              text: tx(
                isEn,
                `تمت إضافة "${product.name}" إلى السلة بنجاح.`,
                `Added "${product.name}" to your cart.`
              ),
            });
          },
        },
        {
          label: tx(isEn, 'شوف التفاصيل', 'See details'),
          action: () => onOpenProductDetail(product),
        },
        {
          label: tx(isEn, 'اقترحلي حاجة تانية', 'Try another'),
          action: () => {
            appendMessage({
              role: 'user',
              kind: 'text',
              text: tx(isEn, 'اقترحلي حاجة تانية', 'Try another'),
            });
            onRetryAnother();
          },
        },
        {
          label: tx(isEn, 'نبدأ من الأول', 'Start over'),
          action: onRestart,
        },
      ]);
    },
    [appendMessage, isEn, onAddToCart, onOpenProductDetail]
  );

  const recommendNowRef = useRef<() => void>(() => {});
  const restartFlowRef = useRef<() => void>(() => {});
  const askStepRef = useRef<(step: GuidedStepKey) => void>(() => {});

  const chooseAnswer = useCallback(
    (label: string, updatePrefs?: () => void, forceRecommendNow?: boolean) => {
      setChips([]);
      updatePrefs?.();
      appendMessage({ role: 'user', kind: 'text', text: label });
      if (forceRecommendNow) {
        recommendNowRef.current();
        return;
      }
      const nextStep = queueRef.current.shift();
      if (nextStep) {
        askStepRef.current(nextStep);
      } else {
        recommendNowRef.current();
      }
    },
    [appendMessage]
  );

  recommendNowRef.current = () => {
    setChips([]);
    setTyping(true);
    scheduleTimer(() => {
      setTyping(false);
      const picked = findRecommendedProduct(prefsRef.current);
      if (!picked) {
        appendMessage({
          role: 'bot',
          kind: 'text',
          text: tx(
            isEn,
            'لم أجد أصنافاً مضافة في المنيو حتى الآن، تصفح القائمة أو جرب إعادة البدء.',
            'No matching items found in the menu yet. Try resetting your filters.'
          ),
        });
        setChips([
          {
            label: tx(isEn, 'امسح الفلاتر', 'Clear filters'),
            solid: true,
            action: () => {
              prefsRef.current = {};
              shownProductIdsRef.current.clear();
              recommendNowRef.current();
            },
          },
          {
            label: tx(isEn, 'نبدأ من الأول', 'Start over'),
            action: () => restartFlowRef.current(),
          },
        ]);
        return;
      }

      const intros = isEn
        ? ['How about this dish?', 'Found a great pick for you!', 'Chef recommends this one:']
        : ['إيه رأيك في ده؟', 'لقيتلك اختيار ممتاز!', 'اختارتلك الطبق ده — ثقة في الشيف:'];
      const asks = isEn
        ? ['What do you think?', 'Shall we add it to your order?']
        : ['إيه رأيك؟', 'عجبك الاختيار ولا تحب نغير؟'];

      appendMessage({ role: 'bot', kind: 'text', text: pickRandom(intros) });
      appendMessage({ role: 'bot', kind: 'product', product: picked });
      scheduleTimer(() => {
        appendMessage({ role: 'bot', kind: 'text', text: pickRandom(asks) });
        showResultActions(picked, () => restartFlowRef.current(), () => recommendNowRef.current());
      }, 320);
    }, 650);
  };

  askStepRef.current = (step: GuidedStepKey) => {
    const surpriseChip: ChatChip = {
      label: tx(isEn, 'اختارلي على طول', 'Surprise me'),
      solid: true,
      action: () =>
        chooseAnswer(
          tx(isEn, 'اختارلي على طول', 'Just pick for me'),
          () => {
            queueRef.current = [];
          },
          true
        ),
    };

    if (step === 'diet') {
      const prompts = isEn
        ? ['Are you eating light/diet today?', 'Counting calories or full feast today?']
        : ['عامل دايت النهاردة ولا لأ؟', 'بتحسب سعراتك ولا اليوم مفتوح؟'];
      botSay(pickRandom(prompts), () => {
        setChips([
          {
            label: tx(isEn, 'دايت وأكل خفيف', 'Light / Diet'),
            action: () =>
              chooseAnswer(tx(isEn, 'دايت وأكل خفيف', 'Diet & Light'), () => {
                prefsRef.current.isDiet = true;
                prefsRef.current.portion = 'light';
              }),
          },
          {
            label: tx(isEn, 'لأ، عادي', 'Not today'),
            action: () =>
              chooseAnswer(tx(isEn, 'لأ، عادي', 'Regular meal'), () => {
                prefsRef.current.isDiet = false;
              }),
          },
          surpriseChip,
        ]);
      });
    } else if (step === 'spicy') {
      const prompts = isEn
        ? ['Spicy or mild flavors?', 'How do you like your spice level?']
        : ['بتحب الحراق ولا عادي؟', 'سبايسي ولا بدون شطة؟'];
      botSay(pickRandom(prompts), () => {
        setChips([
          {
            label: tx(isEn, 'سبايسي وحراق', 'Spicy'),
            action: () =>
              chooseAnswer(tx(isEn, 'سبايسي', 'Spicy'), () => {
                prefsRef.current.isSpicy = true;
              }),
          },
          {
            label: tx(isEn, 'عادي بدون شطة', 'Mild'),
            action: () =>
              chooseAnswer(tx(isEn, 'عادي', 'Mild'), () => {
                prefsRef.current.isSpicy = false;
              }),
          },
          {
            label: tx(isEn, 'أي حاجة تمشي', 'Anything works'),
            action: () => chooseAnswer(tx(isEn, 'أي حاجة تمشي', 'Anything works')),
          },
          surpriseChip,
        ]);
      });
    } else if (step === 'hungry') {
      const prompts = isEn
        ? ['How hungry are you right now?', 'Pick your portion vibe:']
        : ['حاسس بجوع قد إيه دلوقتي؟', 'عايز وجبة خفيفة ولا مشبعة؟'];
      botSay(pickRandom(prompts), () => {
        setChips([
          {
            label: tx(isEn, 'خفيف', 'Light bite'),
            action: () =>
              chooseAnswer(tx(isEn, 'وجبة خفيفة', 'Light bite'), () => {
                prefsRef.current.portion = 'light';
              }),
          },
          {
            label: tx(isEn, 'وسط', 'Medium meal'),
            action: () =>
              chooseAnswer(tx(isEn, 'وجبة وسط', 'Medium meal'), () => {
                prefsRef.current.portion = 'medium';
              }),
          },
          {
            label: tx(isEn, 'جعان جداً / عائلي', 'Very hungry / Feast'),
            action: () =>
              chooseAnswer(tx(isEn, 'وجبة مشبعة', 'Hearty meal'), () => {
                prefsRef.current.portion = 'heavy';
              }),
          },
          surpriseChip,
        ]);
      });
    } else if (step === 'category') {
      if (cleanCategories.length === 0) {
        recommendNowRef.current();
        return;
      }
      const topThree = cleanCategories.slice(0, 3);
      const rest = cleanCategories.slice(3);
      const q = isEn
        ? `What are you craving right now — ${topThree.join(', ')}?`
        : `نفسك رايحة لإيه من المنيو — ${topThree.join('، ')}؟`;
      botSay(q, () => {
        const makeCatChip = (catName: string): ChatChip => ({
          label: catName,
          action: () =>
            chooseAnswer(catName, () => {
              prefsRef.current.category = catName;
            }),
        });
        setChips([
          ...topThree.map(makeCatChip),
          ...(rest.length > 0
            ? [
                {
                  label: tx(isEn, 'حاجة تانية؟', 'More categories'),
                  action: () => {
                    appendMessage({
                      role: 'user',
                      kind: 'text',
                      text: tx(isEn, 'حاجة تانية', 'Something else'),
                    });
                    botSay(tx(isEn, 'دي باقي أقسام المنيو عندنا:', 'Here are the rest of our categories:'), () => {
                      setChips([
                        ...rest.map(makeCatChip),
                        {
                          label: tx(isEn, 'أي حاجة تمشي', 'Anything works'),
                          action: () => chooseAnswer(tx(isEn, 'أي حاجة تمشي', 'Anything works')),
                        },
                        surpriseChip,
                      ]);
                    });
                  },
                },
              ]
            : []),
          {
            label: tx(isEn, 'أي قسم', 'Any category'),
            action: () => chooseAnswer(tx(isEn, 'أي حاجة تمشي', 'Anything works')),
          },
          surpriseChip,
        ]);
      });
    }
  };

  const buildQueue = (): GuidedStepKey[] => {
    const base: GuidedStepKey[] = ['diet', 'spicy', 'hungry'];
    if (cleanCategories.length > 0) {
      base.splice(1, 0, 'category');
    }
    return base;
  };

  restartFlowRef.current = () => {
    clearPendingTimers();
    prefsRef.current = {};
    queueRef.current = buildQueue();
    setChips([]);
    setMessages([]);
    const greetings = isEn
      ? [
          `Welcome! I am the AI Chef for ${displayShopName}. Ask me about any dish's ingredients or prices, or pick from the options below!`,
          `Hello! Ask me about ingredients, sizes, prices, or answer 2 quick taps to pick your meal.`,
        ]
      : [
          `أهلاً بك! أنا شيف ${displayShopName} الذكي. اسألني تحت عن مكونات أو أسعار أي صنف، أو اختار من الأزرار السريعة.`,
          `أهلاً بك في ${displayShopName}! تقدر تسألني عن المكونات والأسعار والعروض أو نختارلك وجبتك في ثواني.`,
        ];
    botSay(pickRandom(greetings), () => {
      const first = queueRef.current.shift();
      if (first) askStepRef.current(first);
    });
  };

  // Free-text AI Chat powered by server-side Gemini API (/api/ai/menu-chat)
  const submitFreeQuestion = useCallback(
    async (questionText: string) => {
      const clean = questionText.trim();
      if (!clean || typing) return;
      clearPendingTimers();
      setFreeInput('');
      setLastFreePrompt(clean);
      setChips([]);
      appendMessage({ role: 'user', kind: 'text', text: clean });
      setTyping(true);

      try {
        const historyPayload = messages
          .filter((m) => m.kind === 'text' && m.text)
          .slice(-6)
          .map((m) => ({ role: m.role, text: m.text }));

        const res = await fetch('/api/ai/menu-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopName: displayShopName,
            language: isEn ? 'en' : 'ar',
            country: shop.country,
            message: clean,
            history: historyPayload,
            deliveryInfo: {
              deliveryFee: shop.deliveryFee,
              freeDelivery: shop.freeDelivery,
              freeDeliveryMinOrder: shop.freeDeliveryMinOrder,
            },
            products: products.slice(0, 120).map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              price: p.price,
              originalPrice: p.originalPrice,
              description: p.description,
              variants: p.variants,
              isOffer: p.isOffer,
              offerLabel: p.offerLabel,
            })),
          }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          reply?: string;
          recommendedProductIds?: string[];
          followUpChips?: string[];
        };

        setTyping(false);

      if (!res.ok) {
        appendMessage({
          role: 'bot',
          kind: 'text',
          text:
            data.error ||
            tx(
              isEn,
              'Chef AI is currently busy. Tap Retry or use the quick guide buttons below.',
              'الشيف الذكي مشغول لحظياً — اضغط إعادة المحاولة أو ابدأ الاختيار السريع.'
            ),
        });
        setChips([
          {
            label: tx(isEn, 'إعادة المحاولة', 'Retry'),
            solid: true,
            action: () => void submitFreeQuestion(clean),
          },
          {
            label: tx(isEn, 'نبدأ الاختيار السريع', 'Quick guide'),
            action: () => restartFlowRef.current(),
          },
        ]);
        return;
      }

      appendMessage({
        role: 'bot',
        kind: 'text',
        text: data.reply || tx(isEn, 'Here is what I recommend:', 'ده ترشيحي ليك من المنيو:'),
      });

      const recProducts = (data.recommendedProductIds || [])
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p));

      recProducts.forEach((prod) => {
        appendMessage({ role: 'bot', kind: 'product', product: prod });
      });

      const followUps: ChatChip[] = (data.followUpChips || []).map((label) => ({
        label,
        action: () => void submitFreeQuestion(label),
      }));

      setChips([
        ...followUps,
        {
          label: tx(isEn, 'نبدأ من الأول', 'Start over'),
          action: () => restartFlowRef.current(),
        },
      ]);
      } catch {
        setTyping(false);
        appendMessage({
          role: 'bot',
          kind: 'text',
          text: tx(
            isEn,
            'Connection error reaching Chef AI. Please retry or use the quick guide.',
            'حدث خطأ في الاتصال بالشيف الذكي — جرب إعادة المحاولة أو الاختيار السريع.'
          ),
        });
        setChips([
          ...(lastFreePrompt
            ? [
                {
                  label: tx(isEn, 'إعادة المحاولة', 'Retry'),
                  solid: true,
                  action: () => void submitFreeQuestion(lastFreePrompt),
                },
              ]
            : []),
          {
            label: tx(isEn, 'الاختيار السريع', 'Quick guide'),
            action: () => restartFlowRef.current(),
          },
        ]);
      }
    },
    [
      appendMessage,
      clearPendingTimers,
      displayShopName,
      isEn,
      lastFreePrompt,
      messages,
      products,
      shop.country,
      shop.deliveryFee,
      shop.freeDelivery,
      shop.freeDeliveryMinOrder,
      typing,
    ]
  );

  const submitFreeQuestionRef = useRef(submitFreeQuestion);
  submitFreeQuestionRef.current = submitFreeQuestion;

  useEffect(() => {
    if (!isOpen) return;
    if (pendingQuestion && lastHandledQuestionIdRef.current !== pendingQuestion.id) {
      lastHandledQuestionIdRef.current = pendingQuestion.id;
      setInitialized(true);
      clearPendingTimers();
      void submitFreeQuestionRef.current(pendingQuestion.text);
      onPendingQuestionHandled?.();
      return;
    }
    if (!initialized) {
      setInitialized(true);
      restartFlowRef.current();
    }
  }, [clearPendingTimers, initialized, isOpen, onPendingQuestionHandled, pendingQuestion]);

  return (
    <>
      {/* Rotating Invite Bubble above Orbital FAB */}
      {!isOpen && inviteHint && (
        <div
          className={`no-print fixed left-4 ${
            hasBottomDock ? 'bottom-[142px] sm:bottom-24' : 'bottom-24 sm:bottom-24'
          } z-40 max-w-[220px] px-3.5 py-2 rounded-[14px] rounded-bl-[4px] text-xs font-extrabold shadow-lg pointer-events-none animate-chef-invite ${
            isEmerald
              ? darkMode
                ? 'bg-[#18231C] text-[#E8F2EB] border border-[#2C3D32]'
                : 'bg-white text-[#14201A] border border-[#CFE3D5]'
              : darkMode
                ? 'bg-[#1B2540] text-[#F5F1E8] border border-[#2A3550]'
                : 'bg-white text-[#20263A] border border-[#E3DCCB]'
          }`}
        >
          {inviteHint}
        </div>
      )}

      {/* Floating Orbital FAB */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={tx(isEn, 'مساعد المنيو الذكي', 'AI Menu Assistant')}
          title={tx(isEn, 'مساعد المنيو الذكي', 'AI Menu Assistant')}
          className={`no-print chef-fab-orbit fixed left-4 ${
            hasBottomDock ? 'bottom-[74px] sm:bottom-6' : 'bottom-5 sm:bottom-6'
          } z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl cursor-pointer transition-transform hover:scale-105 ${
            isEmerald
              ? darkMode
                ? 'bg-[#15803D] text-white border border-[#4ADE80]/60 backdrop-blur-md'
                : 'bg-[#15803D] text-white border border-[#86EFAC]/75 backdrop-blur-md'
              : darkMode
                ? 'bg-[#141C31]/90 text-[#C9A35B] border border-[#C9A35B]/60 backdrop-blur-md'
                : 'bg-[#1B2540]/92 text-[#DCB877] border border-[#A9813F]/75 backdrop-blur-md'
          }`}
        >
          <ChefHat className="w-6 h-6" />
        </button>
      )}

      {/* AI Chef & Customer Chat Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={tx(isEn, `مساعد ${displayShopName}`, `${displayShopName} Assistant AI`)}
          className={`no-print animate-chef-panel fixed left-4 ${
            hasBottomDock ? 'bottom-[72px] sm:bottom-6' : 'bottom-4 sm:bottom-6'
          } z-50 w-[min(380px,calc(100vw-2rem))] h-[min(74vh,590px)] rounded-[20px] flex flex-col overflow-hidden shadow-2xl border ${
            isEmerald
              ? darkMode
                ? 'bg-[#0F1712] border-[#2C3D32] text-[#E8F2EB]'
                : 'bg-[#F6FBF7] border-[#CFE3D5] text-[#14201A]'
              : darkMode
                ? 'bg-[#0A1120] border-[#2A3550] text-[#F5F1E8]'
                : 'bg-[#F7F4ED] border-[#E3DCCB] text-[#20263A]'
          }`}
        >
          {/* Chat Header */}
          <div
            className={`px-4 py-3 flex items-center gap-2.5 border-b shrink-0 ${
              isEmerald
                ? darkMode
                  ? 'bg-gradient-to-br from-[#173323] to-[#0F1712] border-[#2C3D32] text-[#E8F2EB]'
                  : 'bg-gradient-to-br from-[#15803D] to-[#166534] border-[#CFE3D5] text-white'
                : darkMode
                  ? 'bg-gradient-to-br from-[#1B2540] to-[#0E1526] border-[#2A3550] text-[#F5F1E8]'
                  : 'bg-gradient-to-br from-[#722914] to-[#A9813F] border-[#E3DCCB] text-white'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                isEmerald
                  ? darkMode
                    ? 'bg-[#15803D]/25 border-[#4ADE80] text-[#4ADE80]'
                    : 'bg-white/20 border-white/40 text-white'
                  : darkMode
                    ? 'bg-[#C9A35B]/20 border-[#C9A35B] text-[#C9A35B]'
                    : 'bg-white/20 border-white/40 text-white'
              }`}
            >
              <ChefHat className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-sm leading-tight truncate">
                {tx(isEn, `شيف ${displayShopName}`, `${displayShopName} Chef AI`)}
              </div>
              <div className="text-[11px] opacity-85 flex items-center gap-1 truncate">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>
                  {tx(isEn, 'اسأل عن المكونات والأسعار أو اطلب ترشيحاً', 'Ask about ingredients, prices, or picks')}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => restartFlowRef.current()}
              aria-label={tx(isEn, 'نبدأ من الأول', 'Restart chat')}
              title={tx(isEn, 'نبدأ من الأول', 'Restart chat')}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={tx(isEn, 'إغلاق', 'Close')}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Messages */}
          <div
            ref={chatBodyRef}
            className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5"
          >
            {messages.map((msg) => {
              if (msg.kind === 'product' && msg.product) {
                const prod = msg.product;
                const options = getProductOptions(prod);
                return (
                  <div
                    key={msg.id}
                    className={`animate-chef-msg self-start max-w-[92%] rounded-[16px] p-2.5 border ${
                      isEmerald
                        ? darkMode
                          ? 'bg-[#18231C] border-[#2C3D32] text-[#E8F2EB]'
                          : 'bg-white border-[#CFE3D5] text-[#14201A] shadow-xs'
                        : darkMode
                          ? 'bg-[#1B2540] border-[#C9A35B]/35 text-[#F5F1E8]'
                          : 'bg-white border-[#E3DCCB] text-[#20263A] shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-[72px] h-[72px] rounded-[12px] overflow-hidden shrink-0 flex items-center justify-center border ${
                          isEmerald
                            ? darkMode
                              ? 'bg-[#0F1712] border-[#2C3D32]'
                              : 'bg-[#DCFCE7] border-[#CFE3D5]'
                            : darkMode
                              ? 'bg-[#0E1526] border-[#2A3550]'
                              : 'bg-[#EFE9DA] border-[#E3DCCB]'
                        }`}
                      >
                        {prod.imageUrl ? (
                          <img loading="lazy" decoding="async"
                            src={prod.imageUrl}
                            alt={prod.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Utensils
                            className={`w-6 h-6 ${
                              isEmerald
                                ? darkMode
                                  ? 'text-[#4ADE80]'
                                  : 'text-[#15803D]'
                                : darkMode
                                  ? 'text-[#C9A35B]'
                                  : 'text-[#A9813F]'
                            }`}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-[11px] font-bold opacity-75 truncate">
                          {prod.category}
                        </div>
                        <div className="font-extrabold text-sm leading-snug line-clamp-1">
                          {prod.name}
                        </div>
                        {prod.description && (
                          <p className="text-[11px] opacity-75 line-clamp-1">{prod.description}</p>
                        )}
                        <div
                          className={`text-xs font-black tabular-nums ${
                            isEmerald
                              ? darkMode
                                ? 'text-[#4ADE80]'
                                : 'text-[#15803D]'
                              : darkMode
                                ? 'text-[#C9A35B]'
                                : 'text-[#A9813F]'
                          }`}
                        >
                          {Number(prod.price || 0) > 0
                            ? formatMoney(prod.price, shop.country, undefined, isEn)
                            : tx(isEn, 'السعر حسب الاختيار', 'Price on selection')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-current/10">
                      <button
                        type="button"
                        disabled={!shop.acceptOrders}
                        onClick={() => {
                          if (options.length > 0 || Number(prod.price || 0) === 0) {
                            onOpenProductDetail(prod);
                            return;
                          }
                          onAddToCart(prod);
                          appendMessage({
                            role: 'bot',
                            kind: 'text',
                            text: tx(
                              isEn,
                              `تمت إضافة "${prod.name}" إلى سلتك.`,
                              `Added "${prod.name}" to cart.`
                            ),
                          });
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-[10px] text-xs font-extrabold inline-flex items-center justify-center gap-1 transition-opacity hover:opacity-90 disabled:opacity-40 ${
                          isEmerald
                            ? 'bg-[#15803D] text-white'
                            : darkMode
                              ? 'bg-[#C9A35B] text-[#0E1526]'
                              : 'bg-[#A9813F] text-white'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {options.length > 0
                          ? tx(isEn, 'اختر وأضف', 'Select & Add')
                          : tx(isEn, 'أضف للسلة', 'Add to Cart')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenProductDetail(prod)}
                        aria-label={tx(isEn, 'التفاصيل', 'Details')}
                        className={`py-1.5 px-2.5 rounded-[10px] text-xs font-bold border inline-flex items-center gap-1 ${
                          isEmerald
                            ? darkMode
                              ? 'border-[#2C3D32] text-[#E8F2EB] hover:border-[#4ADE80]'
                              : 'border-[#CFE3D5] text-[#14201A] hover:border-[#15803D]'
                            : darkMode
                              ? 'border-[#2A3550] text-[#F5F1E8] hover:border-[#C9A35B]'
                              : 'border-[#E3DCCB] text-[#20263A] hover:border-[#A9813F]'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }

              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`animate-chef-msg max-w-[84%] px-3.5 py-2 text-[13px] font-semibold leading-relaxed rounded-[16px] break-words ${
                    isUser
                      ? `self-end rounded-be-[4px] ${
                          isEmerald
                            ? 'bg-[#15803D] text-white'
                            : darkMode
                              ? 'bg-[#C9A35B] text-[#0E1526]'
                              : 'bg-[#A9813F] text-white'
                        }`
                      : `self-start rounded-bs-[4px] border ${
                          isEmerald
                            ? darkMode
                              ? 'bg-[#18231C] border-[#2C3D32] text-[#E8F2EB]'
                              : 'bg-white border-[#CFE3D5] text-[#14201A] shadow-xs'
                            : darkMode
                              ? 'bg-[#1B2540] border-[#C9A35B]/20 text-[#F5F1E8]'
                              : 'bg-white border-[#E3DCCB] text-[#20263A] shadow-xs'
                        }`
                  }`}
                >
                  {msg.text}
                </div>
              );
            })}

            {typing && (
              <div
                aria-label="typing"
                className={`self-start px-3.5 py-2.5 rounded-[14px] inline-flex items-center gap-1.5 border ${
                  isEmerald
                    ? darkMode
                      ? 'bg-[#18231C] border-[#2C3D32]'
                      : 'bg-white border-[#CFE3D5]'
                    : darkMode
                      ? 'bg-[#1B2540] border-[#C9A35B]/20'
                      : 'bg-white border-[#E3DCCB]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                    isEmerald
                      ? darkMode
                        ? 'bg-[#4ADE80]'
                        : 'bg-[#15803D]'
                      : darkMode
                        ? 'bg-[#C9A35B]'
                        : 'bg-[#A9813F]'
                  }`}
                />
                <span
                  style={{ animationDelay: '0.15s' }}
                  className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                    isEmerald
                      ? darkMode
                        ? 'bg-[#4ADE80]'
                        : 'bg-[#15803D]'
                      : darkMode
                        ? 'bg-[#C9A35B]'
                        : 'bg-[#A9813F]'
                  }`}
                />
                <span
                  style={{ animationDelay: '0.3s' }}
                  className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                    isEmerald
                      ? darkMode
                        ? 'bg-[#4ADE80]'
                        : 'bg-[#15803D]'
                      : darkMode
                        ? 'bg-[#C9A35B]'
                        : 'bg-[#A9813F]'
                  }`}
                />
              </div>
            )}

            {/* Interactive Decision Chips */}
            {chips.length > 0 && !typing && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {chips.map((chip, idx) => (
                  <button
                    key={`${chip.label}-${idx}`}
                    type="button"
                    onClick={chip.action}
                    className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all cursor-pointer whitespace-nowrap ${
                      chip.solid
                        ? isEmerald
                          ? 'bg-[#15803D] border-[#15803D] text-white shadow-xs'
                          : darkMode
                            ? 'bg-[#C9A35B] border-[#C9A35B] text-[#0E1526] shadow-xs'
                            : 'bg-[#A9813F] border-[#A9813F] text-white shadow-xs'
                        : isEmerald
                          ? darkMode
                            ? 'bg-[#18231C] border-[#2C3D32] text-[#BBF7D0] hover:border-[#4ADE80]'
                            : 'bg-white border-[#CFE3D5] text-[#15803D] hover:border-[#15803D]'
                          : darkMode
                            ? 'bg-[#1B2540] border-[#2A3550] text-[#C9A35B] hover:border-[#C9A35B]'
                            : 'bg-white border-[#E3DCCB] text-[#A9813F] hover:border-[#A9813F]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 1-Tap Quick Inquiry Bar (Ingredients & Prices) */}
          <div
            className={`px-3 pt-2 pb-1.5 border-t flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 ${
              isEmerald
                ? darkMode
                  ? 'bg-[#18231C] border-[#2C3D32]'
                  : 'bg-[#DCFCE7]/50 border-[#CFE3D5]'
                : darkMode
                  ? 'bg-[#0E1526] border-[#2A3550]'
                  : 'bg-[#FAF7F0] border-[#E3DCCB]'
            }`}
          >
            <button
              type="button"
              disabled={typing}
              onClick={() =>
                void submitFreeQuestion(
                  tx(
                    isEn,
                    'ما هي أسعار العروض والأصناف المميزة المتاحة حالياً ورسوم التوصيل؟',
                    'What are the current prices, special offers, and delivery fees?'
                  )
                )
              }
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border whitespace-nowrap shrink-0 transition-colors disabled:opacity-45 ${
                isEmerald
                  ? darkMode
                    ? 'bg-[#0F1712] border-[#2C3D32] text-[#BBF7D0] hover:border-[#4ADE80]'
                    : 'bg-white border-[#CFE3D5] text-[#15803D] hover:border-[#15803D]'
                  : darkMode
                    ? 'bg-[#1B2540] border-[#2A3550] text-[#DCB877] hover:border-[#C9A35B]'
                    : 'bg-white border-[#E3DCCB] text-[#722914] hover:border-[#A9813F]'
              }`}
            >
              {tx(isEn, 'الأسعار والعروض', 'Prices & Offers')}
            </button>
            <button
              type="button"
              disabled={typing}
              onClick={() => {
                setFreeInput((prev) =>
                  prev.trim()
                    ? prev
                    : tx(isEn, 'ما هي مكونات وسعر ', 'What are the ingredients and price of ')
                );
                inputRef.current?.focus();
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border whitespace-nowrap shrink-0 transition-colors disabled:opacity-45 ${
                isEmerald
                  ? darkMode
                    ? 'bg-[#0F1712] border-[#2C3D32] text-[#E8F2EB] hover:border-[#4ADE80]'
                    : 'bg-white border-[#CFE3D5] text-[#14201A] hover:border-[#15803D]'
                  : darkMode
                    ? 'bg-[#1B2540] border-[#2A3550] text-[#F5F1E8] hover:border-[#C9A35B]'
                    : 'bg-white border-[#E3DCCB] text-[#20263A] hover:border-[#A9813F]'
              }`}
            >
              {tx(isEn, 'استفسار عن المكونات', 'Ingredients')}
            </button>
          </div>

          {/* Free-Text Gemini AI Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitFreeQuestion(freeInput);
            }}
            className={`px-2.5 pb-2.5 pt-1 flex items-center gap-2 shrink-0 ${
              isEmerald
                ? darkMode
                  ? 'bg-[#18231C]'
                  : 'bg-white'
                : darkMode
                  ? 'bg-[#0E1526]'
                  : 'bg-white'
            }`}
          >
            <input
              ref={inputRef}
              type="text"
              value={freeInput}
              onChange={(e) => setFreeInput(e.target.value)}
              placeholder={tx(
                isEn,
                'Ask about ingredients, prices, or meal picks...',
                'اسأل عن المكونات أو الأسعار أو اقترح وجبة...'
              )}
              className={`flex-1 min-w-0 px-3 py-2 rounded-[12px] text-xs font-bold outline-none border ${
                isEmerald
                  ? darkMode
                    ? 'bg-[#0F1712] border-[#2C3D32] text-[#E8F2EB] placeholder:text-[#A3B5AA] focus:border-[#4ADE80]'
                    : 'bg-[#F6FBF7] border-[#CFE3D5] text-[#14201A] placeholder:text-[#4B5B52] focus:border-[#15803D]'
                  : darkMode
                    ? 'bg-[#1B2540] border-[#2A3550] text-[#F5F1E8] placeholder:text-[#8A93A6] focus:border-[#C9A35B]'
                    : 'bg-[#F7F4ED] border-[#E3DCCB] text-[#20263A] placeholder:text-[#7A756B] focus:border-[#A9813F]'
              }`}
            />
            <button
              type="submit"
              disabled={!freeInput.trim() || typing}
              aria-label={tx(isEn, 'إرسال', 'Send')}
              className={`w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0 transition-opacity disabled:opacity-40 ${
                isEmerald
                  ? 'bg-[#15803D] text-white'
                  : darkMode
                    ? 'bg-[#C9A35B] text-[#0E1526]'
                    : 'bg-[#A9813F] text-white'
              }`}
            >
              <SendHorizontal className={`w-4 h-4 ${isEn ? '' : 'rotate-180'}`} />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
