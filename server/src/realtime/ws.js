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
import { one } from '../db.js';

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

    ws.on('close', () => {
      const set = clients.get(uid);
      if (set) { set.delete(ws); if (set.size === 0) clients.delete(uid); }
      // If NO sockets remain for this user, they went offline.
      if (!clients.has(uid)) broadcastPresence(uid, user.name, false);
    });

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw);
        handleClientMessage(ws, uid, msg);
      } catch (_) { /* ignore malformed */ }
    });

    // Ack so the client knows auth succeeded.
    ws.send(JSON.stringify({ type: 'hello', uid, name: user.name }));
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
    case 'voice-signal': {
      // WebRTC signaling relay. { type:'voice-signal', to:'<uid>', signal:{...} }
      if (!msg.to || !msg.signal) return;
      sendToUser(msg.to, {
        type: 'voice-signal',
        from: uid,
        fromName: ws._userName,
        signal: msg.signal
      });
      break;
    }
    default: break;
  }
}
