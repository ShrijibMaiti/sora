/* Device features: the service worker (public/sw.js), on-device storage it shares (IndexedDB "sora"/"kv"), and Web Push.
   Personal content stays here: the server gets only a push address, the city (for alerts) and wake-up times. */

const SW = 'serviceWorker' in navigator;
export const pushSupported = SW && 'PushManager' in window && 'Notification' in window;

/** Production builds always register; dev only with ?sw=1, so the cache never fights hot reload. */
export function registerSW() {
  if (SW && (import.meta.env.PROD || location.search.includes('sw=1'))) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/* ---------- IndexedDB key-value store (same layout as sw.js) ---------- */
function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('sora', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function kv<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((ok, fail) => {
    const tx = d.transaction('kv', mode), req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => ok(req ? (req.result as T) : undefined);
    tx.onerror = () => fail(tx.error);
  });
}
export const kvPut = (k: string, v: unknown) => kv('readwrite', (s) => s.put(v, k)).catch(() => undefined);
const kvClear = () => kv('readwrite', (s) => s.clear()).catch(() => undefined);

/* ---------- Web Push ---------- */
const SUB_KEY = 'sora.push';
const subId = () => { try { return localStorage.getItem(SUB_KEY); } catch { return null; } };
export const pushOn = () => !!subId() && pushSupported && Notification.permission === 'granted';

function keyBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export type PushResult = 'on' | 'denied' | 'unsupported' | 'error';

/** Ask permission, subscribe, and tell the server where to push (and whether to send this city's alerts). */
export async function enablePush(city: string, alerts: boolean): Promise<PushResult> {
  if (!pushSupported) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const { public_key } = await (await fetch('/api/push/key')).json();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(public_key) }));
    const r = await fetch('/api/push/subscription', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), city, alerts }) });
    if (!r.ok) return 'error';
    localStorage.setItem(SUB_KEY, (await r.json()).id);
    return 'on';
  } catch {
    return 'error';
  }
}

export async function disablePush() {
  const id = subId();
  try { localStorage.removeItem(SUB_KEY); } catch { /* private mode */ }
  if (id) fetch(`/api/push/subscription/${id}`, { method: 'DELETE' }).catch(() => {});
  if (SW) (await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription())?.unsubscribe().catch(() => {});
}

/** Keep the text on this device and ask the server for a content-free wake-up at `at`. False if push isn't on. */
export async function scheduleWake(id: string, at: string, title: string, body: string, url = '/app/#tab=trip'): Promise<boolean> {
  const sid = subId();
  if (!sid || !pushOn()) return false;
  await kvPut('reminder:' + id, { title, body, url });
  const r = await fetch(`/api/push/subscription/${sid}/wake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, at }) }).catch(() => null);
  return !!r?.ok;
}

/** The saved trip, for the service worker's background proactive check (spec §28.2), where the browser offers one. */
export async function saveTripContext(ctx: Record<string, unknown> & { proactive: boolean }) {
  await kvPut('ctx:trip', ctx);
  if (!SW || !ctx.proactive) return;
  const reg = (await navigator.serviceWorker.getRegistration()) as (ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> } }) | undefined;
  await reg?.periodicSync?.register('sora-proactive', { minInterval: 12 * 3600e3 }).catch(() => {}); // installed Chromium apps only
}

/** "Delete history on this device" also forgets the push subscription and everything the service worker keeps. */
export async function clearDevice() {
  await disablePush();
  await kvClear();
  if ('caches' in window) (await caches.keys()).filter((k) => k.startsWith('sora-data')).forEach((k) => caches.delete(k));
}
