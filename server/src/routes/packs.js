// Customization packs — list catalog + unlock for the signed-in user.
//
// A pack is a CSS bundle (lives in /public/styles/packs/<id>.css) that
// styles a set of surfaces (server name, server pin, category card,
// text channel row, voice channel orb, orbit orb). The catalog is
// hard-coded server-side so client UI can render the shop without an
// extra DB lookup; ownership is per-user in users.unlocked_packs (JSON
// array of pack ids).
import { Router } from 'express';
import { q, one } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

export const packsRouter = Router();
packsRouter.use(requireAuth);

// Pack catalog. Add new packs here; client picks them up automatically.
// Each pack lists which surfaces it can style + the css class prefix.
const CATALOG = [
  {
    id: 'aurora',
    name: 'Aurora',
    desc: 'Pink + amber + white flow on names, pins, covers, halos, channels and orbs.',
    price: 0,           // free pack to seed the system
    surfaces: ['serverName','serverPin','serverCover','serverEmblem','category','textChannel','voiceChannel','orbit'],
    cssClass: 'cz-aurora'
  }
];

function readUnlocked(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return [];
}

// Catalog + which packs the caller owns + which is the free starter.
packsRouter.get('/', async (req, res, next) => {
  try {
    const me = await one('SELECT unlocked_packs FROM users WHERE id = ?', [req.user.id]);
    const owned = new Set(readUnlocked(me && me.unlocked_packs));
    res.json({
      packs: CATALOG.map(p => ({ ...p, owned: owned.has(p.id) }))
    });
  } catch (e) { next(e); }
});

// Unlock (i.e. add to user's library). Free packs are auto-granted; paid
// packs would gate on a payment flow here. We accept the unlock as long
// as the pack id is in the catalog.
packsRouter.post('/:id/unlock', async (req, res, next) => {
  try {
    const pack = CATALOG.find(p => p.id === req.params.id);
    if (!pack) return res.status(404).json({ error: 'pack_not_found' });
    if (pack.price > 0) {
      // Hook for future payment integration.
      return res.status(402).json({ error: 'payment_required' });
    }
    const me = await one('SELECT unlocked_packs FROM users WHERE id = ?', [req.user.id]);
    const owned = new Set(readUnlocked(me && me.unlocked_packs));
    if (!owned.has(pack.id)) {
      owned.add(pack.id);
      await q('UPDATE users SET unlocked_packs = ? WHERE id = ?',
        [JSON.stringify([...owned]), req.user.id]);
    }
    res.json({ ok: true, owned: [...owned] });
  } catch (e) { next(e); }
});
