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
│   │   ├── lib/userShape.js    # publicUser/foreignUser DB → JSON adapter
│   │   ├── routes/
│   │   │   ├── health.js       # GET /api/healthz                       ✓ phase 1
│   │   │   ├── voice-config.js # GET /api/voice/config (TURN/STUN)      ✓ phase 1
│   │   │   ├── auth.js         # /api/auth/{signup,login,logout}        ✓ phase 2
│   │   │   ├── me.js           # /api/me, PATCH /me, /api/me/snapshot   ✓ phase 2
│   │   │   ├── servers.js      # CRUD + categories                      ✗ phase 3
│   │   │   ├── channels.js     # text + voice channels                  ✗ phase 3
│   │   │   ├── dms.js          # 1:1 messages                           ✗ phase 3
│   │   │   ├── friends.js      # requests, friendships, marks           ✗ phase 3
│   │   │   └── users.js        # search, block / unblock                ✗ phase 3
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

## What's wired up after Phase 2

The frontend's existing auth modal now talks to the real backend whenever a
`<meta name="orblood-api" content="...">` is present in `public/index.html`
(the default value is `/api`, which works behind the supplied `nginx.conf`).

End-to-end:

- `POST /api/auth/signup` → bcrypt-hashed user, JWT issued, Saved Messages
  thread auto-created.
- `POST /api/auth/login` → JWT for valid email+password.
- `GET  /api/me` → fresh profile.
- `PATCH /api/me` → name, handle, email, password, bio, baseColor, avImage,
  bannerImage, phone, rank, friendsOnly. Uniqueness checked, password
  rehashed.
- `GET  /api/me/snapshot` → full hydration payload that mirrors the in-memory
  shape the frontend already used. Conversations is seeded with `saved`,
  every other store is empty until phase 3.
- `POST /api/auth/logout` → no-op for stateless JWTs (token clears
  client-side); a hook for future session tracking.

Inputs validated with Zod (returns `{error:'validation_failed', field, message}`
on any malformed body). The auth surface has a per-IP rate limit of 8/min.

Errors emitted to the frontend (matched in `_authErrorLabel()` in `app.js`):

| code                    | meaning                            | HTTP |
|-------------------------|------------------------------------|------|
| `validation_failed`     | Zod rejected a field               | 400  |
| `invalid_credentials`   | Wrong email or password            | 401  |
| `email_or_handle_taken` | Signup conflict on email or handle | 409  |
| `email_taken`           | PATCH /me email collision          | 409  |
| `handle_taken`          | PATCH /me handle collision         | 409  |
| `unauthorized`          | Missing or invalid bearer token    | 401  |

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
`<meta name="orblood-api">` to `http://localhost:4000/api`.

For an all-in-one local stack with nginx in front, `docker compose up` and
visit http://localhost:8080 instead.

## Roadmap

- [x] Phase 1: split monolithic `orblood.html` into `public/` + `server/` skeleton.
- [x] Phase 2: real auth (signup/login + JWT) + `/me/snapshot` hydration.
- [ ] Phase 3: hook every frontend mutation (create server, send DM, friend
      request, block, …) to the backend.
- [ ] Phase 4: WebSocket realtime + ExpressTurn-backed WebRTC voice.

## Production deploy outline

1. Provision a host (any small VPS, Ubuntu 22.04+ is fine).
2. Install Node 20 and MySQL 8 (or point at a managed MySQL).
3. `git clone`, copy `.env.example` to `.env`, fill in real values
   (DB_PASSWORD, JWT_SECRET, EXPRESSTURN_*, PUBLIC_ORIGIN to your domain).
4. `cd server && npm install --omit=dev && npm run init-db && pm2 start src/index.js --name orblood`
5. Copy `nginx.conf` to `/etc/nginx/sites-available/orblood`, link, reload.
6. Add TLS with `certbot --nginx`.
