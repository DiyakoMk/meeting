import { Router } from 'express';
import { pingDb } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/healthz', async (_req, res) => {
  try {
    await pingDb();
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'db unreachable', detail: String(e && e.message) });
  }
});
