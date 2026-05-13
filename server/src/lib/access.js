import { one, q } from '../db.js';

// Returns the server_members row for {sid, uid}, or null if the user is not
// a member of that server.
export async function membership(sid, uid) {
  return one('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [sid, uid]);
}

export async function isAdmin(sid, uid) {
  const m = await membership(sid, uid);
  return !!(m && m.is_admin);
}

// Convenience: throws-style helper for routes. When the user isn't a member
// (or admin) we 403 and stop the route.
export async function requireMember(req, res, sid) {
  const m = await membership(sid, req.user.id);
  if (!m) { res.status(403).json({ error: 'not_a_member' }); return null; }
  return m;
}

export async function requireAdmin(req, res, sid) {
  const m = await requireMember(req, res, sid);
  if (!m) return null;
  if (!m.is_admin) { res.status(403).json({ error: 'admin_required' }); return null; }
  return m;
}

// Checks whether two users are friends (in either direction — friendships
// are stored as a single directed row per pair, but we treat them as
// symmetric for simplicity).
export async function areFriends(uidA, uidB) {
  const r = await one(
    'SELECT 1 FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1',
    [uidA, uidB, uidB, uidA]
  );
  return !!r;
}

export async function isBlocked(uidA, uidB) {
  // True if A blocks B OR B blocks A.
  const r = await one(
    'SELECT 1 FROM blocked_users WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?) LIMIT 1',
    [uidA, uidB, uidB, uidA]
  );
  return !!r;
}

// True if the user has the given permission on a server, either by being
// admin (admins bypass every gate) or by holding a server_role whose
// permissions JSON has the key set to true.
export async function hasPermission(sid, uid, permKey) {
  const m = await membership(sid, uid);
  if (!m) return false;
  if (m.is_admin) return true;
  const rows = await q(
    `SELECT sr.permissions
       FROM server_roles sr
       JOIN server_role_members srm
         ON srm.server_id = sr.server_id AND srm.role_id = sr.id
      WHERE sr.server_id = ? AND srm.user_id = ?`,
    [sid, uid]
  );
  for (const row of rows) {
    let perms = row.permissions;
    if (typeof perms === 'string') {
      try { perms = JSON.parse(perms); } catch { perms = {}; }
    }
    if (perms && perms[permKey]) return true;
  }
  return false;
}

// Drop-in replacement for requireAdmin when the gate is a fine-grained role
// permission (e.g. manageVoiceCh, managePins). Falls back to admin if the
// permission key is missing entirely.
export async function requirePermission(req, res, sid, permKey) {
  const m = await requireMember(req, res, sid);
  if (!m) return null;
  if (m.is_admin) return m;
  const ok = await hasPermission(sid, req.user.id, permKey);
  if (!ok) { res.status(403).json({ error: 'permission_required', perm: permKey }); return null; }
  return m;
}
