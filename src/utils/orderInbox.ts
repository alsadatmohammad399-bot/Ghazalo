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

// ---- Order alert sound -------------------------------------------------
// Browsers block audio until the user touches the page once. We keep ONE shared
// AudioContext, unlock it on the first tap/click/key, and expose its state so the
// dashboard can show a visible "sound on" indicator.
let sharedCtx: AudioContext | null = null;
let soundReady = false;
const soundListeners = new Set<() => void>();

function emitSound() {
  soundListeners.forEach((fn) => fn());
}

export function subscribeSoundState(fn: () => void): () => void {
  soundListeners.add(fn);
  return () => {
    soundListeners.delete(fn);
  };
}

export function isSoundReady(): boolean {
  return soundReady;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedCtx) return sharedCtx;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    sharedCtx = new Ctx();
  } catch {
    return null;
  }
  sharedCtx.onstatechange = () => {
    const ok = sharedCtx?.state === 'running';
    if (ok !== soundReady) {
      soundReady = ok;
      emitSound();
    }
  };
  return sharedCtx;
}

/** Call from a user gesture. Resumes the audio engine and plays a silent tick to fully unlock iOS. */
export function unlockOrderSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const finish = () => {
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // ignore
    }
    const ok = ctx.state === 'running';
    if (ok !== soundReady) {
      soundReady = ok;
      emitSound();
    }
  };
  if (ctx.state === 'running') finish();
  else void ctx.resume().then(finish, finish);
}

if (typeof window !== 'undefined') {
  const arm = () => {
    unlockOrderSound();
    if (soundReady) {
      ['pointerdown', 'touchend', 'click', 'keydown'].forEach((e) => window.removeEventListener(e, arm, true));
    }
  };
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((e) => window.addEventListener(e, arm, true));
}

/** Loud, clear 3-note chime (twice) plus vibration. Safe to call anytime; silent only if the browser still blocks audio. */
export function playOrderBeep(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([250, 120, 250, 120, 400]);
    }
  } catch {
    // vibration is best effort
  }
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const run = () => {
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const notes = [880, 1109, 1319];
      [0, 0.9].forEach((offset) => {
        notes.forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          o.connect(g);
          g.connect(master);
          const t = ctx.currentTime + offset + i * 0.22;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          o.start(t);
          o.stop(t + 0.32);
        });
      });
    };
    if (ctx.state === 'running') run();
    else void ctx.resume().then(run, () => undefined);
  } catch {
    // sound is best effort
  }
}
