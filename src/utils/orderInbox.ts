import type { Order, OrderStatus } from '../types';
import { getStoredAuthSession } from './storeRegistry';

/** Customer side: send an order made from a shared menu link to the restaurant's inbox. */
export async function postPublicOrder(shopId: string, order: Order): Promise<boolean> {
  try {
    const r = await fetch(`/api/orders/${encodeURIComponent(shopId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function authHeaders(): Record<string, string> {
  const { token } = getStoredAuthSession();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Restaurant side: cheap check that only returns a counter. */
export async function fetchOrderSeq(shopId: string): Promise<number | null> {
  try {
    const r = await fetch(`/api/orders/${encodeURIComponent(shopId)}?seqOnly=1`, { headers: authHeaders() });
    if (!r.ok) return null;
    const j = (await r.json()) as { seq?: number };
    return typeof j.seq === 'number' ? j.seq : null;
  } catch {
    return null;
  }
}

export async function fetchInboxOrders(shopId: string): Promise<{ orders: Order[]; seq: number } | null> {
  try {
    const r = await fetch(`/api/orders/${encodeURIComponent(shopId)}`, { headers: authHeaders() });
    if (!r.ok) return null;
    const j = (await r.json()) as { orders?: Order[]; seq?: number };
    return { orders: Array.isArray(j.orders) ? j.orders : [], seq: Number(j.seq || 0) };
  } catch {
    return null;
  }
}

export async function pushOrderStatus(shopId: string, orderId: string, status: OrderStatus): Promise<void> {
  try {
    await fetch(`/api/orders/${encodeURIComponent(shopId)}/${encodeURIComponent(orderId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    });
  } catch {
    // local state already updated; next poll reconciles
  }
}

/** Short two-tone beep, no audio file needed. */
export function playOrderBeep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t);
      o.stop(t + 0.17);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // sound is best effort
  }
}
