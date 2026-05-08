import { verifyToken } from './jwt.js';
import { one } from '../db.js';

// Attaches `req.user` ({ id, email, name, handle, ... }) when a valid bearer
// token is present. Routes that *require* auth call requireAuth, others can
// inspect req.user themselves and gate their own logic.
export async function attachUser(req, _res, next) {
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  // navigator.sendBeacon can't set headers, so we also accept ?token= as a
  // fallback — used by the beforeunload voice-leave call. Bearer header is
  // still preferred for every other request.
  const tokenStr = m ? m[1] : (req.query && req.query.token ? String(req.query.token) : null);
  if (!tokenStr) return next();
  const claims = verifyToken(tokenStr);
  if (!claims || !claims.uid) return next();
  const user = await one(
    'SELECT id, email, name, handle, av_image, banner_image, base_color, bio, rank_label, friends_only FROM users WHERE id = ?',
    [claims.uid]
  );
  if (user) req.user = user;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}
