import React, { useMemo, useState } from 'react';
import { Wand2, Check } from 'lucide-react';
import type { ExtractedMenuItem } from '../types';
import { parseMenuText } from '../utils/menuTextParser';

interface Props {
  isEn?: boolean;
  onAdd: (items: ExtractedMenuItem[]) => Promise<void> | void;
}

export const MenuTextPaste: React.FC<Props> = ({ isEn, onAdd }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const parsed = useMemo(() => parseMenuText(text), [text]);
  const t = (ar: string, en: string) => (isEn ? en : ar);

  const submit = async () => {
    if (!parsed.items.length) return;
    setBusy(true);
    try {
      await onAdd(parsed.items);
      setDone(parsed.items.length);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-dashed border-[#15803D]/60 bg-white/60 dark:bg-[#0F1712]/60 p-3.5 space-y-2.5">
      <div className="font-extrabold text-sm flex items-center gap-1.5 text-[#14532D] dark:text-[#BBF7D0]">
        <Wand2 className="w-4 h-4 text-[#15803D]" />
        {t('الصندوق السحري: الصق الأقسام والأصناف والعروض', 'Magic box: paste categories, items and offers')}
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(null); }}
        rows={6}
        dir="auto"
        placeholder={t(
          'وجبات:\nربع فرخة شيش - 85\nنص فرخة شواية - 150\nعروض:\nعرض التكا 2 فرخة تكا + نص كيلو أرز بسمتي بـ 620ج',
          'Meals:\nQuarter chicken - 85\nOffers:\nTika deal 2 chicken + rice for 620'
        )}
        className="sf-inp w-full text-xs"
      />
      {parsed.items.length > 0 && (
        <div className="rounded-xl bg-[#F6FBF7] dark:bg-[#173323]/60 border border-[#CFE3D5] dark:border-[#2C3D32] p-2.5 space-y-1 max-h-[420px] overflow-y-auto text-xs font-bold">
          <div className="font-black text-[#15803D] dark:text-[#BBF7D0]">
            {t(`فهمت ${parsed.items.length} صنف في ${parsed.categories.length} قسم`, `${parsed.items.length} items in ${parsed.categories.length} categories`)}
          </div>
          {parsed.items.map((it, i) => (
            <div key={i} className="rounded-lg bg-white/70 dark:bg-[#0F1712]/60 p-1.5 space-y-0.5">
              <div className="flex justify-between gap-2">
                <span className="truncate font-black">{it.isOffer ? '🏷️ ' : ''}{it.name}</span>
                <span className="shrink-0 tabular-nums text-[#15803D] dark:text-[#BBF7D0] font-black">
                  {it.price > 0 ? `${it.price} ج` : ''}
                  {it.originalPrice ? <s className="ms-1 text-[#4B5B52] dark:text-[#A3B5AA] font-bold">{it.originalPrice}</s> : null}
                </span>
              </div>
              {it.description ? (
                <div className="whitespace-pre-line text-[11px] font-medium text-[#4B5B52] dark:text-[#A3B5AA]">{it.description}</div>
              ) : (
                <div className="text-[10px] text-[#4B5B52] dark:text-[#A3B5AA]">{it.category}</div>
              )}
            </div>
          ))}
          {parsed.skipped.length > 0 && (
            <div className="text-[#B45309]">{t('اتخطيت:', 'Skipped:')} {parsed.skipped.join(' | ')}</div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !parsed.items.length} onClick={() => void submit()} className="sf-btn-primary min-h-[38px] px-4 text-xs disabled:opacity-40">
          <Check className="w-3.5 h-3.5" />
          {t('أضف للمنيو', 'Add to menu')}
        </button>
        {done !== null && <span className="text-xs font-extrabold text-[#15803D]">{t(`اتضاف ${done} صنف`, `${done} added`)}</span>}
      </div>
    </div>
  );
};
