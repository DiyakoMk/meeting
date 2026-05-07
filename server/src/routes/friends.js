import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { parseOr400 } from '../validators.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const requestSchema = z.object({
  // Either an @handle or a raw email.
  target: z.string().trim().min(1).max(190)
});

// Send a friend request. Resolves target by handle first, then by email.
friendsRouter.post('/request', async (req, res, next) => {
  try {
    const body = parseOr400(requestSchema, req.body, res); if (!body) return;
    const raw = body.target.replace(/^@/, '').toLowerCase();
    let target = await one('SELECT * FROM users WHERE handle = ? LIMIT 1', [raw]);
    if (!target) target = await one('SELECT * FROM users WHERE email = ? LIMIT 1', [raw]);
    if (!target) return res.status(404).json({ error: 'user_not_found' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_friend_self' });
    // Already friends?
    const exists = await one(
      'SELECT 1 FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1',
      [req.user.id, target.id, target.id, req.user.id]
    );
    if (exists) return res.status(409).json({ error: 'already_friends' });
    // Pending request already?
    const pending = await one(
      `SELECT * FROM friend_requests
        WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
          AND status = 'pending' LIMIT 1`,
      [req.user.id, target.id, target.id, req.user.id]);
    if (pending) return res.status(409).json({ error: 'request_already_pending' });
    const r = await q(
      'INSERT INTO friend_requests (from_id, to_id, status) VALUES (?, ?, "pending")',
      [req.user.id, target.id]
    );
    res.status(201).json({
      request: {
        id: r.insertId,
        name: target.name,
        handle: '@' + target.handle,
        initial: (target.name||'?').charAt(0).toUpperCase(),
        avColor: target.base_color
          ? `linear-gradient(135deg,${target.base_color},#1e1b4b)`
          : 'linear-gradient(135deg,#818cf8,#1e1b4b)',
        meta: 'sent just now'
      }
    });
  } catch (e) { next(e); }
});

friendsRouter.post('/:rid/accept', async (req, res, next) => {
  try {
    const r = await one(
      'SELECT * FROM friend_requests WHERE id = ? AND to_id = ? AND status = "pending"',
      [req.params.rid, req.user.id]);
    if (!r) return res.status(404).json({ error: 'not_found' });
    await q('UPDATE friend_requests SET status = "accepted", resolved_at = NOW() WHERE id = ?', [r.id]);
    // Symmetric friendship — store both directions for cheap lookups.
    await q(
      'INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)',
      [r.from_id, r.to_id, r.to_id, r.from_id]
    );
    const peer = await one('SELECT * FROM users WHERE id = ?', [r.from_id]);
    res.json({
      ok: true,
      peer: {
        handle: '@' + peer.handle,
        name: peer.name,
        initial: (peer.name||'?').charAt(0).toUpperCase(),
        avColor: peer.base_color ? `linear-gradient(135deg,${peer.base_color},#1e1b4b)` : 'linear-gradient(135deg,#818cf8,#1e1b4b)',
        avImage: peer.av_image || null,
        bio: peer.bio || ''
      }
    });
  } catch (e) { next(e); }
});

friendsRouter.post('/:rid/reject', async (req, res, next) => {
  try {
    const r = await one(
      'SELECT * FROM friend_requests WHERE id = ? AND to_id = ? AND status = "pending"',
      [req.params.rid, req.user.id]);
    if (!r) return res.status(404).json({ error: 'not_found' });
    await q('UPDATE friend_requests SET status = "rejected", resolved_at = NOW() WHERE id = ?', [r.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

friendsRouter.delete('/:rid', async (req, res, next) => {
  // Cancel an outgoing request.
  try {
    const r = await one(
      'SELECT * FROM friend_requests WHERE id = ? AND from_id = ? AND status = "pending"',
      [req.params.rid, req.user.id]);
    if (!r) return res.status(404).json({ error: 'not_found' });
    await q('UPDATE friend_requests SET status = "cancelled", resolved_at = NOW() WHERE id = ?', [r.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Remove an established friendship.
friendsRouter.post('/remove/:userId', async (req, res, next) => {
  try {
    await q(
      'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [req.user.id, req.params.userId, req.params.userId, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});
