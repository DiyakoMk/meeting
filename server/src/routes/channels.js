import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { uid } from '../lib/ids.js';
import { requireMember, requireAdmin } from '../lib/access.js';
import { parseOr400 } from '../validators.js';
import { emitChannelMessage, emitVoiceJoin, emitVoiceLeave } from '../realtime/events.js';

export const channelsRouter = Router();
channelsRouter.use(requireAuth);

const channelSchema = z.object({
  name:       z.string().trim().min(1).max(80),
  style:      z.string().max(40).optional(),
  categoryId: z.string().min(1).max(40).nullable().optional()
});

// All channel endpoints are nested under /api/servers/:sid in the URL the
// frontend sees. We mount this router at `/api/channels` and route it via
// nested params instead, to keep this file focused.

// Create a text channel.
channelsRouter.post('/text/:sid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requireAdmin(req, res, sid)) return;
    const body = parseOr400(channelSchema, req.body, res); if (!body) return;
    const cid = uid();
    await q(
      `INSERT INTO text_channels (id, server_id, category_id, name, style, position)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM (SELECT * FROM text_channels) AS x WHERE x.server_id = ?))`,
      [cid, sid, body.categoryId || null, body.name, body.style || 'glow', sid]
    );
    res.status(201).json({ channel: { id: cid, name: body.name, style: body.style || 'glow', unread: 0, categoryId: body.categoryId || null } });
  } catch (e) { next(e); }
});

channelsRouter.delete('/text/:sid/:cid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requireAdmin(req, res, sid)) return;
    await q('DELETE FROM text_channels WHERE id = ? AND server_id = ?', [req.params.cid, sid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Create a voice channel.
channelsRouter.post('/voice/:sid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requireAdmin(req, res, sid)) return;
    const body = parseOr400(channelSchema, req.body, res); if (!body) return;
    const cid = uid();
    await q(
      `INSERT INTO voice_channels (id, server_id, category_id, name, style, position)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM (SELECT * FROM voice_channels) AS x WHERE x.server_id = ?))`,
      [cid, sid, body.categoryId || null, body.name, body.style || 'indigo', sid]
    );
    res.status(201).json({ channel: { id: cid, name: body.name, style: body.style || 'indigo', categoryId: body.categoryId || null } });
  } catch (e) { next(e); }
});

channelsRouter.delete('/voice/:sid/:cid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requireAdmin(req, res, sid)) return;
    await q('DELETE FROM voice_channels WHERE id = ? AND server_id = ?', [req.params.cid, sid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Join a voice channel — records the current member set so other clients can
// see who's there. Real audio routing happens via WebRTC/TURN in phase 4.
channelsRouter.post('/voice/:sid/:cid/join', async (req, res, next) => {
  try {
    const { sid, cid } = req.params;
    if (!await requireMember(req, res, sid)) return;
    const ch = await one('SELECT * FROM voice_channels WHERE id = ? AND server_id = ?', [cid, sid]);
    if (!ch) return res.status(404).json({ error: 'not_found' });
    await q(
      `INSERT INTO voice_channel_members (channel_id, user_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE joined_at = CURRENT_TIMESTAMP`,
      [cid, req.user.id]
    );
    const members = await q(
      `SELECT u.name FROM voice_channel_members vm JOIN users u ON u.id = vm.user_id WHERE vm.channel_id = ?`,
      [cid]);
    const names = members.map(m => m.name);
    res.json({ ok: true, members: names });
    emitVoiceJoin(sid, cid, req.user.name, names);
  } catch (e) { next(e); }
});

channelsRouter.post('/voice/:sid/:cid/leave', async (req, res, next) => {
  try {
    const { sid, cid } = req.params;
    if (!await requireMember(req, res, sid)) return;
    await q('DELETE FROM voice_channel_members WHERE channel_id = ? AND user_id = ?', [cid, req.user.id]);
    const members = await q(
      `SELECT u.name FROM voice_channel_members vm JOIN users u ON u.id = vm.user_id WHERE vm.channel_id = ?`,
      [cid]);
    const names = members.map(m => m.name);
    res.json({ ok: true });
    emitVoiceLeave(sid, cid, req.user.name, names);
  } catch (e) { next(e); }
});

// Text-channel messages -----------------------------------------------------

const textMessageSchema = z.object({
  text:    z.string().max(4000).optional(),
  payload: z.any().optional(),
  replyTo: z.union([z.string(), z.number()]).optional()
});

channelsRouter.get('/text/:sid/:cid/messages', async (req, res, next) => {
  try {
    const { sid, cid } = req.params;
    if (!await requireMember(req, res, sid)) return;
    const rows = await q(
      `SELECT m.*, u.name AS sender_name FROM text_channel_messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.channel_id = ?
        ORDER BY m.created_at ASC
        LIMIT 200`, [cid]);
    res.json({
      messages: rows.map(r => ({
        id: r.id,
        user: r.sender_name,
        text: r.body || '',
        time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        replyTo: r.reply_to,
        edited: !!r.edited,
        deleted: !!r.deleted,
        payload: r.payload_json
      }))
    });
  } catch (e) { next(e); }
});

channelsRouter.post('/text/:sid/:cid/messages', async (req, res, next) => {
  try {
    const { sid, cid } = req.params;
    if (!await requireMember(req, res, sid)) return;
    const body = parseOr400(textMessageSchema, req.body, res); if (!body) return;
    const result = await q(
      `INSERT INTO text_channel_messages (channel_id, sender_id, body, payload_json, reply_to)
       VALUES (?, ?, ?, ?, ?)`,
      [cid, req.user.id, body.text || '', body.payload ? JSON.stringify(body.payload) : null, body.replyTo || null]
    );
    const messagePayload = {
      id: result.insertId,
      user: req.user.name,
      text: body.text || '',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      replyTo: body.replyTo || null,
      payload: body.payload || null
    };
    res.status(201).json({ message: messagePayload });
    emitChannelMessage(sid, cid, messagePayload);
  } catch (e) { next(e); }
});

channelsRouter.delete('/text/:sid/:cid/messages/:mid', async (req, res, next) => {
  try {
    const { sid, cid, mid } = req.params;
    const m = await requireMember(req, res, sid); if (!m) return;
    const msg = await one('SELECT * FROM text_channel_messages WHERE id = ? AND channel_id = ?', [mid, cid]);
    if (!msg) return res.status(404).json({ error: 'not_found' });
    if (msg.sender_id !== req.user.id && !m.is_admin) {
      return res.status(403).json({ error: 'forbidden' });
    }
    await q('UPDATE text_channel_messages SET deleted = 1, body = NULL WHERE id = ?', [mid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
