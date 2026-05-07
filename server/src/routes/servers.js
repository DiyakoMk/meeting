import { Router } from 'express';
import { z } from 'zod';
import { pool, q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { uid, inviteKey } from '../lib/ids.js';
import { requireMember, requireAdmin, isAdmin as isAdminOf } from '../lib/access.js';
import { parseOr400 } from '../validators.js';
import { emitServerMemberJoined, emitServerMemberLeft, emitServerPinChanged, emitServerCategoryAdded, emitServerCategoryDeleted, emitServerUpdated, emitToUser } from '../realtime/events.js';

export const serversRouter = Router();
serversRouter.use(requireAuth);

const createServerSchema = z.object({
  name:        z.string().trim().min(1).max(80),
  desc:        z.string().max(500).optional().default(''),
  baseColor:   z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  grad:        z.string().max(255).optional().nullable(),
  glow:        z.string().max(64).optional().nullable(),
  cover:       z.string().max(500).optional().nullable(),
  emblemImage: z.string().max(500).optional().nullable(),
  isPrivate:   z.boolean().optional().default(false)
});

const patchServerSchema = createServerSchema.partial().extend({ pinnedText: z.string().max(2000).nullable().optional() });

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80)
});

// Serialise the way /me/snapshot does, so the frontend can drop the result
// straight into `servers[id]`.
async function buildServerPayload(sid) {
  const s = await one('SELECT * FROM servers WHERE id = ?', [sid]);
  if (!s) return null;
  const members = await q(
    `SELECT sm.user_id, sm.is_admin, u.name FROM server_members sm
       JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ?`, [sid]);
  const cats = await q('SELECT * FROM server_categories WHERE server_id = ? ORDER BY position', [sid]);
  const tcs  = await q('SELECT * FROM text_channels    WHERE server_id = ? ORDER BY position', [sid]);
  const vcs  = await q('SELECT * FROM voice_channels   WHERE server_id = ? ORDER BY position', [sid]);
  return {
    id: s.id,
    name: s.name,
    initial: s.initial || (s.name||'?').charAt(0).toUpperCase(),
    desc: s.description || '',
    baseColor: s.base_color || null,
    grad: s.grad || null,
    glow: s.glow || null,
    cover: s.cover || null,
    emblemImage: s.emblem_image || null,
    inviteKey: s.invite_key || null,
    isPrivate: !!s.is_private,
    members: members.map(x => x.name),
    memberDetails: members.map(x => ({ id: String(x.user_id), name: x.name, isAdmin: !!x.is_admin })),
    admins:  members.filter(x => x.is_admin).map(x => x.name),
    pinned: s.pinned_text ? { text: s.pinned_text, by: null, time: null } : null,
    categories: cats.map(c => ({
      id: c.id, name: c.name,
      textChannels:  tcs.filter(t => t.category_id === c.id).map(t => t.id),
      voiceChannels: vcs.filter(v => v.category_id === c.id).map(v => v.id)
    })),
    textChannels: tcs.map(t => ({ id: t.id, name: t.name, style: t.style || 'glow', unread: 0 })),
    voiceChannels: vcs.map(v => ({ id: v.id, name: v.name, style: v.style || 'indigo' }))
  };
}

// Create a new server. The caller becomes its first member + admin.
serversRouter.post('/', async (req, res, next) => {
  try {
    const body = parseOr400(createServerSchema, req.body, res); if (!body) return;
    const sid = uid();
    const initial = body.name.charAt(0).toUpperCase();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO servers
           (id, name, initial, description, base_color, grad, glow, cover, emblem_image, invite_key, is_private)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sid, body.name, initial, body.desc || '', body.baseColor || null,
         body.grad || null, body.glow || null, body.cover || null,
         body.emblemImage || null, inviteKey(), body.isPrivate ? 1 : 0]
      );
      await conn.execute(
        'INSERT INTO server_members (server_id, user_id, is_admin) VALUES (?, ?, 1)',
        [sid, req.user.id]
      );
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
    const payload = await buildServerPayload(sid);
    res.status(201).json({ server: payload });
  } catch (e) { next(e); }
});

// Look up a single server (member-only).
serversRouter.get('/:id', async (req, res, next) => {
  try {
    const m = await requireMember(req, res, req.params.id); if (!m) return;
    const payload = await buildServerPayload(req.params.id);
    if (!payload) return res.status(404).json({ error: 'not_found' });
    res.json({ server: payload });
  } catch (e) { next(e); }
});

// Resolve an invite key OR raw id without requiring membership — used by the
// "Join via ID" preview modal.
serversRouter.get('/lookup/:key', async (req, res, next) => {
  try {
    const k = (req.params.key || '').trim();
    if (!k) return res.status(400).json({ error: 'missing_key' });
    const row = await one(
      'SELECT * FROM servers WHERE invite_key = ? OR id = ? LIMIT 1',
      [k, k]
    );
    if (!row) return res.status(404).json({ error: 'not_found' });
    const memberCount = (await one('SELECT COUNT(*) AS n FROM server_members WHERE server_id = ?', [row.id])).n;
    res.json({
      server: {
        id: row.id, name: row.name, desc: row.description || '',
        emblem: row.emblem_image || null, cover: row.cover || null,
        grad: row.grad || null, glow: row.glow || null,
        initial: row.initial || (row.name||'?').charAt(0).toUpperCase(),
        invite: row.invite_key || null,
        members: memberCount,
        isPrivate: !!row.is_private
      }
    });
  } catch (e) { next(e); }
});

// Update server identity (admin only).
serversRouter.patch('/:id', async (req, res, next) => {
  try {
    const sid = req.params.id;
    if (!await requireAdmin(req, res, sid)) return;
    const body = parseOr400(patchServerSchema, req.body, res); if (!body) return;
    const map = {
      name: 'name', desc: 'description', baseColor: 'base_color',
      grad: 'grad', glow: 'glow', cover: 'cover',
      emblemImage: 'emblem_image', isPrivate: 'is_private', pinnedText: 'pinned_text'
    };
    const sets = []; const args = [];
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        sets.push('`' + col + '` = ?');
        args.push(k === 'isPrivate' ? (body[k] ? 1 : 0) : body[k]);
      }
    }
    if (body.name) {
      sets.push('initial = ?');
      args.push(body.name.charAt(0).toUpperCase());
    }
    if (sets.length) {
      args.push(sid);
      await q('UPDATE servers SET ' + sets.join(', ') + ' WHERE id = ?', args);
    }
    const __payload = await buildServerPayload(sid);
    res.json({ server: __payload });
    if (body.pinnedText !== undefined) emitServerPinChanged(sid, body.pinnedText || null);
    if (['name','desc','baseColor','grad','glow','cover','emblemImage','isPrivate'].some(k => body[k] !== undefined)) emitServerUpdated(sid, __payload);
  } catch (e) { next(e); }
});

// Delete a server entirely (admin only).
serversRouter.delete('/:id', async (req, res, next) => {
  try {
    const sid = req.params.id;
    if (!await requireAdmin(req, res, sid)) return;
    await q('DELETE FROM servers WHERE id = ?', [sid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Leave a server. Last admin can't leave without transferring first.
serversRouter.post('/:id/leave', async (req, res, next) => {
  try {
    const sid = req.params.id;
    const m = await requireMember(req, res, sid); if (!m) return;
    if (m.is_admin) {
      const otherAdmins = await one(
        'SELECT COUNT(*) AS n FROM server_members WHERE server_id = ? AND user_id != ? AND is_admin = 1',
        [sid, req.user.id]
      );
      if (otherAdmins.n === 0) {
        return res.status(409).json({ error: 'last_admin_must_transfer' });
      }
    }
    await q('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [sid, req.user.id]);
    res.json({ ok: true });
    emitServerMemberLeft(sid, req.user.name);
  } catch (e) { next(e); }
});

serversRouter.post('/:keyOrId/join', async (req, res, next) => {
  try {
    const k = (req.params.keyOrId || '').trim();
    const row = await one(
      'SELECT * FROM servers WHERE invite_key = ? OR id = ? LIMIT 1', [k, k]);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const already = await one(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [row.id, req.user.id]);
    if (already) {
      const payload = await buildServerPayload(row.id);
      return res.json({ server: payload, alreadyMember: true });
    }
    if (row.is_private) return res.status(403).json({ error: 'private_server' });
    await q('INSERT INTO server_members (server_id, user_id, is_admin) VALUES (?, ?, 0)',
      [row.id, req.user.id]);
    const payload = await buildServerPayload(row.id);
    res.status(201).json({ server: payload });
    emitServerMemberJoined(row.id, req.user.name);
  } catch (e) { next(e); }
});

// --- Categories ---

serversRouter.post('/:id/categories', async (req, res, next) => {
  try {
    const sid = req.params.id;
    if (!await requireAdmin(req, res, sid)) return;
    const body = parseOr400(categorySchema, req.body, res); if (!body) return;
    const cid = uid();
    await q(
      'INSERT INTO server_categories (id, server_id, name, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM (SELECT * FROM server_categories) AS x WHERE x.server_id = ?))',
      [cid, sid, body.name, sid]
    );
    const category = { id: cid, name: body.name, textChannels: [], voiceChannels: [] };
    res.status(201).json({ category });
    emitServerCategoryAdded(sid, category);
  } catch (e) { next(e); }
});

serversRouter.delete('/:id/categories/:cid', async (req, res, next) => {
  try {
    const sid = req.params.id;
    if (!await requireAdmin(req, res, sid)) return;
    await q('DELETE FROM server_categories WHERE id = ? AND server_id = ?', [req.params.cid, sid]);
    res.json({ ok: true });
    emitServerCategoryDeleted(sid, req.params.cid);
  } catch (e) { next(e); }
});

// Transfer ownership. Caller must be an admin (the current owner is the
// admin we'll downgrade).
const transferSchema = z.object({ targetUserId: z.string().min(1) });
serversRouter.post('/:id/transfer-ownership', async (req, res, next) => {
  try {
    const sid = req.params.id;
    if (!await requireAdmin(req, res, sid)) return;
    const body = parseOr400(transferSchema, req.body, res); if (!body) return;
    const target = await one(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [sid, body.targetUserId]);
    if (!target) return res.status(404).json({ error: 'target_not_member' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Promote target.
      await conn.execute(
        'UPDATE server_members SET is_admin = 1 WHERE server_id = ? AND user_id = ?',
        [sid, body.targetUserId]);
      // Demote caller.
      await conn.execute(
        'UPDATE server_members SET is_admin = 0 WHERE server_id = ? AND user_id = ?',
        [sid, req.user.id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
    res.json({ server: await buildServerPayload(sid) });
  } catch (e) { next(e); }
});

// --- Patch / rename a category ---
const categoryPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  pinnedText: z.string().max(2000).nullable().optional()
});

serversRouter.patch('/:id/categories/:cid', async (req, res, next) => {
  try {
    const sid = req.params.id;
    if (!await requireAdmin(req, res, sid)) return;
    const body = parseOr400(categoryPatchSchema, req.body, res); if (!body) return;
    const sets = [], args = [];
    if (body.name !== undefined) { sets.push('name = ?'); args.push(body.name); }
    if (body.pinnedText !== undefined) {
      sets.push('pinned_text = ?'); args.push(body.pinnedText || null);
      sets.push('pinned_by = ?');   args.push(body.pinnedText ? req.user.id : null);
    }
    if (sets.length) {
      args.push(req.params.cid, sid);
      await q('UPDATE server_categories SET ' + sets.join(', ') + ' WHERE id = ? AND server_id = ?', args);
    }
    res.json({ ok: true });
    emitServerUpdated(sid, await buildServerPayload(sid));
  } catch (e) { next(e); }
});

// --- Reorder categories within a server ---
const reorderSchema = z.object({ order: z.array(z.string().min(1).max(40)).max(200) });

serversRouter.patch('/:id/categories/order', async (req, res, next) => {
  try {
    const sid = req.params.id;
    if (!await requireAdmin(req, res, sid)) return;
    const body = parseOr400(reorderSchema, req.body, res); if (!body) return;
    for (let i = 0; i < body.order.length; i++) {
      await q('UPDATE server_categories SET position = ? WHERE id = ? AND server_id = ?', [i+1, body.order[i], sid]);
    }
    res.json({ ok: true });
    emitServerUpdated(sid, await buildServerPayload(sid));
  } catch (e) { next(e); }
});

// --- Kick a member from a server (admin only) ---
const kickSchema = z.object({ userId: z.union([z.string(), z.number()]) });

serversRouter.post('/:id/kick', async (req, res, next) => {
  try {
    const sid = req.params.id;
    if (!await requireAdmin(req, res, sid)) return;
    const body = parseOr400(kickSchema, req.body, res); if (!body) return;
    const targetId = String(body.userId);
    if (String(req.user.id) === targetId) return res.status(400).json({ error: 'cannot_kick_self' });
    const tm = await one('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [sid, targetId]);
    if (!tm) return res.status(404).json({ error: 'not_member' });
    if (tm.is_admin) return res.status(403).json({ error: 'cannot_kick_admin' });
    await q('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [sid, targetId]);
    const u = await one('SELECT name FROM users WHERE id = ?', [targetId]);
    res.json({ ok: true });
    emitServerMemberLeft(sid, u ? u.name : '');
    emitToUser(targetId, { type: 'server:kicked', serverId: sid });
    emitServerUpdated(sid, await buildServerPayload(sid));
  } catch (e) { next(e); }
});
