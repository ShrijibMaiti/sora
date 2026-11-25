/* Sora service worker: works offline on the last forecast, and shows notifications with the tab closed.
   Personal content never reaches the server: reminder text and the saved trip live in IndexedDB on this device
   (spec §40, §41.3). A reminder push carries only an id; the text is read here. */
const VERSION = 'v1';
const SHELL = `sora-shell-${VERSION}`, DATA = `sora-data-${VERSION}`, TILES = `sora-tiles-${VERSION}`;
const TILE_MAX = 600;
const DATA_API = /^\/api\/(field|events|cities|places)$/;
// proactive rule (spec §28.2): worth a notification only if clearly better, confidently, at most once a day
const R_MIN = 15, C_MIN = 0.8;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/app/', '/manifest.webmanifest', '/icons/icon-192.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA, TILES].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* ---------- fetch ---------- */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // planning (POST) always needs the network
  const url = new URL(req.url);
  if (url.origin === location.origin && DATA_API.test(url.pathname)) e.respondWith(savedData(req));
  else if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;
  else if (req.mode === 'navigate') e.respondWith(page(req));
  else if (url.origin === location.origin && /^\/(assets|icons)\//.test(url.pathname)) e.respondWith(cacheFirst(req, SHELL));
  else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req, SHELL));
  else if (url.hostname === 'tile.openstreetmap.org') e.respondWith(cacheFirst(req, TILES, TILE_MAX));
});

/** Network first; keep a copy; offline, answer with the copy marked "x-sora-offline: <saved at>". */
async function savedData(req) {
  const cache = await caches.open(DATA);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, await stamp(res.clone(), { 'x-sora-saved': new Date().toISOString() }));
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (!hit) throw err;
    return stamp(hit, { 'x-sora-offline': hit.headers.get('x-sora-saved') || '' });
  }
}

/** A copy of a response with extra headers (the body is already decoded, so encoding headers go). */
async function stamp(res, extra) {
  const headers = new Headers(res.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  Object.entries(extra).forEach(([k, v]) => headers.set(k, v));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}

async function page(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const path = new URL(req.url).pathname;
    return (await cache.match(req)) || (await cache.match(path.startsWith('/app') ? '/app/' : '/')) || Promise.reject(err);
  }
}

async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await cache.put(req, res.clone());
    if (max) {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
    }
  }
  return res;
}

/* ---------- on-device storage (shared with the app: src/lib/device.ts) ---------- */
function db() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('sora', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function kv(mode, fn) {
  const d = await db();
  return new Promise((ok, fail) => {
    const tx = d.transaction('kv', mode), req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => ok(req && req.result);
    tx.onerror = () => fail(tx.error);
  });
}
const get = (k) => kv('readonly', (s) => s.get(k));
const put = (k, v) => kv('readwrite', (s) => s.put(v, k));
const del = (k) => kv('readwrite', (s) => s.delete(k));

/* ---------- notifications ---------- */
const show = (title, body, tag, url = '/app/') =>
  self.registration.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url } });

self.addEventListener('push', (e) => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { /* not JSON */ }
  e.waitUntil((async () => {
    if (msg.type === 'alert') return show(msg.title, msg.body, msg.tag, '/app/#tab=live');
    const r = msg.type === 'wake' && (await get('reminder:' + msg.id));
    if (r) { await del('reminder:' + msg.id); return show(r.title, r.body, 'reminder-' + msg.id, r.url || '/app/#tab=trip'); }
    return show('Sora', 'A reminder you set on this device.', 'reminder'); // text deleted since: browsers require a notification
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => new URL(c.url).pathname.startsWith('/app'));
    return w ? w.focus().then(() => w.navigate(url)) : self.clients.openWindow(url);
  }));
});

/* ---------- proactive check in the background (Periodic Background Sync, installed Chromium apps) ---------- */
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'sora-proactive') e.waitUntil(proactive());
});

const IST = 5.5 * 3600e3;
const istDay = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
function nextAt(hhmm, from) { // first IST wall-clock HH:MM at or after `from` (ms)
  const [h, m] = hhmm.split(':').map(Number), d0 = from + IST - ((from + IST) % 86400e3) - IST;
  let t = d0 + (h * 60 + m) * 60e3;
  if (t < from) t += 86400e3;
  return t;
}
const iso = (ms) => new Date(ms).toISOString();
const istHHMM = (ms) => new Date(ms + IST).toISOString().slice(11, 16);

async function proactive() {
  const ctx = await get('ctx:trip');
  if (!ctx || !ctx.proactive || (await get('proactive:last')) === istDay(Date.now())) return;
  const now = Date.now(), dep = nextAt(ctx.dep, now + 30 * 60e3), win = ctx.win * 60e3;
  const res = await fetch('/api/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: ctx.city, origin: ctx.origin, dest: ctx.dest, mode: ctx.mode, planned_departure: iso(dep),
      earliest: iso(Math.max(dep - win, now + 15 * 60e3)), latest_departure: iso(dep + win), latest_arrival: null,
      max_extra_min: ctx.maxExtra, origin_building: ctx.ob, dest_building: ctx.db,
    }),
  });
  if (!res.ok) return;
  const plan = await res.json(), rec = plan.options.find((o) => o.id === plan.recommended);
  if (!plan.reliable || !rec || rec.reduction_pct.median < R_MIN || (rec.p_better || 0) < C_MIN) return;
  await put('proactive:last', istDay(now));
  return show(`Leave at ${istHHMM(Date.parse(rec.departure))} for ${ctx.destName}`,
    `About ${rec.reduction_pct.median}% less exposure than leaving at ${ctx.dep} (${Math.round(rec.p_better * 100)}% chance it helps).`,
    'proactive', '/app/#tab=trip');
}
