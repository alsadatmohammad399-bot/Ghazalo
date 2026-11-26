import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Order, OrderStatus, Product, Shop } from '../types';
import { CashierPage } from './CashierPage';
import { OrderSoundBadge } from '../components/OrderSoundBadge';
import { playOrderBeep } from '../utils/orderInbox';

const SESSION_KEY = 'ghazalo_cashier_link_session';

function setManifest(href: string) {
  let el = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = 'manifest';
    document.head.appendChild(el);
  }
  el.href = href;
}

export const CashierLinkPage: React.FC<{ shopId: string; linkKey: string }> = ({ shopId, linkKey }) => {
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const tokenRef = useRef('');
  const seqRef = useRef<number | null>(null);

  const auth = () => ({ Authorization: `Bearer ${tokenRef.current}` });

  const exchange = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch('/api/cashier-link/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId, key: linkKey }),
      });
      if (r.status === 401) return false;
      const j = (await r.json()) as { ok?: boolean; token?: string };
      if (!j.ok || !j.token) return false;
      tokenRef.current = j.token;
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ shopId, token: j.token }));
      } catch {
        /* ignore */
      }
      return true;
    } catch {
      // offline: reuse last session if any
      try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
        if (s.shopId === shopId && s.token) {
          tokenRef.current = s.token;
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    }
  }, [shopId, linkKey]);

  useEffect(() => {
    setManifest(`/api/cashier-manifest/${encodeURIComponent(shopId)}/${encodeURIComponent(linkKey)}`);
    document.title = 'الكاشير';
    let dead = false;
    (async () => {
      const ok = await exchange();
      if (dead) return;
      if (!ok) {
        setState('invalid');
        return;
      }
      try {
        const r = await fetch(`/api/public-stores/${encodeURIComponent(shopId)}`);
        const j = (await r.json()) as { found?: boolean; shop?: Shop; products?: Product[] };
        if (j.found && j.shop) {
          setShop(j.shop);
          setProducts(j.products || []);
          setState('ready');
          return;
        }
      } catch {
        /* fall through */
      }
      setState('invalid');
    })();
    return () => {
      dead = true;
    };
  }, [shopId, linkKey, exchange]);

  useEffect(() => {
    if (state !== 'ready') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const merge = (incoming: Order[]) =>
      setOrders((prev) => {
        const byId = new Map(prev.map((o) => [o.id, o]));
        incoming.forEach((o) => byId.set(o.id, { ...byId.get(o.id), ...o }));
        return Array.from(byId.values()).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      });
    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          let r = await fetch(`/api/orders/${encodeURIComponent(shopId)}?seqOnly=1`, { headers: auth() });
          if (r.status === 401 && (await exchange())) {
            r = await fetch(`/api/orders/${encodeURIComponent(shopId)}?seqOnly=1`, { headers: auth() });
          }
          if (r.status === 401) {
            setState('invalid');
            return;
          }
          const j = (await r.json()) as { seq?: number };
          if (typeof j.seq === 'number' && j.seq !== seqRef.current) {
            const first = seqRef.current === null;
            const r2 = await fetch(`/api/orders/${encodeURIComponent(shopId)}`, { headers: auth() });
            const d = (await r2.json()) as { orders?: Order[]; seq?: number };
            seqRef.current = Number(d.seq || j.seq);
            merge(Array.isArray(d.orders) ? d.orders : []);
            if (!first) playOrderBeep();
          }
        } catch {
          /* retry next tick */
        }
      }
      timer = setTimeout(() => void tick(), document.hidden ? 20000 : 5000);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, shopId, exchange]);

  if (state === 'loading') {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center font-bold text-gray-600">
        جاري فتح الكاشير...
      </div>
    );
  }
  if (state === 'invalid' || !shop) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-extrabold text-lg">رابط الكاشير غير صالح أو تم إلغاؤه</div>
          <div className="text-sm text-gray-500 mt-2">اطلب من صاحب المطعم رابط جديد من لوحة التحكم.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <OrderSoundBadge />
      <CashierPage
        shop={shop}
        products={products}
        tables={[]}
        orders={orders}
        linkMode
        onBackDashboard={() => window.location.reload()}
        onOrderCreated={(o) => {
          setOrders((prev) => [o, ...prev.filter((x) => x.id !== o.id)]);
          void fetch(`/api/orders/${encodeURIComponent(shopId)}/pos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth() },
            body: JSON.stringify(o),
          }).catch(() => undefined);
        }}
        onOrderStatusChange={(id: string, status: OrderStatus) => {
          setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
          void fetch(`/api/orders/${encodeURIComponent(shopId)}/${encodeURIComponent(id)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth() },
            body: JSON.stringify({ status }),
          }).catch(() => undefined);
        }}
      />
    </>
  );
};
