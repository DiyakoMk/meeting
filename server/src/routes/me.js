import { Router } from 'express';
import { q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { hashPassword } from '../auth/hash.js';
import { parseOr400, profilePatchSchema } from '../validators.js';
import { publicUser, foreignUser } from '../lib/userShape.js';
import { emitProfileUpdated } from '../realtime/events.js';

// Normalise visible_role_ids to "array or null". MySQL JSON column can come
// back as either a parsed value or a string depending on driver version.
function parseRoleIds(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return null;
}

export const meRouter = Router();

meRouter.use(requireAuth);

// Fresh copy of the local user.
meRouter.get('/', async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: publicUser(u) });
});

// Update profile fields. Password change rehashes; handle/email uniqueness
// are checked here to give a clean error message.
meRouter.patch('/', async (req, res, next) => {
  try {
    const patch = parseOr400(profilePatchSchema, req.body, res); if (!patch) return;
    if (patch.handle) {
      const taken = await one('SELECT id FROM users WHERE handle = ? AND id != ? LIMIT 1', [patch.handle, req.user.id]);
      if (taken) return res.status(409).json({ error: 'handle_taken' });
    }
    if (patch.email) {
      const taken = await one('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [patch.email, req.user.id]);
      if (taken) return res.status(409).json({ error: 'email_taken' });
    }
    const sets = [];
    const args = [];
    const map = {
      name: 'name', handle: 'handle', email: 'email', phone: 'phone',
      bio: 'bio', baseColor: 'base_color', rank: 'rank_label',
      avImage: 'av_image', bannerImage: 'banner_image',
      friendsOnly: 'friends_only'
    };
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] !== undefined) {
        sets.push('`' + col + '` = ?');
        args.push(k === 'friendsOnly' ? (patch[k] ? 1 : 0) : patch[k]);
      }
    }
    if (patch.password) {
      sets.push('password_hash = ?');
      args.push(await hashPassword(patch.password));
    }
    if (sets.length) {
      args.push(req.user.id);
      await q('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?', args);
    }
    const fresh = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: publicUser(fresh) });
    // Push the visible-to-others fields to every peer that has us in
    // their UI (friends + server co-members) so avatar / banner / handle
    // / bio updates appear without a reload.
    if (Object.keys(patch).some(k => ['name','handle','bio','baseColor','rank','avImage','bannerImage'].includes(k))){
      emitProfileUpdated(req.user.id, {
        name:        fresh.name,
        handle:      fresh.handle ? '@' + fresh.handle : null,
        bio:         fresh.bio || '',
        baseColor:   fresh.base_color || null,
        rank:        fresh.rank_label || 'EXPLORER',
        avImage:     fresh.av_image || null,
        bannerImage: fresh.banner_image || null
      }).catch(()=>{});
    }
  } catch (e) { next(e); }
});

// Heaviest endpoint: returns everything the frontend needs to hydrate state.
// Mirrors the shape documented in orblood.README.md → hydrateFromBackend().
meRouter.get('/snapshot', async (req, res, next) => {
  try {
    const me = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);

    // Pull online uids from the realtime layer to seed presence
    // straight away. Avoids a flicker where every friend renders as offline
    // until the first 'presence' event lands.
    const { getOnlineUids, getAllVoiceMembers } = await import('../realtime/ws.js');

    // Friends + blocks + requests
    const friendRows = await q(
      `SELECT u.* FROM friendships f
         JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ?
        ORDER BY u.name`, [me.id]);
    const blockedRows = await q(
      `SELECT u.* FROM blocked_users b
         JOIN users u ON u.id = b.blocked_id
        WHERE b.user_id = ?`, [me.id]);
    // Reverse direction: who has *us* blocked. We surface this so the
    // client can show "this user has blocked you" + disable composing.
    const blockedByRows = await q(
      `SELECT u.handle FROM blocked_users b
         JOIN users u ON u.id = b.user_id
        WHERE b.blocked_id = ?`, [me.id]);
    const incoming = await q(
      `SELECT fr.id, fr.created_at, u.id AS uid, u.name, u.handle, u.av_image, u.base_color
         FROM friend_requests fr
         JOIN users u ON u.id = fr.from_id
        WHERE fr.to_id = ? AND fr.status = 'pending'`, [me.id]);
    const outgoing = await q(
      `SELECT fr.id, fr.created_at, u.id AS uid, u.name, u.handle, u.av_image, u.base_color
         FROM friend_requests fr
         JOIN users u ON u.id = fr.to_id
        WHERE fr.from_id = ? AND fr.status = 'pending'`, [me.id]);

    // Build conversations + messages keyed by friend handle. Saved Messages
    // gets the literal "saved" key.
    const conversations = {
      saved: {
        name: 'Saved Messages', online: true, unread: 0,
        avColor: 'linear-gradient(135deg,#b91c4a,#7f1d1d)',
        initial: '★', handle: '@saved',
        bio: 'Personal notes, bookmarks and forwarded messages — only you can see this.',
        rank: 'NOTES', isSaved: true
      }
    };
    const onlineUids = new Set(getOnlineUids ? getOnlineUids() : []);
    friendRows.forEach(row => {
      const k = row.handle.toLowerCase();
      conversations[k] = {
        // Stable peer id so the frontend can correlate WS events
        // (dm:cleared / friend:removed) without re-resolving by handle.
        uid: String(row.id),
        peerId: String(row.id),
        name: row.name,
        online: onlineUids.has(String(row.id)),
        unread: 0,
        avColor: row.base_color
          ? `linear-gradient(135deg,${row.base_color},#1e1b4b)`
          : 'linear-gradient(135deg,#a78bfa,#1e1b4b)',
        avImage: row.av_image || null,
        bannerImage: row.banner_image || null,
        initial: (row.name || '?').charAt(0).toUpperCase(),
        handle: '@' + row.handle.replace(/^@/, ''),
        bio: row.bio || '',
        rank: row.rank_label || 'EXPLORER',
        baseColor: row.base_color || null,
        friendsOnly: !!row.friends_only
      };
    });

    // Servers Cooper-equivalent: any server I'm a member of, plus everything
    // they contain. Mirrors the in-memory shape used by `servers[*]`.
    const memberRows = await q(
      `SELECT s.* FROM server_members sm
         JOIN servers s ON s.id = sm.server_id
        WHERE sm.user_id = ?`, [me.id]);
    // The user's home rail / orb sidebar only shows servers they have
    // *explicitly pinned* via the world UI. Membership without a pin is
    // still discoverable via /api/servers + the World page, but the
    // home rail respects "I unpinned this — keep it off my home". The
    // previous version eagerly auto-filled every membership into
    // myServers, which made unpins look like they reverted on reload.
    //
    // myServers is sourced strictly from user_pinned_servers. New users
    // / new memberships start empty here — the World page is where the
    // user picks which servers to surface on home. The "Pin to home"
    // button on a server's overview is what writes a row to this table.
    const pinnedOrderRows = await q(
      `SELECT server_id FROM user_pinned_servers WHERE user_id = ? ORDER BY position`, [me.id]);
    const pinnedOrder = pinnedOrderRows.map(r => r.server_id);
    const memberSet = new Set(memberRows.map(s => s.id));
    const myServers = pinnedOrder.filter(id => memberSet.has(id));
    const servers = {};
    if (memberRows.length) {
      const sids = memberRows.map(s => s.id);
      const placeholders = sids.map(() => '?').join(',');
      const allMembers   = await q(`SELECT sm.server_id, sm.user_id, sm.is_admin, u.name, u.av_image, u.base_color FROM server_members sm JOIN users u ON u.id = sm.user_id WHERE sm.server_id IN (${placeholders})`, sids);
      const cats         = await q(`SELECT * FROM server_categories WHERE server_id IN (${placeholders}) ORDER BY position`, sids);
      const tcs          = await q(`SELECT * FROM text_channels    WHERE server_id IN (${placeholders}) ORDER BY position`, sids);
      const vcs          = await q(`SELECT * FROM voice_channels   WHERE server_id IN (${placeholders}) ORDER BY position`, sids);
      const roleRows     = await q(`SELECT * FROM server_roles WHERE server_id IN (${placeholders}) ORDER BY position, id`, sids);
      // Pull role members keyed by (server_id, role_id) so we don't pick up
      // an 'owner' row from a different server when two servers share the
      // role id. This is the multi-server analogue of the join in
      // routes/servers.js below.
      const roleMembers  = roleRows.length
        ? await q(
            `SELECT rm.server_id, rm.role_id, u.name FROM server_role_members rm
               JOIN users u ON u.id = rm.user_id
              WHERE rm.server_id IN (${placeholders})`,
            sids)
        : [];
      memberRows.forEach(row => {
        const sid = row.id;
        const sm  = allMembers.filter(x => x.server_id === sid);
        servers[sid] = {
          id: sid,
          name: row.name,
          initial: row.initial || (row.name||'?').charAt(0).toUpperCase(),
          desc: row.description || '',
          baseColor: row.base_color || null,
          grad: row.grad || null,
          glow: row.glow || null,
          cover: row.cover || null,
          emblemImage: row.emblem_image || null,
          inviteKey: row.invite_key || null,
          isPrivate: !!row.is_private,
          // Pack-driven custom styles. styleName/stylePin live on the
          // server row itself; per-category and per-channel styles live
          // on those rows. NULL means the stock look.
          styleName: row.style_name || null,
          stylePin:  row.style_pin  || null, styleCover: row.style_cover || null, styleEmblem: row.style_emblem || null,
          members: sm.map(x => x.name),
          memberDetails: sm.map(x => ({ id: String(x.user_id), name: x.name, isAdmin: !!x.is_admin, avImage: x.av_image || null, baseColor: x.base_color || null })),
          admins: sm.filter(x => x.is_admin).map(x => x.name),
          pinned: row.pinned_text ? { text: row.pinned_text, by: null, time: null } : null,
          categories: cats.filter(c => c.server_id === sid).map(c => ({
            id: c.id, name: c.name,
            pinned: c.pinned_text ? { text: c.pinned_text, by: null, time: null } : null,
            visibleRoleIds: parseRoleIds(c.visible_role_ids),
            customStyle: c.custom_style || null,
            textChannels:  tcs.filter(t => t.server_id === sid && t.category_id === c.id).map(t => t.id),
            voiceChannels: vcs.filter(v => v.server_id === sid && v.category_id === c.id).map(v => v.id)
          })),
          textChannels: tcs.filter(t => t.server_id === sid).map(t => ({
            id: t.id, name: t.name, style: t.style || 'glow', unread: 0,
            customStyle: t.custom_style || null,
            pinnedMsgId: t.pinned_msg_id || null,
            visibleRoleIds:  parseRoleIds(t.visible_role_ids),
            permissionAllow: parseRoleIds(t.permission_allow),
            permissionDeny:  parseRoleIds(t.permission_deny)
          })),
          voiceChannels: vcs.filter(v => v.server_id === sid).map(v => ({
            id: v.id, name: v.name, style: v.style || 'indigo',
            customStyle: v.custom_style || null,
            visibleRoleIds:  parseRoleIds(v.visible_role_ids),
            permissionAllow: parseRoleIds(v.permission_allow),
            permissionDeny:  parseRoleIds(v.permission_deny),
            bitrate: v.bitrate == null ? 64 : Number(v.bitrate)
          })),
          roles: (function(){
            const here = roleRows.filter(r => r.server_id === sid);
            if (!here.length) return null;
            return here.map(r => ({
              id: r.id,
              name: r.name,
              color: r.color || null,
              system: !!r.is_system,
              position: r.position || 0,
              perms: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || {}),
              // Match BOTH server_id and role_id; without the server_id
              // qualifier we'd accidentally union members of identically
              // named roles in other servers (e.g. 'admin' in server A
              // would inherit members of 'admin' in server B).
              members: roleMembers.filter(m => m.server_id === sid && m.role_id === r.id).map(m => m.name)
            }));
          })()
        };
      });
    }

    // Last message preview for every DM thread the user is part of.
    // Lets the home / quick-access lists show "X said Y" right after a
    // refresh without each row hitting GET /api/dms separately. Honours
    // dm_thread_hidden so cleared threads stay quiet until a *newer*
    // message arrives.
    const previewRows = await q(
      `SELECT t.id AS tid, t.user_a, t.user_b, t.is_saved,
              m.id AS mid, m.body, m.deleted, m.payload_json, m.created_at, m.sender_id,
              COALESCE(h.last_hidden_id, 0) AS hidden_cutoff
         FROM dm_threads t
         LEFT JOIN dm_thread_hidden h ON h.thread_id = t.id AND h.user_id = ?
         LEFT JOIN dm_messages m ON m.id = (
           SELECT id FROM dm_messages
            WHERE thread_id = t.id AND id > COALESCE(h.last_hidden_id, 0)
            ORDER BY created_at DESC, id DESC LIMIT 1
         )
        WHERE t.user_a = ? OR t.user_b = ?`, [me.id, me.id, me.id]);
    const peerIds = new Set();
    previewRows.forEach(r => {
      if (r.is_saved) return;
      const peer = r.user_a === me.id ? r.user_b : r.user_a;
      peerIds.add(peer);
    });
    // Per-thread pinned message id (one row max per thread).
    const dmPinRows = await q(
      `SELECT dp.thread_id, dp.message_id
         FROM dm_pinned dp
         JOIN dm_threads t ON t.id = dp.thread_id
        WHERE t.user_a = ? OR t.user_b = ?`, [me.id, me.id]);
    const pinByThread = new Map(dmPinRows.map(r => [r.thread_id, Number(r.message_id)]));
    const peerHandleByUid = new Map();
    if (peerIds.size){
      const rows = await q(
        `SELECT id, handle FROM users WHERE id IN (${[...peerIds].map(()=>'?').join(',')})`,
        [...peerIds]);
      rows.forEach(r => peerHandleByUid.set(r.id, r.handle.toLowerCase()));
    }
    const messagePreviews = {};
    const dmPinned = {};
    previewRows.forEach(r => {
      const pid = pinByThread.get(r.tid);
      if (!pid) return;
      const k = r.is_saved ? 'saved' : peerHandleByUid.get(r.user_a === me.id ? r.user_b : r.user_a);
      if (k) dmPinned[k] = pid;
    });
    previewRows.forEach(r => {
      if (!r.mid) return;
      const k = r.is_saved ? 'saved' : peerHandleByUid.get(r.user_a === me.id ? r.user_b : r.user_a);
      if (!k) return;
      const sender = r.sender_id === me.id ? 'me' : 'them';
      let payload = r.payload_json;
      if (typeof payload === 'string'){ try { payload = JSON.parse(payload); } catch { payload = null; } }
      messagePreviews[k] = {
        id: r.mid,
        sender,
        text: r.body || '',
        time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        day:  new Date(r.created_at).toLocaleDateString().toUpperCase(),
        deleted: !!r.deleted,
        payload,
        type: payload && payload.type ? payload.type : undefined
      };
    });

    // Promote every non-friend DM peer into conversations[] too, so the
    // chat doesn't disappear after a refresh just because the user hasn't
    // friended them yet. We use the same shape as friendRows above but
    // with a fresh user lookup; "friendsOnly" still flows through so the
    // compose box can lock when the peer has the toggle on.
    const peerUidsAll = [...peerIds];
    if (peerUidsAll.length){
      const knownKeys = new Set(Object.keys(conversations));
      const peerUserRows = await q(
        `SELECT * FROM users WHERE id IN (${peerUidsAll.map(()=>'?').join(',')})`,
        peerUidsAll);
      peerUserRows.forEach(row => {
        const k = row.handle.toLowerCase();
        if (knownKeys.has(k)) return; // already populated as a friend
        conversations[k] = {
          uid: String(row.id),
          peerId: String(row.id),
          name: row.name,
          online: onlineUids.has(String(row.id)),
          unread: 0,
          avColor: row.base_color
            ? `linear-gradient(135deg,${row.base_color},#1e1b4b)`
            : 'linear-gradient(135deg,#a78bfa,#1e1b4b)',
          avImage: row.av_image || null,
          bannerImage: row.banner_image || null,
          initial: (row.name || '?').charAt(0).toUpperCase(),
          handle: '@' + row.handle.replace(/^@/, ''),
          bio: row.bio || '',
          rank: row.rank_label || 'EXPLORER',
          baseColor: row.base_color || null,
          friendsOnly: !!row.friends_only,
          isFriend: false
        };
      });
    }

    // Compute persistent unread counts. For every DM thread the user is in,
    // count messages with id > last_read_id (saved by /api/me/dms/read) and
    // sender_id != me. Same idea for text channels — last_read_id per row
    // in text_channel_read_state, count messages with bigger ids.
    const unreadDm = {};
    if (previewRows.length){
      const tids = previewRows.map(r => r.tid);
      const readDm = await q(
        `SELECT thread_id, last_read_id FROM dm_read_state WHERE user_id = ? AND thread_id IN (${tids.map(()=>'?').join(',')})`,
        [me.id, ...tids]);
      const lastReadByThread = new Map(readDm.map(r => [r.thread_id, Number(r.last_read_id)]));
      const hiddenByThread = new Map(previewRows.map(r => [r.tid, Number(r.hidden_cutoff) || 0]));
      for (const tid of tids){
        const lastRead = lastReadByThread.get(tid) || 0;
        const hidden  = hiddenByThread.get(tid) || 0;
        const cutoff = Math.max(lastRead, hidden);
        const row = await one(
          `SELECT COUNT(*) AS n FROM dm_messages
            WHERE thread_id = ? AND sender_id != ? AND id > ?`,
          [tid, me.id, cutoff]);
        if (row && row.n > 0){
          const t = previewRows.find(p => p.tid === tid);
          if (!t) continue;
          const k = t.is_saved ? null : peerHandleByUid.get(t.user_a === me.id ? t.user_b : t.user_a);
          if (k) unreadDm[k] = row.n;
        }
      }
    }
    const unreadChannels = {};
    if (memberRows.length){
      const tcRows = await q(
        `SELECT t.id, t.server_id FROM text_channels t WHERE t.server_id IN (${memberRows.map(()=>'?').join(',')})`,
        memberRows.map(r => r.id));
      const allCids = tcRows.map(r => r.id);
      if (allCids.length){
        const readCh = await q(
          `SELECT channel_id, last_read_id FROM text_channel_read_state WHERE user_id = ? AND channel_id IN (${allCids.map(()=>'?').join(',')})`,
          [me.id, ...allCids]);
        const lastReadByCh = new Map(readCh.map(r => [r.channel_id, Number(r.last_read_id)]));
        for (const cid of allCids){
          const lastRead = lastReadByCh.get(cid) || 0;
          const row = await one(
            `SELECT COUNT(*) AS n FROM text_channel_messages
              WHERE channel_id = ? AND sender_id != ? AND id > ?`,
            [cid, me.id, lastRead]);
          if (row && row.n > 0){
            const t = tcRows.find(x => x.id === cid);
            if (t) unreadChannels[t.server_id + '__' + cid] = row.n;
          }
        }
      }
    }

    // Marks
    const markedOrbs = await q(
      `SELECT channel_id FROM user_marked_orbits WHERE user_id = ? ORDER BY position`, [me.id]);
    const markedTcs  = await q(
      `SELECT mt.channel_id, t.server_id FROM user_marked_text_channels mt
         JOIN text_channels t ON t.id = mt.channel_id
        WHERE mt.user_id = ? ORDER BY mt.position`, [me.id]);
    const markedFr   = await q(
      `SELECT u.handle FROM user_marked_friends mf
         JOIN users u ON u.id = mf.friend_id
        WHERE mf.user_id = ? ORDER BY mf.position`, [me.id]);

    // Live voice channel members per channel id (so guests immediately see
    // who's already in each voice orb).
    const allVoiceIds = [];
    Object.values(servers).forEach(srv => (srv.voiceChannels||[]).forEach(v => allVoiceIds.push(v.id)));
    const voiceMembersByChannel = {};
    if (allVoiceIds.length) {
      const rows = await q(
        `SELECT vm.channel_id, u.name FROM voice_channel_members vm
           JOIN users u ON u.id = vm.user_id
          WHERE vm.channel_id IN (${allVoiceIds.map(()=>'?').join(',')})`,
        allVoiceIds);
      // Group by channel id, store under {users:[names]} so the frontend can
      // merge it into channelData.
      const grouped = {};
      rows.forEach(r => { (grouped[r.channel_id] = grouped[r.channel_id] || []).push(r.name); });
      Object.entries(grouped).forEach(([cid, names]) => { voiceMembersByChannel[cid] = { users: names }; });
    }

    // Notifications
    const notifs = await q(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [me.id]);

    res.json({
      user: publicUser(me),
      servers,
      myServers,
      channelData: voiceMembersByChannel,
      conversations,
      messages: { saved: [] }, // DM threads loaded lazily per-thread
      messagePreviews,         // last message per DM thread for sidebar previews
      dmPinned,                // peerHandle -> message id pinned on that thread
      unreadDm,
      unreadChannels,
      friendsList: friendRows.map(u => u.handle.toLowerCase()),
      markedFriends: markedFr.map(r => r.handle.toLowerCase()),
      markedTextChannels: markedTcs.map(r => r.server_id + '__' + r.channel_id),
      marked: markedOrbs.map(r => r.channel_id),
      blockedUsers: blockedRows.map(u => u.handle.toLowerCase()),
      blockedBy: blockedByRows.map(u => u.handle.toLowerCase()),
      notifications: notifs.map(n => ({
        id: n.id, type: n.kind, title: n.title, desc: n.description,
        time: new Date(n.created_at).toISOString(), unread: !n.read_at
      })),
      friendRequests: {
        incoming: incoming.map(r => ({
          id: r.id, name: r.name,
          handle: r.handle ? '@' + r.handle : '',
          initial: (r.name||'?').charAt(0).toUpperCase(),
          avColor: r.base_color ? `linear-gradient(135deg,${r.base_color},#1e1b4b)` : 'linear-gradient(135deg,#818cf8,#1e1b4b)',
          meta: 'received'
        })),
        outgoing: outgoing.map(r => ({
          id: r.id, name: r.name,
          handle: r.handle ? '@' + r.handle : '',
          initial: (r.name||'?').charAt(0).toUpperCase(),
          avColor: r.base_color ? `linear-gradient(135deg,${r.base_color},#1e1b4b)` : 'linear-gradient(135deg,#818cf8,#1e1b4b)',
          meta: 'sent'
        }))
      }
    });
  } catch (e) { next(e); }
});

// --- Persistence for user-specific layout state -----------------------------
// The client edits these lists frequently (toggle a mark, reorder a pin).
// Each endpoint replaces the whole list for the caller; we keep the API
// simple instead of negotiating per-row diffs.

// Marked voice channels (orbits).
meRouter.put('/marks/orbits', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
    await q('DELETE FROM user_marked_orbits WHERE user_id = ?', [req.user.id]);
    let i = 0;
    for (const cid of ids) {
      if (typeof cid !== 'string' || !cid) continue;
      // Reject anything that doesn't reference an existing voice channel so
      // we don't insert orphan rows when the client gets out of sync.
      const exists = await one('SELECT id FROM voice_channels WHERE id = ?', [cid]);
      if (!exists) continue;
      await q(
        'INSERT IGNORE INTO user_marked_orbits (user_id, channel_id, position) VALUES (?, ?, ?)',
        [req.user.id, cid, ++i]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Marked text channels. Client sends "<serverId>__<channelId>" composite keys.
meRouter.put('/marks/text-channels', async (req, res, next) => {
  try {
    // Accept both `keys` (preferred) and `ids` (legacy) so an older client
    // that hasn't been updated still works.
    const raw = (req.body && (req.body.keys || req.body.ids)) || [];
    const keys = Array.isArray(raw) ? raw : [];
    await q('DELETE FROM user_marked_text_channels WHERE user_id = ?', [req.user.id]);
    let i = 0;
    for (const k of keys) {
      if (typeof k !== 'string') continue;
      const idx = k.indexOf('__');
      if (idx < 0) continue;
      const tcId = k.slice(idx + 2);
      const exists = await one('SELECT id FROM text_channels WHERE id = ?', [tcId]);
      if (!exists) continue;
      await q(
        'INSERT IGNORE INTO user_marked_text_channels (user_id, channel_id, position) VALUES (?, ?, ?)',
        [req.user.id, tcId, ++i]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Marked friends. Client sends an array of @handles (case-insensitive).
meRouter.put('/marks/friends', async (req, res, next) => {
  try {
    const handles = Array.isArray(req.body && req.body.handles) ? req.body.handles : [];
    await q('DELETE FROM user_marked_friends WHERE user_id = ?', [req.user.id]);
    let i = 0;
    for (const raw of handles) {
      if (typeof raw !== 'string') continue;
      const h = raw.replace(/^@/, '').toLowerCase();
      const u = await one('SELECT id FROM users WHERE handle = ?', [h]);
      if (!u) continue;
      await q(
        'INSERT IGNORE INTO user_marked_friends (user_id, friend_id, position) VALUES (?, ?, ?)',
        [req.user.id, u.id, ++i]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Pinned servers (display order on the rail).
meRouter.put('/marks/pinned-servers', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
    await q('DELETE FROM user_pinned_servers WHERE user_id = ?', [req.user.id]);
    let i = 0;
    for (const sid of ids) {
      if (typeof sid !== 'string' || !sid) continue;
      const exists = await one('SELECT user_id FROM server_members WHERE server_id = ? AND user_id = ?', [sid, req.user.id]);
      if (!exists) continue;
      await q(
        'INSERT IGNORE INTO user_pinned_servers (user_id, server_id, position) VALUES (?, ?, ?)',
        [req.user.id, sid, ++i]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
