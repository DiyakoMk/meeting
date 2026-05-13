# ORBLOOD

Voice-first chat (DMs, servers / "worlds", text + voice channels).

```
orblood/
├── public/                     # Frontend — pure static files (UI unchanged)
│   ├── index.html              # Shell + <meta name="orblood-api"> tag
│   ├── styles/main.css
│   └── js/app.js
│
├── server/                     # Backend — Node.js + Express + MySQL + WebSocket
│   ├── src/
│   │   ├── index.js            # App bootstrap, route mounting, http+ws server
│   │   ├── config.js           # Reads .env (validated)
│   │   ├── db.js               # mysql2 pool + q/one/pingDb helpers
│   │   ├── validators.js       # Zod schemas
│   │   ├── schema.sql          # All tables (run via `npm run init-db`)
│   │   ├── auth/
│   │   │   ├── hash.js         # bcrypt
│   │   │   ├── jwt.js          # sign/verify with HS256
│   │   │   └── middleware.js   # attachUser, requireAuth
│   │   ├── lib/
│   │   │   ├── userShape.js    # publicUser/foreignUser DB → JSON
│   │   │   ├── ids.js          # uid + invite-key generators
│   │   │   └── access.js       # membership/admin/friend/block checks
│   │   ├── routes/
│   │   │   ├── health.js       # GET /api/healthz                         ✓ phase 1
│   │   │   ├── voice-config.js # GET /api/voice/config (TURN/STUN)        ✓ phase 1
│   │   │   ├── auth.js         # /api/auth/{signup,login,logout}          ✓ phase 2
│   │   │   ├── me.js           # /api/me, PATCH /me, /api/me/snapshot     ✓ phase 2
│   │   │   ├── servers.js      # CRUD + lookup/join/transfer + categories ✓ phase 3
│   │   │   ├── channels.js     # text+voice CRUD, messages, voice join/   ✓ phase 3
│   │   │   ├── dms.js          # /dms/:peer GET/POST/clear/DELETE         ✓ phase 3
│   │   │   ├── friends.js      # request/accept/reject/cancel/remove      ✓ phase 3
│   │   │   ├── users.js        # search + block/unblock                   ✓ phase 3
│   │   │   └── uploads.js      # POST /api/uploads/image (multipart)      ✓ phase 3
│   │   ├── realtime/
│   │   │   ├── ws.js           # WebSocketServer attached at /ws          ✓ phase 4
│   │   │   └── events.js       # emitNewDm/emitChannelMessage/...         ✓ phase 4
│   │   └── scripts/init-db.js
│   ├── uploads/                # Avatars + covers (gitignored)
│   ├── package.json            # express, mysql2, bcrypt, jwt, zod, ws, multer, cors, rate-limit, dotenv
│   ├── .env.example
│   └── Dockerfile
│
├── docker-compose.yml          # Local: mysql + backend + nginx
├── nginx.conf                  # Reverse-proxy /api → backend, /ws upgrade, /uploads, /
└── README.md
```

## What's wired up after Phase 4

The frontend opens a WebSocket to `/ws?token=<JWT>` immediately after login
and reconnects with exponential backoff. Every mutation that affects another
user pushes an event over WS so all of their open tabs update without a
reload.

| Event                  | Pushed to                           | Effect on the receiver |
|------------------------|-------------------------------------|------------------------|
| `presence`             | every connected client              | green-dot toggle in DM list / friend bubbles |
| `hello`                | the new socket                      | confirm auth |
| `dm:new`               | the DM peer's sockets               | message appears, unread bumps if not viewing |
| `channel:message`      | every member of the server          | text channel updates / unread bumps |
| `voice:join` / `:leave`| every member of the server          | member list under voice orb refreshes |
| `server:member-joined` / `:left` | every member of the server | member sidebar + roster refresh |
| `friend:request`       | the recipient                       | request appears in incoming list + toast |
| `friend:accepted`      | the original sender                 | conversation appears, friendship updates |
| `typing`               | the DM peer                         | "typing…" indicator in DM list |
| `voice-signal`         | the named peer                      | WebRTC SDP / ICE relay |

### WebRTC voice (ExpressTurn-backed)

`voice.js` (the `voice` module inside `app.js`) implements peer-to-peer audio:

1. On join, the frontend calls `GET /api/voice/config` to get the TURN/STUN
   bundle. ExpressTurn credentials are kept server-side; only the time-limited
   ICE response reaches the browser.
2. `getUserMedia({audio:true})` grabs the mic.
3. For each member of the same voice channel, an `RTCPeerConnection` is
   created. The lexicographically-smaller display name initiates the offer
   (avoids glare).
4. SDP / ICE candidates flow through the same WS connection as
   `voice-signal` envelopes — the backend is a dumb relay, never seeing the
   audio bytes.
5. On leave / disconnect / channel switch, `voice.stop()` tears down every
   peer connection and releases the mic.

The `voice` module is a single object behind one entry point — easy to swap
for an SFU later (LiveKit / mediasoup) without touching the rest of the app.

## Auth flow

```
1. User → POST /api/auth/login {email,password}
2. Server → bcrypt verify → 200 {token, user}
3. Client → localStorage["orblood_token_v1"] = token
4. Client → GET /api/me/snapshot (Authorization: Bearer …)
5. Client → new WebSocket("/ws?token=" + token)
6. Server → emits presence:online to everyone
7. From here on, every action is a REST call + a WS push to interested users.
```

## Local development

```bash
# 1. Bring up MySQL.
docker compose up -d db

# 2. Backend setup.
cp server/.env.example server/.env
# generate a real JWT secret and paste into server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
cd server && npm install && npm run init-db && npm run dev

# 3. Frontend.
cd ../public && python3 -m http.server 5173
# open http://localhost:5173
```

If the frontend runs on a different origin than the backend, set
`PUBLIC_ORIGIN` in `server/.env` and update the
`<meta name="orblood-api">` in `public/index.html` to the full
`http://host:4000/api` URL. The WebSocket URL is derived from that
automatically (it just swaps the protocol and replaces `/api` with `/ws`).

For an all-in-one local stack with nginx in front, `docker compose up` and
visit http://localhost:8080.

## ExpressTurn

Sign up at <https://www.expressturn.com> to get a free TURN credential. Paste
it into `server/.env`:

```
EXPRESSTURN_USERNAME=username-from-the-dashboard
EXPRESSTURN_PASSWORD=password-from-the-dashboard
EXPRESSTURN_URLS=turn:relay1.expressturn.com:3480
```

When unset, the backend still serves a public STUN-only ICE config. NAT/CGNAT
users without TURN will frequently fail to connect; provisioning a real TURN
server (or paying for an ExpressTurn upgrade) is required for production.

## Roadmap

- [x] Phase 1: split monolithic `orblood.html` into `public/` + `server/` skeleton.
- [x] Phase 2: real auth (signup/login + JWT) + `/me/snapshot` hydration.
- [x] Phase 3: REST mutations (servers, channels, DMs, friends, blocks,
      profile, image uploads).
- [x] Phase 4: WebSocket realtime + WebRTC voice signaling.

## Production deploy

1. Provision a host (any small VPS, Ubuntu 22.04+ is fine).
2. Install Node 20 and MySQL 8 (or point at a managed MySQL).
3. `git clone`, copy `.env.example` to `.env`, fill in real values
   (DB_PASSWORD, JWT_SECRET, EXPRESSTURN_*, PUBLIC_ORIGIN to your domain).
4. `cd server && npm install --omit=dev && npm run init-db && pm2 start src/index.js --name orblood`
5. Copy `nginx.conf` to `/etc/nginx/sites-available/orblood`, link, reload.
6. Add TLS with `certbot --nginx`. WebSocket upgrade just works because
   nginx already proxies `/ws` with the right headers.
