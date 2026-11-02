// Network-first for the app itself: a new version shows up the moment you open the app while online.
// If you're offline, or the connection is very slow, it opens the saved copy instead.
const V = 'ceol-v9';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => {
  // one missing file must not stop the app from installing
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return; // Supabase, the relay etc. go straight to the network
  const key = new Request(u.origin + u.pathname);
  e.respondWith((async () => {
    const c = await caches.open(V);
    const net = fetch(r.url, { cache: 'no-cache' }).then(res => { if (res.ok) c.put(key, res.clone()); return res; });
    net.catch(() => {});
    const hit = await c.match(key);
    if (!hit) return net;
    return Promise.race([net, new Promise(res => setTimeout(() => res(hit), 4000))]).catch(() => hit);
  })());
});
