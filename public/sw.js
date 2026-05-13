/* ORBLOOD service worker.
 *
 * Two strategies:
 *   - /api/*, /ws, websocket, and uploads go straight to network (we
 *     never want stale chat data or token-protected content cached).
 *   - everything else (HTML/CSS/JS/fonts/icons) uses stale-while-
 *     revalidate so the PWA boots instantly offline but still picks up
 *     a fresh build when the network has one. The cache name is
 *     bumped any time the build stamp in app.js changes; clients pick
 *     up the new bundle automatically on next load.
 */
const CACHE_NAME = 'orblood-shell-v2-fixed-20260513';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/js/app.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(SHELL_URLS).catch(()=>null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/')
      || url.pathname.startsWith('/ws')
      || url.pathname.startsWith('/uploads/')
      || url.pathname.endsWith('/healthz');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-origin only. We don't want to mediate cross-origin fetches
  // (cloudflared tunnel, font CDNs, image hosts).
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) {
    // Bypass cache entirely; the websocket and REST API must talk live.
    return;
  }

  // Stale-while-revalidate for the static shell.
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      // Prefer cached response so PWA opens fast / offline; the network
      // promise refreshes the cache in the background.
      return cached || networkPromise || new Response('', { status: 504 });
    })
  );
});

// Allow the page to ask the SW to skip-waiting (used after a manual
// "update available" prompt in the future). Right now app.js doesn't
// send this, but the hook is cheap and useful.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
