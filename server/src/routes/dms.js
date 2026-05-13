import { Router } from 'express';
import { z } from 'zod';
import { pool, q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { areFriends, isBlocked } from '../lib/access.js';
import { parseOr400 } from '../validators.js';
import { emitNewDm, emitDmDeleted, emitDmCleared, emitDmRead } from '../realtime/events.js';
import { sendToUser } from '../realtime/ws.js';

export const dmsRouter = Router();
dmsRouter.use(requireAuth);

// Locale-independent day key (YYYY-MM-DD) shared with the renderer. Bubbles
// from the same calendar day must hash to the same key so the divider only
// renders once. The client maps "today" / "yesterday" to friendly labels
// at render time; raw dates older than yesterday come through as the key
// itself, which the client also pretty-prints. Keeping the math here
// instead of `toLocaleDateString` avoids the "node prints 5/8/2026 but
// the renderer prints 8/5/2026" drift we hit in the previous fix.
function dayKey(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  return y + '-' + m + '-' + dd;
}

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
  // If the peer key resolves to ourselves (e.g. someone DMing their own
  // handle), route into the Saved Messages thread instead of trying to
  // create a duplicate (user_a, user_b) row.
  if (peer.id === me.id) {
    let row = await one('SELECT * FROM dm_threads WHERE user_a = ? AND is_saved = 1', [me.id]);
    if (!row) {
      const r = await q('INSERT INTO dm_threads (user_a, user_b, is_saved) VALUES (?, ?, 1)', [me.id, me.id]);
      row = await one('SELECT * FROM dm_threads WHERE id = ?', [r.insertId]);
    }
    return { thread: row, peer: null };
  }
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
    // History is always visible to both parties, regardless of who blocked
    // whom. Composing is the only thing that's gated. We still return a
    // blocked flag so the client can surface the right banner state.
    // We also honour dm_thread_hidden: if the caller previously cleared
    // this thread, only show messages with id > last_hidden_id (i.e. only
    // what arrived after they nuked their copy).
    const hiddenRow = await one(
      'SELECT last_hidden_id FROM dm_thread_hidden WHERE user_id = ? AND thread_id = ?',
      [req.user.id, thread.id]);
    const hiddenCutoff = hiddenRow ? Number(hiddenRow.last_hidden_id) || 0 : 0;
    const rows = await q(
      `SELECT m.*, u.handle AS sender_handle FROM dm_messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.thread_id = ? AND m.id > ? ORDER BY m.created_at ASC LIMIT 500`,
      [thread.id, hiddenCutoff]);
    const myId = req.user.id;
    res.json({
      messages: rows.map(r => {
        // Send the raw timestamp so the renderer can format it in the
        // user's local timezone. The legacy `time` field stays for older
        // clients but it's just an ISO string on the wire now; the
        // browser converts to "HH:MM" with todayDayLabel-style helpers.
        const created = (r.created_at instanceof Date)
          ? r.created_at.toISOString()
          : new Date(r.created_at).toISOString();
        return {
          id: r.id,
          sender: r.sender_id === myId ? 'me' : 'them',
          text: r.body || '',
          createdAt: created,                  // canonical, ISO + UTC
          time:      created,                  // legacy alias; renderer
                                               // formats both the same way
          day:       dayKey(r.created_at),
          status:    r.status,
          edited:    !!r.edited,
          deleted:   !!r.deleted,
          payload:   r.payload_json
        };
      })
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
    // Use the same instant we just stamped on the row so the optimistic
    // bubble and the persisted bubble share the exact same wall-clock
    // value. We send ISO + UTC down to the renderer; it formats with the
    // user's local timezone, which fixes the "time changes after a
    // reload" report (server was stamping its UTC clock).
    const created = new Date().toISOString();
    const day  = dayKey(new Date());
    const responsePayload = {
      message: {
        id: result.insertId,
        sender: 'me',
        text: body.text || '',
        createdAt: created,
        time:      created,
        day,
        status: 'sent',
        payload: body.payload || null
      }
    };
    res.status(201).json(responsePayload);
    // Push to the peer in realtime. They see `sender:'them'` for the same row.
    if (peer && peer.id !== req.user.id){
      emitNewDm(req.user.id, peer.id, {
        id: result.insertId,
        sender: 'them',
        text: body.text || '',
        createdAt: created,
        time:      created,
        day,
        payload: body.payload || null,
        peerHandle: req.user.handle ? '@' + req.user.handle : null,
        peerName: req.user.name
      });
    }
  } catch (e) { next(e); }
});

// Pin / unpin a single message in a DM thread. Pin state is shared
// between both peers (one row per thread). Pass {messageId: null} to clear.
const pinSchema = z.object({ messageId: z.union([z.string(), z.number()]).nullable().optional() });
dmsRouter.post('/:peerKey/pin', async (req, res, next) => {
  try {
    const { thread } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    const body = parseOr400(pinSchema, req.body, res); if (!body) return;
    if (!body.messageId){
      await q('DELETE FROM dm_pinned WHERE thread_id = ?', [thread.id]);
      res.json({ ok: true, pinnedMessageId: null });
      sendToUser(thread.user_a, { type: 'dm:pin', threadId: thread.id, messageId: null });
      sendToUser(thread.user_b, { type: 'dm:pin', threadId: thread.id, messageId: null });
      return;
    }
    const mid = Number(body.messageId);
    const m = await one('SELECT id FROM dm_messages WHERE id = ? AND thread_id = ?', [mid, thread.id]);
    if (!m) return res.status(404).json({ error: 'message_not_found' });
    await q(
      `INSERT INTO dm_pinned (thread_id, message_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE message_id = VALUES(message_id), pinned_at = CURRENT_TIMESTAMP`,
      [thread.id, mid]);
    res.json({ ok: true, pinnedMessageId: mid });
    sendToUser(thread.user_a, { type: 'dm:pin', threadId: thread.id, messageId: mid });
    sendToUser(thread.user_b, { type: 'dm:pin', threadId: thread.id, messageId: mid });
  } catch (e) { next(e); }
});

// Mark every message in this thread as read (up to current max id) for the
// caller. Snapshot's unreadDm uses dm_read_state.last_read_id to compute
// "X new messages since you last looked".
dmsRouter.post('/:peerKey/read', async (req, res, next) => {
  try {
    const { thread, peer } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    const top = await one('SELECT MAX(id) AS m FROM dm_messages WHERE thread_id = ?', [thread.id]);
    const maxId = (top && top.m) ? Number(top.m) : 0;
    await q(
      `INSERT INTO dm_read_state (user_id, thread_id, last_read_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id)), updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, thread.id, maxId]);
    res.json({ ok: true, lastReadId: maxId });
    // Tell the peer their delivered ticks just flipped to read ticks. Skip
    // for Saved Messages (peer is the same user) — there's nothing to flip.
    if (peer && peer.id && String(peer.id) !== String(req.user.id) && maxId > 0){
      emitDmRead(req.user.id, peer.id, maxId);
    }
  } catch (e) { next(e); }
});

dmsRouter.post('/:peerKey/clear', async (req, res, next) => {
  try {
    const { thread } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    // One-sided delete: hide every message currently in the thread for the
    // caller only. The peer keeps their full history. New messages (id >
    // last_hidden_id) will surface the thread again on both sides.
    const top = await one('SELECT MAX(id) AS m FROM dm_messages WHERE thread_id = ?', [thread.id]);
    const maxId = (top && top.m) ? Number(top.m) : 0;
    await q(
      `INSERT INTO dm_thread_hidden (user_id, thread_id, last_hidden_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_hidden_id = GREATEST(last_hidden_id, VALUES(last_hidden_id)), updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, thread.id, maxId]);
    // Bring the read marker up to maxId too — there's nothing left to read.
    await q(
      `INSERT INTO dm_read_state (user_id, thread_id, last_read_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id)), updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, thread.id, maxId]);
    res.json({ ok: true, hiddenUpTo: maxId });
  } catch (e) { next(e); }
});

dmsRouter.delete('/:peerKey/:mid', async (req, res, next) => {
  try {
    const { thread, peer } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    const msg = await one('SELECT * FROM dm_messages WHERE id = ? AND thread_id = ?', [req.params.mid, thread.id]);
    if (!msg) return res.status(404).json({ error: 'not_found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    await q('UPDATE dm_messages SET deleted = 1, body = NULL WHERE id = ?', [req.params.mid]);
    res.json({ ok: true });
    // Push the soft-delete to the peer so their bubble flips to
    // "Message deleted" without reloading the thread.
    if (peer && peer.id !== req.user.id) emitDmDeleted(req.user.id, peer.id, Number(req.params.mid));
  } catch (e) { next(e); }
});

const editSchema = z.object({ text: z.string().max(4000) });

dmsRouter.patch('/:peerKey/:mid', async (req, res, next) => {
  try {
    const body = parseOr400(editSchema, req.body, res); if (!body) return;
    const { thread, peer } = await resolveThread(req.params.peerKey, req.user);
    if (!thread) return res.status(404).json({ error: 'peer_not_found' });
    const msg = await one('SELECT * FROM dm_messages WHERE id = ? AND thread_id = ?', [req.params.mid, thread.id]);
    if (!msg) return res.status(404).json({ error: 'not_found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    await q('UPDATE dm_messages SET body = ?, edited = 1 WHERE id = ?', [body.text, req.params.mid]);
    res.json({ ok: true });
    // Push the new body to the peer so their bubble updates without reload.
    if (peer && peer.id !== req.user.id) {
      sendToUser(peer.id, { type: 'dm:edited', from: String(req.user.id), messageId: Number(req.params.mid), text: body.text });
    }
  } catch (e) { next(e); }
});
