import { Router } from 'express';
import { q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { hashPassword } from '../auth/hash.js';
import { parseOr400, profilePatchSchema } from '../validators.js';
import { publicUser, foreignUser } from '../lib/userShape.js';

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
  } catch (e) { next(e); }
});

// Heaviest endpoint: returns everything the frontend needs to hydrate state.
// Mirrors the shape documented in orblood.README.md → hydrateFromBackend().
meRouter.get('/snapshot', async (req, res, next) => {
  try {
    const me = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);

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
    friendRows.forEach(row => {
      const k = row.handle.toLowerCase();
      conversations[k] = {
        name: row.name,
        online: true, // realtime presence will refine this in phase 4
        unread: 0,
        avColor: row.base_color
          ? `linear-gradient(135deg,${row.base_color},#1e1b4b)`
          : 'linear-gradient(135deg,#a78bfa,#1e1b4b)',
        avImage: row.av_image || null,
        initial: (row.name || '?').charAt(0).toUpperCase(),
        handle: '@' + row.handle.replace(/^@/, ''),
        bio: row.bio || '',
        rank: row.rank_label || 'EXPLORER',
        baseColor: row.base_color || null
      };
    });

    // Servers Cooper-equivalent: any server I'm a member of, plus everything
    // they contain. Mirrors the in-memory shape used by `servers[*]`.
    const memberRows = await q(
      `SELECT s.* FROM server_members sm
         JOIN servers s ON s.id = sm.server_id
        WHERE sm.user_id = ?`, [me.id]);
    const myServers = memberRows.map(s => s.id);
    const servers = {};
    if (memberRows.length) {
      const sids = memberRows.map(s => s.id);
      const placeholders = sids.map(() => '?').join(',');
      const allMembers   = await q(`SELECT sm.server_id, sm.user_id, sm.is_admin, u.name FROM server_members sm JOIN users u ON u.id = sm.user_id WHERE sm.server_id IN (${placeholders})`, sids);
      const cats         = await q(`SELECT * FROM server_categories WHERE server_id IN (${placeholders}) ORDER BY position`, sids);
      const tcs          = await q(`SELECT * FROM text_channels    WHERE server_id IN (${placeholders}) ORDER BY position`, sids);
      const vcs          = await q(`SELECT * FROM voice_channels   WHERE server_id IN (${placeholders}) ORDER BY position`, sids);
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
          members: sm.map(x => x.name),
          memberDetails: sm.map(x => ({ id: String(x.user_id), name: x.name, isAdmin: !!x.is_admin })),
          admins: sm.filter(x => x.is_admin).map(x => x.name),
          pinned: row.pinned_text ? { text: row.pinned_text, by: null, time: null } : null,
          categories: cats.filter(c => c.server_id === sid).map(c => ({
            id: c.id, name: c.name,
            pinned: c.pinned_text ? { text: c.pinned_text, by: null, time: null } : null,
            textChannels:  tcs.filter(t => t.server_id === sid && t.category_id === c.id).map(t => t.id),
            voiceChannels: vcs.filter(v => v.server_id === sid && v.category_id === c.id).map(v => v.id)
          })),
          textChannels: tcs.filter(t => t.server_id === sid).map(t => ({
            id: t.id, name: t.name, style: t.style || 'glow', unread: 0,
            pinnedMsgId: t.pinned_msg_id || null
          })),
          voiceChannels: vcs.filter(v => v.server_id === sid).map(v => ({
            id: v.id, name: v.name, style: v.style || 'indigo'
          }))
        };
      });
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

    // Notifications
    const notifs = await q(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [me.id]);

    res.json({
      user: publicUser(me),
      servers,
      myServers,
      channelData: {}, // built lazily by the frontend the first time it sees a voice orb
      conversations,
      messages: { saved: [] }, // DM threads loaded lazily per-thread
      friendsList: friendRows.map(u => u.handle.toLowerCase()),
      markedFriends: markedFr.map(r => r.handle.toLowerCase()),
      markedTextChannels: markedTcs.map(r => r.server_id + '__' + r.channel_id),
      marked: markedOrbs.map(r => r.channel_id),
      blockedUsers: blockedRows.map(u => u.handle.toLowerCase()),
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
