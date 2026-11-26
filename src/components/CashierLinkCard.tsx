import React, { useCallback, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { getStoredAuthSession } from '../utils/storeRegistry';

async function call(shopId: string, action: 'status' | 'generate' | 'revoke') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let idToken = '';
  try {
    idToken = (await auth.currentUser?.getIdToken()) || '';
  } catch {
    /* ignore */
  }
  const t = getStoredAuthSession().token;
  if (t && t.split('.').length === 2) headers.Authorization = `Bearer ${t}`;
  const r = await fetch('/api/cashier-link', {
    method: 'POST',
    headers,
    body: JSON.stringify({ shopId, action, idToken }),
  });
  return (await r.json()) as { ok?: boolean; active?: boolean; key?: string; error?: string };
}

export const CashierLinkCard: React.FC<{ shopId: string }> = ({ shopId }) => {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const url = key ? `${window.location.origin}/c/${shopId}/${key}` : '';

  const run = useCallback(
    async (action: 'status' | 'generate' | 'revoke') => {
      setBusy(true);
      setMsg('');
      try {
        const j = await call(shopId, action);
        if (!j.ok) setMsg('تعذر تنفيذ العملية، سجّل الدخول وحاول تاني.');
        else setKey(j.active && j.key ? j.key : null);
      } catch {
        setMsg('مشكلة في الاتصال.');
      }
      setBusy(false);
    },
    [shopId]
  );

  useEffect(() => {
    void run('status');
  }, [run]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMsg('تم نسخ اللينك ✅');
    } catch {
      setMsg('انسخ اللينك يدوياً من الخانة.');
    }
  };

  return (
    <div className="sf-card space-y-2" dir="rtl" data-testid="cashier-link-card">
      <b className="text-base font-extrabold">🔗 رابط الكاشير (فتح بضغطة واحدة)</b>
      <p className="text-xs opacity-70">
        افتح اللينك على جهاز الكاشير بدون تسجيل دخول. اللينك سري، لو اتسرب اضغط «لينك جديد» والقديم يتلغي فوراً.
      </p>
      {url && (
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="w-full text-xs p-2 rounded-lg border" dir="ltr" />
      )}
      <div className="flex flex-wrap gap-2">
        {!url ? (
          <button type="button" disabled={busy} onClick={() => void run('generate')} className="sf-btn-yellow min-h-[40px] px-4 text-sm">
            إنشاء رابط الكاشير
          </button>
        ) : (
          <>
            <button type="button" onClick={() => void copy()} className="sf-btn min-h-[40px] px-4 text-sm">نسخ</button>
            <a href={url} target="_blank" rel="noreferrer" className="sf-btn min-h-[40px] px-4 text-sm inline-flex items-center">فتح</a>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm('هيتلغي اللينك القديم ويتعمل لينك جديد. متأكد؟')) void run('generate');
              }}
              className="sf-btn min-h-[40px] px-4 text-sm"
            >
              لينك جديد
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm('إلغاء اللينك نهائياً؟')) void run('revoke');
              }}
              className="sf-btn min-h-[40px] px-4 text-sm"
            >
              إلغاء
            </button>
          </>
        )}
      </div>
      {msg && <div className="text-xs font-bold">{msg}</div>}
    </div>
  );
};
