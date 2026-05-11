import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth } from '../auth/middleware.js';

export const voiceConfigRouter = Router();

// The frontend calls this to learn which TURN/STUN servers to use when
// negotiating WebRTC. Keeping the credential server-side means we don't ship
// the long-lived ExpressTurn key to the browser bundle.
voiceConfigRouter.get('/voice/config', requireAuth, (_req, res) => {
  const ice = [];
  if (config.voice.urls.length) {
    ice.push({
      urls: config.voice.urls,
      username: config.voice.username,
      credential: config.voice.password
    });
    // Many Iranian carriers DPI-block stun.l.google.com — derive a STUN
    // entry from the TURN URLs so peers can self-discover their public
    // address via our own coturn even when Google is blocked.
    const stunUrls = config.voice.urls
      .map(u => u.replace(/^turns?:/, 'stun:').split('?')[0])
      .filter((u, i, arr) => arr.indexOf(u) === i);
    if (stunUrls.length) ice.push({ urls: stunUrls });
  }
  // Public STUN fallback as a last resort. Most ISPs in Iran can reach
  // stun.l.google.com; for the few that can't, the entries above cover us.
  ice.push({ urls: ['stun:stun.l.google.com:19302'] });
  res.json({ iceServers: ice });
});
