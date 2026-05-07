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

const app = express();

// CORS — allow the frontend origin only. Adjust PUBLIC_ORIGIN in .env.
app.use(cors({
  origin: config.publicOrigin,
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));

// Static uploads. Anything written to UPLOAD_DIR is served from /uploads/*.
const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsAbs = path.resolve(here, '..', config.uploads.dir.replace(/^\.\//, ''));
app.use(config.uploads.publicBase, express.static(uploadsAbs));

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

// 404
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

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
  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });
})();
