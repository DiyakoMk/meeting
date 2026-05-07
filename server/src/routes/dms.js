import { Router } from 'express';
import { z } from 'zod';
import { pool, q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { areFriends, isBlocked } from '../lib/access.js';
import { parseOr400 } from '../validators.js';
import { emitNewDm } from '../realtime/events.js';

export const dmsRouter = Router();
dmsRouter.use(requireAuth);

// Resolve "peerKey" (a handle without the @, OR the literal "saved") into the
// thread row used as the storage key. Creates the thread on first message.
async function resolveThread(peerKey, me) {
  if (peerKey === 'saved') {
    let row = await one('SELECT * FROM dm_threads WHERE user_a = ? AND is_saved = 1', [me.id]);
    if (!row) {
      const r = await q('INSERT INTO dm_threads (user_a, user_b, is_saved) VALUES (?, ?, 1)', [me.id, me.id]);
      row = await one('SELECT * FROM dm_threads WHERE id = ?', [r.insertId]);
    }
    return { thread: row, peer: null };
  }
  const peer = await one('SELECT * FROM users WHERE handle = ? LIMIT 1', [peerKey]);
  if (!peer) return { thread: null, peer: null };
  // Threads are stored with min(uid) as user_a so we don't need two rows.
  const a = Math.min(me.id, peer.id), b = Math.max(me.id, peer.id);
  let row = await one('SELECT * FROM dm_threads WHERE user_a = ? AND user_b = ? AND is_saved = 0', [a, b]);
  if (!row) {
    const r = await q('INSERT INTO dm_threads (user_a, user_b, is_saved) VALUES (?, ?, 0)', [a, b]);
    row = await one('SELECT * FROM dm_threads WHERE id = ?', [r.insertId]);
  }
  return { thread: row, peer };
}

dmsRouter.get('/:peerKey', async (req, res, next) => {
  try {
    const { thread, peer } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    if (peer && await isBlocked(req.user.id, peer.id)){
      return res.json({ messages: [], blocked: true });
    }
    const rows = await q(
      `SELECT m.*, u.handle AS sender_handle FROM dm_messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.thread_id = ? ORDER BY m.created_at ASC LIMIT 500`, [thread.id]);
    const myId = req.user.id;
    res.json({
      messages: rows.map(r => ({
        id: r.id,
        sender: r.sender_id === myId ? 'me' : 'them',
        text: r.body || '',
        time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        day: new Date(r.created_at).toLocaleDateString().toUpperCase(),
        status: r.status,
        edited: !!r.edited,
        deleted: !!r.deleted,
        payload: r.payload_json
      }))
    });
  } catch (e) { next(e); }
});

const sendSchema = z.object({
  text:    z.string().max(4000).optional(),
  payload: z.any().optional(),
  replyTo: z.union([z.string(), z.number()]).optional()
});

dmsRouter.post('/:peerKey', async (req, res, next) => {
  try {
    const body = parseOr400(sendSchema, req.body, res); if (!body) return;
    const { thread, peer } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    if (peer){
      if (await isBlocked(req.user.id, peer.id)) return res.status(403).json({ error: 'blocked' });
      if (peer.friends_only && !(await areFriends(req.user.id, peer.id))) {
        return res.status(403).json({ error: 'friends_only' });
      }
    }
    const result = await q(
      `INSERT INTO dm_messages (thread_id, sender_id, body, payload_json)
       VALUES (?, ?, ?, ?)`,
      [thread.id, req.user.id, body.text || '', body.payload ? JSON.stringify(body.payload) : null]
    );
    await q('UPDATE dm_threads SET last_msg_at = CURRENT_TIMESTAMP WHERE id = ?', [thread.id]);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const day  = new Date().toLocaleDateString().toUpperCase();
    const responsePayload = {
      message: {
        id: result.insertId,
        sender: 'me',
        text: body.text || '',
        time, day,
        status: 'sent'
      }
    };
    res.status(201).json(responsePayload);
    // Push to the peer in realtime. They see `sender:'them'` for the same row.
    if (peer && peer.id !== req.user.id){
      emitNewDm(req.user.id, peer.id, {
        id: result.insertId,
        sender: 'them',
        text: body.text || '',
        time, day,
        peerHandle: req.user.handle ? '@' + req.user.handle : null,
        peerName: req.user.name
      });
    }
  } catch (e) { next(e); }
});

dmsRouter.post('/:peerKey/clear', async (req, res, next) => {
  try {
    const { thread } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    // Soft-delete only the caller's view. Real bilateral delete would need
    // per-side state; for now, drop messages from the thread entirely.
    await q('DELETE FROM dm_messages WHERE thread_id = ?', [thread.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

dmsRouter.delete('/:peerKey/:mid', async (req, res, next) => {
  try {
    const { thread } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    const msg = await one('SELECT * FROM dm_messages WHERE id = ? AND thread_id = ?', [req.params.mid, thread.id]);
    if (!msg) return res.status(404).json({ error: 'not_found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    await q('UPDATE dm_messages SET deleted = 1, body = NULL WHERE id = ?', [req.params.mid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
