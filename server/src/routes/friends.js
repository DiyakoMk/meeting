import { Router } from 'express';

export const friendsRouter = Router();

// Phase 2/3 will fill these in.
friendsRouter.use((_req, res) => res.status(501).json({ error: 'not_implemented', module: 'friends' }));
