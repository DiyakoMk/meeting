import { Router } from 'express';

export const channelsRouter = Router();

// Phase 2/3 will fill these in.
channelsRouter.use((_req, res) => res.status(501).json({ error: 'not_implemented', module: 'channels' }));
