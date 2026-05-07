import { Router } from 'express';

export const authRouter = Router();

// Phase 2/3 will fill these in.
authRouter.use((_req, res) => res.status(501).json({ error: 'not_implemented', module: 'auth' }));
