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
  }
  // A public STUN fallback so direct peer-to-peer still has a chance.
  ice.push({ urls: ['stun:stun.l.google.com:19302'] });
  res.json({ iceServers: ice });
});
