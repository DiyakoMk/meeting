import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q, one } from '../db.js';
import { hashPassword, verifyPassword } from '../auth/hash.js';
import { signToken } from '../auth/jwt.js';
import { parseOr400, signupSchema, loginSchema } from '../validators.js';
import { publicUser } from '../lib/userShape.js';

export const authRouter = Router();

// Block brute-force: 8 attempts/min per IP for the auth surface.
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false
});
authRouter.use(authLimiter);

authRouter.post('/signup', async (req, res, next) => {
  try {
    const body = parseOr400(signupSchema, req.body, res); if (!body) return;
    const existing = await one('SELECT id FROM users WHERE email = ? OR handle = ? LIMIT 1', [body.email, body.handle]);
    if (existing) return res.status(409).json({ error: 'email_or_handle_taken' });
    const hash = await hashPassword(body.password);
    const result = await q(
      'INSERT INTO users (email, handle, name, password_hash) VALUES (?, ?, ?, ?)',
      [body.email, body.handle, body.name, hash]
    );
    const userId = result.insertId;
    // Auto-create the user's Saved Messages thread.
    await q(
      'INSERT INTO dm_threads (user_a, user_b, is_saved) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE id = id',
      [userId, userId]
    );
    const user = await one('SELECT * FROM users WHERE id = ?', [userId]);
    const token = signToken({ uid: userId });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (e) { next(e); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = parseOr400(loginSchema, req.body, res); if (!body) return;
    const row = await one('SELECT * FROM users WHERE email = ? LIMIT 1', [body.email]);
    if (!row) return res.status(401).json({ error: 'invalid_credentials' });
    const ok = await verifyPassword(body.password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    await q('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    const token = signToken({ uid: row.id });
    res.json({ token, user: publicUser(row) });
  } catch (e) { next(e); }
});

authRouter.post('/logout', async (_req, res) => {
  // We use stateless JWTs, so logout is a frontend-side concern (drop the
  // token). We expose this endpoint anyway so the frontend has a single hook.
  res.json({ ok: true });
});
