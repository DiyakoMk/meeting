# ORBLOOD

Voice-first chat (DMs, servers / "worlds", text + voice channels).

```
orblood/
├── public/                     # Frontend — pure static files (UI unchanged)
│   ├── index.html              # Shell + <meta name="orblood-api"> tag
│   ├── styles/main.css
│   └── js/app.js
│
├── server/                     # Backend — Node.js + Express + MySQL
│   ├── src/
│   │   ├── index.js            # App bootstrap, route mounting, CORS, /uploads static
│   │   ├── config.js           # Reads .env (validated)
│   │   ├── db.js               # mysql2 pool + q/one/pingDb helpers
│   │   ├── validators.js       # Zod schemas for every input
│   │   ├── schema.sql          # All tables (run via `npm run init-db`)
│   │   ├── auth/
│   │   │   ├── hash.js         # bcrypt
│   │   │   ├── jwt.js          # sign/verify with HS256
│   │   │   └── middleware.js   # attachUser (decode bearer), requireAuth
│   │   ├── lib/
│   │   │   ├── userShape.js    # publicUser/foreignUser DB → JSON
│   │   │   ├── ids.js          # uid + invite-key generators
│   │   │   └── access.js       # membership / admin / friend / block checks
│   │   ├── routes/
│   │   │   ├── health.js       # GET /api/healthz                         ✓ phase 1
│   │   │   ├── voice-config.js # GET /api/voice/config (TURN/STUN)        ✓ phase 1
│   │   │   ├── auth.js         # /api/auth/{signup,login,logout}          ✓ phase 2
│   │   │   ├── me.js           # /api/me, PATCH /me, /api/me/snapshot     ✓ phase 2
│   │   │   ├── servers.js      # create / patch / delete / lookup / join  ✓ phase 3
│   │   │   │                   # /transfer-ownership, categories CRUD
│   │   │   ├── channels.js     # text + voice channels CRUD,              ✓ phase 3
│   │   │   │                   # /text/:c/messages send + read + delete,
│   │   │   │                   # /voice/:c/{join,leave}
│   │   │   ├── dms.js          # /dms/:peer GET/POST/clear/DELETE :mid    ✓ phase 3
│   │   │   ├── friends.js      # /request /accept /reject (cancel) /remove ✓ phase 3
│   │   │   ├── users.js        # /search, /:id/block, /:id/unblock        ✓ phase 3
│   │   │   └── uploads.js      # POST /uploads/image (multipart, 5MB cap) ✓ phase 3
│   │   ├── realtime/           # Phase 4: WebSocket push + voice signaling
│   │   └── scripts/init-db.js  # Creates the database from schema.sql
│   ├── uploads/                # Avatars + covers (gitignored)
│   ├── package.json            # express, mysql2, bcrypt, jsonwebtoken, zod, ws, multer, cors, express-rate-limit, dotenv
│   ├── .env.example
│   └── Dockerfile
│
├── docker-compose.yml          # Local: mysql + backend + nginx (frontend)
├── nginx.conf                  # Reverse-proxy /api → backend, serve /public
└── README.md
```

## What's wired up after Phase 3

When `<meta name="orblood-api">` resolves to a reachable backend, every user
action persists to MySQL:

**Auth**
- signup / login / logout / me / patch / snapshot (phase 2).
- Token in `Authorization: Bearer …`, stored in `localStorage.orblood_token_v1`.

**Profile**
- PATCH `/api/me` — name, handle, email, password, bio, baseColor, phone,
  rank, friendsOnly. Avatars + covers via image upload.
- POST `/api/uploads/image` — multipart, returns `{url}` pointing at
  `/uploads/<random>.<ext>`. Frontend then PATCHes `/me` with the URL.

**Servers**
- POST `/api/servers` — caller becomes first member + admin.
- GET  `/api/servers/lookup/:keyOrId` — preview without joining.
- POST `/api/servers/:keyOrId/join` — honours `is_private`.
- PATCH `/api/servers/:id`, DELETE `/api/servers/:id`,
  POST `/api/servers/:id/leave` (last-admin guard),
  POST `/api/servers/:id/transfer-ownership`.
- POST `/api/servers/:id/categories`, DELETE `/api/servers/:id/categories/:cid`.

**Channels**
- POST `/api/channels/text/:sid`, DELETE `/api/channels/text/:sid/:cid`.
- POST `/api/channels/voice/:sid`, DELETE `/api/channels/voice/:sid/:cid`.
- GET / POST / DELETE `/api/channels/text/:sid/:cid/messages[/:mid]`.
- POST `/api/channels/voice/:sid/:cid/{join,leave}` — tracks who's connected.

**DMs**
- GET / POST `/api/dms/:peerKey` — `peerKey` is a handle (or `saved`).
- POST `/api/dms/:peerKey/clear`, DELETE `/api/dms/:peerKey/:mid`.
- Honours block list + `friends_only` flag on the peer.

**Friends**
- POST `/api/friends/request` (`{target}` = handle or email).
- POST `/api/friends/:rid/accept`, `/reject`.
- DELETE `/api/friends/:rid` (cancel outgoing).
- POST `/api/friends/remove/:userId`.

**Users**
- GET  `/api/users/search?q=…`.
- POST `/api/users/:id/block`, `/api/users/:id/unblock`.

The frontend's `backend.*` adapter in `public/js/app.js` mirrors all of these
1:1. When the API is unreachable, the page falls back to in-memory state and
logs a warning.

## Error codes

| code                        | HTTP | when |
|-----------------------------|-----:|------|
| `validation_failed`         | 400  | Zod rejected a field |
| `invalid_credentials`       | 401  | Bad email/password |
| `unauthorized`              | 401  | Missing or invalid bearer token |
| `not_a_member`              | 403  | Acting on a server you're not in |
| `admin_required`            | 403  | Member-only action attempted by non-admin |
| `private_server`            | 403  | Joining a private server |
| `blocked`                   | 403  | DM target blocked you (or vice-versa) |
| `friends_only`              | 403  | DM target accepts only friends |
| `forbidden`                 | 403  | Generic permission denial |
| `last_admin_must_transfer`  | 409  | Owner trying to leave their own server |
| `email_or_handle_taken`     | 409  | Signup conflict |
| `email_taken` / `handle_taken` | 409 | PATCH /me conflict |
| `already_friends`           | 409  | Friend request to an existing friend |
| `request_already_pending`   | 409  | Duplicate friend request |
| `not_found`                 | 404  | Lookup miss |
| `user_not_found`            | 404  | Friend-request target absent |

## Local development

```bash
# 1. Bring up MySQL.
docker compose up -d db

# 2. Backend setup.
cp server/.env.example server/.env
# edit DB_PASSWORD + JWT_SECRET in server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
cd server && npm install && npm run init-db && npm run dev

# 3. Frontend (anywhere — same host or separate).
cd ../public && python3 -m http.server 5173
# open http://localhost:5173
```

If the frontend runs on a different origin than the backend (e.g. 5173 vs 4000),
set `PUBLIC_ORIGIN=http://localhost:5173` in `server/.env` and update the
`<meta name="orblood-api">` in `public/index.html` to `http://localhost:4000/api`.

For an all-in-one local stack with nginx in front, `docker compose up` and
visit http://localhost:8080 instead.

## Roadmap

- [x] Phase 1: split monolithic `orblood.html` into `public/` + `server/` skeleton.
- [x] Phase 2: real auth (signup/login + JWT) + `/me/snapshot` hydration.
- [x] Phase 3: REST mutations (servers, channels, DMs, friends, blocks,
      profile, image uploads).
- [ ] Phase 4: WebSocket realtime + ExpressTurn-backed WebRTC voice.

## Production deploy outline

1. Provision a host (any small VPS, Ubuntu 22.04+ is fine).
2. Install Node 20 and MySQL 8 (or point at a managed MySQL).
3. `git clone`, copy `.env.example` to `.env`, fill in real values
   (DB_PASSWORD, JWT_SECRET, EXPRESSTURN_*, PUBLIC_ORIGIN to your domain).
4. `cd server && npm install --omit=dev && npm run init-db && pm2 start src/index.js --name orblood`
5. Copy `nginx.conf` to `/etc/nginx/sites-available/orblood`, link, reload.
6. Add TLS with `certbot --nginx`.
