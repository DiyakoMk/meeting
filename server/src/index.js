import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pingDb } from './db.js';
import { attachUser } from './auth/middleware.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { serversRouter } from './routes/servers.js';
import { channelsRouter } from './routes/channels.js';
import { dmsRouter } from './routes/dms.js';
import { friendsRouter } from './routes/friends.js';
import { usersRouter } from "./routes/users.js";
import { uploadsRouter } from "./routes/uploads.js";
import { voiceConfigRouter } from './routes/voice-config.js';
import { packsRouter } from './routes/packs.js';
import { attachWs } from './realtime/ws.js';
import http from 'node:http';

const app = express();

// We sit behind nginx (and sometimes a Cloudflare tunnel in dev), so trust the
// first proxy hop. Without this Express sees every request as coming from
// 127.0.0.1 and the auth rate limiter treats all users as one.
app.set('trust proxy', true);

// CORS — when credentials are sent, browsers refuse to honour a
// wildcard `Access-Control-Allow-Origin: *`. The frontend uses
// `credentials: 'include'` for the auth cookie, so we always reflect
// the request Origin instead of returning '*'. Treat PUBLIC_ORIGIN='*'
// as "trust whatever the request says" (suitable for the demo tunnel),
// and otherwise restrict to the configured origin.
app.use(cors({
  origin: (origin, cb) => {
    // Same-origin requests (no Origin header) and tools like curl just pass.
    if (!origin) return cb(null, true);
    if (config.publicOrigin === '*') return cb(null, origin);
    if (config.publicOrigin === origin) return cb(null, origin);
    return cb(null, false);
  },
  credentials: true
}));

// 8MB headroom — avImage / bannerImage can come in as base64 data URLs when
// the multipart upload endpoint is unreachable (offline / static-only host).
// The matching schema column is MEDIUMTEXT (~16MB) and the validator allows
// up to 6MB so the body parser must not be the tighter gate.
app.use(express.json({ limit: '8mb' }));

// Static uploads. Anything written to UPLOAD_DIR is served from /uploads/*.
const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsAbs = path.resolve(here, '..', config.uploads.dir.replace(/^\.\//, ''));
app.use(config.uploads.publicBase, express.static(uploadsAbs));

// Serve the static frontend from the same origin so the SPA can call /api
// without CORS. In production nginx does this; this fallback is for
// dev/preview deployments where the backend is the only public process.
//
// `Cache-Control: no-cache` (NOT no-store) lets the browser keep a copy
// but forces it to revalidate with the server every time. Without this,
// users running the dev tunnel keep getting the cached app.js for 5+
// minutes after we redeploy, which looked like "fixes don't apply" in
// reports — Ctrl+Shift+R would always work, plain F5 wouldn't. The
// trade-off is one tiny 304 round trip per asset on each pageload, which
// is fine for dev / staging. In production the nginx config can override
// this with a longer max-age for hashed bundles.
const publicDir = path.resolve(here, '..', '..', 'public');

// Boot stamp shared across this process. We use it to cache-bust the
// frontend bundle below so a fresh deploy is visible the moment the
// renderer loads, even if the browser cached the previous index.html.
const _bootStamp = Date.now().toString(36);

// Inline the build stamp into index.html as a query string on the static
// asset URLs the SPA references. The HTML itself stays small enough that
// the cost of reading + rewriting on every load is negligible (<2 ms),
// and it removes the "the user keeps seeing the cached app.js" failure
// mode entirely without us needing to teach every CDN about no-cache.
let _indexHtmlCache = null;
function _serveIndexHtml(_req, res) {
  if (!_indexHtmlCache) {
    try {
      _indexHtmlCache = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    } catch (e) {
      return res.status(500).type('text/plain').send('index.html missing');
    }
  }
  // Append ?v=<bootStamp> to local script + stylesheet refs so the
  // browser revalidates them after each redeploy. Only rewrite paths
  // that look like our own assets (start with / or relative).
  const stamped = _indexHtmlCache
    .replace(/(<script\s+[^>]*src=")(\/[^"?]+\.js)(")/g,             '$1$2?v='+_bootStamp+'$3')
    .replace(/(<link\s+[^>]*href=")(\/[^"?]+\.css)(")/g,             '$1$2?v='+_bootStamp+'$3');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(stamped);
}

// Direct hits on / serve the rewritten index.html so the boot stamp lands
// on the asset references. Everything else falls through to express.static.
app.get('/', _serveIndexHtml);
app.use(express.static(publicDir, {
  index: false,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    // Service worker must be served from the root scope and as
    // application/javascript. Some browsers refuse to register an SW
    // served with text/plain or with a path-restricted Service-Worker-
    // Allowed header. Setting both explicitly here is harmless.
    if (filePath.endsWith('/sw.js') || filePath.endsWith('\\sw.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    if (filePath.endsWith('manifest.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    }
  }
}));

// Bearer-token decoder runs on every request.
app.use(attachUser);

// Routes
app.use('/api', healthRouter);
app.use('/api', voiceConfigRouter);
app.use('/api/auth',     authRouter);
app.use('/api/me',       meRouter);
app.use('/api/servers',  serversRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/dms',      dmsRouter);
app.use('/api/friends',  friendsRouter);
app.use('/api/users',    usersRouter);
app.use('/api/uploads',  uploadsRouter);
app.use('/api/packs',    packsRouter);

// 404 — JSON for API routes, fallback to SPA index.html for everything else.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
// Same rewrite for any non-API route so the SPA's deep links also pick
// up the cache-busted asset URLs.
app.use(_serveIndexHtml);

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'internal_error', message: err && err.message });
});

(async () => {
  try {
    await pingDb();
    console.log('[server] db ok');
  } catch (e) {
    console.warn('[server] db unreachable at startup:', e.message);
    console.warn('[server] continuing — fix the connection then restart.');
  }
  // Wrap Express in a bare HTTP server so we can also attach the WebSocket

  // upgrade handler on the same port. nginx reverse-proxies /ws → backend.

  const httpServer = http.createServer(app);

  attachWs(httpServer);

  httpServer.listen(config.port, () => {

    console.log(`[server] listening on http://localhost:${config.port}`);

    console.log(`[server] websocket on    ws://localhost:${config.port}/ws`);

  });

})();
