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
    const m = await requireMember(req, res, sid); if (!m) return;
    const ch = await one(
      `SELECT v.*, c.visible_role_ids AS cat_visible_role_ids
         FROM voice_channels v
         LEFT JOIN server_categories c ON c.id = v.category_id
        WHERE v.id = ? AND v.server_id = ?`,
      [cid, sid]);
    if (!ch) return res.status(404).json({ error: 'not_found' });
    // Cascade visibility check — admin / owner skip, everyone else needs
    // to satisfy BOTH the parent category's visibleRoleIds and the
    // channel's own. Without this a user could hit /join directly for an
    // orb whose parent category their roles can't see.
    if (!m.is_admin) {
      const _parse = v => {
        if (v == null) return null;
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
        return v;
      };
      const userRoleIds = (await q(
        `SELECT sr.id FROM server_roles sr
           JOIN server_role_members srm
             ON srm.server_id = sr.server_id AND srm.role_id = sr.id
          WHERE sr.server_id = ? AND srm.user_id = ?`, [sid, req.user.id]
      )).map(r => r.id);
      const _hasAny = (allow) => {
        if (!Array.isArray(allow) || !allow.length) return true; // unrestricted
        return userRoleIds.some(rid => allow.includes(rid));
      };
      const catAllow = _parse(ch.cat_visible_role_ids);
      const vcAllow  = _parse(ch.visible_role_ids);
      if (!_hasAny(catAllow) || !_hasAny(vcAllow)){
        return res.status(403).json({ error: 'channel_not_visible' });
      }
    }
    // A user can only be in one voice channel at a time. Drop them out of
    // any *other* voice channel they were in (across every server) before
    // recording the new join, so their avatar doesn't linger on an old
    // orb. We snapshot the affected channels so we can fan out leave
    // events to their members.
    const stale = await q(
      `SELECT vm.channel_id, vc.server_id
         FROM voice_channel_members vm
         JOIN voice_channels vc ON vc.id = vm.channel_id
        WHERE vm.user_id = ? AND vm.channel_id != ?`,
      [req.user.id, cid]);
    if (stale.length){
      await q('DELETE FROM voice_channel_members WHERE user_id = ? AND channel_id != ?', [req.user.id, cid]);
    }
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
    // Fan out a voice:leave for every channel they got pulled out of
    // first, so peers see the move atomically.
    for (const s of stale){
      const remaining = await q(
        `SELECT u.name FROM voice_channel_members vm JOIN users u ON u.id = vm.user_id WHERE vm.channel_id = ?`,
        [s.channel_id]);
      emitVoiceLeave(s.server_id, s.channel_id, req.user.name, remaining.map(r => r.name));
    }
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
        time: ((r.created_at instanceof Date) ? r.created_at.toISOString() : new Date(r.created_at).toISOString()),
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
    const m = await requireMember(req, res, sid); if (!m) return;
    // Visibility + send gate (channel + parent category cascade). Admins
    // and the server owner always pass — for everyone else, both the
    // category visibleRoleIds and the channel visibleRoleIds must be
    // satisfied, AND the per-channel sendMessages deny must not match.
    // Without this, a user could share / forward straight into a
    // private channel by hitting the API directly (the renderer hid
    // the channel from the picker but the endpoint accepted writes).
    if (!m.is_admin) {
      const ch = await one(
        `SELECT t.id, t.category_id, t.visible_role_ids, t.permission_allow, t.permission_deny,
                c.visible_role_ids AS cat_visible_role_ids
           FROM text_channels t
           LEFT JOIN server_categories c ON c.id = t.category_id
          WHERE t.id = ? AND t.server_id = ?`,
        [cid, sid]);
      if (!ch) return res.status(404).json({ error: 'channel_not_found' });
      const userRoleIds = (await q(
        `SELECT sr.id FROM server_roles sr
           JOIN server_role_members srm
             ON srm.server_id = sr.server_id AND srm.role_id = sr.id
          WHERE sr.server_id = ? AND srm.user_id = ?`, [sid, req.user.id]
      )).map(r => r.id);
      const _parse = v => {
        if (v == null) return null;
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; }}
        return v;
      };
      const tcAllow = _parse(ch.visible_role_ids);
      const catAllow = _parse(ch.cat_visible_role_ids);
      const denyMap  = _parse(ch.permission_deny)  || {};
      const allowMap = _parse(ch.permission_allow) || {};
      const _hasAny = (allowList) => {
        if (!Array.isArray(allowList) || !allowList.length) return true; // unrestricted
        return userRoleIds.some(rid => allowList.includes(rid));
      };
      // Also honour an explicit per-channel allow on viewChannel — even if
      // the channel/category restricts to a role, an allow override gives
      // a different role read access.
      const _viewAllowedByOverride = userRoleIds.some(rid =>
        Array.isArray(allowMap[rid]) && allowMap[rid].includes('viewChannel'));
      const _viewDeniedByOverride = userRoleIds.some(rid =>
        Array.isArray(denyMap[rid]) && denyMap[rid].includes('viewChannel'));
      const canSee = !_viewDeniedByOverride && (
        _viewAllowedByOverride || (_hasAny(catAllow) && _hasAny(tcAllow))
      );
      if (!canSee) return res.status(403).json({ error: 'channel_not_visible' });
      // sendMessages deny — same allow-beats-deny rule as before.
      if (Object.keys(denyMap).length) {
        for (const rid of userRoleIds) {
          const denied  = Array.isArray(denyMap[rid])  && denyMap[rid].includes('sendMessages');
          const allowed = Array.isArray(allowMap[rid]) && allowMap[rid].includes('sendMessages');
          if (denied && !allowed) {
            return res.status(403).json({ error: 'channel_send_denied' });
          }
        }
      }
    }
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
      time: new Date().toISOString(),
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

// --- Patch (rename / restyle / restrict) a text channel ---
// Per-role permission overrides:
//   permissionAllow / permissionDeny shape: { "<role-id>": ["sendMessages", ...] }
//   - allow grants the perm inside this channel even if the role doesn't
//     have it server-wide
//   - deny strips it inside this channel even if the role does have it
//   - both can coexist; deny always wins
const overrideMapSchema = z.record(
  z.string().min(1).max(40),
  z.array(z.string().min(1).max(40)).max(40)
).nullable().optional();

const channelPatchSchema = z.object({
  name:            z.string().trim().min(1).max(80).optional(),
  style:           z.string().max(40).optional(),
  customStyle:     z.string().max(40).nullable().optional(),
  // null clears the restriction (visible to everyone). An empty array
  // means "no role can see it", which the client never actually sends
  // but we still store as-is.
  visibleRoleIds:  z.array(z.string().min(1).max(40)).max(50).nullable().optional(),
  permissionAllow: overrideMapSchema,
  permissionDeny:  overrideMapSchema,
  // Voice-channel-only. Opus bitrate in kbps; valid range per the RFC
  // is 6..510. We clamp to the picker's actual values.
  bitrate:         z.number().int().min(8).max(510).optional(),
});

function _buildChannelPatch(body) {
  const sets = [], args = [];
  if (body.name  !== undefined) { sets.push('name = ?');  args.push(body.name); }
  if (body.style !== undefined) { sets.push('style = ?'); args.push(body.style); }
  if (body.customStyle !== undefined) {
    sets.push('custom_style = ?');
    args.push(body.customStyle || null);
  }
  if (body.visibleRoleIds !== undefined) {
    sets.push('visible_role_ids = ?');
    args.push(body.visibleRoleIds === null ? null : JSON.stringify(body.visibleRoleIds));
  }
  if (body.permissionAllow !== undefined) {
    sets.push('permission_allow = ?');
    args.push(body.permissionAllow === null ? null : JSON.stringify(body.permissionAllow));
  }
  if (body.permissionDeny !== undefined) {
    sets.push('permission_deny = ?');
    args.push(body.permissionDeny === null ? null : JSON.stringify(body.permissionDeny));
  }
  if (body.bitrate !== undefined) {
    sets.push('bitrate = ?');
    args.push(Number(body.bitrate));
  }
  return { sets, args };
}

channelsRouter.patch('/text/:sid/:cid', async (req, res, next) => {
  try {
    const sid = req.params.sid;
    if (!await requirePermission(req, res, sid, "manageTextCh")) return;
    const body = parseOr400(channelPatchSchema, req.body, res); if (!body) return;
    const { sets, args } = _buildChannelPatch(body);
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
    const { sets, args } = _buildChannelPatch(body);
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
  const members = await q(`SELECT sm.user_id, sm.is_admin, u.name, u.av_image, u.base_color FROM server_members sm JOIN users u ON u.id = sm.user_id WHERE sm.server_id = ?`, [sid]);
  const cats = await q('SELECT * FROM server_categories WHERE server_id = ? ORDER BY position', [sid]);
  const tcs  = await q('SELECT * FROM text_channels    WHERE server_id = ? ORDER BY position', [sid]);
  const vcs  = await q('SELECT * FROM voice_channels   WHERE server_id = ? ORDER BY position', [sid]);
  return {
    id: s.id, name: s.name, initial: s.initial || (s.name||'?').charAt(0).toUpperCase(),
    desc: s.description || '', baseColor: s.base_color || null,
    grad: s.grad || null, glow: s.glow || null, cover: s.cover || null,
    emblemImage: s.emblem_image || null, inviteKey: s.invite_key || null,
    isPrivate: !!s.is_private,
    styleName: s.style_name || null,
    stylePin:  s.style_pin  || null, styleCover: s.style_cover || null, styleEmblem: s.style_emblem || null,
    members: members.map(x => x.name),
    memberDetails: members.map(x => ({ id: String(x.user_id), name: x.name, isAdmin: !!x.is_admin, avImage: x.av_image || null, baseColor: x.base_color || null })),
    admins:  members.filter(x => x.is_admin).map(x => x.name),
    pinned: s.pinned_text ? { text: s.pinned_text, by: null, time: null } : null,
    categories: cats.map(c => ({
      id: c.id, name: c.name,
      pinned: c.pinned_text ? { text: c.pinned_text, by: null, time: null } : null,
      visibleRoleIds: __parseRoleIds(c.visible_role_ids),
      customStyle: c.custom_style || null,
      textChannels:  tcs.filter(t => t.category_id === c.id).map(t => t.id),
      voiceChannels: vcs.filter(v => v.category_id === c.id).map(v => v.id)
    })),
    textChannels: tcs.map(t => ({
      id: t.id, name: t.name, style: t.style || 'glow', unread: 0,
      customStyle: t.custom_style || null,
      pinnedMsgId: t.pinned_msg_id || null,
      visibleRoleIds:  __parseRoleIds(t.visible_role_ids),
      permissionAllow: __parseRoleIds(t.permission_allow),
      permissionDeny:  __parseRoleIds(t.permission_deny)
    })),
    voiceChannels: vcs.map(v => ({
      id: v.id, name: v.name, style: v.style || 'indigo',
      customStyle: v.custom_style || null,
      visibleRoleIds:  __parseRoleIds(v.visible_role_ids),
      permissionAllow: __parseRoleIds(v.permission_allow),
      permissionDeny:  __parseRoleIds(v.permission_deny),
      bitrate: v.bitrate == null ? 64 : Number(v.bitrate)
    }))
  };
}

function __parseRoleIds(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return null;
}
