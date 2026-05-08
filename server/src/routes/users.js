import { Router } from 'express';
import { q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { foreignUser } from '../lib/userShape.js';
import { emitBlockedByPeer } from '../realtime/events.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

// Lookup by exact handle / email / id. Returns the foreign-safe shape (no
// email or phone) so the caller can show preview info before sending a
// friend request.
usersRouter.get('/search', async (req, res, next) => {
  try {
    const raw = String(req.query.q || '').trim();
    if (!raw) return res.json({ user: null });
    const handle = raw.replace(/^@/, '').toLowerCase();
    let row = await one('SELECT * FROM users WHERE handle = ? LIMIT 1', [handle]);
    if (!row) row = await one('SELECT * FROM users WHERE email = ? LIMIT 1', [raw.toLowerCase()]);
    if (!row && /^\d+$/.test(raw)) row = await one('SELECT * FROM users WHERE id = ? LIMIT 1', [raw]);
    // Last resort: exact display name match (case-insensitive). This lets
    // the profile modal find peers we only know by name.
    if (!row) row = await one('SELECT * FROM users WHERE LOWER(name) = ? LIMIT 1', [raw.toLowerCase()]);
    if (!row || row.id === req.user.id) return res.json({ user: null });
    res.json({ user: foreignUser(row) });
  } catch (e) { next(e); }
});

usersRouter.post('/:id/block', async (req, res, next) => {
  try {
    const target = await one('SELECT * FROM users WHERE id = ? OR handle = ?', [req.params.id, req.params.id]);
    if (!target) return res.status(404).json({ error: 'not_found' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_block_self' });
    await q('INSERT IGNORE INTO blocked_users (user_id, blocked_id) VALUES (?, ?)', [req.user.id, target.id]);
    res.json({ ok: true });
    // Notify the blocked user so their compose box locks live.
    emitBlockedByPeer(target.id, req.user.id, req.user.handle ? '@' + req.user.handle : null, true);
  } catch (e) { next(e); }
});

usersRouter.post('/:id/unblock', async (req, res, next) => {
  try {
    const target = await one('SELECT * FROM users WHERE id = ? OR handle = ?', [req.params.id, req.params.id]);
    if (!target) return res.status(404).json({ error: 'not_found' });
    await q('DELETE FROM blocked_users WHERE user_id = ? AND blocked_id = ?', [req.user.id, target.id]);
    res.json({ ok: true });
    emitBlockedByPeer(target.id, req.user.id, req.user.handle ? '@' + req.user.handle : null, false);
  } catch (e) { next(e); }
});
