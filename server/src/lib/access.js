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
