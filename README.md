# ORBLOOD

Voice-first chat (DMs, servers / "worlds", text + voice channels). The repo has
two halves and a thin glue layer.

```
orblood/
├── public/                     # Frontend — pure static files
│   ├── index.html              # Shell (markup only)
│   ├── styles/main.css         # All styles
│   └── js/app.js               # All app logic (will be split further later)
│
├── server/                     # Backend — Node.js + Express + MySQL
│   ├── src/
│   │   ├── index.js            # App bootstrap, route mounting
│   │   ├── config.js           # Reads .env
│   │   ├── db.js               # mysql2 pool + helpers
│   │   ├── schema.sql          # Tables (run via `npm run init-db`)
│   │   ├── auth/
│   │   │   ├── hash.js         # bcrypt wrapper
│   │   │   ├── jwt.js          # sign/verify
│   │   │   └── middleware.js   # attachUser, requireAuth
│   │   ├── routes/
│   │   │   ├── health.js       # GET /api/healthz
│   │   │   ├── voice-config.js # GET /api/voice/config (TURN/STUN)
│   │   │   ├── auth.js         # /api/auth/{signup,login,logout}
│   │   │   ├── me.js           # /api/me, /api/me/snapshot
│   │   │   ├── servers.js      # CRUD + categories
│   │   │   ├── channels.js     # text + voice channels
│   │   │   ├── dms.js          # 1:1 messages, saved messages
│   │   │   ├── friends.js      # requests, friendships, marks
│   │   │   └── users.js        # search, block / unblock
│   │   ├── realtime/           # Phase 4: WebSocket for push + voice signaling
│   │   └── scripts/init-db.js  # Creates the database from schema.sql
│   ├── uploads/                # Avatars + covers (gitignored)
│   ├── package.json
│   ├── .env.example            # Copy to .env
│   └── Dockerfile
│
├── docker-compose.yml          # Local: mysql + backend + nginx (frontend)
├── nginx.conf                  # Reverse proxy /api → backend, serve /public
└── README.md                   # this file
```

## Local development

### 1. Bring up MySQL (and optionally backend + nginx) with Docker.

```bash
cp server/.env.example server/.env
# generate a real JWT secret and paste it into server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose up -d db
```

### 2. Install backend deps and apply the schema.

```bash
cd server
npm install
npm run init-db
npm run dev    # auto-restart on changes
```

The API now listens on http://localhost:4000.

### 3. Serve the frontend.

The simplest option:

```bash
cd public
python3 -m http.server 5173
```

Open http://localhost:5173. By default the page talks to no backend — to wire
it up, add a meta tag to `public/index.html`:

```html
<meta name="orblood-api" content="http://localhost:4000/api">
```

(or set `window.ORBLOOD_API` before `app.js` loads.)

For an all-in-one local stack with nginx in front, run `docker compose up`
and visit http://localhost:8080 instead.

## Production deploy outline

1. Provision a host (any small VPS, Ubuntu 22.04 is fine).
2. Install Node 20 and MySQL 8 (or point at a managed MySQL).
3. `git clone`, copy `.env.example` to `.env`, fill in real values
   (DB_PASSWORD, JWT_SECRET, EXPRESSTURN_*, PUBLIC_ORIGIN to your real domain).
4. `cd server && npm install --omit=dev && npm run init-db && pm2 start src/index.js --name orblood`
5. Copy `nginx.conf` to `/etc/nginx/sites-available/orblood`, link, reload.
6. Add TLS with `certbot --nginx`.

## Roadmap (where this repo is in the migration)

- [x] Phase 1: split monolithic `orblood.html` into `public/` + `server/`
      skeleton.
- [ ] Phase 2: real auth (signup/login + JWT) + `/me/snapshot` hydration.
- [ ] Phase 3: hook every frontend mutation (create server, send DM, friend
      request, block, …) to the backend.
- [ ] Phase 4: WebSocket realtime + ExpressTurn-backed WebRTC voice.
