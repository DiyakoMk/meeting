import { Router } from 'express';

export const usersRouter = Router();

// Phase 2/3 will fill these in.
usersRouter.use((_req, res) => res.status(501).json({ error: 'not_implemented', module: 'users' }));
