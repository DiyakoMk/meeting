// WebSocket server — attaches to the same HTTP server Express listens on.
//
// Clients connect to ws://<host>/ws?token=<JWT>. On connection we verify the
// token, store the socket in a per-user map, and broadcast events when
// mutations happen elsewhere in the REST layer.
//
// Event envelope: JSON { type, ...payload }. The frontend listens for these
// and patches its in-memory state + re-renders the affected section.

import { WebSocketServer } from 'ws';
import { verifyToken } from '../auth/jwt.js';
import { one, q } from '../db.js';

// uid → Set<WebSocket>. A single user can have multiple tabs / devices.
const clients = new Map();

let wss = null;

export function attachWs(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // Extract token from query string.
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) { ws.close(4001, 'missing_token'); return; }

    const claims = verifyToken(token);
    if (!claims || !claims.uid) { ws.close(4001, 'invalid_token'); return; }

    const user = await one('SELECT id, name, handle FROM users WHERE id = ?', [claims.uid]);
    if (!user) { ws.close(4001, 'user_not_found'); return; }

    const uid = String(user.id);
    ws._uid = uid;
    ws._userName = user.name;
    ws._handle = user.handle;

    if (!clients.has(uid)) clients.set(uid, new Set());
    clients.get(uid).add(ws);

    // Tell everyone this user came online.
    broadcastPresence(uid, user.name, true);

    ws.on('close', async () => {
      const set = clients.get(uid);
      if (set) { set.delete(ws); if (set.size === 0) clients.delete(uid); }
      // If NO sockets remain for this user, they went offline. Also drop
      // them from any voice channel they were in so the orb UI on other
      // clients stops showing a phantom listener.
      //
      // Grace period: a 12-second delay before we actually evict them
      // from voice. A network blip, tab backgrounding, or page reload
      // routinely closes the socket and re-opens it within a couple of
      // seconds; we don't want every transient drop to flicker the user
      // out of voice everywhere. If they reconnect within the window
      // (clients.has(uid) is true again), we cancel the eviction.
      if (!clients.has(uid)) {
        broadcastPresence(uid, user.name, false);
        const evictionDelayMs = 12000;
        setTimeout(async () => {
          if (clients.has(uid)) return;  // they came back; bail.
          try {
            const rows = await q(
              `SELECT vm.channel_id AS cid, vc.server_id AS sid
                 FROM voice_channel_members vm
                 JOIN voice_channels vc ON vc.id = vm.channel_id
                WHERE vm.user_id = ?`, [uid]);
            if (rows.length) {
              await q('DELETE FROM voice_channel_members WHERE user_id = ?', [uid]);
              for (const row of rows) {
                const remaining = await q(
                  `SELECT u.name FROM voice_channel_members vm
                     JOIN users u ON u.id = vm.user_id
                    WHERE vm.channel_id = ?`, [row.cid]);
                const names = remaining.map(r => r.name);
                const memberRows = await q('SELECT user_id FROM server_members WHERE server_id = ?', [row.sid]);
                const memberUids = memberRows.map(r => String(r.user_id));
                const data = JSON.stringify({ type: 'voice:leave', serverId: row.sid, channelId: row.cid, userName: user.name, members: names });
                for (const mu of memberUids) {
                  const set2 = clients.get(mu);
                  if (!set2) continue;
                  for (const cws of set2) { try { cws.send(data); } catch (_) {} }
                }
              }
            }
          } catch (_) { /* swallow */ }
        }, evictionDelayMs);
      }
    });

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw);
        handleClientMessage(ws, uid, msg);
      } catch (_) { /* ignore malformed */ }
    });

    // Ack so the client knows auth succeeded. Include the current online
    // user set so a freshly-connected client can paint presence without
    // waiting for the next presence event.
    const onlineUids = Array.from(clients.keys()).filter(u => u !== uid);
    ws.send(JSON.stringify({ type: 'hello', uid, name: user.name, online: onlineUids }));
  });
}

// --- Helpers called by REST routes to push events to connected clients ---

// Send to every socket of a specific user.
export function sendToUser(uid, payload) {
  const set = clients.get(String(uid));
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) { try { ws.send(data); } catch (_) {} }
}

// Send to every connected client (e.g. global announcements).
export function broadcast(payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);
  for (const ws of wss.clients) { try { ws.send(data); } catch (_) {} }
}

// Send to every member of a server (by server id). Requires a list of user
// ids that are members — the caller (a REST route) already has this.
export function sendToServer(memberUids, payload) {
  const data = JSON.stringify(payload);
  for (const uid of memberUids) {
    const set = clients.get(String(uid));
    if (!set) continue;
    for (const ws of set) { try { ws.send(data); } catch (_) {} }
  }
}

// Online-presence broadcast. All connected clients learn about it so they
// can update the green dot on the friend list / DM header.
function broadcastPresence(uid, name, online) {
  broadcast({ type: 'presence', uid, name, online });
}

// Returns true if the user has at least one live socket.
export function isOnline(uid) {
  return clients.has(String(uid));
}

// Snapshot helper for /me/snapshot.
export function getOnlineUids() {
  return Array.from(clients.keys());
}

// --- Client → server messages (typing, voice signaling) ---

function handleClientMessage(ws, uid, msg) {
  switch (msg.type) {
    case 'typing': {
      // { type:'typing', to:'<peerHandle>' }
      // Forward to the peer so they see a typing indicator.
      if (!msg.to) return;
      // Look up peer uid by handle.
      one('SELECT id FROM users WHERE handle = ? LIMIT 1', [msg.to.replace(/^@/, '')])
        .then(peer => { if (peer) sendToUser(peer.id, { type: 'typing', from: ws._handle }); })
        .catch(() => {});
      break;
    }
    case 'ping': {
      // Lightweight RTT probe used by the orb HUD. Reflects whatever
      // correlation id the client sent so the client can compute the
      // exact round-trip duration.
      try { ws.send(JSON.stringify({ type: 'pong', t: msg.t })); } catch(_){}
      break;
    }
    case 'voice-signal': {
      // WebRTC signaling relay. `to` may be a numeric uid, a handle, or
      // a display name. The client cannot always know the peer's id
      // locally — when two users share a voice room but have no DM
      // history, the client only has the display name. Accept all three.
      if (!msg.to || !msg.signal) return;
      const envelope = {
        type: 'voice-signal',
        from: uid,
        fromName: ws._userName,
        signal: msg.signal
      };
      const target = String(msg.to);
      if (/^\d+$/.test(target)){
        sendToUser(target, envelope);
      } else {
        const noAt = target.replace(/^@/, '');
        one('SELECT id FROM users WHERE handle = ? OR name = ? LIMIT 1', [noAt, target])
          .then(peer => { if (peer) sendToUser(peer.id, envelope); })
          .catch(() => {});
      }
      break;
    }
    default: break;
  }
}
