import { Router } from 'express';

export const dmsRouter = Router();

// Phase 2/3 will fill these in.
dmsRouter.use((_req, res) => res.status(501).json({ error: 'not_implemented', module: 'dms' }));
