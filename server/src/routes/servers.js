import { Router } from 'express';

export const serversRouter = Router();

// Phase 2/3 will fill these in.
serversRouter.use((_req, res) => res.status(501).json({ error: 'not_implemented', module: 'servers' }));
