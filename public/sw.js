// Minimal service worker so AssistAnt installs as an app. It keeps the app shell
// available offline; live data and the crew always go to the network.
// Bumping the name clears older caches on activate (v1 could hold HTML stored for stylesheet requests).
const CACHE = 'assistant-v2';
const SHELL = ['/', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // Only page navigations fall back to the cached app shell. A stylesheet or script must never be
  // answered with the home page's HTML, or the page loads unstyled when the server is briefly down.
  const offline = e.request.mode === 'navigate' ? () => caches.match(e.request).then((r) => r || caches.match('/')) : () => caches.match(e.request).then((r) => r || Response.error());
  e.respondWith(fetch(e.request).catch(offline));
});
