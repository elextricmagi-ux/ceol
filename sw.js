// Stale-while-revalidate for the app shell: opens instantly offline, updates in the background.
const V = 'ceol-v8';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return; // Supabase etc. go straight to network
  const key = new Request(u.origin + u.pathname);
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(key);
    const net = fetch(r).then(res => { if (res.ok) c.put(key, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
