import express from 'express';
import cors from 'cors';
import path from 'node:path';
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
import { attachWs } from './realtime/ws.js';
import http from 'node:http';

const app = express();

// We sit behind nginx (and sometimes a Cloudflare tunnel in dev), so trust the
// first proxy hop. Without this Express sees every request as coming from
// 127.0.0.1 and the auth rate limiter treats all users as one.
app.set('trust proxy', true);

// CORS — allow the frontend origin only. Adjust PUBLIC_ORIGIN in .env.
app.use(cors({
  origin: config.publicOrigin,
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
const publicDir = path.resolve(here, '..', '..', 'public');
app.use(express.static(publicDir));

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

// 404 — JSON for API routes, fallback to SPA index.html for everything else.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.use((_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

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
