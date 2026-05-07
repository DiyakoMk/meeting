import { Router } from 'express';

export const meRouter = Router();

// Phase 2/3 will fill these in.
meRouter.use((_req, res) => res.status(501).json({ error: 'not_implemented', module: 'me' }));
