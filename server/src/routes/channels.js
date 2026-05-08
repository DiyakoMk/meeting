import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { uid } from '../lib/ids.js';
import { requireMember, requireAdmin, requirePermission } from '../lib/access.js';
import { parseOr400 } from '../validators.js';
import {
  emitChannelMessage, emitVoiceJoin, emitVoiceLeave,
  emitChannelMessageDeleted, emitServerChannelAdded, emitServerChannelDeleted,
  emitServerUpdated, emitChannelMessagePinned, emitVoiceKicked
} from '../realtime/events.js';

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
    if (!await requirePermission(req, res, sid, "manageTextCh")) return;
    const body = parseOr400(channelSchema, req.body, res); if (!body) return;
    const cid = uid();
    await q(
      `INSERT INTO text_channels (id, server_id, category_id, name, style, position)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM (SELECT * FROM text_channels) AS x WHERE x.server_id = ?))`,
      [cid, sid, body.categoryId || null, body.name, body.style || 'glow', sid]
    );
    const channel = { id: cid, name: body.name, style: body.style || 'glow', unread: 0, categoryId: body.categoryId || null };
    res.status(201).json({ channel });
    emitServerChannelAdded(sid, 'text', channel, body.categoryId || null);
  } catch (e) { next(e); }
});

channelsRouter.delete('/text/:sid/:cid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requirePermission(req, res, sid, "manageTextCh")) return;
    await q('DELETE FROM text_channels WHERE id = ? AND server_id = ?', [req.params.cid, sid]);
    res.json({ ok: true });
    emitServerChannelDeleted(sid, 'text', req.params.cid);
  } catch (e) { next(e); }
});

// Create a voice channel.
channelsRouter.post('/voice/:sid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requirePermission(req, res, sid, "manageVoiceCh")) return;
    const body = parseOr400(channelSchema, req.body, res); if (!body) return;
    const cid = uid();
    await q(
      `INSERT INTO voice_channels (id, server_id, category_id, name, style, position)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM (SELECT * FROM voice_channels) AS x WHERE x.server_id = ?))`,
      [cid, sid, body.categoryId || null, body.name, body.style || 'indigo', sid]
    );
    const channel = { id: cid, name: body.name, style: body.style || 'indigo', categoryId: body.categoryId || null };
    res.status(201).json({ channel });
    emitServerChannelAdded(sid, 'voice', channel, body.categoryId || null);
  } catch (e) { next(e); }
});

channelsRouter.delete('/voice/:sid/:cid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requirePermission(req, res, sid, "manageVoiceCh")) return;
    await q('DELETE FROM voice_channels WHERE id = ? AND server_id = ?', [req.params.cid, sid]);
    res.json({ ok: true });
    emitServerChannelDeleted(sid, 'voice', req.params.cid);
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
// Kick another user out of a voice channel. Requires kickFromVoice.
const voiceKickSchema = z.object({ userId: z.union([z.string(), z.number()]) });
channelsRouter.post('/voice/:sid/:cid/kick', async (req, res, next) => {
  try {
    const { sid, cid } = req.params;
    if (!await requirePermission(req, res, sid, 'kickFromVoice')) return;
    const body = parseOr400(voiceKickSchema, req.body, res); if (!body) return;
    const targetId = String(body.userId);
    if (String(req.user.id) === targetId) return res.status(400).json({ error: 'cannot_kick_self' });
    const targetUser = await one('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!targetUser) return res.status(404).json({ error: 'target_not_found' });
    await q('DELETE FROM voice_channel_members WHERE channel_id = ? AND user_id = ?', [cid, targetId]);
    const members = await q(
      `SELECT u.name FROM voice_channel_members vm JOIN users u ON u.id = vm.user_id WHERE vm.channel_id = ?`,
      [cid]);
    const names = members.map(m => m.name);
    res.json({ ok: true });
    emitVoiceKicked(targetId, sid, cid);
    emitVoiceLeave(sid, cid, targetUser.name, names);
  } catch (e) { next(e); }
});


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
    emitChannelMessageDeleted(sid, cid, Number(mid));
  } catch (e) { next(e); }
});

// Mark every message in this text channel as read (up to current max id)
// for the caller. Mirrors the DM read endpoint.
channelsRouter.post('/text/:sid/:cid/read', async (req, res, next) => {
  try {
    const { sid, cid } = req.params;
    if (!await requireMember(req, res, sid)) return;
    const top = await one('SELECT MAX(id) AS m FROM text_channel_messages WHERE channel_id = ?', [cid]);
    const maxId = (top && top.m) ? Number(top.m) : 0;
    await q(
      `INSERT INTO text_channel_read_state (user_id, channel_id, last_read_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id)), updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, cid, maxId]);
    res.json({ ok: true, lastReadId: maxId });
  } catch (e) { next(e); }
});

// --- Patch (rename / restyle) a text channel ---
const channelPatchSchema = z.object({
  name:  z.string().trim().min(1).max(80).optional(),
  style: z.string().max(40).optional()
});

channelsRouter.patch('/text/:sid/:cid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requirePermission(req, res, sid, "manageTextCh")) return;
    const body = parseOr400(channelPatchSchema, req.body, res); if (!body) return;
    const sets = [], args = [];
    if (body.name  !== undefined) { sets.push('name = ?');  args.push(body.name); }
    if (body.style !== undefined) { sets.push('style = ?'); args.push(body.style); }
    if (sets.length) {
      args.push(req.params.cid, sid);
      await q('UPDATE text_channels SET ' + sets.join(', ') + ' WHERE id = ? AND server_id = ?', args);
    }
    res.json({ ok: true });
    emitServerUpdated(sid, await __buildServerPayload(sid));
  } catch (e) { next(e); }
});

channelsRouter.patch('/voice/:sid/:cid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requirePermission(req, res, sid, "manageVoiceCh")) return;
    const body = parseOr400(channelPatchSchema, req.body, res); if (!body) return;
    const sets = [], args = [];
    if (body.name  !== undefined) { sets.push('name = ?');  args.push(body.name); }
    if (body.style !== undefined) { sets.push('style = ?'); args.push(body.style); }
    if (sets.length) {
      args.push(req.params.cid, sid);
      await q('UPDATE voice_channels SET ' + sets.join(', ') + ' WHERE id = ? AND server_id = ?', args);
    }
    res.json({ ok: true });
    emitServerUpdated(sid, await __buildServerPayload(sid));
  } catch (e) { next(e); }
});

// --- Pin / unpin a message inside a text channel ---
const channelPinSchema = z.object({ messageId: z.union([z.number(), z.string()]).nullable().optional() });

channelsRouter.post('/text/:sid/:cid/pin', async (req, res, next) => {
  try {
    const sid = req.params.sid, cid = req.params.cid;
    const m = await requirePermission(req, res, sid, "managePins"); if (!m) return;
    const body = parseOr400(channelPinSchema, req.body, res); if (!body) return;
    let pinnedMsg = null, pinnedBy = null, pinnedMsgId = null;
    if (body.messageId) {
      const row = await one('SELECT m.*, u.name AS sender_name FROM text_channel_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ? AND m.channel_id = ?', [Number(body.messageId), cid]);
      if (!row) return res.status(404).json({ error: 'message_not_found' });
      pinnedMsgId = row.id; pinnedMsg = row.body || ''; pinnedBy = row.sender_name;
      await q('UPDATE text_channels SET pinned_msg_id = ? WHERE id = ? AND server_id = ?', [row.id, cid, sid]);
    } else {
      await q('UPDATE text_channels SET pinned_msg_id = NULL WHERE id = ? AND server_id = ?', [cid, sid]);
    }
    res.json({ ok: true, pinnedMsgId, pinnedMsg, pinnedBy });
    emitChannelMessagePinned(sid, cid, pinnedMsgId, pinnedMsg, pinnedBy);
  } catch (e) { next(e); }
});

// Helper: rebuild the same payload servers.js exports. Inline to avoid a
// circular import; keeps emitServerUpdated honest after channel mutations.

async function __buildServerPayload(sid) {
  const s = await one('SELECT * FROM servers WHERE id = ?', [sid]);
  if (!s) return null;
  const members = await q(`SELECT sm.user_id, sm.is_admin, u.name FROM server_members sm JOIN users u ON u.id = sm.user_id WHERE sm.server_id = ?`, [sid]);
  const cats = await q('SELECT * FROM server_categories WHERE server_id = ? ORDER BY position', [sid]);
  const tcs  = await q('SELECT * FROM text_channels    WHERE server_id = ? ORDER BY position', [sid]);
  const vcs  = await q('SELECT * FROM voice_channels   WHERE server_id = ? ORDER BY position', [sid]);
  return {
    id: s.id, name: s.name, initial: s.initial || (s.name||'?').charAt(0).toUpperCase(),
    desc: s.description || '', baseColor: s.base_color || null,
    grad: s.grad || null, glow: s.glow || null, cover: s.cover || null,
    emblemImage: s.emblem_image || null, inviteKey: s.invite_key || null,
    isPrivate: !!s.is_private,
    members: members.map(x => x.name),
    memberDetails: members.map(x => ({ id: String(x.user_id), name: x.name, isAdmin: !!x.is_admin })),
    admins:  members.filter(x => x.is_admin).map(x => x.name),
    pinned: s.pinned_text ? { text: s.pinned_text, by: null, time: null } : null,
    categories: cats.map(c => ({
      id: c.id, name: c.name,
      pinned: c.pinned_text ? { text: c.pinned_text, by: null, time: null } : null,
      textChannels:  tcs.filter(t => t.category_id === c.id).map(t => t.id),
      voiceChannels: vcs.filter(v => v.category_id === c.id).map(v => v.id)
    })),
    textChannels: tcs.map(t => ({ id: t.id, name: t.name, style: t.style || 'glow', unread: 0, pinnedMsgId: t.pinned_msg_id || null })),
    voiceChannels: vcs.map(v => ({ id: v.id, name: v.name, style: v.style || 'indigo' }))
  };
}
