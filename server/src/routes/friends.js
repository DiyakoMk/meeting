import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { parseOr400 } from '../validators.js';
import { emitFriendRequest, emitFriendAccepted } from '../realtime/events.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const requestSchema = z.object({
  target: z.string().trim().min(1).max(190)
});

friendsRouter.post('/request', async (req, res, next) => {
  try {
    const body = parseOr400(requestSchema, req.body, res); if (!body) return;
    const raw = body.target.replace(/^@/, '').toLowerCase();
    let target = await one('SELECT * FROM users WHERE handle = ? LIMIT 1', [raw]);
    if (!target) target = await one('SELECT * FROM users WHERE email = ? LIMIT 1', [raw]);
    if (!target) return res.status(404).json({ error: 'user_not_found' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_friend_self' });
    const exists = await one(
      'SELECT 1 FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1',
      [req.user.id, target.id, target.id, req.user.id]
    );
    if (exists) return res.status(409).json({ error: 'already_friends' });
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
    const requestPayload = {
      id: r.insertId,
      name: target.name,
      handle: '@' + target.handle,
      initial: (target.name||'?').charAt(0).toUpperCase(),
      avColor: target.base_color
        ? `linear-gradient(135deg,${target.base_color},#1e1b4b)`
        : 'linear-gradient(135deg,#818cf8,#1e1b4b)',
      meta: 'sent just now'
    };
    res.status(201).json({ request: requestPayload });
    // Push to the recipient. They'll see it as an INCOMING request — same id,
    // but with the *sender's* identity baked in.
    emitFriendRequest(target.id, {
      id: r.insertId,
      name: req.user.name,
      handle: req.user.handle ? '@' + req.user.handle : '',
      initial: (req.user.name||'?').charAt(0).toUpperCase(),
      avColor: req.user.base_color
        ? `linear-gradient(135deg,${req.user.base_color},#1e1b4b)`
        : 'linear-gradient(135deg,#818cf8,#1e1b4b)',
      meta: 'received'
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
    await q(
      'INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)',
      [r.from_id, r.to_id, r.to_id, r.from_id]
    );
    const peer = await one('SELECT * FROM users WHERE id = ?', [r.from_id]);
    const peerShape = {
      handle: '@' + peer.handle,
      name: peer.name,
      initial: (peer.name||'?').charAt(0).toUpperCase(),
      avColor: peer.base_color ? `linear-gradient(135deg,${peer.base_color},#1e1b4b)` : 'linear-gradient(135deg,#818cf8,#1e1b4b)',
      avImage: peer.av_image || null,
      bio: peer.bio || ''
    };
    res.json({ ok: true, peer: peerShape });
    // Tell the original sender that we accepted.
    emitFriendAccepted(r.from_id, {
      handle: '@' + req.user.handle,
      name: req.user.name,
      initial: (req.user.name||'?').charAt(0).toUpperCase(),
      avColor: req.user.base_color ? `linear-gradient(135deg,${req.user.base_color},#1e1b4b)` : 'linear-gradient(135deg,#818cf8,#1e1b4b)',
      avImage: req.user.av_image || null,
      bio: req.user.bio || ''
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
  try {
    const r = await one(
      'SELECT * FROM friend_requests WHERE id = ? AND from_id = ? AND status = "pending"',
      [req.params.rid, req.user.id]);
    if (!r) return res.status(404).json({ error: 'not_found' });
    await q('UPDATE friend_requests SET status = "cancelled", resolved_at = NOW() WHERE id = ?', [r.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

friendsRouter.post('/remove/:userId', async (req, res, next) => {
  try {
    await q(
      'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [req.user.id, req.params.userId, req.params.userId, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});
